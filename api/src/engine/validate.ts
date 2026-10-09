import { findUnreachableDocuments } from './documents.js';
import { CycleError, findCycle, GraphError, type GraphErrorCode, validateGraph } from './graph.js';
import type { RouteStepInput } from './route.js';

export type RouteProblem =
  | { code: 'cycle'; cycle: string[]; message: string }
  | { code: GraphErrorCode; stepId: string | undefined; message: string }
  | { code: 'unreachable_document'; stepId: string; documentId: string; message: string };

/**
 * Checks a whole route definition before it is saved. Returns every problem found
 * (an empty list means the route is sound):
 *  - the step list is malformed (duplicate ids, unknown or self references)
 *  - the dependencies contain a cycle (rejected on save)
 *  - a document can never be held because its producing steps are not upstream
 */
export function validateRoute(steps: readonly RouteStepInput[]): RouteProblem[] {
  try {
    validateGraph(steps);
  } catch (error) {
    if (error instanceof GraphError) {
      return [{ code: error.code, stepId: error.stepId, message: error.message }];
    }
    throw error;
  }

  const cycle = findCycle(steps);
  if (cycle) {
    return [{ code: 'cycle', cycle, message: new CycleError(cycle).message }];
  }

  const requirements = new Map(steps.map((s) => [s.id, s.requires]));
  return findUnreachableDocuments(steps, requirements).map((p) => ({
    code: 'unreachable_document' as const,
    stepId: p.stepId,
    documentId: p.documentId,
    message: p.message,
  }));
}
