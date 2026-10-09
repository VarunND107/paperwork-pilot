import { describe, expect, it } from 'vitest';
import { caseHealth } from './health.js';
import { buildRoute, checkComplete, type RouteState, type RouteStepInput } from './route.js';
import { GraphError } from './graph.js';

const steps: RouteStepInput[] = [
  {
    id: 'a',
    position: 1,
    needs: [],
    due: { amount: 21, unit: 'DAY' },
    requires: [{ documentId: 'id', producedBy: [] }],
  },
  {
    id: 'b',
    position: 2,
    needs: ['a'],
    due: { amount: 1, unit: 'WEEK' },
    requires: [
      { documentId: 'cert', producedBy: ['a'] },
      { documentId: 'photo', producedBy: [] },
    ],
  },
  { id: 'c', position: 3, needs: ['a'], due: null, requires: [] },
  {
    id: 'd',
    position: 4,
    needs: ['b', 'c'],
    due: null,
    requires: [{ documentId: 'cert', producedBy: ['a'] }],
  },
];

function state(overrides: Partial<RouteState> = {}): RouteState {
  return {
    doneIds: new Set(),
    tickedDocumentIds: new Set(),
    eventDate: null,
    today: '2026-10-09',
    ...overrides,
  };
}

describe('buildRoute', () => {
  it('numbers steps from 1 in route order and marks the next one', () => {
    const r = buildRoute(steps, state());
    expect(r.order).toEqual(['a', 'b', 'c', 'd']);
    expect(r.steps.map((s) => s.number)).toEqual([1, 2, 3, 4]);
    expect(r.steps.map((s) => s.isNext)).toEqual([true, false, false, false]);
    expect(r.nextStepId).toBe('a');
    expect(r.total).toBe(4);
    expect(r.doneCount).toBe(0);
  });

  it('computes status and blockers', () => {
    const r = buildRoute(steps, state({ doneIds: new Set(['a']) }));
    const byId = Object.fromEntries(r.steps.map((s) => [s.id, s]));
    expect(byId.a?.status).toBe('done');
    expect(byId.b?.status).toBe('ready');
    expect(byId.c?.status).toBe('ready');
    expect(byId.d).toMatchObject({ status: 'locked', blockedBy: ['b', 'c'] });
    expect(r.nextStepId).toBe('b');
    expect(r.doneCount).toBe(1);
  });

  it('auto-satisfies a document once the step that produces it is done', () => {
    const before = buildRoute(steps, state()).steps.find((s) => s.id === 'b');
    expect(before?.docs.find((d) => d.documentId === 'cert')).toEqual({
      documentId: 'cert',
      state: 'wait',
      comesFrom: ['a'],
    });
    const after = buildRoute(steps, state({ doneIds: new Set(['a']) })).steps.find(
      (s) => s.id === 'b',
    );
    expect(after?.docs.find((d) => d.documentId === 'cert')?.state).toBe('auto');
  });

  it('shares one tick across every step that needs the same document', () => {
    const ticked = state({ tickedDocumentIds: new Set(['photo', 'id']) });
    const r = buildRoute(steps, ticked);
    expect(r.steps.find((s) => s.id === 'a')?.docs[0]?.state).toBe('ticked');
    expect(
      r.steps.find((s) => s.id === 'b')?.docs.find((d) => d.documentId === 'photo')?.state,
    ).toBe('ticked');
  });

  it('can complete only when ready and every document is held', () => {
    const none = buildRoute(steps, state()).steps.find((s) => s.id === 'a');
    expect(none).toMatchObject({ status: 'ready', docsComplete: false, canComplete: false });
    const ticked = buildRoute(steps, state({ tickedDocumentIds: new Set(['id']) })).steps.find(
      (s) => s.id === 'a',
    );
    expect(ticked).toMatchObject({ docsComplete: true, canComplete: true });
    // c has no documents but is locked until a is done
    const c = buildRoute(steps, state()).steps.find((s) => s.id === 'c');
    expect(c).toMatchObject({ status: 'locked', docsComplete: true, canComplete: false });
  });

  it('computes deadlines from the event date', () => {
    const r = buildRoute(steps, state({ eventDate: '2026-10-01', today: '2026-10-09' }));
    const a = r.steps.find((s) => s.id === 'a');
    const b = r.steps.find((s) => s.id === 'b');
    const c = r.steps.find((s) => s.id === 'c');
    expect(a).toMatchObject({ deadline: '2026-10-22', daysLeft: 13, deadlineState: 'upcoming' });
    expect(b).toMatchObject({ deadline: '2026-10-08', daysLeft: -1, deadlineState: 'overdue' });
    expect(c).toMatchObject({ deadline: null, daysLeft: null, deadlineState: 'none' });
  });

  it('has no deadlines until the case has an event date', () => {
    const r = buildRoute(steps, state({ eventDate: null }));
    expect(r.steps.every((s) => s.deadline === null && s.deadlineState === 'none')).toBe(true);
  });

  it('has no next step once everything is done', () => {
    const r = buildRoute(steps, state({ doneIds: new Set(['a', 'b', 'c', 'd']) }));
    expect(r.nextStepId).toBeNull();
    expect(r.doneCount).toBe(4);
    expect(r.steps.some((s) => s.isNext)).toBe(false);
  });

  it('handles an empty route', () => {
    const r = buildRoute([], state());
    expect(r).toMatchObject({ order: [], steps: [], total: 0, doneCount: 0, nextStepId: null });
  });
});

