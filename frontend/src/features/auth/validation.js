export const passwordHint = 'Mật khẩu từ 8–128 ký tự, gồm ít nhất một chữ cái và một chữ số.';
export function validateFields(values, mode) {
  const errors = {};
  if (mode !== 'reset') {
    const email = values.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Vui lòng nhập email hợp lệ.';
  }
  if (mode === 'register' && (!values.full_name.trim() || [...values.full_name.trim()].length > 150))
    errors.full_name = 'Họ và tên phải từ 1–150 ký tự.';
  if (mode !== 'forgot') {
    const password = values.password;
    if ([...password].length < 8 || [...password].length > 128 || !/\p{L}/u.test(password) || !/\p{Nd}/u.test(password))
      errors.password = passwordHint;
    if (mode === 'reset' && values.confirm !== password) errors.confirm = 'Mật khẩu xác nhận chưa khớp.';
  }
  return errors;
}
