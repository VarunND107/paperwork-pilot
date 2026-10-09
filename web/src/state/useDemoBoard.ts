import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { caseStore, type CaseSession } from '../api/caseStore';
import { useCaseBoard, type CaseBoard } from './useCaseBoard';

const MAX_RECOVERIES = 2;

export interface DemoBoard extends CaseBoard {
  /** The case behind the demo, once it exists. */
  session: CaseSession | null;
  /** Creating the case failed (for example the API is down). */
  createError: string | null;
}

/**
 * The live demo on the landing page runs on a REAL case. The first visit to a situation creates a
 * case through the API and remembers its secret token in this browser; later visits (and page
 * reloads) pick the same case up again, so progress persists.
 * If the stored case has disappeared (database reset, deleted), a fresh one is made.
 */
export function useDemoBoard(eventSlug: string | null): DemoBoard {
  const [session, setSession] = useState<CaseSession | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [recoveries, setRecoveries] = useState(0);

  useEffect(() => {
    setCreateError(null);
    if (!eventSlug) {
      setSession(null);
      return;
    }
    const stored = caseStore.demoSession(eventSlug);
    if (stored) {
      setSession(stored);
      return;
    }
    setSession(null);
    let cancelled = false;
    api
      .createCase(eventSlug)
      .then(({ token, case: view }) => {
        if (cancelled) return;
        caseStore.save(view.id, token);
        caseStore.setDemo(eventSlug, view.id);
        setSession({ id: view.id, token });
      })
      .catch((error: unknown) => {
        if (!cancelled) setCreateError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [eventSlug, recoveries]);

  const board = useCaseBoard(session);
  const { status } = board.state;

  useEffect(() => {
    if (
      session &&
      (status === 'not-found' || status === 'no-access') &&
      recoveries < MAX_RECOVERIES
    ) {
      caseStore.forget(session.id);
      setRecoveries((n) => n + 1);
    }
  }, [session, status, recoveries]);

  return { ...board, session, createError };
}
