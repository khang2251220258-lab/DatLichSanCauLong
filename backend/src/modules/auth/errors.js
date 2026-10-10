export class AuthError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
export const invalid = () => new AuthError(422, 'VALIDATION_ERROR', 'Thông tin không hợp lệ.');
