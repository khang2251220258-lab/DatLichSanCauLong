export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export async function api(path, { method = 'GET', body, csrfToken, signal, validate } = {}) {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new ApiError(0, 'API_NOT_CONFIGURED');
  const headers = { Accept: 'application/json' };
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 20000);
  try {
    const response = await fetch(base.replace(/\/$/, '') + path, {
      method, headers, credentials: 'include', signal: controller.signal,
      ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
    if (response.status === 204) return null;
    const envelope = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, envelope?.error?.code || 'API_ERROR');
    if (!envelope || !Object.hasOwn(envelope, 'data')) throw new ApiError(0, 'INVALID_RESPONSE');
    if (validate && !validate(envelope)) throw new ApiError(0, 'INVALID_RESPONSE');
    return envelope;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, signal?.aborted ? 'REQUEST_CANCELLED' : 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
const messages = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  ACCOUNT_LOCKED: 'Tài khoản đang bị khóa.',
  EMAIL_ALREADY_EXISTS: 'Email này đã được đăng ký.',
  VALIDATION_ERROR: 'Vui lòng kiểm tra thông tin đã nhập.',
  INVALID_RESET_TOKEN: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.',
  RATE_LIMITED: 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.',
  FORBIDDEN: 'Không thể thực hiện yêu cầu. Vui lòng tải lại trang và thử lại.',
  AUTH_EMAIL_UNAVAILABLE: 'Dịch vụ email chưa sẵn sàng. Vui lòng thử lại sau.',
  SESSION_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  API_NOT_CONFIGURED: 'Kết nối API chưa được cấu hình.',
  INVALID_RESPONSE: 'Dữ liệu máy chủ trả về không hợp lệ. Vui lòng thử lại.',
  NETWORK_ERROR: 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.',
  BOOKING_EXPIRED: 'Thời gian gửi minh chứng đã hết.',
  PROOF_ALREADY_SUBMITTED: 'Booking đã nhận một minh chứng thanh toán.',
  INVALID_BOOKING_STATE: 'Trạng thái booking hiện tại không cho phép gửi minh chứng.',
  PROOF_TOO_LARGE: 'Ảnh minh chứng vượt quá 5 MB.',
  INVALID_FILE_TYPE: 'Chỉ chấp nhận ảnh JPG hoặc PNG.',
  INVALID_IMAGE: 'Ảnh không hợp lệ hoặc không đáp ứng giới hạn xử lý.',
  AMENITY_NAME_EXISTS: 'Tên tiện ích đã tồn tại.',
  IMAGE_STORAGE_NOT_CONFIGURED: 'Dịch vụ lưu ảnh chưa được cấu hình.',
  IMAGE_STORAGE_UNAVAILABLE: 'Dịch vụ lưu ảnh tạm thời chưa sẵn sàng.',
};
export const errorMessage = error => messages[error.code] || 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.';
