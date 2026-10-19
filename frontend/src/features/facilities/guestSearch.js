const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):(?:00|30)$/;

export const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

export function localSearchDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

export function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function intervalFrom(params) {
  const values = ['date', 'start_time', 'end_time'].map(key => params.get(key) || '');
  return values.every(Boolean) ? { date: values[0], start_time: values[1], end_time: values[2] } : null;
}

export function validateSearchInterval({ date, start_time, end_time }, today = localSearchDate()) {
  if (!DATE.test(date) || date < today || date > addDays(today, 30)) return 'Ngày chơi phải từ hôm nay đến tối đa 30 ngày tới.';
  if (!TIME.test(start_time) || !TIME.test(end_time)) return 'Giờ chơi phải theo mốc 30 phút.';
  const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const duration = minutes(end_time) - minutes(start_time);
  if (duration < 30 || duration > 180) return 'Khoảng chơi phải từ 30 phút đến tối đa 3 giờ.';
  return '';
}

export function searchContext(params) {
  const interval = intervalFrom(params);
  // Detail navigation preserves a previously accepted search. Availability
  // performs the authoritative current-date check again.
  if (!interval || validateSearchInterval(interval, interval.date)) return null;
  return {
    ...interval,
    district: params.get('district') || '',
    q: params.get('q') || '',
  };
}

export function resultDetailPath(facility, params) {
  const next = new URLSearchParams();
  for (const key of ['q', 'district', 'date', 'start_time', 'end_time']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  if (Array.isArray(facility.matching_courts) && facility.matching_courts.length) {
    next.set('matching_courts', facility.matching_courts.map(court => court.id).join(','));
  }
  return `/facilities/${encodeURIComponent(facility.id)}${next.size ? `?${next}` : ''}`;
}

export function listReturnPath(params) {
  const next = new URLSearchParams();
  for (const key of ['q', 'district', 'date', 'start_time', 'end_time', 'page', 'page_size']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  return `/facilities${next.size ? `?${next}` : ''}`;
}

export function matchingCourtIds(params, courts) {
  const raw = params.get('matching_courts');
  if (!raw) return [];
  const allowed = new Set(courts.map(court => String(court.id)));
  return [...new Set(raw.split(',').filter(id => /^[1-9]\d*$/.test(id) && allowed.has(id)))];
}
