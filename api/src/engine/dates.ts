import type { DateOnly, Due } from './types.js';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export interface YMD {
  y: number;
  m: number;
  d: number;
}

/** True only for real calendar dates in `YYYY-MM-DD` form ("2026-02-30" is not one). */
export function isDateOnly(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

export function parseDateOnly(value: DateOnly): YMD {
  if (!isDateOnly(value)) throw new RangeError(`Not a valid YYYY-MM-DD date: "${value}"`);
  const match = DATE_RE.exec(value);
  return { y: Number(match?.[1]), m: Number(match?.[2]), d: Number(match?.[3]) };
}

function format(ms: number): DateOnly {
  const date = new Date(ms);
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMs(value: DateOnly): number {
  const { y, m, d } = parseDateOnly(value);
  return Date.UTC(y, m - 1, d);
}

export function addDays(value: DateOnly, days: number): DateOnly {
  return format(toMs(value) + days * DAY_MS);
}

/**
 * Adds calendar months. When the target month is shorter the day is clamped to its last day, so
 * 31 January plus one month is 28 (or 29) February, never 3 March.
 */
export function addMonths(value: DateOnly, months: number): DateOnly {
  const { y, m, d } = parseDateOnly(value);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12; // 0-11
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return format(Date.UTC(year, month, Math.min(d, lastDay)));
}

export function addDuration(value: DateOnly, due: Due): DateOnly {
  switch (due.unit) {
    case 'DAY':
      return addDays(value, due.amount);
    case 'WEEK':
      return addDays(value, due.amount * 7);
    case 'MONTH':
      return addMonths(value, due.amount);
  }
}

/** Whole days from `from` to `to`. Positive when `to` is later. */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** The calendar date in India (Asia/Kolkata, UTC+5:30, no daylight saving) at the instant `now`. */
export function indiaToday(now: Date): DateOnly {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/** Reads a database DATE column (midnight UTC) as a calendar date. */
export function dateOnlyFromDb(value: Date): DateOnly {
  return format(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Converts a calendar date to the midnight-UTC `Date` that Prisma stores in a DATE column. */
export function dateOnlyToDb(value: DateOnly): Date {
  return new Date(toMs(value));
}
