import { isHeld } from './documents.js';
import type { RouteView } from './route.js';
import type { CaseHealthStatus } from './types.js';

export interface CaseHealth {
  status: CaseHealthStatus;
  /** The step to do next, or null when the route is complete. */
  nextStepId: string | null;
  /** Steps past their deadline and not done. */
  overdueStepIds: string[];
  /** Documents the next step still needs. */
  missingDocumentIds: string[];
}

/**
 * The status pill on the professional dashboard.
 *  Overdue         a step that is not done is past its deadline
 *  Needs document  nothing is overdue, but the next step still needs a document the client lacks
 *  On track        everything else, including a finished route
 */
export function caseHealth(route: RouteView): CaseHealth {
  const overdueStepIds = route.steps
    .filter((s) => s.status !== 'done' && s.deadlineState === 'overdue')
    .map((s) => s.id);
  const next = route.steps.find((s) => s.isNext);
  const missingDocumentIds = next
    ? next.docs.filter((d) => !isHeld(d.state)).map((d) => d.documentId)
    : [];

  let status: CaseHealth['status'] = 'on_track';
  if (overdueStepIds.length > 0) status = 'overdue';
  else if (missingDocumentIds.length > 0) status = 'needs_document';

  return { status, nextStepId: route.nextStepId, overdueStepIds, missingDocumentIds };
}
