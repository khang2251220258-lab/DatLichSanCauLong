import { v2 as cloudinary } from 'cloudinary';
import { AuthError } from '../../auth/errors.js';

const unavailable = () => new AuthError(503, 'IMAGE_STORAGE_UNAVAILABLE', 'Dịch vụ lưu ảnh chưa sẵn sàng.');
export function storageErrorCode(error) {
  // Never log the provider message/response: it may include signed URLs or credentials.
  if (Number.isInteger(error?.http_code)) return `HTTP_${error.http_code}`;
  return ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'IMAGE_STORAGE_NOT_CONFIGURED', 'IMAGE_STORAGE_UNAVAILABLE'].includes(error?.code) ? error.code : 'STORAGE_ERROR';
}
export function createImageStorage(env = process.env, sdk = cloudinary) {
  const options = { cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET,
    resource_type: 'image', type: 'upload', secure: true, timeout: 30000 };
  function ready() {
    if (![options.cloud_name, options.api_key, options.api_secret].every(v => typeof v === 'string' && v.trim()))
      throw new AuthError(503, 'IMAGE_STORAGE_NOT_CONFIGURED', 'Chưa cấu hình dịch vụ lưu ảnh.');
  }
  return {
    ready,
    url(publicId) {
      ready();
      return sdk.url(publicId, { cloud_name: options.cloud_name, resource_type: 'image', type: 'upload', secure: true });
    },
    async upload(buffer, publicId) {
      ready();
      try {
        const result = await new Promise((resolve, reject) => {
          const stream = sdk.uploader.upload_stream({ ...options, public_id: publicId, overwrite: false, allowed_formats: ['jpg', 'png', 'webp'] },
            (error, value) => error ? reject(error) : resolve(value));
          stream.on('error', reject);
          stream.end(buffer);
        });
        if (result?.public_id !== publicId || result.resource_type !== 'image' || result.type !== 'upload') throw unavailable();
        return result.public_id;
      } catch { throw unavailable(); }
    },
    async destroy(publicId) {
      ready();
      // Kept unwrapped so cleanup can log only a sanitized error code.
      const result = await sdk.uploader.destroy(publicId, { ...options, invalidate: true });
      if (!['ok', 'not found'].includes(result?.result)) throw unavailable();
    },
  };
}
