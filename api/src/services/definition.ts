import { type DbOrTx, type Prisma } from '../db.js';
import { buildRequirements, type StepDocumentRow } from '../engine/documents.js';
import type { RouteStepInput } from '../engine/route.js';
import type { Due } from '../engine/types.js';

const EVENT_INCLUDE = {
  steps: {
    orderBy: { position: 'asc' },
    include: {
      office: true,
      needs: true,
      documents: { orderBy: { position: 'asc' }, include: { document: true } },
      tips: {
        where: { status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { _count: { select: { flags: true } } },
      },
    },
  },
} satisfies Prisma.EventInclude;

export type LoadedEvent = Prisma.EventGetPayload<{ include: typeof EVENT_INCLUDE }>;
export type LoadedStep = LoadedEvent['steps'][number];

export interface EventDefinition {
  event: LoadedEvent;
  /** Steps in author order. */
  steps: LoadedStep[];
  /** What the route engine needs. Step ids are database ids. */
  inputs: RouteStepInput[];
  /** stepId -> documentId -> the wording this step uses for the document. */
  labels: Map<string, Map<string, string>>;
  /** Every document id this event asks for, mapped to whether anyone can tick it. */
  tickable: Map<string, boolean>;
}

/** Loads one event with everything needed to compute its route. `idOrSlug` accepts either. */
export async function loadEventDefinition(
  db: DbOrTx,
  idOrSlug: string,
): Promise<EventDefinition | null> {
  const event = await db.event.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: EVENT_INCLUDE,
  });
  return event ? buildDefinition(event) : null;
}

export function buildDefinition(event: LoadedEvent): EventDefinition {
  const stepIds = new Set(event.steps.map((s) => s.id));

  const rows: StepDocumentRow[] = event.steps.flatMap((s) =>
    s.documents.map((d) => ({
      stepId: s.id,
      documentId: d.documentId,
      role: d.role,
      // A producer outside this event can never be done in this route: ignore it.
      producedByStepId:
        d.producedByStepId && stepIds.has(d.producedByStepId) ? d.producedByStepId : null,
    })),
  );
  const requirements = buildRequirements(rows);

  const labels = new Map<string, Map<string, string>>();
  const tickable = new Map<string, boolean>();
  for (const step of event.steps) {
    const stepLabels = new Map<string, string>();
    for (const d of step.documents) {
      if (d.role === 'REQUIRES') stepLabels.set(d.documentId, d.label ?? d.document.name);
    }
    labels.set(step.id, stepLabels);
    for (const r of requirements.get(step.id) ?? []) {
      tickable.set(
        r.documentId,
        (tickable.get(r.documentId) ?? false) || r.producedBy.length === 0,
      );
    }
  }

  const inputs = event.steps.map((s): RouteStepInput => {
    const due: Due | null =
      s.dueAmount !== null && s.dueUnit !== null ? { amount: s.dueAmount, unit: s.dueUnit } : null;
    return {
      id: s.id,
      position: s.position,
      needs: s.needs.map((n) => n.dependsOnId).filter((id) => stepIds.has(id)),
      due,
      requires: requirements.get(s.id) ?? [],
    };
  });

  return { event, steps: event.steps, inputs, labels, tickable };
}
