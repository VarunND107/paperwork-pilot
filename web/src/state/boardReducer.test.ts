import { describe, expect, it } from 'vitest';
import { caseAfterStepOne, freshCase } from '../test/fixtures';
import { boardReducer, defaultSelection, initialBoardState, withTick } from './boardReducer';

describe('defaultSelection', () => {
  it('is the next step to do', () => {
    expect(defaultSelection(freshCase())).toBe('s1');
    expect(defaultSelection(caseAfterStepOne())).toBe('s2');
  });
  it('is the last step once the route is finished', () => {
    const done = { ...freshCase(), progress: { done: 3, total: 3, nextStepId: null } };
    expect(defaultSelection(done)).toBe('s3');
  });
  it('is null for an empty route', () => {
    expect(
      defaultSelection({
        ...freshCase(),
        steps: [],
        progress: { done: 0, total: 0, nextStepId: null },
      }),
    ).toBeNull();
  });
});

describe('boardReducer', () => {
  it('selects the next step when a case loads and plays the enter animation', () => {
    const next = boardReducer(initialBoardState, {
      type: 'loaded',
      view: freshCase(),
      enter: true,
    });
    expect(next).toMatchObject({ status: 'ready', selectedId: 's1', enterKey: 1 });
  });

  it('keeps the selection when a case is refreshed without the enter animation', () => {
    let state = boardReducer(initialBoardState, { type: 'loaded', view: freshCase(), enter: true });
    state = boardReducer(state, { type: 'select', id: 's3' });
    state = boardReducer(state, { type: 'loaded', view: freshCase(), enter: false });
    expect(state.selectedId).toBe('s3');
    expect(state.enterKey).toBe(1);
  });

  it('falls back to the next step when the selected step no longer exists', () => {
    let state = boardReducer(initialBoardState, { type: 'loaded', view: freshCase(), enter: true });
    state = boardReducer(state, { type: 'select', id: 'gone' });
    state = boardReducer(state, { type: 'applied', view: freshCase() });
    expect(state.selectedId).toBe('s1');
  });

  it('records which step to stamp, and clears it as soon as anything else happens', () => {
    let state = boardReducer(initialBoardState, { type: 'loaded', view: freshCase(), enter: true });
    state = boardReducer(state, {
      type: 'applied',
      view: caseAfterStepOne(),
      slamStepId: 's1',
      flash: ['s2'],
    });
    expect(state).toMatchObject({ slamStepId: 's1', slamKey: 1, flashIds: ['s2'] });

    // A document tick on the same screen must not replay the stamp, nor clear it.
    state = boardReducer(state, { type: 'applied', view: caseAfterStepOne() });
    expect(state.slamStepId).toBe('s1');
    expect(state.slamKey).toBe(1);
    expect(state.flashIds).toEqual([]);

    // Selecting another step clears it.
    state = boardReducer(state, { type: 'select', id: 's2' });
    expect(state.slamStepId).toBeNull();
  });

  it('clears the stamp on undo', () => {
    let state = boardReducer(initialBoardState, { type: 'loaded', view: freshCase(), enter: true });
    state = boardReducer(state, { type: 'applied', view: caseAfterStepOne(), slamStepId: 's1' });
    state = boardReducer(state, { type: 'applied', view: freshCase(), fresh: true });
    expect(state.slamStepId).toBeNull();
    expect(state.freshKey).toBeGreaterThan(0);
  });

  it('records failures with their kind', () => {
    const state = boardReducer(initialBoardState, {
      type: 'failed',
      status: 'no-access',
      message: 'nope',
    });
    expect(state).toMatchObject({ status: 'no-access', error: 'nope', busy: false });
  });

  it('re-announces an identical message by alternating an invisible space', () => {
    let state = boardReducer(initialBoardState, { type: 'announce', text: 'Step 1 done.' });
    expect(state.announcement).toBe('Step 1 done.');
    state = boardReducer(state, { type: 'announce', text: 'Step 1 done.' });
    expect(state.announcement).toBe('Step 1 done. ');
    state = boardReducer(state, { type: 'announce', text: 'Step 1 done.' });
    expect(state.announcement).toBe('Step 1 done.');
    state = boardReducer(state, { type: 'announce', text: 'Step 2 done.' });
    expect(state.announcement).toBe('Step 2 done.');
  });
});

describe('withTick', () => {
  it('ticks a document on every step that asks for it and completes the step when all are held', () => {
    const view = withTick(freshCase(), 'd-discharge', true);
    const s1 = view.steps[0];
    expect(s1?.documents[0]?.state).toBe('ticked');
    expect(s1?.docsComplete).toBe(false);
    expect(s1?.canComplete).toBe(false);

    const both = withTick(view, 'd-id', true);
    expect(both.steps[0]).toMatchObject({ docsComplete: true, canComplete: true });
  });

  it('unticks', () => {
    const view = withTick(withTick(freshCase(), 'd-id', true), 'd-id', false);
    expect(view.steps[0]?.documents[1]?.state).toBe('open');
  });

  it('never changes a document that an earlier step produces', () => {
    const view = withTick(freshCase(), 'd-cert', true);
    expect(view.steps[1]?.documents[0]?.state).toBe('wait');
  });

  it('does not make a locked step completable', () => {
    const view = withTick(freshCase(), 'd-reporter', true);
    expect(view.steps[1]?.canComplete).toBe(false);
  });

  it('does not touch the original', () => {
    const original = freshCase();
    withTick(original, 'd-id', true);
    expect(original.steps[0]?.documents[1]?.state).toBe('open');
  });
});
