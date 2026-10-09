import { describe, expect, it } from 'vitest';
import {
  ancestorsOf,
  CycleError,
  descendantsOf,
  findCycle,
  GraphError,
  topologicalSort,
  validateGraph,
  wouldCreateCycle,
} from './graph.js';
import { node, route } from '../test/engineKit.js';

/** Runs `fn`, expects a GraphError, and returns it so the test can check its fields. */
function graphErrorFrom(fn: () => unknown): GraphError {
  try {
    fn();
  } catch (error) {
    if (error instanceof GraphError) return error;
    throw error;
  }
  throw new Error('Expected a GraphError but nothing was thrown');
}

describe('validateGraph', () => {
  it('accepts a valid list, including the empty one', () => {
    expect(() => validateGraph([])).not.toThrow();
    expect(() => validateGraph(route(['a', []], ['b', ['a']]))).not.toThrow();
  });

  it('rejects duplicate ids', () => {
    const error = graphErrorFrom(() => validateGraph([node('a'), node('a')]));
    expect(error).toMatchObject({ name: 'GraphError', code: 'duplicate_step', stepId: 'a' });
  });

  it('rejects a need that is not in the route', () => {
    const error = graphErrorFrom(() => validateGraph([node('a', ['ghost'])]));
    expect(error).toMatchObject({ code: 'unknown_step', stepId: 'ghost' });
  });

  it('rejects a step that needs itself', () => {
    const error = graphErrorFrom(() => validateGraph([node('a', ['a'])]));
    expect(error).toMatchObject({ code: 'self_dependency', stepId: 'a' });
  });
});

