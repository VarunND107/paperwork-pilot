import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SEED_EVENTS, SEED_OFFICES, type SeedEvent } from './seed-data.js';

interface LandingStep {
  id: string;
  t: string;
  form: string;
  where: string;
  fee: string;
  wait: string;
  due: string;
  needs: string[];
  docs: { t: string; from?: string }[];
  tip: string;
}
interface LandingEvent {
  label: string;
  place: string;
  steps: LandingStep[];
}

/** Evaluates the EVENTS object literal from the approved landing page, in an empty sandbox. */
function loadLandingPageEvents(): Record<string, LandingEvent> {
  const html = readFileSync(new URL('../../../design/landing-page.html', import.meta.url), 'utf8');
  const start = html.indexOf('var EVENTS = ');
  const end = html.indexOf('var SEED = ', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const sandbox: { EVENTS?: Record<string, LandingEvent> } = {};
  vm.runInNewContext(html.slice(start, end), sandbox);
  if (!sandbox.EVENTS) throw new Error('EVENTS not found in landing page');
  return sandbox.EVENTS;
}

/** All steps reachable by following `needs` upwards from `key`. */
function ancestors(event: SeedEvent, key: string): Set<string> {
  const byKey = new Map(event.steps.map((s) => [s.key, s]));
  const seen = new Set<string>();
  const stack = [...(byKey.get(key)?.needs ?? [])];
  while (stack.length) {
    const next = stack.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    stack.push(...(byKey.get(next)?.needs ?? []));
  }
  return seen;
}

describe('seed data matches the approved landing page', () => {
  const landing = loadLandingPageEvents();

  it('has the same three events', () => {
    expect(SEED_EVENTS.map((e) => e.slug).sort()).toEqual(Object.keys(landing).sort());
  });

  for (const event of SEED_EVENTS) {
    describe(event.slug, () => {
      const source = landing[event.slug];

      it('keeps the label and place word for word', () => {
        expect(source).toBeDefined();
        expect(event.label).toBe(source?.label);
        expect(event.place).toBe(source?.place);
      });

      it('keeps every step, in order, word for word', () => {
        expect(event.steps).toHaveLength(source?.steps.length ?? -1);
        event.steps.forEach((step, i) => {
          const s = source?.steps[i];
          expect(step.key).toBe(s?.id);
          expect(step.title).toBe(s?.t);
          expect(step.form).toBe(s?.form);
          expect(step.where).toBe(s?.where);
          expect(step.fee).toBe(s?.fee);
          expect(step.wait).toBe(s?.wait);
          expect(step.due).toBe(s?.due);
          expect(step.needs).toEqual(s?.needs);
          expect(step.tip).toBe(s?.tip);
          expect(step.docs.map((d) => ({ t: d.t, from: d.from }))).toEqual(
            (s?.docs ?? []).map((d) => ({ t: d.t, from: d.from })),
          );
        });
      });
    });
  }
});

describe('seed data integrity', () => {
  it('has unique event slugs and step keys', () => {
    expect(new Set(SEED_EVENTS.map((e) => e.slug)).size).toBe(SEED_EVENTS.length);
    const keys = SEED_EVENTS.flatMap((e) => e.steps.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only depends on steps of the same event, never on itself', () => {
    for (const event of SEED_EVENTS) {
      const keys = new Set(event.steps.map((s) => s.key));
      for (const step of event.steps) {
        expect(step.needs).not.toContain(step.key);
        for (const need of step.needs) expect(keys.has(need)).toBe(true);
      }
    }
  });

  it('lists steps in a valid order: every dependency comes earlier', () => {
    for (const event of SEED_EVENTS) {
      const seen = new Set<string>();
      for (const step of event.steps) {
        for (const need of step.needs) expect(seen.has(need)).toBe(true);
        seen.add(step.key);
      }
    }
  });

  it('only auto-fills a document from a step the requiring step actually waits for', () => {
    for (const event of SEED_EVENTS) {
      for (const step of event.steps) {
        const before = ancestors(event, step.key);
        for (const d of step.docs) {
          if (d.from) expect(before.has(d.from), `${step.key} doc "${d.t}"`).toBe(true);
        }
      }
    }
  });

  it('refers only to known offices', () => {
    const known = new Set(SEED_OFFICES.map((o) => o.key));
    for (const event of SEED_EVENTS) {
      for (const step of event.steps) expect(known.has(step.office), step.office).toBe(true);
    }
  });

  it('gives every step an http(s) source_url', () => {
    for (const event of SEED_EVENTS) {
      for (const step of event.steps) {
        expect(() => new URL(step.sourceUrl)).not.toThrow();
        expect(new URL(step.sourceUrl).protocol).toMatch(/^https?:$/);
      }
    }
  });

  it('has machine-readable deadlines only where amount and unit are both present', () => {
    for (const event of SEED_EVENTS) {
      for (const step of event.steps) {
        expect(step.dueAmount === undefined).toBe(step.dueUnit === undefined);
      }
    }
    const s2 = SEED_EVENTS.find((e) => e.slug === 'death')?.steps.find((s) => s.key === 's2');
    expect(s2).toMatchObject({ due: 'Within 21 days', dueAmount: 21, dueUnit: 'DAY' });
  });

  it('has match keywords for every event', () => {
    for (const event of SEED_EVENTS) expect(event.keywords.length).toBeGreaterThan(5);
  });
});
