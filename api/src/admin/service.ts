import { type Db, type DbOrTx, Prisma } from '../db.js';
import { buildRequirements, type StepDocumentRow } from '../engine/documents.js';
import type { RouteStepInput } from '../engine/route.js';
import { isStale } from '../engine/verification.js';
import { validateRoute } from '../engine/validate.js';
import { HttpError } from '../errors.js';
import type {
  AdminDocumentRow,
  AdminEventRow,
  AdminOfficeRow,
  AdminStepRow,
  Provenance,
} from './types.js';

/** What an admin edit says about itself. The server stamps last_verified_at on every edit. */
export interface EditProvenance {
  sourceUrl: string;
  verified: boolean;
}

function provenanceView(
  row: { sourceUrl: string | null; lastVerifiedAt: Date | null; verified: boolean },
  now: Date,
): Provenance {
  return {
    sourceUrl: row.sourceUrl,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    verified: row.verified,
    stale: isStale(row.lastVerifiedAt, now),
  };
}

const stamp = (p: EditProvenance, now: Date) => ({
  sourceUrl: p.sourceUrl,
  verified: p.verified,
  lastVerifiedAt: now,
});

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Lower-case, trimmed, de-duplicated, in the order given. */
function cleanKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keywords) {
    const v = k.trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// =============================================================================================
// Route validation: run on the state a change would leave behind, inside its transaction.
// =============================================================================================

interface Graph {
  steps: { id: string; title: string; position: number; needs: string[] }[];
  rows: StepDocumentRow[];
  titles: Map<string, string>;
  documentNames: Map<string, string>;
}

async function loadGraph(db: DbOrTx, eventId: string): Promise<Graph> {
  // Flat, sequential queries on purpose: this runs inside transactions, where nested includes
  // make Prisma issue concurrent queries on one connection.
  const steps = await db.step.findMany({
    where: { eventId },
    orderBy: { position: 'asc' },
    select: { id: true, title: true, position: true },
  });
  const deps = await db.stepDependency.findMany({
    where: { step: { eventId } },
    select: { stepId: true, dependsOnId: true },
  });
  const docRows = await db.stepDocument.findMany({
    where: { step: { eventId } },
    select: { stepId: true, documentId: true, role: true, producedByStepId: true },
  });
  const docs = await db.document.findMany({
    where: { id: { in: [...new Set(docRows.map((r) => r.documentId))] } },
    select: { id: true, name: true },
  });
  return {
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title,
      position: s.position,
      needs: deps.filter((d) => d.stepId === s.id).map((d) => d.dependsOnId),
    })),
    rows: docRows,
    titles: new Map(steps.map((s) => [s.id, s.title])),
    documentNames: new Map(docs.map((d) => [d.id, d.name])),
  };
}

/** "A" needs "B", which needs "C", which needs "A". */
export function describeCycle(cycle: readonly string[], titleOf: (id: string) => string): string {
  const names = cycle.map((id) => `"${titleOf(id)}"`);
  if (cycle.length === 2) return `${names[0] ?? ''} cannot need itself.`;
  const [first, second, ...rest] = names;
  return `${first ?? ''} needs ${second ?? ''}${rest.map((n) => `, which needs ${n}`).join('')}.`;
}

/** Throws a clear HttpError when the route as it now stands is not sound. */
function assertRouteSound(graph: Graph): void {
  const requirements = buildRequirements(graph.rows);
  const inputs: RouteStepInput[] = graph.steps.map((s) => ({
    id: s.id,
    position: s.position,
    needs: s.needs,
    due: null,
    requires: requirements.get(s.id) ?? [],
  }));
  const problem = validateRoute(inputs)[0];
  if (!problem) return;
  const titleOf = (id: string) => graph.titles.get(id) ?? 'a step';

  if (problem.code === 'cycle') {
    throw HttpError.conflict(
      'dependency_cycle',
      `Not saved: this would create a loop. ${describeCycle(problem.cycle, titleOf)} ` +
        'A step cannot depend, even indirectly, on itself. Remove one of these dependencies.',
      { cycle: problem.cycle, titles: problem.cycle.map(titleOf) },
    );
  }
  if (problem.code === 'self_dependency') {
    const id = problem.stepId ?? '';
    throw HttpError.conflict(
      'dependency_cycle',
      `Not saved: "${titleOf(id)}" cannot need itself.`,
      { cycle: [id, id], titles: [titleOf(id), titleOf(id)] },
    );
  }
  if (problem.code === 'unreachable_document') {
    const doc = graph.documentNames.get(problem.documentId) ?? 'a document';
    throw HttpError.conflict(
      'document_not_upstream',
      `Not saved: "${titleOf(problem.stepId)}" asks for "${doc}", which only comes from a step it does not wait for. ` +
        'Make it wait for the step that hands over the document, or change where the document comes from.',
      { stepId: problem.stepId, documentId: problem.documentId },
    );
  }
  throw HttpError.badRequest(problem.code, problem.message);
}

