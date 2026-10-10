import { localDate, localTime, selectionFrom } from '../facilities/detailRules';
import { bookingStatusLabels } from '../../domain/statusLabels';

export const bookingLabels = bookingStatusLabels;
export const dayLabel = stamp => localDate(stamp).split('-').reverse().join('/');
export const stampLabel = stamp => dayLabel(stamp) + ' ' + localTime(stamp);
export function estimate(slots) {
  // API amounts have at most two decimal places. Round once after summing.
  let cents = 0n;
  for (const slot of slots) {
    if (!/^\d+(\.\d{1,2})?$/.test(String(slot.slot_amount))) return null;
    const [whole, fraction = ''] = String(slot.slot_amount).split('.');
    cents += BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  }
  const total = (cents + 50n) / 100n;
  const deposit = (total * 30n + 50n) / 100n;
  return { total_amount: String(total), deposit_amount: String(deposit), remaining_amount: String(total - deposit) };
}
export function validDraft(draft, facilityId) {
  if (!draft || draft.facility.id !== facilityId || !draft.slots?.length) return false;
  const range = selectionFrom(draft.slots, draft.slots.map((_, i) => i), draft.court.id, localDate(draft.selection.start_at));
  return range && Object.keys(range).every(k => range[k] === draft.selection[k]) && estimate(draft.slots);
}
const createMessages = {
  SLOT_UNAVAILABLE: 'Khung giờ vừa thay đổi hoặc đã được đặt. Vui lòng chọn lại.',
  FACILITY_UNAVAILABLE: 'Cơ sở hiện không thể nhận đặt sân.', COURT_UNAVAILABLE: 'Sân hiện không thể nhận đặt lịch.',
  PRICE_NOT_CONFIGURED: 'Bảng giá chưa sẵn sàng. Vui lòng kiểm tra lại sau.',
  BANK_ACCOUNT_NOT_CONFIGURED: 'Cơ sở chưa cấu hình thông tin nhận cọc.',
  INVALID_TIME_RANGE: 'Khung giờ không hợp lệ. Vui lòng chọn lại các slot liên tiếp.',
  BOOKING_IN_PAST: 'Giờ bắt đầu đã qua. Vui lòng chọn lại.',
  BOOKING_TOO_LONG: 'Chỉ được chọn tối đa 3 giờ (6 slot).',
  BOOKING_TOO_FAR: 'Chỉ được đặt trước tối đa 30 ngày.',
  BOOKING_AMOUNT_TOO_LARGE: 'Số tiền vượt giới hạn cho phép. Vui lòng chọn lại.',
  CANCELLATION_POLICY_NOT_CONFIGURED: 'Booking này không có chính sách hủy đã lưu nên không thể tự hủy.',
  CANCELLATION_DEADLINE_PASSED: 'Đã qua thời hạn cho phép hủy booking.',
  CANCELLATION_NOT_ALLOWED: 'Booking hiện không thể hủy.',
  INCONSISTENT_PAYMENT_STATE: 'Trạng thái thanh toán chưa nhất quán. Vui lòng liên hệ hỗ trợ.',
  INVALID_BOOKING_STATE: 'Trạng thái booking đã thay đổi. Dữ liệu đang được đồng bộ lại.',
};
export function bookingError(error) {
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập và chọn lại khung giờ.';
  if (error.status === 403) return 'Không có quyền hoặc phiên bảo mật không hợp lệ. Vui lòng kiểm tra lại phiên đăng nhập.';
  if (error.status === 404) return 'Không tìm thấy booking hoặc bạn không có quyền xem booking này.';
  return createMessages[error.code] || (error.status === 422 ? 'Thông tin không hợp lệ. Vui lòng kiểm tra lại.' : 'Chưa thể tải dữ liệu. Vui lòng thử lại.');
}
