/** A step is stale when it was last verified more than this many days ago, or never. */
export const STALE_AFTER_DAYS = 90;

const DAY_MS = 86_400_000;

/**
 * Has this record gone stale? `null` (never verified) is stale. Exactly 90 days old is still fresh;
 * one millisecond older is stale. `now` is passed in so the function stays pure.
 */
export function isStale(
  lastVerifiedAt: Date | null,
  now: Date,
  staleAfterDays: number = STALE_AFTER_DAYS,
): boolean {
  if (lastVerifiedAt === null) return true;
  return now.getTime() - lastVerifiedAt.getTime() > staleAfterDays * DAY_MS;
}
