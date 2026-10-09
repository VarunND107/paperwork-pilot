import type { DateOnly, DeadlineState, DocState, DueUnit, StepStatus } from '../engine/types.js';

/**
 * JSON shapes returned by the API. The web app keeps a copy of these types in
 * web/src/api/types.ts: keep the two in step.
 */

export const DISCLAIMER = 'Guidance, not legal advice.';

export interface EventSummary {
  id: string;
  slug: string;
  label: string;
  place: string;
  eventDateLabel: string;
  stepCount: number;
  /** True while at least one step is unverified sample data. */
  isSample: boolean;
}

export interface OfficeView {
  id: string;
  name: string;
  kind: 'OFFICE' | 'PORTAL';
  url: string | null;
}

export interface TipView {
  id: string;
  body: string;
  /** SEED tips are sample text; USER tips came from a visitor and were approved by a moderator. */
  origin: 'SEED' | 'USER';
  /** Only shown for visitor tips. Sample tips carry no date. */
  createdAt: string | null;
  staleFlags: number;
}

export interface VerificationView {
  sourceUrl: string;
  /** False for all sample data. The UI must say "sample" and never "verified" when false. */
  verified: boolean;
  lastVerifiedAt: string | null;
  /** Never verified, or verified more than 90 days ago. */
  stale: boolean;
}

export interface DocumentView {
  documentId: string;
  /** What the step calls it. Falls back to the catalog name. */
  label: string;
  state: DocState;
  /** The step that hands this document over, when there is one. */
  comesFrom: { stepId: string; number: number } | null;
}

export interface BlockerView {
  id: string;
  number: number;
  title: string;
}

export interface StepView {
  id: string;
  number: number;
  title: string;
  form: string;
  where: string;
  office: OfficeView | null;
  fee: string;
  wait: string;
  /** Deadline wording, for example "Within 21 days". */
  due: string;
  dueRule: { amount: number; unit: DueUnit } | null;
  /** Last day to finish, when the case has an event date and the step has a computable deadline. */
  deadline: DateOnly | null;
  daysLeft: number | null;
  deadlineState: DeadlineState;
  status: StepStatus;
  blockedBy: BlockerView[];
  isNext: boolean;
  documents: DocumentView[];
  docsComplete: boolean;
  canComplete: boolean;
  doneAt: string | null;
  tips: TipView[];
  verification: VerificationView;
}

export interface CaseView {
  id: string;
  event: EventSummary;
  startedAt: string;
  eventDate: DateOnly | null;
  remindersOptIn: boolean;
  reminderEmail: string | null;
  progress: { done: number; total: number; nextStepId: string | null };
  steps: StepView[];
  /** Today in India, so the browser and server agree about "overdue". */
  today: DateOnly;
  disclaimer: string;
}

export interface RouteResponse {
  event: EventSummary;
  steps: StepView[];
  today: DateOnly;
  disclaimer: string;
}

export interface StepChanges {
  /** Steps that became ready. */
  unlocked: string[];
  /** Steps that went back to locked. */
  relocked: string[];
  /** Done steps that were reopened by an undo (the undone step comes first). */
  reopened: string[];
}
