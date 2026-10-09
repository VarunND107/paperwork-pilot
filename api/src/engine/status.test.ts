import { describe, expect, it } from 'vitest';
import { node, route } from '../test/engineKit.js';
import { computeStatuses, diffStatuses, findNextStep } from './status.js';
import { topologicalSort } from './graph.js';

const diamond = route(['a', []], ['b', ['a']], ['c', ['a']], ['d', ['b', 'c']]);

describe('computeStatuses', () => {
  it('makes root steps ready and everything else locked when nothing is done', () => {
    const s = computeStatuses(diamond, new Set());
    expect(s.get('a')).toEqual({ status: 'ready', blockedBy: [] });
    expect(s.get('b')).toEqual({ status: 'locked', blockedBy: ['a'] });
    expect(s.get('c')).toEqual({ status: 'locked', blockedBy: ['a'] });
    expect(s.get('d')).toEqual({ status: 'locked', blockedBy: ['b', 'c'] });
  });

  it('unlocks dependents when their needs are done', () => {
    const s = computeStatuses(diamond, new Set(['a']));
    expect(s.get('a')?.status).toBe('done');
    expect(s.get('b')?.status).toBe('ready');
    expect(s.get('c')?.status).toBe('ready');
    expect(s.get('d')).toEqual({ status: 'locked', blockedBy: ['b', 'c'] });
  });

  it('lists only the needs that are still not done', () => {
    const s = computeStatuses(diamond, new Set(['a', 'b']));
    expect(s.get('d')).toEqual({ status: 'locked', blockedBy: ['c'] });
    const done = computeStatuses(diamond, new Set(['a', 'b', 'c']));
    expect(done.get('d')).toEqual({ status: 'ready', blockedBy: [] });
  });

  it('reports blockedBy in route order, not input order', () => {
    const steps = [node('z', ['y', 'x'], 9), node('x', [], 2), node('y', [], 1)];
    expect(computeStatuses(steps, new Set()).get('z')?.blockedBy).toEqual(['y', 'x']);
  });

  it('keeps a done step done and never lists blockers for it', () => {
    const s = computeStatuses(diamond, new Set(['a', 'b', 'c', 'd']));
    for (const id of ['a', 'b', 'c', 'd'])
      expect(s.get(id)).toEqual({ status: 'done', blockedBy: [] });
  });

  it('does not rewrite a done step whose prerequisite is no longer done', () => {
    // d is marked done although b is not (for example an admin added the dependency later).
    const s = computeStatuses(diamond, new Set(['a', 'c', 'd']));
    expect(s.get('d')?.status).toBe('done');
    expect(s.get('b')?.status).toBe('ready');
  });

  it('ignores ids in the done set that are not in the route', () => {
    const s = computeStatuses(diamond, new Set(['a', 'deleted-step']));
    expect(s.size).toBe(4);
    expect(s.get('b')?.status).toBe('ready');
  });

  it('handles an empty route', () => {
    expect(computeStatuses([], new Set()).size).toBe(0);
  });

  it('counts a duplicated need once', () => {
    const steps = [node('a'), { id: 'b', position: 1, needs: ['a', 'a'] }];
    expect(computeStatuses(steps, new Set()).get('b')?.blockedBy).toEqual(['a']);
  });
});

describe('findNextStep', () => {
  const order = topologicalSort(diamond);

  it('is the first ready step in route order', () => {
    expect(findNextStep(order, computeStatuses(diamond, new Set()))).toBe('a');
    expect(findNextStep(order, computeStatuses(diamond, new Set(['a'])))).toBe('b');
    expect(findNextStep(order, computeStatuses(diamond, new Set(['a', 'b'])))).toBe('c');
  });

  it('is null once everything is done', () => {
    expect(findNextStep(order, computeStatuses(diamond, new Set(order)))).toBeNull();
  });
});

describe('diffStatuses', () => {
  const order = topologicalSort(diamond);

  it('reports steps that opened up', () => {
    const before = computeStatuses(diamond, new Set());
    const after = computeStatuses(diamond, new Set(['a']));
    expect(diffStatuses(order, before, after)).toEqual({ unlocked: ['b', 'c'], relocked: [] });
  });

  it('reports steps that closed again', () => {
    const before = computeStatuses(diamond, new Set(['a']));
    const after = computeStatuses(diamond, new Set());
    expect(diffStatuses(order, before, after)).toEqual({ unlocked: [], relocked: ['b', 'c'] });
  });

  it('reports nothing when nothing changed', () => {
    const s = computeStatuses(diamond, new Set(['a']));
    expect(diffStatuses(order, s, s)).toEqual({ unlocked: [], relocked: [] });
  });
});
