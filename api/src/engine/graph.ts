import type { StepNode } from './types.js';

export type GraphErrorCode = 'duplicate_step' | 'unknown_step' | 'self_dependency';

/** The step list itself is malformed (not a cycle: see CycleError). */
export class GraphError extends Error {
  constructor(
    readonly code: GraphErrorCode,
    message: string,
    readonly stepId?: string,
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

/**
 * The dependency edges loop back on themselves.
 * `cycle` lists step ids following "needs" edges, first id repeated at the end:
 * `[a, b, c, a]` means a needs b, b needs c, and c needs a.
 */
export class CycleError extends Error {
  constructor(readonly cycle: readonly string[]) {
    super(`Dependency cycle: ${cycle.join(' -> ')}`);
    this.name = 'CycleError';
  }
}

const byPosition = (a: StepNode, b: StepNode): number =>
  a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Index the steps by id, rejecting duplicate ids, unknown references and self-dependencies. */
function indexSteps(steps: readonly StepNode[]): Map<string, StepNode> {
  const byId = new Map<string, StepNode>();
  for (const step of steps) {
    if (byId.has(step.id)) {
      throw new GraphError('duplicate_step', `Step "${step.id}" appears twice.`, step.id);
    }
    byId.set(step.id, step);
  }
  for (const step of steps) {
    for (const need of step.needs) {
      if (need === step.id) {
        throw new GraphError('self_dependency', `Step "${step.id}" cannot need itself.`, step.id);
      }
      if (!byId.has(need)) {
        throw new GraphError(
          'unknown_step',
          `Step "${step.id}" needs "${need}", which is not in this route.`,
          need,
        );
      }
    }
  }
  return byId;
}

/** Throws GraphError when ids repeat, a need points outside the list, or a step needs itself. */
export function validateGraph(steps: readonly StepNode[]): void {
  indexSteps(steps);
}

function sortedNeeds(step: StepNode, byId: Map<string, StepNode>): string[] {
  return step.needs
    .map((id) => byId.get(id))
    .filter((s): s is StepNode => s !== undefined)
    .sort(byPosition)
    .map((s) => s.id);
}

/**
 * Finds a dependency cycle, or returns null when the steps form a valid DAG.
 * Deterministic: it explores steps in author order.
 */
export function findCycle(steps: readonly StepNode[]): string[] | null {
  const byId = indexSteps(steps);
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>();
  const path: string[] = [];

  const visit = (id: string): string[] | null => {
    colour.set(id, GREY);
    path.push(id);
    const step = byId.get(id);
    for (const need of step ? sortedNeeds(step, byId) : []) {
      const c = colour.get(need) ?? WHITE;
      if (c === GREY) return [...path.slice(path.indexOf(need)), need];
      if (c === WHITE) {
        const found = visit(need);
        if (found) return found;
      }
    }
    path.pop();
    colour.set(id, BLACK);
    return null;
  };

  for (const step of [...steps].sort(byPosition)) {
    if ((colour.get(step.id) ?? WHITE) === WHITE) {
      const found = visit(step.id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Orders the steps so every step comes after the steps it needs. When several steps are
 * available at once, the one with the lowest `position` goes first, so the result is stable and
 * follows the author's order wherever the dependencies allow.
 *
 * @throws CycleError when the dependencies loop; GraphError when the list is malformed.
 */
export function topologicalSort(steps: readonly StepNode[]): string[] {
  const cycle = findCycle(steps);
  if (cycle) throw new CycleError(cycle);
  const byId = indexSteps(steps);

  const remainingNeeds = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const step of steps) {
    remainingNeeds.set(step.id, new Set(step.needs).size);
    for (const need of new Set(step.needs)) {
      const list = dependents.get(need) ?? [];
      list.push(step.id);
      dependents.set(need, list);
    }
  }

  const available = steps.filter((s) => remainingNeeds.get(s.id) === 0).sort(byPosition);
  const order: string[] = [];
  while (available.length > 0) {
    const next = available.shift();
    if (!next) break;
    order.push(next.id);
    for (const childId of dependents.get(next.id) ?? []) {
      const left = (remainingNeeds.get(childId) ?? 0) - 1;
      remainingNeeds.set(childId, left);
      const child = byId.get(childId);
      if (left === 0 && child) {
        available.push(child);
        available.sort(byPosition);
      }
    }
  }
  return order;
}

/** Every step that must be done, directly or indirectly, before `id` (not including `id`). */
export function ancestorsOf(steps: readonly StepNode[], id: string): Set<string> {
  const byId = indexSteps(steps);
  if (!byId.has(id)) throw new GraphError('unknown_step', `No step "${id}" in this route.`, id);
  const seen = new Set<string>();
  const stack = [...(byId.get(id)?.needs ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    stack.push(...(byId.get(next)?.needs ?? []));
  }
  return seen;
}

/** Every step that needs `id`, directly or indirectly (not including `id`). */
export function descendantsOf(steps: readonly StepNode[], id: string): Set<string> {
  const byId = indexSteps(steps);
  if (!byId.has(id)) throw new GraphError('unknown_step', `No step "${id}" in this route.`, id);
  const children = new Map<string, string[]>();
  for (const step of steps) {
    for (const need of step.needs) {
      const list = children.get(need) ?? [];
      list.push(step.id);
      children.set(need, list);
    }
  }
  const seen = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return seen;
}

/**
 * Would adding "stepId needs dependsOnId" create a cycle? Returns the cycle (first id repeated at
 * the end, for example `[stepId, dependsOnId, ..., stepId]`) or null when the edge is safe.
 * This is the check the admin panel runs before saving a dependency.
 */
export function wouldCreateCycle(
  steps: readonly StepNode[],
  stepId: string,
  dependsOnId: string,
): string[] | null {
  const byId = indexSteps(steps);
  for (const id of [stepId, dependsOnId]) {
    if (!byId.has(id)) throw new GraphError('unknown_step', `No step "${id}" in this route.`, id);
  }
  if (stepId === dependsOnId) return [stepId, stepId];

  // Cycle exists iff dependsOnId already (transitively) needs stepId. Find that path by BFS.
  const parent = new Map<string, string>();
  const queue: string[] = [dependsOnId];
  const visited = new Set<string>([dependsOnId]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const step = byId.get(current);
    for (const need of step ? sortedNeeds(step, byId) : []) {
      if (visited.has(need)) continue;
      visited.add(need);
      parent.set(need, current);
      if (need === stepId) {
        const back: string[] = [stepId];
        let at: string | undefined = stepId;
        while (at !== undefined && at !== dependsOnId) {
          at = parent.get(at);
          if (at !== undefined) back.push(at);
        }
        return [stepId, ...back.reverse()];
      }
      queue.push(need);
    }
  }
  return null;
}
