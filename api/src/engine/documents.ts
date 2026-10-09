import { ancestorsOf, topologicalSort } from './graph.js';
import type { DocState, StepNode } from './types.js';

/** One document a step asks the user to carry. */
export interface DocRequirement {
  documentId: string;
  /** Steps that hand the user this document. Empty means the user has to get it themselves. */
  producedBy: readonly string[];
}

/**
 * A document produced by a done step counts as held. Otherwise the user's own tick decides.
 * A document that some step produces cannot be ticked early: it is "wait" until that step is done.
 */
export function documentState(
  requirement: DocRequirement,
  doneIds: ReadonlySet<string>,
  tickedDocumentIds: ReadonlySet<string>,
): DocState {
  if (requirement.producedBy.length > 0) {
    return requirement.producedBy.some((id) => doneIds.has(id)) ? 'auto' : 'wait';
  }
  return tickedDocumentIds.has(requirement.documentId) ? 'ticked' : 'open';
}

export function isHeld(state: DocState): boolean {
  return state === 'auto' || state === 'ticked';
}

export function requirementsComplete(
  requirements: readonly DocRequirement[],
  doneIds: ReadonlySet<string>,
  tickedDocumentIds: ReadonlySet<string>,
): boolean {
  return requirements.every((r) => isHeld(documentState(r, doneIds, tickedDocumentIds)));
}

/** The ids of documents the user holds right now, across the whole route. */
export function heldDocumentIds(
  requirementsByStep: ReadonlyMap<string, readonly DocRequirement[]>,
  doneIds: ReadonlySet<string>,
  tickedDocumentIds: ReadonlySet<string>,
): Set<string> {
  const held = new Set<string>();
  for (const requirements of requirementsByStep.values()) {
    for (const r of requirements) {
      if (isHeld(documentState(r, doneIds, tickedDocumentIds))) held.add(r.documentId);
    }
  }
  return held;
}

export interface StepDocumentRow {
  stepId: string;
  documentId: string;
  role: 'REQUIRES' | 'PRODUCES';
  producedByStepId: string | null;
}

/**
 * Turns database rows into per-step requirements. A document's producers are the union of every
 * step with a "produces" row for it and the requiring row's own `producedByStepId`.
 * Pass only the rows of ONE event, so a document produced in another event never leaks in.
 */
export function buildRequirements(rows: readonly StepDocumentRow[]): Map<string, DocRequirement[]> {
  const producers = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.role !== 'PRODUCES') continue;
    const set = producers.get(row.documentId) ?? new Set<string>();
    set.add(row.stepId);
    producers.set(row.documentId, set);
  }
  const result = new Map<string, DocRequirement[]>();
  for (const row of rows) {
    if (row.role !== 'REQUIRES') continue;
    const merged = new Set(producers.get(row.documentId) ?? []);
    if (row.producedByStepId) merged.add(row.producedByStepId);
    merged.delete(row.stepId); // a step cannot hand itself the document it needs
    const list = result.get(row.stepId) ?? [];
    list.push({ documentId: row.documentId, producedBy: [...merged] });
    result.set(row.stepId, list);
  }
  return result;
}

export interface DocumentFlowProblem {
  stepId: string;
  documentId: string;
  /** The document is handed over only by steps that this step does not wait for. */
  message: string;
}

/**
 * Every document that some step produces must be reachable: at least one of its producers has to
 * be a step that the requiring step (transitively) needs. Otherwise the step could become "ready"
 * while the document can never be held, and the user would be stuck.
 */
export function findUnreachableDocuments(
  steps: readonly StepNode[],
  requirementsByStep: ReadonlyMap<string, readonly DocRequirement[]>,
): DocumentFlowProblem[] {
  topologicalSort(steps); // rejects cycles and malformed lists first
  const problems: DocumentFlowProblem[] = [];
  for (const step of steps) {
    const before = ancestorsOf(steps, step.id);
    for (const r of requirementsByStep.get(step.id) ?? []) {
      if (r.producedBy.length === 0) continue;
      if (!r.producedBy.some((p) => before.has(p))) {
        problems.push({
          stepId: step.id,
          documentId: r.documentId,
          message: 'This document comes only from steps that this step does not wait for.',
        });
      }
    }
  }
  return problems;
}
