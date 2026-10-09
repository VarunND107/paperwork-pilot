import type { CaseView } from '../api/types';

export type BoardStatus = 'idle' | 'loading' | 'ready' | 'error' | 'no-access' | 'not-found';

export interface BoardState {
  status: BoardStatus;
  error: string | null;
  view: CaseView | null;
  selectedId: string | null;
  /** Steps that just unlocked: they bounce once. */
  flashIds: readonly string[];
  /** Bumped when the route list should animate in (new situation, reset). */
  enterKey: number;
  /** Bumped when the detail card should play its enter animation. */
  freshKey: number;
  /** Bumped when a step was just completed, so the stamp slams down again. */
  slamKey: number;
  /** The step whose stamp should slam right now. Cleared as soon as anything else happens. */
  slamStepId: string | null;
  /** A change is in flight. */
  busy: boolean;
  /** Text for the polite live region. */
  announcement: string;
}

export const initialBoardState: BoardState = {
  status: 'idle',
  error: null,
  view: null,
  selectedId: null,
  flashIds: [],
  enterKey: 0,
  freshKey: 0,
  slamKey: 0,
  slamStepId: null,
  busy: false,
  announcement: '',
};

export type BoardAction =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'loaded'; view: CaseView; enter: boolean }
  | { type: 'failed'; status: 'error' | 'no-access' | 'not-found'; message: string }
  | { type: 'select'; id: string }
  | {
      type: 'applied';
      view: CaseView;
      flash?: readonly string[];
      /** The step that was just completed. */
      slamStepId?: string;
      fresh?: boolean;
    }
  | { type: 'optimistic'; view: CaseView }
  | { type: 'busy'; busy: boolean }
  | { type: 'announce'; text: string };

/** The step to show first: the next one to do, or the last one when the route is finished. */
export function defaultSelection(view: CaseView): string | null {
  return view.progress.nextStepId ?? view.steps[view.steps.length - 1]?.id ?? null;
}

function keepSelection(state: BoardState, view: CaseView): string | null {
  return state.selectedId && view.steps.some((s) => s.id === state.selectedId)
    ? state.selectedId
    : defaultSelection(view);
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'idle':
      return initialBoardState;
    case 'loading':
      return { ...state, status: 'loading', error: null };
    case 'loaded':
      return {
        ...state,
        status: 'ready',
        error: null,
        view: action.view,
        selectedId: action.enter
          ? defaultSelection(action.view)
          : keepSelection(state, action.view),
        flashIds: [],
        slamStepId: null,
        enterKey: action.enter ? state.enterKey + 1 : state.enterKey,
        freshKey: state.freshKey + 1,
        busy: false,
      };
    case 'failed':
      return { ...state, status: action.status, error: action.message, busy: false };
    case 'select':
      return {
        ...state,
        selectedId: action.id,
        flashIds: [],
        slamStepId: null,
        freshKey: state.freshKey + 1,
      };
    case 'applied':
      return {
        ...state,
        view: action.view,
        selectedId: keepSelection(state, action.view),
        flashIds: action.flash ?? [],
        slamStepId: action.slamStepId ?? (action.fresh ? null : state.slamStepId),
        slamKey: action.slamStepId ? state.slamKey + 1 : state.slamKey,
        freshKey: action.fresh ? state.freshKey + 1 : state.freshKey,
      };
    case 'optimistic':
      return { ...state, view: action.view };
    case 'busy':
      return { ...state, busy: action.busy };
    case 'announce': {
      // A screen reader will not re-read an identical sentence, so alternate an invisible
      // trailing space when the same message comes round again.
      const NBSP = '\u00a0';
      const repeated = action.text === state.announcement.replace(/\u00a0$/, '');
      const next =
        repeated && !state.announcement.endsWith(NBSP) ? action.text + NBSP : action.text;
      return { ...state, announcement: next };
    }
  }
}

/** Reflects a tick on every step that asks for the document, before the server confirms it. */
export function withTick(view: CaseView, documentId: string, ticked: boolean): CaseView {
  return {
    ...view,
    steps: view.steps.map((step) => {
      if (!step.documents.some((d) => d.documentId === documentId)) return step;
      const documents = step.documents.map((d) =>
        d.documentId === documentId && (d.state === 'open' || d.state === 'ticked')
          ? { ...d, state: ticked ? ('ticked' as const) : ('open' as const) }
          : d,
      );
      const docsComplete = documents.every((d) => d.state === 'auto' || d.state === 'ticked');
      return {
        ...step,
        documents,
        docsComplete,
        canComplete: step.status === 'ready' && docsComplete,
      };
    }),
  };
}
