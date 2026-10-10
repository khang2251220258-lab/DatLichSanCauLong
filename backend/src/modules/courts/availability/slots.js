import { AuthError, invalid } from '../../auth/errors.js';
export { requestId } from '../../users/owner-requests/validation.js';
export const timezone = 'Asia/Ho_Chi_Minh';
export const invalidDate = () => new AuthError(422, 'INVALID_DATE', 'Ngày xem lịch không hợp lệ.');
export function dateQuery(query) {
  if (Object.keys(query).some(k => k !== 'date')) throw invalid();
  const value = query.date;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) throw invalidDate();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw invalidDate();
  return value;
}
const minutes = value => value.getUTCHours() * 60 + value.getUTCMinutes();
const overlap = (a, b, start, end) => +a < end && +b > start;
export function buildSlots({ facility, rules, blocks, bookings, dayStart, now }) {
  const open = minutes(facility.opening_time), close = minutes(facility.closing_time);
  if (![facility.opening_time, facility.closing_time].every(v => Number.isFinite(+v) && v.getUTCMinutes() % 30 === 0 && v.getUTCSeconds() === 0 && v.getUTCMilliseconds() === 0) || close <= open)
    throw new AuthError(409, 'FACILITY_NOT_CONFIGURED', 'Giờ hoạt động chưa được cấu hình hợp lệ.');
  const slots = [];
  for (let minute = open; minute < close; minute += 30) {
    const start = +dayStart + minute * 60000, end = start + 1800000;
    const covering = rules.filter(r => minutes(r.start_time) <= minute && minutes(r.end_time) >= minute + 30);
    if (covering.length > 1) throw new AuthError(409, 'PRICE_NOT_CONFIGURED', 'Bảng giá không nhất quán.');
    let slot_amount = null;
    if (covering.length) {
      const rate = BigInt(covering[0].hourly_rate.toString());
      slot_amount = String(rate / 2n) + (rate % 2n ? '.5' : '');
    }
    const occupied = bookings.filter(b => overlap(b.start_at, b.end_at, start, end));
    const state = start <= +now ? 'PAST'
      : blocks.some(b => overlap(b.start_at, b.end_at, start, end)) ? 'BLOCKED'
      : occupied.some(b => b.status === 'CONFIRMED') ? 'BOOKED'
      : occupied.some(b => b.status === 'PENDING_CONFIRMATION' || (b.status === 'PENDING_PAYMENT' && +now < +b.expires_at)) ? 'HELD'
      : slot_amount === null ? 'UNPRICED' : 'AVAILABLE';
    slots.push({ start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), state, slot_amount });
  }
  return slots;
}
