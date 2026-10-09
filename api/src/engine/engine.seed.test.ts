import { describe, expect, it } from 'vitest';
import { SEED_EVENTS } from '../seed/seed-data.js';
import { seedEvent, seedEventInputs } from '../test/engineKit.js';
import { caseHealth } from './health.js';
import { topologicalSort } from './graph.js';
import { buildRoute, checkComplete, type RouteView } from './route.js';
import { computeStatuses, diffStatuses } from './status.js';
import { cascadeUndo } from './undo.js';
import { validateRoute } from './validate.js';

const TODAY = '2026-10-09';

function view(
  slug: string,
  done: string[] = [],
  ticked: string[] = [],
  eventDate: string | null = null,
): RouteView {
  return buildRoute(seedEventInputs(seedEvent(slug)), {
    doneIds: new Set(done),
    tickedDocumentIds: new Set(ticked),
    eventDate,
    today: TODAY,
  });
}

/** Documents a step needs that nobody hands over (the user has to carry these). */
function carried(slug: string, stepKey: string): string[] {
  const input = seedEventInputs(seedEvent(slug)).find((s) => s.id === stepKey);
  return (input?.requires ?? []).filter((r) => r.producedBy.length === 0).map((r) => r.documentId);
}

describe('the seeded routes are sound', () => {
  for (const event of SEED_EVENTS) {
    const inputs = seedEventInputs(event);

    it(`${event.slug}: no cycles, no unreachable documents`, () => {
      expect(validateRoute(inputs)).toEqual([]);
    });

    it(`${event.slug}: the route order is the author order`, () => {
      expect(topologicalSort(inputs)).toEqual(event.steps.map((s) => s.key));
    });

    it(`${event.slug}: finishing steps in order finishes the route`, () => {
      const done: string[] = [];
      for (const step of event.steps) {
        const ticked = carried(event.slug, step.key);
        const r = view(event.slug, done, ticked);
        expect(checkComplete(r, step.key), `${step.key}`).toEqual({ ok: true });
        done.push(step.key);
      }
      const final = view(event.slug, done);
      expect(final.doneCount).toBe(event.steps.length);
      expect(final.nextStepId).toBeNull();
      expect(caseHealth(final).status).toBe('on_track');
    });
  }
});

