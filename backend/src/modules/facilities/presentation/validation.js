import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { AuthError, invalid } from '../../auth/errors.js';
import { requestId } from '../../users/owner-requests/validation.js';
export { requestId };
export const MAX_IMAGE_BYTES = 5_000_000;
export const MAX_IMAGE_PIXELS = 25_000_000;
export const MAX_IMAGES = 10;
export function exact(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length || keys.some(k => !Object.hasOwn(body, k))) throw invalid();
}
export function idsInput(body, key) {
  exact(body, [key]);
  if (!Array.isArray(body[key])) throw invalid();
  const ids = body[key].map(requestId);
  if (new Set(ids.map(String)).size !== ids.length) throw invalid();
  return ids;
}
export function amenityInput(body, patch = false) {
  if (!patch) exact(body, ['name']);
  else if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length || Object.keys(body).some(k => !['name', 'is_active'].includes(k))) throw invalid();
  const input = {};
  if (Object.hasOwn(body, 'name')) {
    if (typeof body.name !== 'string') throw invalid();
    input.name = body.name.trim().normalize('NFC');
    if (!input.name || [...input.name].length > 100) throw invalid();
  }
  if (Object.hasOwn(body, 'is_active')) {
    if (typeof body.is_active !== 'boolean') throw invalid();
    input.is_active = body.is_active;
  }
  return input;
}
export function catalogQuery(query) {
  if (Object.keys(query).some(k => !['page', 'page_size'].includes(k))) throw invalid();
  const num = (v, fallback) => {
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || !/^[1-9]\d*$/.test(v) || !Number.isSafeInteger(Number(v))) throw invalid();
    return Number(v);
  };
  const page = num(query.page, 1), page_size = num(query.page_size, 20);
  if (page_size > 100 || !Number.isSafeInteger((page - 1) * page_size)) throw invalid();
  return { page, page_size };
}
export async function imageInput(file, body = {}) {
  exact(body, []);
  if (!file?.buffer?.length) throw invalid();
  if (file.buffer.length > MAX_IMAGE_BYTES) throw new AuthError(413, 'PAYLOAD_TOO_LARGE', 'Ảnh vượt quá 5 MB.');
  let type;
  try { type = await fileTypeFromBuffer(file.buffer); } catch { /* Malformed content. */ }
  if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime) || file.mimetype !== type.mime)
    throw new AuthError(415, 'UNSUPPORTED_IMAGE', 'Chỉ nhận ảnh JPEG, PNG hoặc WebP có nội dung hợp lệ.');
  try {
    const decoder = sharp(file.buffer, { failOn: 'warning', limitInputPixels: MAX_IMAGE_PIXELS });
    const metadata = await decoder.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)
      || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)
      || metadata.width * metadata.height > MAX_IMAGE_PIXELS
      || (metadata.pages ?? 1) !== 1) throw new Error('Invalid image metadata');
    await decoder.raw().toBuffer();
  } catch {
    throw new AuthError(422, 'INVALID_IMAGE', 'Ảnh bị lỗi, không hoàn chỉnh hoặc vượt quá 25 triệu pixel.');
  }
  return file.buffer;
}
