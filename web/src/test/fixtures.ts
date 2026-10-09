import type { CaseView, DocumentView, EventSummary, StepView } from '../api/types';

export const deathEvent: EventSummary = {
  id: 'evt-death',
  slug: 'death',
  label: 'A parent has passed away',
  place: 'Bengaluru, Karnataka',
  eventDateLabel: 'Date of death',
  stepCount: 3,
  isSample: true,
};
export const moveEvent: EventSummary = {
  id: 'evt-move',
  slug: 'move',
  label: 'Moving to Bengaluru with a toddler',
  place: 'Bengaluru, Karnataka',
  eventDateLabel: 'Move-in date',
  stepCount: 3,
  isSample: true,
};
export const bizEvent: EventSummary = {
  id: 'evt-biz',
  slug: 'biz',
  label: 'Starting a small business',
  place: 'Bengaluru, Karnataka',
  eventDateLabel: 'Planned opening date',
  stepCount: 3,
  isSample: true,
};
export const allEvents = [deathEvent, moveEvent, bizEvent];

export function doc(
  over: Partial<DocumentView> & { documentId: string; label: string },
): DocumentView {
  return { state: 'open', comesFrom: null, ...over };
}

export function step(
  over: Partial<StepView> & { id: string; number: number; title: string },
): StepView {
  return {
    form: 'Form 2',
    where: 'Ward office',
    office: null,
    fee: 'Free',
    wait: 'Same day',
    due: 'Within 21 days',
    dueRule: null,
    deadline: null,
    daysLeft: null,
    deadlineState: 'none',
    status: 'locked',
    blockedBy: [],
    isNext: false,
    documents: [],
    docsComplete: true,
    canComplete: false,
    doneAt: null,
    tips: [
      {
        id: `tip-${over.id}`,
        scope: 'step',
        body: 'Bring the original.',
        origin: 'SEED',
        createdAt: null,
        staleFlags: 0,
      },
    ],
    verification: {
      sourceUrl: 'https://crsorgi.gov.in/',
      verified: false,
      lastVerifiedAt: null,
      stale: true,
    },
    ...over,
  };
}

/**
 * A three-step route with nothing done:
 *   1 Medical certificate (ready, two documents to carry)
 *   2 Register the death (locked, waits for 1, its first document comes from 1)
 *   3 Certified copies   (locked, waits for 2)
 */
export function freshCase(over: Partial<CaseView> = {}): CaseView {
  const steps: StepView[] = [
    step({
      id: 's1',
      number: 1,
      title: 'Get the medical certificate',
      status: 'ready',
      isNext: true,
      docsComplete: false,
      canComplete: false,
      documents: [
        doc({ documentId: 'd-discharge', label: 'Hospital discharge or death summary' }),
        doc({ documentId: 'd-id', label: 'ID of the person who died' }),
      ],
    }),
    step({
      id: 's2',
      number: 2,
      title: 'Register the death',
      form: 'Form 2 (death report)',
      blockedBy: [{ id: 's1', number: 1, title: 'Get the medical certificate' }],
      docsComplete: false,
      documents: [
        doc({
          documentId: 'd-cert',
          label: 'Medical certificate of cause of death',
          state: 'wait',
          comesFrom: { stepId: 's1', number: 1 },
        }),
        doc({ documentId: 'd-reporter', label: 'ID of the person reporting' }),
      ],
    }),
    step({
      id: 's3',
      number: 3,
      title: 'Collect certified copies',
      blockedBy: [{ id: 's2', number: 2, title: 'Register the death' }],
    }),
  ];
  return {
    id: 'case-1',
    event: deathEvent,
    startedAt: '2026-10-09T06:00:00.000Z',
    eventDate: null,
    remindersOptIn: false,
    reminderEmail: null,
    progress: { done: 0, total: 3, nextStepId: 's1' },
    steps,
    today: '2026-10-09',
    disclaimer: 'Guidance, not legal advice.',
    ...over,
  };
}

/** Step 1 done: step 2 ready with its first document auto-ticked. */
export function caseAfterStepOne(): CaseView {
  const base = freshCase();
  const [s1, s2, s3] = base.steps as [StepView, StepView, StepView];
  return {
    ...base,
    progress: { done: 1, total: 3, nextStepId: 's2' },
    steps: [
      {
        ...s1,
        status: 'done',
        isNext: false,
        docsComplete: true,
        doneAt: '2026-10-09T06:00:00.000Z',
        documents: s1.documents.map((d) => ({ ...d, state: 'ticked' as const })),
      },
      {
        ...s2,
        status: 'ready',
        isNext: true,
        blockedBy: [],
        documents: [
          { ...(s2.documents[0] as DocumentView), state: 'auto' },
          s2.documents[1] as DocumentView,
        ],
      },
      s3,
    ],
  };
}
