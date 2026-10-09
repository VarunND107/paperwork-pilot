import { topologicalSort, validateGraph } from './graph.js';
import type { StepNode, StepStatus } from './types.js';

export interface StatusInfo {
  status: StepStatus;
  /** Ids of the steps this one is still waiting for, in route order. Empty unless locked. */
  blockedBy: string[];
}

/**
 * done   the user marked it done
 * ready  not done, and every step it needs is done
 * locked not done, and at least one step it needs is not done
 *
 * A step that is marked done stays done even if its prerequisites later change (for example an
 * admin adds a new dependency); the user's record is never silently rewritten.
 */
export function computeStatuses(
  steps: readonly StepNode[],
  doneIds: ReadonlySet<string>,
): Map<string, StatusInfo> {
  validateGraph(steps);
  const order = topologicalSort(steps);
  const rank = new Map(order.map((id, i) => [id, i]));
  const result = new Map<string, StatusInfo>();
  for (const step of steps) {
    if (doneIds.has(step.id)) {
      result.set(step.id, { status: 'done', blockedBy: [] });
      continue;
    }
    const blockedBy = [...new Set(step.needs)]
      .filter((need) => !doneIds.has(need))
      .sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    result.set(step.id, { status: blockedBy.length > 0 ? 'locked' : 'ready', blockedBy });
  }
  return result;
}

/** The first step, in route order, that the user can work on right now. */
export function findNextStep(
  order: readonly string[],
  statuses: ReadonlyMap<string, StatusInfo>,
): string | null {
  for (const id of order) {
    if (statuses.get(id)?.status === 'ready') return id;
  }
  return null;
}

export interface StatusChanges {
  /** locked -> ready: finishing a step opened these up. */
  unlocked: string[];
  /** ready -> locked: undoing a step closed these again. */
  relocked: string[];
}

/** What changed between two status maps, in route order. */
export function diffStatuses(
  order: readonly string[],
  before: ReadonlyMap<string, StatusInfo>,
  after: ReadonlyMap<string, StatusInfo>,
): StatusChanges {
  const unlocked: string[] = [];
  const relocked: string[] = [];
  for (const id of order) {
    const was = before.get(id)?.status;
    const now = after.get(id)?.status;
    if (was === 'locked' && now === 'ready') unlocked.push(id);
    if (was === 'ready' && now === 'locked') relocked.push(id);
  }
  return { unlocked, relocked };
}
