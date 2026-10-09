import type { Db, DbOrTx, Tx } from '../db.js';
import type { Case } from '../generated/prisma/client.js';
import { addMonths, dateOnlyToDb, indiaToday } from '../engine/dates.js';
import { checkComplete, type RouteView } from '../engine/route.js';
import { diffStatuses, type StatusInfo } from '../engine/status.js';
import type { DateOnly } from '../engine/types.js';
import { cascadeUndo } from '../engine/undo.js';
import { HttpError } from '../errors.js';
import { createToken, hashToken } from '../security/tokens.js';
import { type EventDefinition, loadEventDefinition } from './definition.js';
import type { CaseView, StepChanges } from './types.js';
import {
  buildCaseView,
  type CaseState,
  caseEventDate,
  computeRoute,
  EMPTY_CASE_STATE,
} from './views.js';

export interface CaseBundle {
  row: Case;
  def: EventDefinition;
  state: CaseState;
}

async function loadState(db: DbOrTx, caseId: string): Promise<CaseState> {
  // Sequential on purpose: inside a transaction both queries share one connection.
  const steps = await db.caseStep.findMany({ where: { caseId, status: 'DONE' } });
  const docs = await db.caseDocument.findMany({ where: { caseId, ticked: true } });
  return {
    doneIds: new Set(steps.map((s) => s.stepId)),
    doneAt: new Map(steps.map((s) => [s.stepId, s.doneAt ?? new Date(0)])),
    tickedDocumentIds: new Set(docs.map((d) => d.documentId)),
  };
}

async function loadDefinitionForCase(db: Db, caseId: string): Promise<EventDefinition> {
  const head = await db.case.findUnique({ where: { id: caseId }, select: { eventId: true } });
  if (!head) throw HttpError.notFound('Case not found.');
  const def = await loadEventDefinition(db, head.eventId);
  if (!def) throw HttpError.notFound('The situation for this case no longer exists.');
  return def;
}

export async function loadCaseBundle(db: Db, caseId: string): Promise<CaseBundle> {
  const def = await loadDefinitionForCase(db, caseId);
  const row = await db.case.findUnique({ where: { id: caseId } });
  if (!row) throw HttpError.notFound('Case not found.');
  return { row, def, state: await loadState(db, caseId) };
}

export async function getCaseView(db: Db, caseId: string, now: Date): Promise<CaseView> {
  const { row, def, state } = await loadCaseBundle(db, caseId);
  return buildCaseView(def, row, state, now);
}

/**
 * Runs `fn` with the case row locked, so two quick clicks cannot interleave. The (read-mostly)
 * route definition is loaded first, outside the transaction, to keep the locked section short.
 */
