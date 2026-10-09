/**
 * JSON shapes returned by the API. A hand-kept copy of api/src/services/types.ts and
 * api/src/routes/match.ts: keep them in step.
 */

export type DateOnly = string; // YYYY-MM-DD
export type StepStatus = 'done' | 'ready' | 'locked';
export type DocState = 'auto' | 'ticked' | 'open' | 'wait';
export type DeadlineState = 'none' | 'overdue' | 'due_soon' | 'upcoming';

export interface EventSummary {
  id: string;
  slug: string;
  label: string;
  place: string;
  eventDateLabel: string;
  stepCount: number;
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
  /** Whether the tip is about the step itself or about the office it goes to. */
  scope: 'step' | 'office';
  body: string;
  origin: 'SEED' | 'USER';
  createdAt: string | null;
  staleFlags: number;
}

export interface VerificationView {
  sourceUrl: string;
  verified: boolean;
  lastVerifiedAt: string | null;
  stale: boolean;
}

export interface DocumentView {
  documentId: string;
  label: string;
  state: DocState;
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
  due: string;
  dueRule: { amount: number; unit: 'DAY' | 'WEEK' | 'MONTH' } | null;
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
  today: DateOnly;
  disclaimer: string;
}

export interface StepChanges {
  unlocked: string[];
  relocked: string[];
  reopened: string[];
}

export interface MatchResponse {
  matched: EventSummary | null;
  candidates: { event: EventSummary; score: number }[];
  suggestions: EventSummary[];
}

export interface AppConfig {
  proEnabled: boolean;
  adminEnabled: boolean;
  staleAfterDays: number;
  disclaimer: string;
  emailProvider: string;
}
