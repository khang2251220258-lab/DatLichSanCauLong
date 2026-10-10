import { AuthError, invalid } from '../auth/errors.js';
import { requestId } from '../users/owner-requests/validation.js';
export { requestId, pagination } from '../users/owner-requests/validation.js';

export const fail = (code, status = 409) => new AuthError(status, code, {
  INVALID_TIME_RANGE: 'Khoảng thời gian không hợp lệ.', BOOKING_TOO_LONG: 'Chỉ được đặt tối đa 3 giờ.',
  BOOKING_IN_PAST: 'Giờ bắt đầu phải ở tương lai.', BOOKING_TOO_FAR: 'Chỉ được đặt trước tối đa 30 ngày.',
  FACILITY_UNAVAILABLE: 'Cơ sở không thể nhận đặt sân.', COURT_UNAVAILABLE: 'Sân không hoạt động.',
  SLOT_UNAVAILABLE: 'Khung giờ không còn trống.', PRICE_NOT_CONFIGURED: 'Bảng giá chưa được cấu hình hợp lệ.',
  BANK_ACCOUNT_NOT_CONFIGURED: 'Thông tin chuyển khoản chưa được cấu hình hợp lệ.',
  BOOKING_AMOUNT_TOO_LARGE: 'Số tiền đặt sân vượt giới hạn cho phép.',
  BOOKING_EXPIRED: 'Booking đã hết thời gian thanh toán.',
  CANCELLATION_NOT_ALLOWED: 'Booking không thể hủy ở trạng thái hiện tại.',
  CANCELLATION_POLICY_NOT_CONFIGURED: 'Booking không có chính sách hủy đã lưu.',
  CANCELLATION_DEADLINE_PASSED: 'Đã qua thời hạn cho phép hủy booking.',
  INCONSISTENT_PAYMENT_STATE: 'Trạng thái thanh toán của booking không nhất quán.',
  INVALID_BOOKING_STATE: 'Trạng thái booking không cho phép thao tác này.',
}[code] || 'Không thể xử lý yêu cầu.');
export const local = date => new Date(+date + 7 * 3600000);
export const minute = date => date.getUTCHours() * 60 + date.getUTCMinutes();
const rangeError = () => fail('INVALID_TIME_RANGE', 422);
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || value.startsWith('0000')) throw rangeError();
  const date = new Date(value), canonical = value.length === 20 ? value.replace('Z', '.000Z') : value;
  if (!Number.isFinite(+date) || date.toISOString() !== canonical || date.getUTCSeconds() || date.getUTCMilliseconds() || date.getUTCMinutes() % 30) throw rangeError();
  return date;
}
export function input(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 3 ||
      Object.keys(body).some(k => !['court_id', 'start_at', 'end_at'].includes(k))) throw invalid();
  if (typeof body.start_at !== 'string' || typeof body.end_at !== 'string') throw invalid();
  const court_id = requestId(body.court_id), start_at = timestamp(body.start_at), end_at = timestamp(body.end_at);
  const duration = end_at - start_at;
  if (duration <= 0 || duration % 1800000 || local(start_at).toISOString().slice(0,10) !== local(end_at).toISOString().slice(0,10)) throw rangeError();
  if (duration > 10800000) throw fail('BOOKING_TOO_LONG', 422);
  return { court_id, start_at, end_at };
}
export function cancellationInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid();
  const keys = Object.keys(body);
  if (keys.length > 1 || keys.some(key => key !== 'reason')) throw invalid();
  if (!Object.hasOwn(body, 'reason')) return null;
  if (typeof body.reason !== 'string') throw invalid();
  const reason = body.reason.trim();
  if ([...reason].length > 500) throw invalid();
  return reason || null;
}
export function confirmedCancellationError(booking, now) {
  if (booking.cancellation_cutoff_hours_snapshot === null) return 'CANCELLATION_POLICY_NOT_CONFIGURED';
  const deadline = new Date(+booking.start_at - booking.cancellation_cutoff_hours_snapshot * 3600000);
  return now >= deadline ? 'CANCELLATION_DEADLINE_PASSED' : null;
}
export function validateTime(input, facility, now) {
  if (input.start_at <= now) throw fail('BOOKING_IN_PAST', 422);
  if (+input.start_at > +now + 30 * 86400000) throw fail('BOOKING_TOO_FAR', 422);
  if (minute(local(input.start_at)) < minute(facility.opening_time) || minute(local(input.end_at)) > minute(facility.closing_time)) throw rangeError();
}
export function priceSlots(input, rules) {
  const slots = []; let halfUnits = 0n;
  for (let start = +input.start_at; start < +input.end_at; start += 1800000) {
    const at = minute(local(new Date(start)));
    const covering = rules.filter(r => minute(r.start_time) <= at && minute(r.end_time) >= at + 30);
    if (covering.length !== 1 || !/^[1-9]\d*$/.test(covering[0].hourly_rate.toString())) throw fail('PRICE_NOT_CONFIGURED');
    const rate = BigInt(covering[0].hourly_rate.toString());
    if (rate > 999999999999n) throw fail('BOOKING_AMOUNT_TOO_LARGE', 422);
    halfUnits += rate;
    slots.push({ start_at: new Date(start), end_at: new Date(start + 1800000), hourly_rate_snapshot: String(rate), slot_amount: String(rate / 2n) + (rate % 2n ? '.5' : '') });
  }
  const total = (halfUnits + 1n) / 2n, deposit = (total * 30n + 50n) / 100n;
  if (total > 999999999999n) throw fail('BOOKING_AMOUNT_TOO_LARGE', 422);
  return { slots, total_amount: String(total), deposit_amount: String(deposit), remaining_amount: String(total - deposit) };
}
