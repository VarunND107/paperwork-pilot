import { describe, expect, it } from 'vitest';
import { route } from '../test/engineKit.js';
import {
  buildRequirements,
  type DocRequirement,
  documentState,
  findUnreachableDocuments,
  heldDocumentIds,
  isHeld,
  requirementsComplete,
  type StepDocumentRow,
} from './documents.js';

const none = new Set<string>();
const ids = (...v: string[]) => new Set(v);

describe('documentState', () => {
  const userHolds: DocRequirement = { documentId: 'passbook', producedBy: [] };
  const fromStep: DocRequirement = { documentId: 'cert', producedBy: ['s3'] };

  it('is open until the user ticks a document nobody produces', () => {
    expect(documentState(userHolds, none, none)).toBe('open');
    expect(documentState(userHolds, none, ids('passbook'))).toBe('ticked');
  });

  it('counts a document produced by a done step as held (auto)', () => {
    expect(documentState(fromStep, ids('s3'), none)).toBe('auto');
    expect(isHeld(documentState(fromStep, ids('s3'), none))).toBe(true);
  });

  it('waits when the producing step is not done', () => {
    expect(documentState(fromStep, none, none)).toBe('wait');
    expect(isHeld('wait')).toBe(false);
  });

  it('does not let a tick override a document that a step must produce', () => {
    expect(documentState(fromStep, none, ids('cert'))).toBe('wait');
  });

  it('is auto when ANY producer is done', () => {
    const two: DocRequirement = { documentId: 'cert', producedBy: ['a', 'b'] };
    expect(documentState(two, ids('b'), none)).toBe('auto');
    expect(documentState(two, ids('x'), none)).toBe('wait');
  });

  it('goes back to wait when the producer is undone', () => {
    expect(documentState(fromStep, ids('s3'), none)).toBe('auto');
    expect(documentState(fromStep, none, none)).toBe('wait');
  });

  it('only auto and ticked count as held', () => {
    expect(isHeld('auto')).toBe(true);
    expect(isHeld('ticked')).toBe(true);
    expect(isHeld('open')).toBe(false);
    expect(isHeld('wait')).toBe(false);
  });
});

describe('requirementsComplete', () => {
  const reqs: DocRequirement[] = [
    { documentId: 'cert', producedBy: ['s3'] },
    { documentId: 'id', producedBy: [] },
  ];

  it('needs every document held', () => {
    expect(requirementsComplete(reqs, none, none)).toBe(false);
    expect(requirementsComplete(reqs, ids('s3'), none)).toBe(false);
    expect(requirementsComplete(reqs, none, ids('id'))).toBe(false);
    expect(requirementsComplete(reqs, ids('s3'), ids('id'))).toBe(true);
  });

  it('is trivially complete for a step that needs no documents', () => {
    expect(requirementsComplete([], none, none)).toBe(true);
  });
});

describe('heldDocumentIds', () => {
  it('collects documents held across the whole route', () => {
    const byStep = new Map<string, DocRequirement[]>([
      ['s4', [{ documentId: 'cert', producedBy: ['s3'] }]],
      [
        's5',
        [
          { documentId: 'cert', producedBy: ['s3'] },
          { documentId: 'pass', producedBy: [] },
        ],
      ],
    ]);
    expect(heldDocumentIds(byStep, none, none)).toEqual(new Set());
    expect(heldDocumentIds(byStep, ids('s3'), ids('pass'))).toEqual(new Set(['cert', 'pass']));
  });
});

describe('buildRequirements', () => {
  const rows: StepDocumentRow[] = [
    { stepId: 's2', documentId: 'regno', role: 'PRODUCES', producedByStepId: null },
    { stepId: 's3', documentId: 'regno', role: 'REQUIRES', producedByStepId: 's2' },
    { stepId: 's3', documentId: 'id', role: 'REQUIRES', producedByStepId: null },
  ];

  it('creates requirements only from requires-rows', () => {
    const result = buildRequirements(rows);
    expect(result.get('s2')).toBeUndefined();
    expect(result.get('s3')?.map((r) => r.documentId)).toEqual(['regno', 'id']);
  });

  it('knows who produces a document', () => {
    const result = buildRequirements(rows);
    expect(result.get('s3')?.[0]?.producedBy).toEqual(['s2']);
    expect(result.get('s3')?.[1]?.producedBy).toEqual([]);
  });

  it('merges produces-rows with the explicit producer, without duplicates', () => {
    const merged = buildRequirements([
      { stepId: 'a', documentId: 'd', role: 'PRODUCES', producedByStepId: null },
      { stepId: 'b', documentId: 'd', role: 'PRODUCES', producedByStepId: null },
      { stepId: 'c', documentId: 'd', role: 'REQUIRES', producedByStepId: 'a' },
    ]);
    expect(merged.get('c')?.[0]?.producedBy.slice().sort()).toEqual(['a', 'b']);
  });

  it('works from produces-rows alone, with no explicit producer on the requirement', () => {
    const result = buildRequirements([
      { stepId: 'a', documentId: 'd', role: 'PRODUCES', producedByStepId: null },
      { stepId: 'c', documentId: 'd', role: 'REQUIRES', producedByStepId: null },
    ]);
    expect(result.get('c')?.[0]?.producedBy).toEqual(['a']);
  });

  it('works from the explicit producer alone, with no produces-row', () => {
    const result = buildRequirements([
      { stepId: 'c', documentId: 'd', role: 'REQUIRES', producedByStepId: 'a' },
    ]);
    expect(result.get('c')?.[0]?.producedBy).toEqual(['a']);
  });

  it('never lets a step hand itself the document it needs', () => {
    const result = buildRequirements([
      { stepId: 'a', documentId: 'd', role: 'PRODUCES', producedByStepId: null },
      { stepId: 'a', documentId: 'd', role: 'REQUIRES', producedByStepId: null },
    ]);
    expect(result.get('a')?.[0]?.producedBy).toEqual([]);
  });
});

describe('findUnreachableDocuments', () => {
  const steps = route(['a', []], ['b', ['a']], ['c', ['b']], ['x', []]);
  const req = (stepId: string, producedBy: string[]) =>
    new Map<string, DocRequirement[]>([[stepId, [{ documentId: 'doc', producedBy }]]]);

  it('accepts a document produced by a direct prerequisite', () => {
    expect(findUnreachableDocuments(steps, req('b', ['a']))).toEqual([]);
  });

  it('accepts a document produced further upstream', () => {
    expect(findUnreachableDocuments(steps, req('c', ['a']))).toEqual([]);
  });

  it('flags a document produced by an unrelated branch', () => {
    const problems = findUnreachableDocuments(steps, req('c', ['x']));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ stepId: 'c', documentId: 'doc' });
  });

  it('flags a document produced by a step that comes later', () => {
    expect(findUnreachableDocuments(steps, req('b', ['c']))).toHaveLength(1);
  });

  it('accepts when at least one producer is upstream', () => {
    expect(findUnreachableDocuments(steps, req('c', ['x', 'a']))).toEqual([]);
  });

  it('ignores documents nobody produces', () => {
    expect(findUnreachableDocuments(steps, req('c', []))).toEqual([]);
  });
});
