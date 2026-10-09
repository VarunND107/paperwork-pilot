import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { AppConfig, EventSummary } from '../api/types';

interface AppData {
  /** null while loading. */
  events: EventSummary[] | null;
  /** null while loading or if the server could not be reached. */
  config: AppConfig | null;
  error: string | null;
}

const AppDataContext = createContext<AppData>({ events: null, config: null, error: null });

/** Loads the situations and the runtime feature flags once, for the whole app. */
export function AppDataProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<EventSummary[] | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .events(controller.signal)
      .then(setEvents)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    api
      .config(controller.signal)
      .then(setConfig)
      .catch(() => {
        /* flags default to off */
      });
    return () => {
      controller.abort();
    };
  }, []);

  const value = useMemo(() => ({ events, config, error }), [events, config, error]);
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  return useContext(AppDataContext);
}
