import { describe, expect, it } from 'vitest';
import type { RouteStepInput } from './route.js';
import { validateRoute } from './validate.js';

const step = (
  id: string,
  needs: string[] = [],
  requires: RouteStepInput['requires'] = [],
  position = 0,
): RouteStepInput => ({ id, position, needs, due: null, requires });

describe('validateRoute', () => {
  it('accepts a sound route', () => {
    expect(
      validateRoute([
        step('a', [], [], 1),
        step('b', ['a'], [{ documentId: 'd', producedBy: ['a'] }], 2),
      ]),
    ).toEqual([]);
  });

  it('accepts an empty route', () => {
    expect(validateRoute([])).toEqual([]);
  });

  it('reports a dependency cycle with its path', () => {
    const problems = validateRoute([step('a', ['b'], [], 1), step('b', ['a'], [], 2)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'cycle', cycle: ['a', 'b', 'a'] });
  });

  it('reports duplicate ids, unknown references and self-dependencies', () => {
    expect(validateRoute([step('a'), step('a')])[0]).toMatchObject({ code: 'duplicate_step' });
    expect(validateRoute([step('a', ['zzz'])])[0]).toMatchObject({
      code: 'unknown_step',
      stepId: 'zzz',
    });
    expect(validateRoute([step('a', ['a'])])[0]).toMatchObject({ code: 'self_dependency' });
  });

  it('reports a document that can never be held', () => {
    const problems = validateRoute([
      step('a', [], [], 1),
      step('b', [], [{ documentId: 'cert', producedBy: ['a'] }], 2), // b does not wait for a
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      code: 'unreachable_document',
      stepId: 'b',
      documentId: 'cert',
    });
  });
});
