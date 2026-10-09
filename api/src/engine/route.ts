import { computeDeadline, daysLeft, deadlineState } from './deadlines.js';
import { type DocRequirement, documentState, isHeld } from './documents.js';
import { GraphError, topologicalSort } from './graph.js';
import { computeStatuses, findNextStep } from './status.js';
import type { DateOnly, DeadlineState, DocState, Due, StepNode, StepStatus } from './types.js';

export interface RouteStepInput extends StepNode {
  /** Machine-readable deadline counted from the event date, if the step has one. */
  due: Due | null;
  requires: readonly DocRequirement[];
}

export interface RouteState {
  doneIds: ReadonlySet<string>;
  /** Documents the user said they hold. Documents that steps hand over are computed, not ticked. */
  tickedDocumentIds: ReadonlySet<string>;
  eventDate: DateOnly | null;
  today: DateOnly;
}

export interface RouteDocView {
  documentId: string;
  state: DocState;
  /** Steps that hand this document over, in route order. */
  comesFrom: string[];
}

export interface RouteStepView {
  id: string;
  /** Position in the route, starting at 1. This is the number the user sees. */
  number: number;
  status: StepStatus;
  /** Steps still to finish before this one, in route order. */
  blockedBy: string[];
  /** The one step to do next (the first ready step). */
  isNext: boolean;
  deadline: DateOnly | null;
  daysLeft: number | null;
  deadlineState: DeadlineState;
  docs: RouteDocView[];
  docsComplete: boolean;
  /** Ready, with every document held. */
  canComplete: boolean;
}

export interface RouteView {
  /** Step ids in route order. */
  order: string[];
  steps: RouteStepView[];
  total: number;
  doneCount: number;
  nextStepId: string | null;
}

/** Everything the user sees about their progress along one route, computed from the raw state. */
export function buildRoute(steps: readonly RouteStepInput[], state: RouteState): RouteView {
  const order = topologicalSort(steps);
  const rank = new Map(order.map((id, i) => [id, i]));
  const statuses = computeStatuses(steps, state.doneIds);
  const nextStepId = findNextStep(order, statuses);
  const byId = new Map(steps.map((s) => [s.id, s]));

  const views = order.map((id): RouteStepView => {
    const step = byId.get(id);
    if (!step) throw new GraphError('unknown_step', `No step "${id}" in this route.`, id);
    const info = statuses.get(id);
    const status: StepStatus = info?.status ?? 'locked';
    const docs = step.requires.map((r): RouteDocView => {
      return {
        documentId: r.documentId,
        state: documentState(r, state.doneIds, state.tickedDocumentIds),
        comesFrom: [...r.producedBy].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)),
      };
    });
    const docsComplete = docs.every((d) => isHeld(d.state));
    const deadline = computeDeadline(state.eventDate, step.due);
    return {
      id,
      number: (rank.get(id) ?? 0) + 1,
      status,
      blockedBy: info?.blockedBy ?? [],
      isNext: id === nextStepId,
      deadline,
      daysLeft: daysLeft(deadline, state.today),
      deadlineState: deadlineState(deadline, state.today),
      docs,
      docsComplete,
      canComplete: status === 'ready' && docsComplete,
    };
  });

  return {
    order,
    steps: views,
    total: views.length,
    doneCount: views.filter((v) => v.status === 'done').length,
    nextStepId,
  };
}

export type CompleteCheck =
  | { ok: true }
  | { ok: false; reason: 'already_done' }
  | { ok: false; reason: 'locked'; blockedBy: string[] }
  | { ok: false; reason: 'documents_missing'; missing: string[] };

/** May this step be marked done right now? A step needs to be ready and all its documents held. */
export function checkComplete(route: RouteView, stepId: string): CompleteCheck {
  const step = route.steps.find((s) => s.id === stepId);
  if (!step) throw new GraphError('unknown_step', `No step "${stepId}" in this route.`, stepId);
  if (step.status === 'done') return { ok: false, reason: 'already_done' };
  if (step.status === 'locked') return { ok: false, reason: 'locked', blockedBy: step.blockedBy };
  const missing = step.docs.filter((d) => !isHeld(d.state)).map((d) => d.documentId);
  if (missing.length > 0) return { ok: false, reason: 'documents_missing', missing };
  return { ok: true };
}
