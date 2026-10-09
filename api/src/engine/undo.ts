import { descendantsOf, topologicalSort } from './graph.js';
import type { StepNode } from './types.js';

export interface UndoResult {
  /** The done set after the undo. The input set is never modified. */
  doneIds: Set<string>;
  /** Every step that went from done to not done, in route order. The first is the one undone. */
  reopened: string[];
}

/**
 * Un-doing a step re-locks everything that depended on it: a step can only stay done while all
 * the steps it needs are done, so every done step downstream is reopened too.
 * Un-doing a step that is not done changes nothing.
 */
export function cascadeUndo(
  steps: readonly StepNode[],
  doneIds: ReadonlySet<string>,
  stepId: string,
): UndoResult {
  const order = topologicalSort(steps);
  const downstream = descendantsOf(steps, stepId); // throws if the step does not exist
  const next = new Set(doneIds);
  const reopened: string[] = [];
  for (const id of order) {
    if (!doneIds.has(id)) continue;
    if (id === stepId || downstream.has(id)) {
      next.delete(id);
      reopened.push(id);
    }
  }
  return { doneIds: next, reopened };
}

/** The steps that are done even though a step they need is not. A consistent record has none. */
export function findInconsistentDone(
  steps: readonly StepNode[],
  doneIds: ReadonlySet<string>,
): string[] {
  return steps
    .filter((s) => doneIds.has(s.id) && s.needs.some((n) => !doneIds.has(n)))
    .map((s) => s.id);
}
