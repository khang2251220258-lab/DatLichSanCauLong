import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { AuthError, invalid } from '../auth/errors.js';

export const MAX_PROOF_BYTES = 5_000_000;
export const MAX_PROOF_PIXELS = 25_000_000;
const badImage = () => new AuthError(422, 'INVALID_IMAGE', 'Ảnh không hợp lệ; chỉ nhận ảnh tĩnh tối đa 25 triệu pixel.');
const badType = () => new AuthError(415, 'INVALID_FILE_TYPE', 'Chỉ chấp nhận ảnh JPEG hoặc PNG.');

function staticPng(buffer) {
  let offset = 8, ended = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    if (offset + length + 12 > buffer.length || ['acTL', 'fcTL', 'fdAT'].includes(type)) throw badImage();
    offset += length + 12;
    if (type === 'IEND') { ended = length === 0 && offset === buffer.length; break; }
  }
  if (!ended) throw badImage();
}

function staticJpeg(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset++] !== 0xff) throw badImage();
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xd9) { if (offset !== buffer.length) throw badImage(); return; }
    if (marker === 0xd8 || marker === 0 || offset + 2 > buffer.length) throw badImage();
    if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) throw badImage();
    if (marker === 0xe2 && buffer.toString('ascii', offset + 2, offset + 6) === 'MPF\0') throw badImage();
    offset += length;
    if (marker === 0xda) {
      // Entropy data: stuffed FF00 and restart markers are not segment boundaries.
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) { offset++; continue; }
        let next = offset + 1;
        while (buffer[next] === 0xff) next++;
        if (buffer[next] === 0 || (buffer[next] >= 0xd0 && buffer[next] <= 0xd7)) { offset = next + 1; continue; }
        break;
      }
    }
  }
  throw badImage();
}

export async function proofInput(file, body) {
  if (!file || (body && Object.keys(body).length)) throw invalid();
  if (!Buffer.isBuffer(file.buffer) || !file.buffer.length) throw badImage();
  if (file.buffer.length > MAX_PROOF_BYTES) throw new AuthError(413, 'PROOF_TOO_LARGE', 'Ảnh vượt quá 5 MB.');
  if (!['image/jpeg', 'image/png'].includes(file.mimetype)) throw badType();
  let type;
  try { type = await fileTypeFromBuffer(file.buffer); } catch { throw badImage(); }
  if (type?.mime === 'image/apng' && file.mimetype === 'image/png') throw badImage();
  if (!type || type.mime !== file.mimetype) throw badType();
  try {
    if (type.mime === 'image/png') staticPng(file.buffer);
    else staticJpeg(file.buffer);
    const decoder = sharp(file.buffer, { limitInputPixels: MAX_PROOF_PIXELS, failOn: 'warning' });
    const meta = await decoder.metadata();
    if (!['jpeg', 'png'].includes(meta.format) || !meta.width || !meta.height ||
        meta.width * meta.height > MAX_PROOF_PIXELS || (meta.pages ?? 1) !== 1) throw badImage();
    // Metadata alone does not decode compressed pixels. Discard the fully decoded pixels.
    await decoder.raw().toBuffer();
  } catch { throw badImage(); }
  return { buffer: file.buffer, mime_type: type.mime, size_bytes: BigInt(file.buffer.length) };
}
