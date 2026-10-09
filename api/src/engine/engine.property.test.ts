import { describe, expect, it } from 'vitest';
import { prng } from '../test/engineKit.js';
import { CycleError, findCycle, topologicalSort, wouldCreateCycle } from './graph.js';
import { computeStatuses } from './status.js';
import type { StepNode } from './types.js';
import { cascadeUndo, findInconsistentDone } from './undo.js';

/** A random DAG whose author order (position) is deliberately unrelated to the dependency order. */
function randomDag(rand: () => number): StepNode[] {
  const n = 1 + Math.floor(rand() * 12);
  const positions = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [positions[i], positions[j]] = [positions[j]!, positions[i]!];
  }
  const nodes: StepNode[] = [];
  for (let i = 0; i < n; i++) {
    const needs: string[] = [];
    for (let j = 0; j < i; j++) if (rand() < 0.3) needs.push(`s${j}`);
    nodes.push({ id: `s${i}`, position: positions[i]!, needs });
  }
  return nodes;
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const RUNS = 300;

describe('graph properties (random DAGs)', () => {
  it('topologicalSort is a permutation that puts every step after its needs', () => {
    const rand = prng(1);
    for (let run = 0; run < RUNS; run++) {
      const steps = randomDag(rand);
      const order = topologicalSort(steps);
      expect(order).toHaveLength(steps.length);
      expect(new Set(order)).toEqual(new Set(steps.map((s) => s.id)));
      const at = new Map(order.map((id, i) => [id, i]));
      for (const s of steps)
        for (const need of s.needs) expect(at.get(need)!).toBeLessThan(at.get(s.id)!);
    }
  });

  it('topologicalSort does not depend on the order of the input', () => {
    const rand = prng(2);
    for (let run = 0; run < RUNS; run++) {
      const steps = randomDag(rand);
      expect(topologicalSort(shuffled(steps, rand))).toEqual(topologicalSort(steps));
    }
  });

  it('topologicalSort always picks the lowest-position step among those available', () => {
    const rand = prng(3);
    for (let run = 0; run < RUNS; run++) {
      const steps = randomDag(rand);
      const order = topologicalSort(steps);
      const byId = new Map(steps.map((s) => [s.id, s]));
      const placed = new Set<string>();
      for (const id of order) {
        const available = steps.filter(
          (s) => !placed.has(s.id) && s.needs.every((n) => placed.has(n)),
        );
        const lowest = Math.min(...available.map((s) => s.position));
        expect(byId.get(id)!.position).toBe(lowest);
        placed.add(id);
      }
    }
  });

  it('findCycle is null for every DAG', () => {
    const rand = prng(4);
    for (let run = 0; run < RUNS; run++) expect(findCycle(randomDag(rand))).toBeNull();
  });

  it('adding a back edge always creates a cycle that findCycle and topologicalSort both see', () => {
    const rand = prng(5);
    let tested = 0;
    for (let run = 0; run < RUNS * 3 && tested < RUNS; run++) {
      const steps = randomDag(rand);
      const withEdges = steps.filter((s) => s.needs.length > 0);
      if (withEdges.length === 0) continue;
      const child = withEdges[Math.floor(rand() * withEdges.length)]!;
      const parentId = child.needs[Math.floor(rand() * child.needs.length)]!;
      // Existing edge: child needs parent. Closing the loop: parent needs child.
      expect(wouldCreateCycle(steps, parentId, child.id)).not.toBeNull();
      const looped = steps.map((s) =>
        s.id === parentId ? { ...s, needs: [...s.needs, child.id] } : s,
      );
      const cycle = findCycle(looped);
      expect(cycle).not.toBeNull();
      expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
      for (let i = 0; i < cycle!.length - 1; i++) {
        expect(looped.find((s) => s.id === cycle![i])!.needs).toContain(cycle![i + 1]);
      }
      expect(() => topologicalSort(looped)).toThrow(CycleError);
      tested++;
    }
    expect(tested).toBeGreaterThan(100);
  });

  it('wouldCreateCycle agrees with actually adding the edge and looking for a cycle', () => {
    const rand = prng(6);
    for (let run = 0; run < RUNS; run++) {
      const steps = randomDag(rand);
      const a = steps[Math.floor(rand() * steps.length)]!;
      const b = steps[Math.floor(rand() * steps.length)]!;
      if (a.id === b.id) continue;
      const predicted = wouldCreateCycle(steps, a.id, b.id);
      const after = steps.map((s) =>
        s.id === a.id ? { ...s, needs: [...new Set([...s.needs, b.id])] } : s,
      );
      expect(predicted !== null).toBe(findCycle(after) !== null);
      if (predicted) {
        expect(predicted[0]).toBe(a.id);
        expect(predicted[predicted.length - 1]).toBe(a.id);
        expect(predicted[1]).toBe(b.id);
      }
    }
  });
});

