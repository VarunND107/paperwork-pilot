import { addDuration, daysBetween } from './dates.js';
import type { DateOnly, DeadlineState, Due } from './types.js';

/**
 * The last day to finish a step: the event date plus the allowed time.
 * "Within 21 days" of 1 October is 22 October, and 22 October itself is still on time.
 * Returns null when the case has no event date yet or the step has no machine-readable deadline.
 */
export function computeDeadline(eventDate: DateOnly | null, due: Due | null): DateOnly | null {
  if (!eventDate || !due) return null;
  return addDuration(eventDate, due);
}

/** Days from `today` until the deadline. Zero on the day itself, negative once it has passed. */
export function daysLeft(deadline: DateOnly | null, today: DateOnly): number | null {
  return deadline ? daysBetween(today, deadline) : null;
}

/** Overdue after the deadline day, due_soon within `soonDays` days (inclusive), else upcoming. */
export function deadlineState(
  deadline: DateOnly | null,
  today: DateOnly,
  soonDays = 3,
): DeadlineState {
  const left = daysLeft(deadline, today);
  if (left === null) return 'none';
  if (left < 0) return 'overdue';
  if (left <= soonDays) return 'due_soon';
  return 'upcoming';
}

/** True when the deadline is today or falls within the next `days` days. Used by reminders. */
export function isDueWithin(deadline: DateOnly | null, today: DateOnly, days: number): boolean {
  const left = daysLeft(deadline, today);
  return left !== null && left >= 0 && left <= days;
}
