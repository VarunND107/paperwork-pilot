import type { Case } from '../generated/prisma/client.js';
import { indiaToday, dateOnlyFromDb } from '../engine/dates.js';
import { buildRoute, type RouteView } from '../engine/route.js';
import { isStale } from '../engine/verification.js';
import type { DateOnly } from '../engine/types.js';
import type { EventDefinition, LoadedEvent, LoadedStep } from './definition.js';
import {
  type CaseView,
  DISCLAIMER,
  type EventSummary,
  type RouteResponse,
  type StepView,
  type TipView,
} from './types.js';

export interface CaseState {
  doneIds: ReadonlySet<string>;
  doneAt: ReadonlyMap<string, Date>;
  tickedDocumentIds: ReadonlySet<string>;
}

export const EMPTY_CASE_STATE: CaseState = {
  doneIds: new Set(),
  doneAt: new Map(),
  tickedDocumentIds: new Set(),
};

export function eventSummary(
  event: Pick<LoadedEvent, 'id' | 'slug' | 'label' | 'place' | 'eventDateLabel'>,
  steps: readonly { verified: boolean }[],
): EventSummary {
  return {
    id: event.id,
    slug: event.slug,
    label: event.label,
    place: event.place,
    eventDateLabel: event.eventDateLabel,
    stepCount: steps.length,
    isSample: steps.some((s) => !s.verified),
  };
}

const TIPS_SHOWN = 5;

/** The step's own tips and its office's tips, newest first. */
function tipsFor(step: LoadedStep): TipView[] {
  return [
    ...step.tips.map((tip) => ({ tip, scope: 'step' as const })),
    ...(step.office?.tips ?? []).map((tip) => ({ tip, scope: 'office' as const })),
  ]
    .sort((a, b) => b.tip.createdAt.getTime() - a.tip.createdAt.getTime())
    .slice(0, TIPS_SHOWN)
    .map(({ tip, scope }) => tipView(tip, scope));
}

function tipView(tip: LoadedStep['tips'][number], scope: TipView['scope']): TipView {
  return {
    id: tip.id,
    scope,
    body: tip.body,
    origin: tip.origin,
    createdAt: tip.origin === 'USER' ? tip.createdAt.toISOString() : null,
    staleFlags: tip._count.flags,
  };
}

/** Computes the route for one event and one case state. */
export function computeRoute(
  def: EventDefinition,
  state: CaseState,
  eventDate: DateOnly | null,
  now: Date,
): RouteView {
  return buildRoute(def.inputs, {
    doneIds: state.doneIds,
    tickedDocumentIds: state.tickedDocumentIds,
    eventDate,
    today: indiaToday(now),
  });
}

export function buildStepViews(
  def: EventDefinition,
  route: RouteView,
  state: CaseState,
  now: Date,
): StepView[] {
  const stepById = new Map(def.steps.map((s) => [s.id, s]));
  const viewByStepId = new Map(route.steps.map((v) => [v.id, v]));
  const documentName = new Map<string, string>();
  for (const s of def.steps)
    for (const d of s.documents) documentName.set(d.documentId, d.document.name);

  return route.steps.map((v): StepView => {
    const step = stepById.get(v.id);
    if (!step) throw new Error(`Route refers to unknown step ${v.id}`);
    const labels = def.labels.get(step.id);
    return {
      id: step.id,
      number: v.number,
      title: step.title,
      form: step.form,
      where: step.whereText,
      office: step.office
        ? {
            id: step.office.id,
            name: step.office.name,
            kind: step.office.kind,
            url: step.office.url,
          }
        : null,
      fee: step.fee,
      wait: step.waitText,
      due: step.dueText,
      dueRule:
        step.dueAmount !== null && step.dueUnit !== null
          ? { amount: step.dueAmount, unit: step.dueUnit }
          : null,
      deadline: v.deadline,
      daysLeft: v.daysLeft,
      deadlineState: v.deadlineState,
      status: v.status,
      blockedBy: v.blockedBy.map((id) => ({
        id,
        number: viewByStepId.get(id)?.number ?? 0,
        title: stepById.get(id)?.title ?? '',
      })),
      isNext: v.isNext,
      documents: v.docs.map((d) => {
        const from = d.comesFrom[0];
        return {
          documentId: d.documentId,
          label: labels?.get(d.documentId) ?? documentName.get(d.documentId) ?? 'Document',
          state: d.state,
          comesFrom: from ? { stepId: from, number: viewByStepId.get(from)?.number ?? 0 } : null,
        };
      }),
      docsComplete: v.docsComplete,
      canComplete: v.canComplete,
      doneAt: state.doneAt.get(step.id)?.toISOString() ?? null,
      tips: tipsFor(step),
      verification: {
        sourceUrl: step.sourceUrl,
        verified: step.verified,
        lastVerifiedAt: step.lastVerifiedAt?.toISOString() ?? null,
        stale: isStale(step.lastVerifiedAt, now),
      },
    };
  });
}

/** The public preview of a route, with nothing done yet. */
export function buildRouteResponse(
  def: EventDefinition,
  eventDate: DateOnly | null,
  now: Date,
): RouteResponse {
  const route = computeRoute(def, EMPTY_CASE_STATE, eventDate, now);
  return {
    event: eventSummary(def.event, def.steps),
    steps: buildStepViews(def, route, EMPTY_CASE_STATE, now),
    today: indiaToday(now),
    disclaimer: DISCLAIMER,
  };
}

export function caseEventDate(row: Pick<Case, 'eventDate'>): DateOnly | null {
  return row.eventDate ? dateOnlyFromDb(row.eventDate) : null;
}

export function buildCaseView(
  def: EventDefinition,
  row: Pick<Case, 'id' | 'startedAt' | 'eventDate' | 'remindersOptIn' | 'reminderEmail'>,
  state: CaseState,
  now: Date,
): CaseView {
  const route = computeRoute(def, state, caseEventDate(row), now);
  return {
    id: row.id,
    event: eventSummary(def.event, def.steps),
    startedAt: row.startedAt.toISOString(),
    eventDate: caseEventDate(row),
    remindersOptIn: row.remindersOptIn,
    reminderEmail: row.reminderEmail,
    progress: { done: route.doneCount, total: route.total, nextStepId: route.nextStepId },
    steps: buildStepViews(def, route, state, now),
    today: indiaToday(now),
    disclaimer: DISCLAIMER,
  };
}