describe('topologicalSort', () => {
  it('returns an empty order for an empty route', () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it('orders a chain', () => {
    expect(topologicalSort(route(['c', ['b']], ['b', ['a']], ['a', []]))).toEqual(['a', 'b', 'c']);
  });

  it('puts every step after the steps it needs (diamond)', () => {
    const steps = route(['d', ['b', 'c']], ['b', ['a']], ['c', ['a']], ['a', []]);
    const order = topologicalSort(steps);
    expect(order[0]).toBe('a');
    expect(order[3]).toBe('d');
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('breaks ties with the author position, not the input order', () => {
    const steps = [node('late', [], 5), node('early', [], 1), node('middle', [], 3)];
    expect(topologicalSort(steps)).toEqual(['early', 'middle', 'late']);
  });

  it('breaks position ties by id so the result is deterministic', () => {
    expect(topologicalSort([node('b'), node('a'), node('c')])).toEqual(['a', 'b', 'c']);
  });

  it('follows author order wherever dependencies allow', () => {
    // 2 and 3 are both ready after 1; 4 needs 2 only. Expect 1,2,3,4 not 1,2,4,3.
    const steps = route(['s1', []], ['s2', ['s1']], ['s3', ['s1']], ['s4', ['s2']]);
    expect(topologicalSort(steps)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('lets a later-authored step wait for an earlier one that is blocked', () => {
    // x (pos 1) needs z (pos 3). y (pos 2) has no needs, so y goes first, then z, then x.
    const steps = [node('x', ['z'], 1), node('y', [], 2), node('z', [], 3)];
    expect(topologicalSort(steps)).toEqual(['y', 'z', 'x']);
  });

  it('does not depend on the order of the input array', () => {
    const steps = route(['a', []], ['b', ['a']], ['c', ['a']], ['d', ['b', 'c']], ['e', []]);
    const expected = topologicalSort(steps);
    expect(topologicalSort([...steps].reverse())).toEqual(expected);
    expect(topologicalSort([steps[3]!, steps[0]!, steps[4]!, steps[2]!, steps[1]!])).toEqual(
      expected,
    );
  });

  it('tolerates the same need listed twice', () => {
    expect(topologicalSort([node('a'), { id: 'b', position: 1, needs: ['a', 'a'] }])).toEqual([
      'a',
      'b',
    ]);
  });

  it('throws CycleError with the cycle path', () => {
    const steps = route(['a', ['b']], ['b', ['c']], ['c', ['a']]);
    try {
      topologicalSort(steps);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CycleError);
      const cycle = (error as CycleError).cycle;
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
      expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c']));
    }
  });

  it('throws GraphError for a malformed list', () => {
    expect(() => topologicalSort([node('a', ['nope'])])).toThrow(GraphError);
  });
});

describe('findCycle', () => {
  it('returns null for a DAG and for an empty route', () => {
    expect(findCycle([])).toBeNull();
    expect(findCycle(route(['a', []], ['b', ['a']], ['c', ['a', 'b']]))).toBeNull();
  });

  it('finds a two-step loop', () => {
    expect(findCycle(route(['a', ['b']], ['b', ['a']]))).toEqual(['a', 'b', 'a']);
  });

  it('finds a three-step loop in author order', () => {
    expect(findCycle(route(['a', ['b']], ['b', ['c']], ['c', ['a']]))).toEqual([
      'a',
      'b',
      'c',
      'a',
    ]);
  });

  it('finds a loop that hides behind a healthy prefix', () => {
    const steps = route(['root', []], ['a', ['root', 'c']], ['b', ['a']], ['c', ['b']]);
    const cycle = findCycle(steps);
    expect(cycle).not.toBeNull();
    expect(new Set(cycle)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('returns a path where each step needs the next', () => {
    const steps = route(['a', ['b']], ['b', ['c']], ['c', ['d']], ['d', ['b']]);
    const cycle = findCycle(steps) ?? [];
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    for (let i = 0; i < cycle.length - 1; i++) {
      const step = steps.find((s) => s.id === cycle[i]);
      expect(step?.needs).toContain(cycle[i + 1]);
    }
  });

  it('does not flag a diamond as a cycle', () => {
    expect(findCycle(route(['a', []], ['b', ['a']], ['c', ['a']], ['d', ['b', 'c']]))).toBeNull();
  });
});

describe('wouldCreateCycle', () => {
  const chain = route(['a', []], ['b', ['a']], ['c', ['b']], ['d', ['c']]);

  it('allows an edge that keeps the graph acyclic', () => {
    expect(wouldCreateCycle(chain, 'd', 'a')).toBeNull();
    expect(wouldCreateCycle(chain, 'c', 'a')).toBeNull();
  });

  it('allows an edge that already exists', () => {
    expect(wouldCreateCycle(chain, 'b', 'a')).toBeNull();
  });

  it('rejects an edge that closes a loop and returns the cycle', () => {
    expect(wouldCreateCycle(chain, 'a', 'd')).toEqual(['a', 'd', 'c', 'b', 'a']);
    expect(wouldCreateCycle(chain, 'b', 'c')).toEqual(['b', 'c', 'b']);
  });

  it('rejects a step needing itself', () => {
    expect(wouldCreateCycle(chain, 'b', 'b')).toEqual(['b', 'b']);
  });

  it('allows an edge between independent branches', () => {
    const forks = route(['a', []], ['b', ['a']], ['c', []], ['d', ['c']]);
    expect(wouldCreateCycle(forks, 'b', 'd')).toBeNull();
  });

  it('throws for a step that does not exist', () => {
    expect(() => wouldCreateCycle(chain, 'a', 'ghost')).toThrow(GraphError);
    expect(() => wouldCreateCycle(chain, 'ghost', 'a')).toThrow(GraphError);
  });
});

describe('ancestorsOf and descendantsOf', () => {
  const diamond = route(['a', []], ['b', ['a']], ['c', ['a']], ['d', ['b', 'c']], ['e', []]);

  it('collects everything upstream', () => {
    expect(ancestorsOf(diamond, 'd')).toEqual(new Set(['a', 'b', 'c']));
    expect(ancestorsOf(diamond, 'a')).toEqual(new Set());
    expect(ancestorsOf(diamond, 'e')).toEqual(new Set());
  });

  it('collects everything downstream', () => {
    expect(descendantsOf(diamond, 'a')).toEqual(new Set(['b', 'c', 'd']));
    expect(descendantsOf(diamond, 'b')).toEqual(new Set(['d']));
    expect(descendantsOf(diamond, 'd')).toEqual(new Set());
  });

  it('never includes the step itself', () => {
    expect(ancestorsOf(diamond, 'd').has('d')).toBe(false);
    expect(descendantsOf(diamond, 'a').has('a')).toBe(false);
  });

  it('throws for an unknown step', () => {
    expect(() => ancestorsOf(diamond, 'zzz')).toThrow(GraphError);
    expect(() => descendantsOf(diamond, 'zzz')).toThrow(GraphError);
  });
});
