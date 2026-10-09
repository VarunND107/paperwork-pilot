import { describe, expect, it } from 'vitest';
import { isStale, STALE_AFTER_DAYS } from './verification.js';

const now = new Date('2026-10-09T12:00:00Z');
const daysAgo = (n: number, extraMs = 0) => new Date(now.getTime() - n * 86_400_000 - extraMs);

describe('isStale', () => {
  it('treats a step that was never verified as stale', () => {
    expect(isStale(null, now)).toBe(true);
  });

  it('is fresh when verified recently', () => {
    expect(isStale(daysAgo(0), now)).toBe(false);
    expect(isStale(daysAgo(1), now)).toBe(false);
    expect(isStale(daysAgo(89), now)).toBe(false);
  });

  it('is still fresh at exactly 90 days and stale one millisecond later', () => {
    expect(STALE_AFTER_DAYS).toBe(90);
    expect(isStale(daysAgo(90), now)).toBe(false);
    expect(isStale(daysAgo(90, 1), now)).toBe(true);
  });

  it('is stale when verified long ago', () => {
    expect(isStale(daysAgo(91), now)).toBe(true);
    expect(isStale(daysAgo(400), now)).toBe(true);
  });

  it('treats a date in the future as fresh', () => {
    expect(isStale(new Date(now.getTime() + 86_400_000), now)).toBe(false);
  });

  it('accepts a custom window', () => {
    expect(isStale(daysAgo(10), now, 7)).toBe(true);
    expect(isStale(daysAgo(10), now, 30)).toBe(false);
  });
});
