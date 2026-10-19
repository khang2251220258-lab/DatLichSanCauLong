import { AuthError } from '../../auth/errors.js';

const DAY_MS = 86_400_000;
const invalid = () => new AuthError(422, 'INVALID_RECURRENCE', 'Lịch cố định không hợp lệ.');
const tooLong = () => new AuthError(422, 'RECURRENCE_TOO_LONG', 'Lịch cố định vượt quá giới hạn cho phép.');

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) throw invalid();
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw invalid();
  return date;
}
function parseTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):(00|30)$/.test(value)) throw invalid();
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}
const isoWeekday = date => date.getUTCDay() || 7;
const localUtc = (date, time) => new Date(`${date.toISOString().slice(0, 10)}T${time}:00.000+07:00`);

export function expandRecurrence({ weekday, start_date, end_date, start_time, end_time }) {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw invalid();
  const startDate = parseDate(start_date), endDate = parseDate(end_date);
  const inclusiveDays = Math.floor((endDate - startDate) / DAY_MS) + 1;
  if (inclusiveDays < 1) throw invalid();
  if (inclusiveDays > 93) throw tooLong();
  const startMinutes = parseTime(start_time), endMinutes = parseTime(end_time);
  const duration = endMinutes - startMinutes;
  if (duration < 30 || duration > 180 || duration % 30 !== 0) throw invalid();

  const first = new Date(+startDate + ((weekday - isoWeekday(startDate) + 7) % 7) * DAY_MS);
  const occurrences = [];
  for (let day = first; day <= endDate; day = new Date(+day + 7 * DAY_MS)) {
    occurrences.push({ start_at: localUtc(day, start_time), end_at: localUtc(day, end_time) });
  }
  if (!occurrences.length) throw invalid();
  if (occurrences.length > 14) throw tooLong();
  return occurrences;
}