describe('checkComplete', () => {
  it('allows a ready step with all documents held', () => {
    const r = buildRoute(steps, state({ tickedDocumentIds: new Set(['id']) }));
    expect(checkComplete(r, 'a')).toEqual({ ok: true });
  });

  it('refuses a step that is already done', () => {
    const r = buildRoute(steps, state({ doneIds: new Set(['a']) }));
    expect(checkComplete(r, 'a')).toEqual({ ok: false, reason: 'already_done' });
  });

  it('refuses a locked step and names what it waits for', () => {
    const r = buildRoute(steps, state());
    // d directly needs b and c; neither is done yet.
    expect(checkComplete(r, 'd')).toEqual({ ok: false, reason: 'locked', blockedBy: ['b', 'c'] });
  });

  it('refuses a ready step with missing documents and lists them', () => {
    const r = buildRoute(steps, state({ doneIds: new Set(['a']) }));
    expect(checkComplete(r, 'b')).toEqual({
      ok: false,
      reason: 'documents_missing',
      missing: ['photo'],
    });
  });

  it('throws for a step that does not exist', () => {
    expect(() => checkComplete(buildRoute(steps, state()), 'ghost')).toThrow(GraphError);
  });
});

describe('caseHealth', () => {
  it('is On track when nothing is overdue and the next step has its documents', () => {
    const r = buildRoute(steps, state({ tickedDocumentIds: new Set(['id']) }));
    expect(caseHealth(r)).toMatchObject({
      status: 'on_track',
      nextStepId: 'a',
      missingDocumentIds: [],
    });
  });

  it('Needs document when the next step still lacks one', () => {
    const r = buildRoute(steps, state());
    expect(caseHealth(r)).toMatchObject({ status: 'needs_document', missingDocumentIds: ['id'] });
  });

  it('is Overdue when a step that is not done is past its deadline', () => {
    const r = buildRoute(steps, state({ eventDate: '2026-09-01', today: '2026-10-09' }));
    const h = caseHealth(r);
    expect(h.status).toBe('overdue');
    expect(h.overdueStepIds).toEqual(['a', 'b']);
  });

  it('Overdue wins over Needs document', () => {
    const r = buildRoute(steps, state({ eventDate: '2026-09-01', today: '2026-10-09' }));
    expect(caseHealth(r).missingDocumentIds).toEqual(['id']);
    expect(caseHealth(r).status).toBe('overdue');
  });

  it('does not count a step that is done, even if its deadline passed', () => {
    const r = buildRoute(
      steps,
      state({
        eventDate: '2026-09-01',
        today: '2026-10-09',
        doneIds: new Set(['a', 'b']),
        tickedDocumentIds: new Set(['id', 'photo']),
      }),
    );
    expect(caseHealth(r).overdueStepIds).toEqual([]);
    expect(caseHealth(r).status).toBe('on_track');
  });

  it('counts a locked step whose deadline has passed', () => {
    const r = buildRoute(
      [
        { id: 'x', position: 1, needs: [], due: null, requires: [] },
        { id: 'y', position: 2, needs: ['x'], due: { amount: 1, unit: 'DAY' }, requires: [] },
      ],
      state({ eventDate: '2026-10-01', today: '2026-10-09' }),
    );
    expect(caseHealth(r).status).toBe('overdue');
  });

  it('is On track for a finished route', () => {
    const r = buildRoute(steps, state({ doneIds: new Set(['a', 'b', 'c', 'd']) }));
    expect(caseHealth(r)).toEqual({
      status: 'on_track',
      nextStepId: null,
      overdueStepIds: [],
      missingDocumentIds: [],
    });
  });
});