// =============================================================================================
// Events
// =============================================================================================

type EventWithCounts = Prisma.EventGetPayload<{
  include: {
    steps: { select: { verified: true; lastVerifiedAt: true } };
    _count: { select: { cases: true } };
  };
}>;

function eventRow(e: EventWithCounts, now: Date): AdminEventRow {
  return {
    id: e.id,
    slug: e.slug,
    label: e.label,
    place: e.place,
    eventDateLabel: e.eventDateLabel,
    keywords: e.keywords,
    position: e.position,
    stepCount: e.steps.length,
    staleStepCount: e.steps.filter((s) => isStale(s.lastVerifiedAt, now)).length,
    unverifiedStepCount: e.steps.filter((s) => !s.verified).length,
    caseCount: e._count.cases,
    ...provenanceView(e, now),
  };
}

const EVENT_COUNTS = {
  steps: { select: { verified: true, lastVerifiedAt: true } },
  _count: { select: { cases: true } },
} satisfies Prisma.EventInclude;

export async function listEvents(db: Db, now: Date): Promise<AdminEventRow[]> {
  const events = await db.event.findMany({ orderBy: { position: 'asc' }, include: EVENT_COUNTS });
  return events.map((e) => eventRow(e, now));
}

async function getEventRow(db: DbOrTx, id: string, now: Date): Promise<AdminEventRow> {
  const e = await db.event.findUnique({ where: { id }, include: EVENT_COUNTS });
  if (!e) throw HttpError.notFound('Event not found.');
  return eventRow(e, now);
}

export async function getEventDetail(
  db: Db,
  id: string,
  now: Date,
): Promise<{ event: AdminEventRow; steps: AdminStepRow[] }> {
  const event = await getEventRow(db, id, now);
  const steps = await db.step.findMany({
    where: { eventId: id },
    orderBy: { position: 'asc' },
    include: STEP_INCLUDE,
  });
  return { event, steps: steps.map((s) => stepRow(s, now)) };
}

export interface EventInput extends EditProvenance {
  slug: string;
  label: string;
  place: string;
  eventDateLabel: string;
  keywords: string[];
  position?: number | undefined;
}

export async function createEvent(db: Db, input: EventInput, now: Date): Promise<AdminEventRow> {
  const max = await db.event.aggregate({ _max: { position: true } });
  try {
    const created = await db.event.create({
      data: {
        slug: input.slug,
        label: input.label,
        place: input.place,
        eventDateLabel: input.eventDateLabel,
        keywords: cleanKeywords(input.keywords),
        position: input.position ?? (max._max.position ?? 0) + 1,
        ...stamp(input, now),
      },
    });
    return await getEventRow(db, created.id, now);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw HttpError.conflict(
        'slug_taken',
        `There is already a situation with the address "${input.slug}".`,
      );
    }
    throw error;
  }
}

