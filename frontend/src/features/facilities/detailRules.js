export const zone = 'Asia/Ho_Chi_Minh';
export const labels = { AVAILABLE:'Có thể chọn', HELD:'Đang được giữ', BOOKED:'Đã đặt', BLOCKED:'Bị khóa', UNPRICED:'Chưa có giá', PAST:'Đã qua' };
export function localDate(instant) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:zone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(instant));
  const get = name => parts.find(p => p.type === name).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export const localTime = instant => new Intl.DateTimeFormat('vi-VN', { timeZone:zone, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date(instant));
export function money(value) {
  if (value === null) return 'Chưa có giá';
  const [integer, fraction] = String(value).split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction ? ',' + fraction : '') + ' ₫';
}
export function selectionFrom(slots, indices, courtId, date) {
  if (!indices.length || indices.length > 6) return null;
  const picked = [...indices].sort((a,b) => a-b).map(i => slots[i]);
  if (picked.some((s,i) => !s || s.state !== 'AVAILABLE' || localDate(s.start_at) !== date || localDate(s.end_at) !== date || Date.parse(s.end_at)-Date.parse(s.start_at)!==1800000 || (i && picked[i-1].end_at !== s.start_at))) return null;
  return { court_id:courtId, start_at:picked[0].start_at, end_at:picked.at(-1).end_at };
}
