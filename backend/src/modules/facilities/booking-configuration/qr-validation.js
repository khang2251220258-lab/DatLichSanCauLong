import sharp from 'sharp';
import { proofInput, MAX_PROOF_BYTES, MAX_PROOF_PIXELS } from '../../payments/validation.js';

export { MAX_PROOF_BYTES as MAX_QR_BYTES, MAX_PROOF_PIXELS as MAX_QR_PIXELS };

export async function qrInput(file, body) {
  const input = await proofInput(file, body);
  const buffer = await sharp(input.buffer, { limitInputPixels: MAX_PROOF_PIXELS, failOn: 'warning' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { buffer, mime_type: 'image/png', size_bytes: BigInt(buffer.length) };
}