async function withLockedCase<T>(
  db: Db,
  caseId: string,
  fn: (c: CaseBundle & { tx: Tx }) => Promise<T>,
): Promise<T> {
  const def = await loadDefinitionForCase(db, caseId);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM cases WHERE id = ${caseId} FOR UPDATE`;
    const row = await tx.case.findUnique({ where: { id: caseId } });
    if (!row) throw HttpError.notFound('Case not found.');
    return fn({ tx, row, def, state: await loadState(tx, caseId) });
  });
}

/** An event date has to be plausible: up to ten years back, up to five years ahead. */
export function assertPlausibleEventDate(date: DateOnly, now: Date): void {
  const today = indiaToday(now);
  if (date < addMonths(today, -120) || date > addMonths(today, 60)) {
    throw HttpError.badRequest(
      'invalid_event_date',
      'That date looks wrong. Use a date from the last ten years or the next five.',
    );
  }
}

export interface NewCaseInput {
  eventIdOrSlug: string;
  eventDate: DateOnly | null;
  orgId?: string | null;
  clientName?: string | null;
}

export async function createCase(
  db: Db,
  input: NewCaseInput,
  now: Date,
): Promise<{ token: string; view: CaseView; caseId: string }> {
  const def = await loadEventDefinition(db, input.eventIdOrSlug);
  if (!def) throw HttpError.notFound('There is no such situation.');
  if (input.eventDate) assertPlausibleEventDate(input.eventDate, now);

  const token = createToken('case');
  const row = await db.case.create({
    data: {
      eventId: def.event.id,
      tokenHash: hashToken(token),
      startedAt: now,
      eventDate: input.eventDate ? dateOnlyToDb(input.eventDate) : null,
      orgId: input.orgId ?? null,
      clientName: input.clientName ?? null,
      steps: { create: def.steps.map((s) => ({ stepId: s.id })) },
    },
  });
  return { token, caseId: row.id, view: buildCaseView(def, row, EMPTY_CASE_STATE, now) };
}

export interface CaseSettingsInput {
  eventDate?: DateOnly | null;
  remindersOptIn?: boolean;
  reminderEmail?: string | null;
}

export async function updateCaseSettings(
  db: Db,
  caseId: string,
  input: CaseSettingsInput,
  now: Date,
): Promise<CaseView> {
  return withLockedCase(db, caseId, async ({ tx, row, def, state }) => {
    const optIn = input.remindersOptIn ?? row.remindersOptIn;
    let email = input.reminderEmail !== undefined ? input.reminderEmail : row.reminderEmail;
    // Opting out forgets the address: we keep no email we have no reason to use.
    if (!optIn) email = null;
    if (!optIn) await tx.reminderLog.deleteMany({ where: { caseId } });
    if (optIn && !email) {
      throw HttpError.badRequest('email_required', 'Add an email address to get reminders.');
    }
    if (input.eventDate) assertPlausibleEventDate(input.eventDate, now);

    const updated = await tx.case.update({
      where: { id: caseId },
      data: {
        remindersOptIn: optIn,
        reminderEmail: email,
        ...(input.eventDate !== undefined
          ? { eventDate: input.eventDate ? dateOnlyToDb(input.eventDate) : null }
          : {}),
      },
    });
    return buildCaseView(def, updated, state, now);
  });
}

function statusMap(route: RouteView): Map<string, StatusInfo> {
  return new Map(route.steps.map((s) => [s.id, { status: s.status, blockedBy: s.blockedBy }]));
}

export interface StepChangeResult {
  view: CaseView;
  changes: StepChanges;
  /** True when the request asked for the state the step was already in. */
  unchanged: boolean;
}

export async function setStepDone(
  db: Db,
  caseId: string,
  stepId: string,
  done: boolean,
  now: Date,
): Promise<StepChangeResult> {
  return withLockedCase(db, caseId, async ({ tx, row, def, state }) => {
    if (!def.steps.some((s) => s.id === stepId)) {
      throw HttpError.notFound('That step is not part of this case.');
    }
    const eventDate = caseEventDate(row);
    const before = computeRoute(def, state, eventDate, now);
    const none: StepChanges = { unlocked: [], relocked: [], reopened: [] };

    if (done) {
      const check = checkComplete(before, stepId);
      if (!check.ok) {
        if (check.reason === 'already_done') {
          return { view: buildCaseView(def, row, state, now), changes: none, unchanged: true };
        }
        const titleOf = (id: string) => def.steps.find((s) => s.id === id)?.title ?? '';
        const numberOf = (id: string) => before.steps.find((s) => s.id === id)?.number ?? 0;
        if (check.reason === 'locked') {
          throw HttpError.conflict('step_locked', 'Finish the steps this one waits for first.', {
            blockedBy: check.blockedBy.map((id) => ({
              id,
              number: numberOf(id),
              title: titleOf(id),
            })),
          });
        }
        const labels = def.labels.get(stepId);
        throw HttpError.conflict(
          'documents_missing',
          'Tick each document you are carrying before you mark this step done.',
          {
            missing: check.missing.map((id) => ({ documentId: id, label: labels?.get(id) ?? id })),
          },
        );
      }
      await tx.caseStep.upsert({
        where: { caseId_stepId: { caseId, stepId } },
        create: { caseId, stepId, status: 'DONE', doneAt: now },
        update: { status: 'DONE', doneAt: now },
      });
    } else {
      const { reopened } = cascadeUndo(def.inputs, state.doneIds, stepId);
      if (reopened.length === 0) {
        return { view: buildCaseView(def, row, state, now), changes: none, unchanged: true };
      }
      await tx.caseStep.updateMany({
        where: { caseId, stepId: { in: reopened } },
        data: { status: 'PENDING', doneAt: null },
      });
    }

    const nextState = await loadState(tx, caseId);
    const after = computeRoute(def, nextState, eventDate, now);
    const { unlocked, relocked } = diffStatuses(after.order, statusMap(before), statusMap(after));
    const reopened = done
      ? []
      : before.order.filter((id) => state.doneIds.has(id) && !nextState.doneIds.has(id));
    return {
      view: buildCaseView(def, row, nextState, now),
      changes: { unlocked, relocked, reopened },
      unchanged: false,
    };
  });
}

export async function setDocumentTicked(
  db: Db,
  caseId: string,
  documentId: string,
  ticked: boolean,
  now: Date,
): Promise<CaseView> {
  return withLockedCase(db, caseId, async ({ tx, row, def }) => {
    const canTick = def.tickable.get(documentId);
    if (canTick === undefined) {
      throw HttpError.notFound('That document is not part of this case.');
    }
    if (!canTick) {
      throw HttpError.conflict(
        'document_not_tickable',
        'This document comes from an earlier step. Finish that step and it is ticked for you.',
      );
    }
    await tx.caseDocument.upsert({
      where: { caseId_documentId: { caseId, documentId } },
      create: { caseId, documentId, ticked, tickedAt: ticked ? now : null },
      update: { ticked, tickedAt: ticked ? now : null },
    });
    return buildCaseView(def, row, await loadState(tx, caseId), now);
  });
}

/** Back to a clean slate: nothing done, nothing ticked. Settings and the event date stay. */
export async function resetCase(db: Db, caseId: string, now: Date): Promise<CaseView> {
  return withLockedCase(db, caseId, async ({ tx, row, def }) => {
    await tx.caseStep.updateMany({ where: { caseId }, data: { status: 'PENDING', doneAt: null } });
    await tx.caseDocument.deleteMany({ where: { caseId } });
    return buildCaseView(def, row, EMPTY_CASE_STATE, now);
  });
}

export async function deleteCase(db: Db, caseId: string): Promise<void> {
  await db.case.delete({ where: { id: caseId } });
}
