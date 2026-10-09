import { SEED_EVENTS, type SeedEvent } from '../seed/seed-data.js';
import { buildRequirements, type StepDocumentRow } from '../engine/documents.js';
import type { RouteStepInput } from '../engine/route.js';
import type { StepNode } from '../engine/types.js';

/** Shorthand for a graph node. Position defaults to 0 (so ids break ties). */
export function node(id: string, needs: string[] = [], position = 0): StepNode {
  return { id, needs, position };
}

/** A route from `[id, needs]` pairs, with positions in the order given. */
export function route(...defs: [string, string[]][]): StepNode[] {
  return defs.map(([id, needs], i) => node(id, needs, i + 1));
}

/** Converts a seed event into engine input. Step ids are the seed keys; document ids are names. */
export function seedEventInputs(event: SeedEvent): RouteStepInput[] {
  const rows: StepDocumentRow[] = [];
  for (const step of event.steps) {
    for (const d of step.docs) {
      const documentId = d.doc ?? d.t;
      rows.push({
        stepId: step.key,
        documentId,
        role: 'REQUIRES',
        producedByStepId: d.from ?? null,
      });
      if (d.from) {
        rows.push({ stepId: d.from, documentId, role: 'PRODUCES', producedByStepId: null });
      }
    }
  }
  const requirements = buildRequirements(rows);
  return event.steps.map((step, i) => ({
    id: step.key,
    position: i + 1,
    needs: step.needs,
    due:
      step.dueAmount !== undefined && step.dueUnit
        ? { amount: step.dueAmount, unit: step.dueUnit }
        : null,
    requires: requirements.get(step.key) ?? [],
  }));
}

export function seedEvent(slug: string): SeedEvent {
  const event = SEED_EVENTS.find((e) => e.slug === slug);
  if (!event) throw new Error(`No seed event ${slug}`);
  return event;
}

/** Small deterministic PRNG (mulberry32) so randomized tests are reproducible. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
