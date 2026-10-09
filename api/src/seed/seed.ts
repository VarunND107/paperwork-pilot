import type { Db, Tx } from '../db.js';
import {
  SEED_EVENTS,
  SEED_OFFICES,
  type SeedEvent,
  type SeedOffice,
  type SeedStep,
} from './seed-data.js';

export interface SeedResult {
  created: string[];
  skipped: string[];
}

const DEFAULT_CITY = 'Bengaluru';

/**
 * Creates the sample events that do not exist yet. An event that already exists (matched by slug)
 * is left completely alone, so re-running the seeder never overwrites an admin's edits or resets
 * a verified flag.
 *
 * Everything created here is sample data: verified = false, last_verified_at = null.
 */
export async function seedDatabase(
  prisma: Db,
  events: SeedEvent[] = SEED_EVENTS,
  offices: SeedOffice[] = SEED_OFFICES,
): Promise<SeedResult> {
  const result: SeedResult = { created: [], skipped: [] };
  for (const [index, event] of events.entries()) {
    const exists = await prisma.event.findUnique({ where: { slug: event.slug } });
    if (exists) {
      result.skipped.push(event.slug);
      continue;
    }
    await prisma.$transaction((tx) => createEvent(tx, event, index + 1, offices), {
      timeout: 60_000,
    });
    result.created.push(event.slug);
  }
  return result;
}

async function createEvent(
  tx: Tx,
  event: SeedEvent,
  position: number,
  allOffices: SeedOffice[],
): Promise<void> {
  // Offices and documents are shared across events, so reuse what is already there.
  const officeIds = new Map<string, string>();
  for (const key of new Set(event.steps.map((s) => s.office))) {
    const def = allOffices.find((o) => o.key === key);
    if (!def) throw new Error(`Seed step refers to unknown office "${key}"`);
    const office = await tx.office.upsert({
      where: { name_city: { name: def.name, city: DEFAULT_CITY } },
      update: {},
      create: {
        name: def.name,
        kind: def.kind,
        city: DEFAULT_CITY,
        url: def.url ?? null,
        sourceUrl: def.url ?? null,
        verified: false,
        lastVerifiedAt: null,
      },
    });
    officeIds.set(key, office.id);
  }

  const documentIds = new Map<string, string>();
  for (const step of event.steps) {
    for (const d of step.docs) {
      const name = d.doc ?? d.t;
      if (documentIds.has(name)) continue;
      const doc = await tx.document.upsert({
        where: { name },
        update: {},
        create: { name, verified: false, lastVerifiedAt: null },
      });
      documentIds.set(name, doc.id);
    }
  }

  const created = await tx.event.create({
    data: {
      slug: event.slug,
      label: event.label,
      place: event.place,
      eventDateLabel: event.eventDateLabel,
      keywords: event.keywords,
      position,
      verified: false,
      lastVerifiedAt: null,
    },
  });

  const stepIds = new Map<string, string>();
  for (const [i, step] of event.steps.entries()) {
    const row = await tx.step.create({
      data: stepData(created.id, i + 1, step, officeIds.get(step.office) ?? null),
    });
    stepIds.set(step.key, row.id);
  }

  const idOf = (key: string): string => {
    const id = stepIds.get(key);
    if (!id) throw new Error(`Seed refers to unknown step "${key}" in event "${event.slug}"`);
    return id;
  };

  await tx.stepDependency.createMany({
    data: event.steps.flatMap((step) =>
      step.needs.map((need) => ({ stepId: idOf(step.key), dependsOnId: idOf(need) })),
    ),
  });

  // requires-rows, and a produces-row on every step that hands a document on.
  const produced = new Set<string>();
  for (const step of event.steps) {
    for (const [i, d] of step.docs.entries()) {
      const name = d.doc ?? d.t;
      const documentId = documentIds.get(name);
      if (!documentId) throw new Error(`Missing document "${name}"`);
      await tx.stepDocument.create({
        data: {
          stepId: idOf(step.key),
          documentId,
          role: 'REQUIRES',
          producedByStepId: d.from ? idOf(d.from) : null,
          label: d.t === name ? null : d.t,
          position: i,
        },
      });
      if (d.from) {
        const marker = `${d.from}:${name}`;
        if (!produced.has(marker)) {
          produced.add(marker);
          await tx.stepDocument.create({
            data: { stepId: idOf(d.from), documentId, role: 'PRODUCES', position: 100 },
          });
        }
      }
    }
  }

  await tx.tip.createMany({
    data: event.steps.map((step) => ({
      stepId: idOf(step.key),
      body: step.tip,
      status: 'APPROVED' as const,
      origin: 'SEED' as const,
      moderatedAt: new Date(),
    })),
  });
}

function stepData(eventId: string, position: number, s: SeedStep, officeId: string | null) {
  return {
    eventId,
    position,
    title: s.title,
    form: s.form,
    whereText: s.where,
    officeId,
    fee: s.fee,
    waitText: s.wait,
    dueText: s.due,
    dueAmount: s.dueAmount ?? null,
    dueUnit: s.dueUnit ?? null,
    sourceUrl: s.sourceUrl,
    lastVerifiedAt: null,
    verified: false,
  };
}
