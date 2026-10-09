import { describe, expect, it } from 'vitest';
import { computeDeadline, daysLeft, deadlineState, isDueWithin } from './deadlines.js';

describe('computeDeadline', () => {
  it('counts "within 21 days" from the event date', () => {
    expect(computeDeadline('2026-10-01', { amount: 21, unit: 'DAY' })).toBe('2026-10-22');
  });

  it('supports weeks and calendar months', () => {
    expect(computeDeadline('2026-10-01', { amount: 1, unit: 'WEEK' })).toBe('2026-10-08');
    expect(computeDeadline('2026-10-01', { amount: 3, unit: 'MONTH' })).toBe('2027-01-01');
    expect(computeDeadline('2026-11-30', { amount: 3, unit: 'MONTH' })).toBe('2027-02-28');
  });

  it('treats "by the event date" as the event date itself', () => {
    expect(computeDeadline('2026-10-01', { amount: 0, unit: 'DAY' })).toBe('2026-10-01');
  });

  it('is null without an event date', () => {
    expect(computeDeadline(null, { amount: 21, unit: 'DAY' })).toBeNull();
  });

  it('is null for a step with no machine-readable deadline', () => {
    expect(computeDeadline('2026-10-01', null)).toBeNull();
  });
});

describe('daysLeft', () => {
  it('is zero on the deadline day and counts down to it', () => {
    expect(daysLeft('2026-10-22', '2026-10-22')).toBe(0);
    expect(daysLeft('2026-10-22', '2026-10-15')).toBe(7);
  });
  it('goes negative once the deadline has passed', () => {
    expect(daysLeft('2026-10-22', '2026-10-24')).toBe(-2);
  });
  it('is null without a deadline', () => {
    expect(daysLeft(null, '2026-10-22')).toBeNull();
  });
});

describe('deadlineState', () => {
  const deadline = '2026-10-22';
  it.each([
    ['2026-10-10', 'upcoming'],
    ['2026-10-18', 'upcoming'], // 4 days left
    ['2026-10-19', 'due_soon'], // 3 days left
    ['2026-10-21', 'due_soon'],
    ['2026-10-22', 'due_soon'], // the deadline day itself is still on time
    ['2026-10-23', 'overdue'],
    ['2027-01-01', 'overdue'],
  ])('on %s the state is %s', (today, expected) => {
    expect(deadlineState(deadline, today)).toBe(expected);
  });

  it('is none without a deadline', () => {
    expect(deadlineState(null, '2026-10-22')).toBe('none');
  });

  it('accepts a custom "soon" window', () => {
    expect(deadlineState(deadline, '2026-10-15', 7)).toBe('due_soon');
    expect(deadlineState(deadline, '2026-10-14', 7)).toBe('upcoming');
  });
});

describe('isDueWithin', () => {
  const deadline = '2026-10-22';
  it('includes today and the whole window', () => {
    expect(isDueWithin(deadline, '2026-10-22', 3)).toBe(true);
    expect(isDueWithin(deadline, '2026-10-20', 3)).toBe(true);
    expect(isDueWithin(deadline, '2026-10-19', 3)).toBe(true);
  });
  it('excludes deadlines further away and ones already past', () => {
    expect(isDueWithin(deadline, '2026-10-18', 3)).toBe(false);
    expect(isDueWithin(deadline, '2026-10-23', 3)).toBe(false);
  });
  it('is false without a deadline', () => {
    expect(isDueWithin(null, '2026-10-22', 3)).toBe(false);
  });
});