describe('status and undo properties (random operation sequences)', () => {
  it('keeps the invariants through random complete / undo sequences', () => {
    const rand = prng(7);
    for (let run = 0; run < 150; run++) {
      const steps = randomDag(rand);
      const order = topologicalSort(steps);
      let done = new Set<string>();

      for (let op = 0; op < 40; op++) {
        const statuses = computeStatuses(steps, done);

        // Invariants of status
        for (const s of steps) {
          const info = statuses.get(s.id)!;
          const unmet = s.needs.filter((n) => !done.has(n));
          if (done.has(s.id)) {
            expect(info.status).toBe('done');
          } else if (unmet.length === 0) {
            expect(info).toEqual({ status: 'ready', blockedBy: [] });
          } else {
            expect(info.status).toBe('locked');
            expect(new Set(info.blockedBy)).toEqual(new Set(unmet));
          }
        }
        expect(findInconsistentDone(steps, done)).toEqual([]);

        if (rand() < 0.6) {
          const ready = order.filter((id) => statuses.get(id)!.status === 'ready');
          if (ready.length > 0)
            done = new Set([...done, ready[Math.floor(rand() * ready.length)]!]);
        } else if (done.size > 0) {
          const target = [...done][Math.floor(rand() * done.size)]!;
          const result = cascadeUndo(steps, done, target);
          // Undo only ever removes, and what it removes is exactly what it reports.
          for (const id of result.doneIds) expect(done.has(id)).toBe(true);
          expect(new Set(result.reopened)).toEqual(
            new Set([...done].filter((id) => !result.doneIds.has(id))),
          );
          expect(result.reopened[0]).toBe(order.filter((id) => result.reopened.includes(id))[0]);
          expect(result.reopened).toContain(target);
          // Nothing that depended on the undone step is still done.
          for (const s of steps) {
            if (s.needs.includes(target)) expect(result.doneIds.has(s.id)).toBe(false);
          }
          done = result.doneIds;
        }
      }
    }
  });

  it('completing steps in route order always finishes the whole route', () => {
    const rand = prng(8);
    for (let run = 0; run < RUNS; run++) {
      const steps = randomDag(rand);
      const done = new Set<string>();
      for (const id of topologicalSort(steps)) {
        expect(computeStatuses(steps, done).get(id)!.status).toBe('ready');
        done.add(id);
      }
      expect([...computeStatuses(steps, done).values()].every((s) => s.status === 'done')).toBe(
        true,
      );
    }
  });

  it('undoing then redoing the same steps gets back to the same state', () => {
    const rand = prng(9);
    for (let run = 0; run < RUNS; run++) {
      const steps = randomDag(rand);
      const order = topologicalSort(steps);
      const all = new Set(order);
      const target = order[Math.floor(rand() * order.length)]!;
      const { doneIds, reopened } = cascadeUndo(steps, all, target);
      const redone = new Set(doneIds);
      for (const id of reopened) {
        expect(computeStatuses(steps, redone).get(id)!.status).toBe('ready');
        redone.add(id);
      }
      expect(redone).toEqual(all);
    }
  });
});
