import { v2 as cloudinary } from 'cloudinary';
import { AuthError } from '../auth/errors.js';

const unavailable = () => new AuthError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Dịch vụ lưu ảnh chưa sẵn sàng.');
export function createProofStorage(env = process.env, sdk = cloudinary) {
  const options = { cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET, resource_type: 'image', type: 'authenticated', secure: true, timeout: 30000 };
  function ready() {
    if (![options.cloud_name, options.api_key, options.api_secret].every(v => typeof v === 'string' && v.trim()))
      throw new AuthError(503, 'IMAGE_STORAGE_NOT_CONFIGURED', 'Chưa cấu hình dịch vụ lưu ảnh.');
  }
  return {
    ready,
    privateUrl(publicId, mimeType, expiresAt) {
      ready();
      const format = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : null;
      if (!format || !Number.isInteger(expiresAt)) throw unavailable();
      try {
        return sdk.utils.private_download_url(publicId, format, { ...options, expires_at: expiresAt, attachment: false });
      } catch { throw unavailable(); }
    },
    async upload(buffer, publicId) {
      ready();
      try {
        const result = await new Promise((resolve, reject) => {
          const stream = sdk.uploader.upload_stream({ ...options, public_id: publicId, overwrite: false, allowed_formats: ['jpg', 'png'] },
            (error, value) => error ? reject(error) : resolve(value));
          stream.on('error', reject);
          stream.end(buffer);
        });
        if (result?.public_id !== publicId || result.resource_type !== 'image' || result.type !== 'authenticated') throw unavailable();
        return publicId;
      } catch { throw unavailable(); }
    },
    async destroy(publicId) {
      ready();
      const result = await sdk.uploader.destroy(publicId, { ...options, invalidate: true });
      if (!['ok', 'not found'].includes(result?.result)) throw unavailable();
    },
  };
}
