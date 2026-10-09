import { describe, expect, it } from 'vitest';
import { route } from '../test/engineKit.js';
import { GraphError } from './graph.js';
import { computeStatuses } from './status.js';
import { cascadeUndo, findInconsistentDone } from './undo.js';

const chain = route(['a', []], ['b', ['a']], ['c', ['b']], ['d', ['c']]);
const diamond = route(['a', []], ['b', ['a']], ['c', ['a']], ['d', ['b', 'c']], ['e', []]);

describe('cascadeUndo', () => {
  it('re-locks everything downstream of the undone step', () => {
    const { doneIds, reopened } = cascadeUndo(chain, new Set(['a', 'b', 'c', 'd']), 'b');
    expect(doneIds).toEqual(new Set(['a']));
    expect(reopened).toEqual(['b', 'c', 'd']);
    const statuses = computeStatuses(chain, doneIds);
    expect(statuses.get('b')?.status).toBe('ready');
    expect(statuses.get('c')).toEqual({ status: 'locked', blockedBy: ['b'] });
    expect(statuses.get('d')?.status).toBe('locked');
  });

  it('only reopens the step itself when it is a leaf', () => {
    const { doneIds, reopened } = cascadeUndo(chain, new Set(['a', 'b', 'c', 'd']), 'd');
    expect(doneIds).toEqual(new Set(['a', 'b', 'c']));
    expect(reopened).toEqual(['d']);
  });

  it('undoing a root of a diamond reopens the whole diamond but not unrelated steps', () => {
    const { doneIds, reopened } = cascadeUndo(diamond, new Set(['a', 'b', 'c', 'd', 'e']), 'a');
    expect(doneIds).toEqual(new Set(['e']));
    expect(reopened).toEqual(['a', 'b', 'c', 'd']);
  });

  it('undoing one branch of a diamond reopens the join but not the other branch', () => {
    const { doneIds, reopened } = cascadeUndo(diamond, new Set(['a', 'b', 'c', 'd']), 'b');
    expect(doneIds).toEqual(new Set(['a', 'c']));
    expect(reopened).toEqual(['b', 'd']);
  });

  it('skips downstream steps that were not done', () => {
    const { doneIds, reopened } = cascadeUndo(chain, new Set(['a', 'b']), 'a');
    expect(doneIds).toEqual(new Set());
    expect(reopened).toEqual(['a', 'b']);
  });

  it('does nothing when the step is not done', () => {
    const { doneIds, reopened } = cascadeUndo(chain, new Set(['a']), 'c');
    expect(doneIds).toEqual(new Set(['a']));
    expect(reopened).toEqual([]);
  });

  it('never modifies the set it was given', () => {
    const done = new Set(['a', 'b', 'c']);
    cascadeUndo(chain, done, 'a');
    expect(done).toEqual(new Set(['a', 'b', 'c']));
  });

  it('throws for a step that does not exist', () => {
    expect(() => cascadeUndo(chain, new Set(), 'ghost')).toThrow(GraphError);
  });

  it('always leaves a consistent record', () => {
    for (const id of ['a', 'b', 'c', 'd']) {
      const { doneIds } = cascadeUndo(chain, new Set(['a', 'b', 'c', 'd']), id);
      expect(findInconsistentDone(chain, doneIds)).toEqual([]);
    }
  });
});

describe('findInconsistentDone', () => {
  it('finds a done step whose prerequisite is not done', () => {
    expect(findInconsistentDone(chain, new Set(['a', 'c']))).toEqual(['c']);
  });
  it('finds none in a consistent record', () => {
    expect(findInconsistentDone(chain, new Set(['a', 'b']))).toEqual([]);
    expect(findInconsistentDone(chain, new Set())).toEqual([]);
  });
});