describe('death route', () => {
  it('starts with only the medical certificate ready', () => {
    const r = view('death');
    expect(r.steps.map((s) => s.status)).toEqual([
      'ready',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(r.nextStepId).toBe('s1');
    expect(r.steps[1]?.blockedBy).toEqual(['s1']);
  });

  it('shows the same "After 3, 4" blockers as the demo for the bank claim', () => {
    const r = view('death', ['s1', 's2']);
    const s5 = r.steps.find((s) => s.id === 's5');
    const numbers = (s5?.blockedBy ?? []).map((id) => r.steps.find((s) => s.id === id)?.number);
    expect(numbers).toEqual([3, 4]);
  });

  it('unlocks the legal heir certificate only after the certified copies', () => {
    const before = computeStatuses(seedEventInputs(seedEvent('death')), new Set(['s1', 's2']));
    const after = computeStatuses(seedEventInputs(seedEvent('death')), new Set(['s1', 's2', 's3']));
    expect(before.get('s4')?.status).toBe('locked');
    expect(after.get('s4')?.status).toBe('ready');
    expect(
      diffStatuses(topologicalSort(seedEventInputs(seedEvent('death'))), before, after),
    ).toEqual({
      unlocked: ['s4'],
      relocked: [],
    });
  });

  it('needs both the copies and the legal heir certificate for the bank claim and the PF claim', () => {
    const r = view('death', ['s1', 's2', 's3']);
    expect(r.steps.find((s) => s.id === 's5')?.blockedBy).toEqual(['s4']);
    expect(r.steps.find((s) => s.id === 's6')?.blockedBy).toEqual(['s4']);
  });

  it('auto-ticks the documents earlier steps produce', () => {
    const early = view('death').steps.find((s) => s.id === 's3');
    expect(early?.docs.find((d) => d.documentId === 'Registration number')?.state).toBe('wait');
    const later = view('death', ['s1', 's2']).steps.find((s) => s.id === 's3');
    expect(later?.docs.find((d) => d.documentId === 'Registration number')?.state).toBe('auto');
    expect(later?.docs.find((d) => d.documentId === 'ID of the applicant')?.state).toBe('open');
  });

  it('will not let a step be marked done until its carried documents are ticked', () => {
    const none = view('death');
    expect(checkComplete(none, 's1')).toEqual({
      ok: false,
      reason: 'documents_missing',
      missing: ['Hospital discharge or death summary', 'ID of the person who died'],
    });
    const some = view('death', [], ['ID of the person who died']);
    expect(checkComplete(some, 's1')).toMatchObject({
      reason: 'documents_missing',
      missing: ['Hospital discharge or death summary'],
    });
    const all = view(
      'death',
      [],
      ['ID of the person who died', 'Hospital discharge or death summary'],
    );
    expect(checkComplete(all, 's1')).toEqual({ ok: true });
  });

  it('refuses a locked step', () => {
    expect(checkComplete(view('death'), 's5')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('cascade undo of the certified copies re-locks the heir certificate, the bank claim and the PF claim', () => {
    const inputs = seedEventInputs(seedEvent('death'));
    const all = new Set(['s1', 's2', 's3', 's4', 's5', 's6']);
    const { doneIds, reopened } = cascadeUndo(inputs, all, 's3');
    expect(reopened).toEqual(['s3', 's4', 's5', 's6']);
    expect(doneIds).toEqual(new Set(['s1', 's2']));
    const statuses = computeStatuses(inputs, doneIds);
    expect(statuses.get('s3')?.status).toBe('ready');
    expect(statuses.get('s4')).toEqual({ status: 'locked', blockedBy: ['s3'] });
    expect(statuses.get('s5')).toEqual({ status: 'locked', blockedBy: ['s3', 's4'] });
  });

  it('computes the 21-day registration deadline from the date of death', () => {
    const r = view('death', [], [], '2026-10-01');
    const s2 = r.steps.find((s) => s.id === 's2');
    expect(s2).toMatchObject({ deadline: '2026-10-22', daysLeft: 13, deadlineState: 'upcoming' });
    expect(r.steps.find((s) => s.id === 's3')?.deadline).toBe('2026-10-08');
    expect(r.steps.find((s) => s.id === 's4')?.deadline).toBe('2026-11-01');
    expect(r.steps.find((s) => s.id === 's5')?.deadline).toBe('2027-01-01');
    // "Right away" and "Once you hold the legal heir certificate" have no computed deadline
    expect(r.steps.find((s) => s.id === 's1')?.deadline).toBeNull();
    expect(r.steps.find((s) => s.id === 's6')?.deadline).toBeNull();
  });

  it('turns overdue after the deadline', () => {
    const r = view('death', ['s1'], [], '2026-09-01');
    expect(r.steps.find((s) => s.id === 's2')?.deadlineState).toBe('overdue');
    expect(caseHealth(r).status).toBe('overdue');
  });
});

describe('move route', () => {
  it('opens three steps once the rental agreement is done', () => {
    const r = view('move', ['m1']);
    const ready = r.steps.filter((s) => s.status === 'ready').map((s) => s.id);
    expect(ready).toEqual(['m2', 'm3', 'm4']);
  });

  it('holds the preschool step until both the vaccination record and the child Aadhaar are done', () => {
    expect(view('move', ['m1', 'm2', 'm4']).steps.find((s) => s.id === 'm6')?.blockedBy).toEqual([
      'm5',
    ]);
    expect(view('move', ['m1', 'm2', 'm4', 'm5']).steps.find((s) => s.id === 'm6')?.status).toBe(
      'ready',
    );
  });

  it("shares a tick on the child's birth certificate between the health centre and Aadhaar steps", () => {
    const ticked = ["Child's birth certificate"];
    const r = view('move', ['m1', 'm2'], ticked);
    const m4 = r.steps.find((s) => s.id === 'm4');
    const m5 = r.steps.find((s) => s.id === 'm5');
    expect(m4?.docs.find((d) => d.documentId === "Child's birth certificate")?.state).toBe(
      'ticked',
    );
    expect(m5?.docs.find((d) => d.documentId === "Child's birth certificate")?.state).toBe(
      'ticked',
    );
  });

  it('treats "Address proof (rental agreement)" as the rental agreement from step 1', () => {
    const m4 = view('move').steps.find((s) => s.id === 'm4');
    const doc = m4?.docs.find((d) => d.documentId === 'Rental agreement');
    expect(doc).toMatchObject({ state: 'wait', comesFrom: ['m1'] });
    expect(
      view('move', ['m1'])
        .steps.find((s) => s.id === 'm4')
        ?.docs.find((d) => d.documentId === 'Rental agreement')?.state,
    ).toBe('auto');
  });

  it('counts "before move-in" and "at move-in" deadlines from the move-in date', () => {
    const r = view('move', [], [], '2026-11-15');
    expect(r.steps.find((s) => s.id === 'm1')?.deadline).toBe('2026-11-15');
    expect(r.steps.find((s) => s.id === 'm2')?.deadline).toBe('2026-12-15');
    expect(r.steps.find((s) => s.id === 'm5')?.deadline).toBe('2027-01-15');
  });
});

describe('business route', () => {
  it('has two independent starting points', () => {
    const r = view('biz');
    expect(r.steps.filter((s) => s.status === 'ready').map((s) => s.id)).toEqual(['b1', 'b2']);
    expect(r.nextStepId).toBe('b1');
  });

  it('needs the Udyam certificate and the Shops registration before the current account', () => {
    expect(view('biz', ['b1', 'b2', 'b3']).steps.find((s) => s.id === 'b6')?.blockedBy).toEqual([
      'b4',
    ]);
    expect(view('biz', ['b1']).steps.find((s) => s.id === 'b6')?.blockedBy).toEqual(['b4']);
  });

  it('hands the premises proof to the licence, the registration and GST once step 2 is done', () => {
    const r = view('biz', ['b2']);
    for (const id of ['b3', 'b4', 'b5']) {
      const doc = r.steps
        .find((s) => s.id === id)
        ?.docs.find((d) => d.documentId === 'Premises proof');
      expect(doc?.state, id).toBe('auto');
    }
  });
});
