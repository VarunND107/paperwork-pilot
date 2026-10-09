import { describe, expect, it } from 'vitest';
import {
  addDays,
  addDuration,
  addMonths,
  dateOnlyFromDb,
  dateOnlyToDb,
  daysBetween,
  indiaToday,
  isDateOnly,
  parseDateOnly,
} from './dates.js';

describe('isDateOnly', () => {
  it('accepts real calendar dates', () => {
    expect(isDateOnly('2026-10-09')).toBe(true);
    expect(isDateOnly('2024-02-29')).toBe(true);
    expect(isDateOnly('2026-12-31')).toBe(true);
  });

  it('rejects impossible and malformed dates', () => {
    expect(isDateOnly('2025-02-29')).toBe(false);
    expect(isDateOnly('2026-02-30')).toBe(false);
    expect(isDateOnly('2026-13-01')).toBe(false);
    expect(isDateOnly('2026-00-10')).toBe(false);
    expect(isDateOnly('2026-1-9')).toBe(false);
    expect(isDateOnly('09-10-2026')).toBe(false);
    expect(isDateOnly('2026-10-09T00:00:00Z')).toBe(false);
    expect(isDateOnly('')).toBe(false);
    expect(isDateOnly('abc')).toBe(false);
  });
});

describe('parseDateOnly', () => {
  it('splits a date', () => {
    expect(parseDateOnly('2026-10-09')).toEqual({ y: 2026, m: 10, d: 9 });
  });
  it('throws on an invalid date', () => {
    expect(() => parseDateOnly('2026-02-30')).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it.each([
    ['2026-10-01', 21, '2026-10-22'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2025-02-28', 1, '2025-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-10-09', 0, '2026-10-09'],
    ['2026-01-01', 365, '2027-01-01'],
    ['2024-01-01', 366, '2025-01-01'],
  ])('%s + %i days = %s', (start, n, expected) => {
    expect(addDays(start, n)).toBe(expected);
  });
});

describe('addMonths', () => {
  it.each([
    ['2026-10-09', 3, '2027-01-09'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-01-15', -1, '2025-12-15'],
    ['2026-05-31', 1, '2026-06-30'],
    ['2026-10-09', 0, '2026-10-09'],
    ['2026-10-09', 12, '2027-10-09'],
    ['2026-10-09', 25, '2028-11-09'],
    ['2026-01-31', -13, '2024-12-31'],
  ])('%s + %i months = %s', (start, n, expected) => {
    expect(addMonths(start, n)).toBe(expected);
  });

  it('never rolls over into the following month', () => {
    for (let month = 1; month <= 12; month++) {
      const start = `2026-${String(month).padStart(2, '0')}-31`;
      if (!isDateOnly(start)) continue;
      const result = addMonths(start, 1);
      const { m } = parseDateOnly(result);
      expect(m).toBe((month % 12) + 1);
    }
  });
});

describe('addDuration', () => {
  it('adds days, weeks and months', () => {
    expect(addDuration('2026-10-01', { amount: 21, unit: 'DAY' })).toBe('2026-10-22');
    expect(addDuration('2026-10-01', { amount: 1, unit: 'WEEK' })).toBe('2026-10-08');
    expect(addDuration('2026-10-01', { amount: 3, unit: 'MONTH' })).toBe('2027-01-01');
    expect(addDuration('2026-10-01', { amount: 0, unit: 'DAY' })).toBe('2026-10-01');
  });
});

describe('daysBetween', () => {
  it('counts whole days, signed', () => {
    expect(daysBetween('2026-10-01', '2026-10-22')).toBe(21);
    expect(daysBetween('2026-10-22', '2026-10-01')).toBe(-21);
    expect(daysBetween('2026-10-09', '2026-10-09')).toBe(0);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });
});

describe('indiaToday', () => {
  it('uses the calendar date in India, not in UTC', () => {
    expect(indiaToday(new Date('2026-10-09T18:29:59Z'))).toBe('2026-10-09');
    expect(indiaToday(new Date('2026-10-09T18:30:00Z'))).toBe('2026-10-10');
    expect(indiaToday(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
    expect(indiaToday(new Date('2025-12-31T20:00:00Z'))).toBe('2026-01-01');
    expect(indiaToday(new Date('2026-06-15T12:00:00Z'))).toBe('2026-06-15');
  });
});

describe('database date conversion', () => {
  it('round-trips a DATE column', () => {
    expect(dateOnlyToDb('2026-10-09').toISOString()).toBe('2026-10-09T00:00:00.000Z');
    expect(dateOnlyFromDb(new Date('2026-10-09T00:00:00Z'))).toBe('2026-10-09');
    expect(dateOnlyFromDb(dateOnlyToDb('2024-02-29'))).toBe('2024-02-29');
  });
});
