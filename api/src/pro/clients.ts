import type { Db } from '../db.js';
import { caseHealth } from '../engine/health.js';
import { isHeld } from '../engine/documents.js';
import { dateOnlyFromDb } from '../engine/dates.js';
import type { CaseHealthStatus, DateOnly } from '../engine/types.js';
import { HttpError } from '../errors.js';
import { createCase } from '../services/cases.js';
import { type EventDefinition, loadEventDefinition } from '../services/definition.js';
import { type CaseState, computeRoute } from '../services/views.js';
import type { ClientList, ClientRow } from './types.js';

/** The dashboard lists at most this many clients at once. */
export const MAX_CLIENTS = 500;

interface CaseHead {
  id: string;
  clientName: string | null;
  eventId: string;
  eventDate: Date | null;
  startedAt: Date;
}

const SEVERITY: Record<CaseHealthStatus, number> = { overdue: 0, needs_document: 1, on_track: 2 };

/**
 * One row per client case. Cases are loaded in bulk (two queries for all of their progress, one
 * definition per situation), so the dashboard costs the same for ten clients as for five hundred.
 */
async function buildRows(db: Db, heads: CaseHead[], now: Date): Promise<ClientRow[]> {
  if (heads.length === 0) return [];
  const ids = heads.map((h) => h.id);
  const doneSteps = await db.caseStep.findMany({
    where: { caseId: { in: ids }, status: 'DONE' },
    select: { caseId: true, stepId: true, doneAt: true },
  });
  const ticked = await db.caseDocument.findMany({
    where: { caseId: { in: ids }, ticked: true },
    select: { caseId: true, documentId: true },
  });

  const progress = new Map<
    string,
    { doneIds: Set<string>; doneAt: Map<string, Date>; tickedDocumentIds: Set<string> }
  >();
  for (const id of ids) {
    progress.set(id, { doneIds: new Set(), doneAt: new Map(), tickedDocumentIds: new Set() });
  }
  for (const s of doneSteps) {
    const p = progress.get(s.caseId);
    p?.doneIds.add(s.stepId);
    p?.doneAt.set(s.stepId, s.doneAt ?? new Date(0));
  }
  for (const d of ticked) progress.get(d.caseId)?.tickedDocumentIds.add(d.documentId);
  const stateOf = new Map<string, CaseState>(progress);

  const defs = new Map<string, EventDefinition>();
  for (const eventId of new Set(heads.map((h) => h.eventId))) {
    const def = await loadEventDefinition(db, eventId);
    if (def) defs.set(eventId, def);
  }

  const rows: ClientRow[] = [];
  for (const head of heads) {
    const def = defs.get(head.eventId);
    const state = stateOf.get(head.id);
    if (!def || !state) continue;
    const eventDate = head.eventDate ? dateOnlyFromDb(head.eventDate) : null;
    const route = computeRoute(def, state, eventDate, now);
    const health = caseHealth(route);
    const nextView = route.steps.find((s) => s.isNext);
    const nextStep = nextView ? def.steps.find((s) => s.id === nextView.id) : undefined;
    const labels = nextStep ? def.labels.get(nextStep.id) : undefined;
    const names = new Map<string, string>();
    for (const s of def.steps)
      for (const d of s.documents) names.set(d.documentId, d.document.name);

    rows.push({
      id: head.id,
      clientName: head.clientName ?? 'Unnamed client',
      event: { id: def.event.id, slug: def.event.slug, label: def.event.label },
      eventDate,
      startedAt: head.startedAt.toISOString(),
      progress: { done: route.doneCount, total: route.total },
      status: health.status,
      next:
        nextView && nextStep
          ? {
              id: nextStep.id,
              number: nextView.number,
              title: nextStep.title,
              deadline: nextView.deadline,
              daysLeft: nextView.daysLeft,
            }
          : null,
      missingDocuments: nextView
        ? nextView.docs
            .filter((d) => !isHeld(d.state))
            .map((d) => labels?.get(d.documentId) ?? names.get(d.documentId) ?? 'Document')
        : [],
      overdueSteps: health.overdueStepIds.length,
    });
  }
  return rows;
}

export interface ClientFilters {
  filter: 'all' | 'attention';
  status?: CaseHealthStatus | undefined;
  /** A situation, by id or slug. */
  event?: string | undefined;
  q?: string | undefined;
}

export async function listClients(
  db: Db,
  orgId: string,
  filters: ClientFilters,
  now: Date,
): Promise<ClientList> {
  const [total, matching] = await Promise.all([
    db.case.count({ where: { orgId } }),
    db.case.findMany({
      where: {
        orgId,
        ...(filters.q ? { clientName: { contains: filters.q, mode: 'insensitive' as const } } : {}),
        ...(filters.event
          ? { event: { OR: [{ id: filters.event }, { slug: filters.event }] } }
          : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: MAX_CLIENTS + 1,
      select: { id: true, clientName: true, eventId: true, eventDate: true, startedAt: true },
    }),
  ]);
  const truncated = matching.length > MAX_CLIENTS;
  const rows = await buildRows(db, matching.slice(0, MAX_CLIENTS), now);

  const counts = {
    all: rows.length,
    onTrack: rows.filter((r) => r.status === 'on_track').length,
    needsDocument: rows.filter((r) => r.status === 'needs_document').length,
    overdue: rows.filter((r) => r.status === 'overdue').length,
  };
  const clients = rows
    .filter((r) => (filters.filter === 'attention' ? r.status !== 'on_track' : true))
    .filter((r) => (filters.status ? r.status === filters.status : true))
    .sort(
      (a, b) =>
        SEVERITY[a.status] - SEVERITY[b.status] || a.clientName.localeCompare(b.clientName, 'en'),
    );
  return { clients, counts, total, truncated };
}

export async function getClient(
  db: Db,
  orgId: string,
  caseId: string,
  now: Date,
): Promise<ClientRow> {
  const head = await db.case.findFirst({
    where: { id: caseId, orgId },
    select: { id: true, clientName: true, eventId: true, eventDate: true, startedAt: true },
  });
  const [row] = head ? await buildRows(db, [head], now) : [];
  if (!row) throw HttpError.notFound('There is no such client.');
  return row;
}

export async function createClient(
  db: Db,
  orgId: string,
  input: { clientName: string; eventId: string; eventDate: DateOnly | null },
  now: Date,
): Promise<ClientRow> {
  // The case's own access key is not handed out: the team reaches it through their member keys.
  const { caseId } = await createCase(
    db,
    {
      eventIdOrSlug: input.eventId,
      eventDate: input.eventDate,
      orgId,
      clientName: input.clientName,
    },
    now,
  );
  return getClient(db, orgId, caseId, now);
}

export async function renameClient(
  db: Db,
  orgId: string,
  caseId: string,
  clientName: string,
  now: Date,
): Promise<ClientRow> {
  const { count } = await db.case.updateMany({
    where: { id: caseId, orgId },
    data: { clientName },
  });
  if (count === 0) throw HttpError.notFound('There is no such client.');
  return getClient(db, orgId, caseId, now);
}
