import { invalid } from '../auth/errors.js';

const OVERVIEW_KEYS = new Set(['from', 'to', 'facility_id']);
const COURT_KEYS = new Set([...OVERVIEW_KEYS, 'page', 'page_size']);
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

function one(value) {
  return typeof value === 'string' ? value : null;
}

function localDate(value) {
  const text = one(value);
  const match = text?.match(DATE);
  if (!match) throw invalid();
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw invalid();
  return { text, epochDay: Date.UTC(year, month - 1, day) / 86_400_000 };
}

function positiveBigInt(value) {
  const text = one(value);
  if (!text || !POSITIVE_INTEGER.test(text)) throw invalid();
  try { return BigInt(text); } catch { throw invalid(); }
}

function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  const text = one(value);
  if (!text || !POSITIVE_INTEGER.test(text)) throw invalid();
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > maximum) throw invalid();
  return number;
}

function analyticsQuery(query, allowed) {
  if (!query || Object.keys(query).some(key => !allowed.has(key))) throw invalid();
  const from = localDate(query.from);
  const to = localDate(query.to);
  const inclusiveDays = to.epochDay - from.epochDay + 1;
  if (inclusiveDays < 1 || inclusiveDays > 366) throw invalid();
  return {
    from: from.text,
    to: to.text,
    facility_id: query.facility_id === undefined ? null : positiveBigInt(query.facility_id),
  };
}

export function overviewQuery(query) {
  return analyticsQuery(query, OVERVIEW_KEYS);
}

export function courtsQuery(query) {
  return {
    ...analyticsQuery(query, COURT_KEYS),
    page: positiveInteger(query.page, 1, Number.MAX_SAFE_INTEGER),
    page_size: positiveInteger(query.page_size, 20, 100),
  };
}