export async function updateEvent(
  db: Db,
  id: string,
  patch: Partial<EventInput> & EditProvenance,
  now: Date,
): Promise<AdminEventRow> {
  await getEventRow(db, id, now);
  try {
    await db.event.update({
      where: { id },
      data: {
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.place !== undefined ? { place: patch.place } : {}),
        ...(patch.eventDateLabel !== undefined ? { eventDateLabel: patch.eventDateLabel } : {}),
        ...(patch.keywords !== undefined ? { keywords: cleanKeywords(patch.keywords) } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...stamp(patch, now),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw HttpError.conflict('slug_taken', 'There is already a situation with that address.');
    }
    throw error;
  }
  return getEventRow(db, id, now);
}

export async function deleteEvent(db: Db, id: string): Promise<void> {
  const event = await db.event.findUnique({
    where: { id },
    include: { _count: { select: { cases: true } } },
  });
  if (!event) throw HttpError.notFound('Event not found.');
  if (event._count.cases > 0) {
    throw HttpError.conflict(
      'event_in_use',
      `${event._count.cases} ${event._count.cases === 1 ? 'case uses' : 'cases use'} this situation, so it cannot be deleted.`,
      { caseCount: event._count.cases },
    );
  }
  await db.event.delete({ where: { id } });
}

// =============================================================================================
// Steps, dependencies and step documents
// =============================================================================================

const STEP_INCLUDE = {
  office: { select: { id: true, name: true } },
  needs: { include: { dependsOn: { select: { id: true, title: true } } } },
  documents: { orderBy: { position: 'asc' }, include: { document: { select: { name: true } } } },
} satisfies Prisma.StepInclude;

type LoadedAdminStep = Prisma.StepGetPayload<{ include: typeof STEP_INCLUDE }>;

function stepRow(s: LoadedAdminStep, now: Date): AdminStepRow {
  return {
    id: s.id,
    eventId: s.eventId,
    position: s.position,
    title: s.title,
    form: s.form,
    whereText: s.whereText,
    officeId: s.officeId,
    officeName: s.office?.name ?? null,
    fee: s.fee,
    waitText: s.waitText,
    dueText: s.dueText,
    dueAmount: s.dueAmount,
    dueUnit: s.dueUnit,
    needs: s.needs.map((n) => ({ id: n.dependsOn.id, title: n.dependsOn.title })),
    documents: s.documents.map((d) => ({
      id: d.id,
      documentId: d.documentId,
      documentName: d.document.name,
      role: d.role,
      producedByStepId: d.producedByStepId,
      label: d.label,
      position: d.position,
    })),
    updatedAt: s.updatedAt.toISOString(),
    ...provenanceView(s, now),
    sourceUrl: s.sourceUrl,
  };
}

async function loadStep(db: DbOrTx, id: string): Promise<LoadedAdminStep> {
  const step = await db.step.findUnique({ where: { id }, include: STEP_INCLUDE });
  if (!step) throw HttpError.notFound('Step not found.');
  return step;
}

export async function getStep(
  db: Db,
  id: string,
  now: Date,
): Promise<{
  step: AdminStepRow;
  event: { id: string; slug: string; label: string };
  siblings: { id: string; title: string; position: number; needs: string[] }[];
}> {
  const step = await loadStep(db, id);
  const event = await db.event.findUniqueOrThrow({ where: { id: step.eventId } });
  const siblings = await db.step.findMany({
    where: { eventId: step.eventId },
    orderBy: { position: 'asc' },
    include: { needs: true },
  });
  return {
    step: stepRow(step, now),
    event: { id: event.id, slug: event.slug, label: event.label },
    siblings: siblings.map((s) => ({
      id: s.id,
      title: s.title,
      position: s.position,
      needs: s.needs.map((n) => n.dependsOnId),
    })),
  };
}

export interface StepDocumentInput {
  documentId: string;
  role: 'REQUIRES' | 'PRODUCES';
  producedByStepId?: string | null | undefined;
  label?: string | null | undefined;
}

export interface StepFields {
  title: string;
  form: string;
  whereText: string;
  officeId: string | null;
  fee: string;
  waitText: string;
  dueText: string;
  dueAmount: number | null;
  dueUnit: 'DAY' | 'WEEK' | 'MONTH' | null;
}

async function assertOffice(db: DbOrTx, officeId: string | null | undefined): Promise<void> {
  if (!officeId) return;
  if (!(await db.office.findUnique({ where: { id: officeId } }))) {
    throw HttpError.badRequest('unknown_office', 'That office does not exist.');
  }
}

async function assertNeeds(
  db: DbOrTx,
  eventId: string,
  stepId: string | null,
  needs: string[],
): Promise<void> {
  const unique = [...new Set(needs)];
  if (stepId && unique.includes(stepId)) {
    throw HttpError.conflict('dependency_cycle', 'Not saved: a step cannot need itself.', {
      cycle: [stepId, stepId],
      titles: [],
    });
  }
  const found = await db.step.findMany({
    where: { id: { in: unique }, eventId },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    throw HttpError.badRequest(
      'unknown_step',
      'A step can only wait for steps of the same situation, and every step it waits for must exist.',
    );
  }
}

async function writeDocumentRows(
  tx: DbOrTx,
  eventId: string,
  stepId: string,
  rows: readonly StepDocumentInput[],
): Promise<void> {
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.documentId}:${r.role}`;
    if (seen.has(key)) {
      throw HttpError.badRequest(
        'duplicate_document',
        'The same document is listed twice for this step.',
      );
    }
    seen.add(key);
    if (r.role === 'PRODUCES' && r.producedByStepId) {
      throw HttpError.badRequest(
        'invalid_document_row',
        '"Comes from step" only applies to documents a step asks for, not to ones it produces.',
      );
    }
  }
  const docIds = [...new Set(rows.map((r) => r.documentId))];
  const docs = await tx.document.findMany({ where: { id: { in: docIds } }, select: { id: true } });
  if (docs.length !== docIds.length) {
    throw HttpError.badRequest('unknown_document', 'One of the documents does not exist.');
  }
  const producers = [
    ...new Set(rows.flatMap((r) => (r.producedByStepId ? [r.producedByStepId] : []))),
  ];
  if (producers.length > 0) {
    const ok = await tx.step.findMany({
      where: { id: { in: producers }, eventId },
      select: { id: true },
    });
    if (ok.length !== producers.length) {
      throw HttpError.badRequest(
        'unknown_step',
        '"Comes from step" must be a step of the same situation.',
      );
    }
  }
  await tx.stepDocument.deleteMany({ where: { stepId } });
  if (rows.length > 0) {
    await tx.stepDocument.createMany({
      data: rows.map((r, i) => ({
        stepId,
        documentId: r.documentId,
        role: r.role,
        producedByStepId: r.role === 'REQUIRES' ? (r.producedByStepId ?? null) : null,
        label: r.label ?? null,
        position: r.role === 'PRODUCES' ? 100 + i : i,
      })),
    });
  }
}

async function replaceNeeds(tx: DbOrTx, stepId: string, needs: readonly string[]): Promise<void> {
  await tx.stepDependency.deleteMany({ where: { stepId } });
  const unique = [...new Set(needs)];
  if (unique.length > 0) {
    await tx.stepDependency.createMany({
      data: unique.map((dependsOnId) => ({ stepId, dependsOnId })),
    });
  }
}

export interface StepCreateInput extends StepFields, EditProvenance {
  position?: number | undefined;
  needs: string[];
  documents: StepDocumentInput[];
}

export async function createStep(
  db: Db,
  eventId: string,
  input: StepCreateInput,
  now: Date,
): Promise<AdminStepRow> {
  const id = await db.$transaction(async (tx) => {
    if (!(await tx.event.findUnique({ where: { id: eventId } })))
      throw HttpError.notFound('Event not found.');
    await assertOffice(tx, input.officeId);
    await assertNeeds(tx, eventId, null, input.needs);
    const max = await tx.step.aggregate({ where: { eventId }, _max: { position: true } });
    const created = await tx.step.create({
      data: {
        eventId,
        position: input.position ?? (max._max.position ?? 0) + 1,
        title: input.title,
        form: input.form,
        whereText: input.whereText,
        officeId: input.officeId,
        fee: input.fee,
        waitText: input.waitText,
        dueText: input.dueText,
        dueAmount: input.dueAmount,
        dueUnit: input.dueUnit,
        ...stamp(input, now),
      },
    });
    await replaceNeeds(tx, created.id, input.needs);
    await writeDocumentRows(tx, eventId, created.id, input.documents);
    assertRouteSound(await loadGraph(tx, eventId));
    return created.id;
  });
  return stepRow(await loadStep(db, id), now);
}

export interface StepPatchInput extends EditProvenance, Partial<StepFields> {
  position?: number | undefined;
  needs?: string[] | undefined;
  documents?: StepDocumentInput[] | undefined;
}

export async function updateStep(
  db: Db,
  id: string,
  patch: StepPatchInput,
  now: Date,
): Promise<AdminStepRow> {
  await db.$transaction(async (tx) => {
    const step = await tx.step.findUnique({ where: { id }, select: { eventId: true } });
    if (!step) throw HttpError.notFound('Step not found.');
    if (patch.officeId !== undefined) await assertOffice(tx, patch.officeId);
    if (patch.needs !== undefined) await assertNeeds(tx, step.eventId, id, patch.needs);
    await tx.step.update({
      where: { id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.form !== undefined ? { form: patch.form } : {}),
        ...(patch.whereText !== undefined ? { whereText: patch.whereText } : {}),
        ...(patch.officeId !== undefined ? { officeId: patch.officeId } : {}),
        ...(patch.fee !== undefined ? { fee: patch.fee } : {}),
        ...(patch.waitText !== undefined ? { waitText: patch.waitText } : {}),
        ...(patch.dueText !== undefined ? { dueText: patch.dueText } : {}),
        ...(patch.dueAmount !== undefined ? { dueAmount: patch.dueAmount } : {}),
        ...(patch.dueUnit !== undefined ? { dueUnit: patch.dueUnit } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...stamp(patch, now),
      },
    });
    if (patch.needs !== undefined) await replaceNeeds(tx, id, patch.needs);
    if (patch.documents !== undefined)
      await writeDocumentRows(tx, step.eventId, id, patch.documents);
    assertRouteSound(await loadGraph(tx, step.eventId));
  });
  return stepRow(await loadStep(db, id), now);
}

export async function deleteStep(db: Db, id: string): Promise<void> {
  await loadStep(db, id);
  await db.step.delete({ where: { id } });
}

/** Replaces the set of steps this step waits for. Rejects a cycle with the path that causes it. */
export async function setDependencies(
  db: Db,
  id: string,
  needs: string[],
  provenance: EditProvenance,
  now: Date,
): Promise<AdminStepRow> {
  return updateStep(db, id, { needs, ...provenance }, now);
}

export async function addDependency(
  db: Db,
  id: string,
  dependsOnId: string,
  provenance: EditProvenance,
  now: Date,
): Promise<AdminStepRow> {
  const step = await loadStep(db, id);
  const needs = [...new Set([...step.needs.map((n) => n.dependsOnId), dependsOnId])];
  return updateStep(db, id, { needs, ...provenance }, now);
}

export async function removeDependency(
  db: Db,
  id: string,
  dependsOnId: string,
  provenance: EditProvenance,
  now: Date,
): Promise<AdminStepRow> {
  const step = await loadStep(db, id);
  if (!step.needs.some((n) => n.dependsOnId === dependsOnId)) {
    throw HttpError.notFound('This step does not wait for that step.');
  }
  const needs = step.needs.map((n) => n.dependsOnId).filter((x) => x !== dependsOnId);
  return updateStep(db, id, { needs, ...provenance }, now);
}

export async function setStepDocuments(
  db: Db,
  id: string,
  rows: StepDocumentInput[],
  provenance: EditProvenance,
  now: Date,
): Promise<AdminStepRow> {
  return updateStep(db, id, { documents: rows, ...provenance }, now);
}

// =============================================================================================
// Documents (catalog)
// =============================================================================================

const DOC_COUNTS = {
  _count: { select: { stepDocuments: true, caseDocuments: true } },
} satisfies Prisma.DocumentInclude;

function documentRow(
  d: Prisma.DocumentGetPayload<{ include: typeof DOC_COUNTS }>,
  now: Date,
): AdminDocumentRow {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    stepCount: d._count.stepDocuments,
    caseCount: d._count.caseDocuments,
    ...provenanceView(d, now),
  };
}

export async function listDocuments(db: Db, now: Date): Promise<AdminDocumentRow[]> {
  const docs = await db.document.findMany({ orderBy: { name: 'asc' }, include: DOC_COUNTS });
  return docs.map((d) => documentRow(d, now));
}

export async function createDocument(
  db: Db,
  input: EditProvenance & { name: string; description?: string | null | undefined },
  now: Date,
): Promise<AdminDocumentRow> {
  try {
    const d = await db.document.create({
      data: { name: input.name, description: input.description ?? null, ...stamp(input, now) },
      include: DOC_COUNTS,
    });
    return documentRow(d, now);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw HttpError.conflict('name_taken', `A document called "${input.name}" already exists.`);
    }
    throw error;
  }
}

export async function updateDocument(
  db: Db,
  id: string,
  patch: EditProvenance & { name?: string | undefined; description?: string | null | undefined },
  now: Date,
): Promise<AdminDocumentRow> {
  if (!(await db.document.findUnique({ where: { id } })))
    throw HttpError.notFound('Document not found.');
  try {
    const d = await db.document.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...stamp(patch, now),
      },
      include: DOC_COUNTS,
    });
    return documentRow(d, now);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw HttpError.conflict('name_taken', 'A document with that name already exists.');
    }
    throw error;
  }
}

export async function deleteDocument(db: Db, id: string): Promise<void> {
  const d = await db.document.findUnique({ where: { id }, include: DOC_COUNTS });
  if (!d) throw HttpError.notFound('Document not found.');
  if (d._count.stepDocuments > 0) {
    throw HttpError.conflict(
      'document_in_use',
      `"${d.name}" is used by ${d._count.stepDocuments} step ${d._count.stepDocuments === 1 ? 'entry' : 'entries'}. Remove it from those steps first.`,
      { stepCount: d._count.stepDocuments },
    );
  }
  await db.document.delete({ where: { id } });
}

// =============================================================================================
// Offices
// =============================================================================================

const OFFICE_COUNTS = { _count: { select: { steps: true } } } satisfies Prisma.OfficeInclude;

function officeRow(
  o: Prisma.OfficeGetPayload<{ include: typeof OFFICE_COUNTS }>,
  now: Date,
): AdminOfficeRow {
  return {
    id: o.id,
    name: o.name,
    kind: o.kind,
    city: o.city,
    address: o.address,
    url: o.url,
    hours: o.hours,
    stepCount: o._count.steps,
    ...provenanceView(o, now),
  };
}

export async function listOffices(db: Db, now: Date): Promise<AdminOfficeRow[]> {
  const offices = await db.office.findMany({
    orderBy: [{ city: 'asc' }, { name: 'asc' }],
    include: OFFICE_COUNTS,
  });
  return offices.map((o) => officeRow(o, now));
}

export interface OfficeFields {
  name: string;
  kind: 'OFFICE' | 'PORTAL';
  city: string;
  address: string | null;
  url: string | null;
  hours: string | null;
}

export async function createOffice(
  db: Db,
  input: EditProvenance & OfficeFields,
  now: Date,
): Promise<AdminOfficeRow> {
  try {
    const o = await db.office.create({
      data: {
        name: input.name,
        kind: input.kind,
        city: input.city,
        address: input.address,
        url: input.url,
        hours: input.hours,
        ...stamp(input, now),
      },
      include: OFFICE_COUNTS,
    });
    return officeRow(o, now);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw HttpError.conflict('name_taken', `"${input.name}" already exists in ${input.city}.`);
    }
    throw error;
  }
}

export async function updateOffice(
  db: Db,
  id: string,
  patch: EditProvenance & Partial<OfficeFields>,
  now: Date,
): Promise<AdminOfficeRow> {
  if (!(await db.office.findUnique({ where: { id } })))
    throw HttpError.notFound('Office not found.');
  try {
    const o = await db.office.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.city !== undefined ? { city: patch.city } : {}),
        ...(patch.address !== undefined ? { address: patch.address } : {}),
        ...(patch.url !== undefined ? { url: patch.url } : {}),
        ...(patch.hours !== undefined ? { hours: patch.hours } : {}),
        ...stamp(patch, now),
      },
      include: OFFICE_COUNTS,
    });
    return officeRow(o, now);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw HttpError.conflict(
        'name_taken',
        'An office with that name already exists in that city.',
      );
    }
    throw error;
  }
}

/** Steps that used the office keep working: their link is cleared (their wording is unchanged). */
export async function deleteOffice(db: Db, id: string): Promise<void> {
  if (!(await db.office.findUnique({ where: { id } })))
    throw HttpError.notFound('Office not found.');
  await db.office.delete({ where: { id } });
}
