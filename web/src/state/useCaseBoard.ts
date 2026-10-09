import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { CaseSession } from '../api/caseStore';
import type { CaseView, DateOnly } from '../api/types';
import { boardReducer, initialBoardState, withTick, type BoardState } from './boardReducer';

export interface CaseBoard {
  state: BoardState;
  select: (id: string) => void;
  toggleDocument: (documentId: string, ticked: boolean) => Promise<void>;
  complete: (stepId: string) => Promise<void>;
  undo: (stepId: string) => Promise<void>;
  reset: () => Promise<void>;
  setEventDate: (date: DateOnly | null) => Promise<void>;
  /** Use a case view the server just returned from some other call (for example settings). */
  replaceView: (view: CaseView) => void;
  reload: () => void;
}

/**
 * Everything the route board does against the real API for one case: load it, select a step,
 * tick documents, mark steps done or undo them, reset, and set the event date. The server is the
 * authority: every change returns the full recomputed case, which replaces local state.
 */
export function useCaseBoard(session: CaseSession | null): CaseBoard {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  const [reloadKey, bumpReload] = useReducer((n: number) => n + 1, 0);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const stateRef = useRef(state);
  stateRef.current = state;

  const sessionId = session?.id ?? null;
  const sessionToken = session?.token ?? null;

  useEffect(() => {
    if (!sessionId || !sessionToken) {
      dispatch({ type: 'idle' });
      return;
    }
    const controller = new AbortController();
    dispatch({ type: 'loading' });
    api
      .getCase(sessionId, sessionToken, controller.signal)
      .then((view) => {
        dispatch({ type: 'loaded', view, enter: true });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          dispatch({ type: 'failed', status: 'no-access', message: error.message });
        } else if (error instanceof ApiError && error.status === 404) {
          dispatch({ type: 'failed', status: 'not-found', message: error.message });
        } else {
          const message = error instanceof Error ? error.message : t('board.loadError');
          dispatch({ type: 'failed', status: 'error', message });
        }
      });
    return () => {
      controller.abort();
    };
  }, [sessionId, sessionToken, reloadKey, t]);

  const announce = useCallback((text: string) => {
    dispatch({ type: 'announce', text });
  }, []);

  /** Runs one change, keeping `busy` honest and turning failures into a spoken message. */
  const guarded = useCallback(
    async (work: (s: CaseSession) => Promise<void>) => {
      const current = sessionRef.current;
      if (!current) return;
      dispatch({ type: 'busy', busy: true });
      try {
        await work(current);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('app.networkError');
        announce(t('live.failed', { message }));
        // The server may disagree with what we showed (another tab, an admin edit). Re-sync.
        try {
          const view = await api.getCase(current.id, current.token);
          dispatch({ type: 'applied', view });
        } catch {
          /* keep what we have */
        }
      } finally {
        dispatch({ type: 'busy', busy: false });
      }
    },
    [announce, t],
  );

  const select = useCallback((id: string) => {
    dispatch({ type: 'select', id });
  }, []);

  const toggleDocument = useCallback(
    async (documentId: string, ticked: boolean) => {
      const before = stateRef.current.view;
      if (before) dispatch({ type: 'optimistic', view: withTick(before, documentId, ticked) });
      await guarded(async (s) => {
        const view = await api.setDocumentTicked(s.id, s.token, documentId, ticked);
        dispatch({ type: 'applied', view });
      });
    },
    [guarded],
  );

  const complete = useCallback(
    async (stepId: string) => {
      await guarded(async (s) => {
        const res = await api.setStepDone(s.id, s.token, stepId, true);
        const n = res.case.steps.find((x) => x.id === stepId)?.number ?? 0;
        dispatch({
          type: 'applied',
          view: res.case,
          flash: res.changes.unlocked,
          slamStepId: res.unchanged ? undefined : stepId,
        });
        const unlocked = res.changes.unlocked.length;
        announce(
          t('live.stepDone', { n }) +
            (unlocked > 0 ? ` ${t('live.moreReady', { count: unlocked })}` : ''),
        );
      });
    },
    [announce, guarded, t],
  );

  const undo = useCallback(
    async (stepId: string) => {
      await guarded(async (s) => {
        const res = await api.setStepDone(s.id, s.token, stepId, false);
        const n = res.case.steps.find((x) => x.id === stepId)?.number ?? 0;
        dispatch({ type: 'applied', view: res.case, fresh: true });
        const later = res.changes.reopened.length - 1;
        announce(
          t('live.reopened', { n }) + (later > 0 ? ` ${t('live.relocked', { count: later })}` : ''),
        );
      });
    },
    [announce, guarded, t],
  );

  const reset = useCallback(async () => {
    await guarded(async (s) => {
      const view = await api.resetCase(s.id, s.token);
      dispatch({ type: 'loaded', view, enter: true });
    });
  }, [guarded]);

  const setEventDate = useCallback(
    async (date: DateOnly | null) => {
      await guarded(async (s) => {
        const view = await api.patchCase(s.id, s.token, { eventDate: date });
        dispatch({ type: 'applied', view });
        announce(date ? t('board.eventDateSaved') : t('board.eventDateCleared'));
      });
    },
    [announce, guarded, t],
  );

  const replaceView = useCallback((view: CaseView) => {
    dispatch({ type: 'applied', view });
  }, []);

  return useMemo(
    () => ({
      state,
      select,
      toggleDocument,
      complete,
      undo,
      reset,
      setEventDate,
      replaceView,
      reload: bumpReload,
    }),
    [state, select, toggleDocument, complete, undo, reset, setEventDate, replaceView],
  );
}
