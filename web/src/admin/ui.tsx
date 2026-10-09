import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { formatTimestamp } from '../lib/format';
import { useAdmin } from './AdminContext';
import type { EditProvenance, Provenance } from './types';

// ---- loading data ----------------------------------------------------------------------------

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (value: T) => void;
}

/** Loads something from the admin API on mount and whenever `path` changes. */
export function useAdminResource<T>(path: string | null): Loaded<T> {
  const { request } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    request<T>(path)
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, request, tick]);

  const reload = useCallback(() => {
    setTick((n) => n + 1);
  }, []);
  return { data, error, loading, reload, setData };
}

// ---- messages --------------------------------------------------------------------------------

/** Shows an API error: validation problems as a list, a dependency loop as its path. */
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError) {
    const details = error.details as
      { path?: string; message?: string }[] | { cycle?: string[]; titles?: string[] } | undefined;
    const cycleTitles =
      error.code === 'dependency_cycle' && details && 'titles' in details
        ? details.titles
        : undefined;
    const fields =
      error.code === 'validation_error' && Array.isArray(details) ? details : undefined;
    return (
      <div className="error-box" role="alert">
        <p>
          <strong>{error.message}</strong>
        </p>
        {cycleTitles && cycleTitles.length > 1 && (
          <ol aria-label="The loop">
            {cycleTitles.map((title, i) => (
              <li key={`${title}-${i}`}>{title}</li>
            ))}
          </ol>
        )}
        {fields && (
          <ul>
            {fields.map((f, i) => (
              <li key={i}>
                {f.path ? `${f.path}: ` : ''}
                {f.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="error-box" role="alert">
      <p>{error instanceof Error ? error.message : 'Something went wrong.'}</p>
    </div>
  );
}

export function SavedNote({ children }: { children: ReactNode }) {
  return children ? (
    <p className="form-msg" role="status">
      {children}
    </p>
  ) : null;
}

// ---- tags -------------------------------------------------------------------------------------

/** The "stale" badge: never verified, or verified more than 90 days ago. */
export function StaleTag({ stale }: { stale: boolean }) {
  return stale ? <span className="tag alert">stale</span> : null;
}

export function VerifiedTag({ verified }: { verified: boolean }) {
  return verified ? (
    <span className="tag ok">verified</span>
  ) : (
    <span className="tag wait">not verified</span>
  );
}

export function LastChecked({ p }: { p: Pick<Provenance, 'lastVerifiedAt'> }) {
  return <>{p.lastVerifiedAt ? formatTimestamp(p.lastVerifiedAt) : 'never'}</>;
}

// ---- source and verification fields -------------------------------------------------------------

interface ProvenanceFieldsProps {
  idPrefix: string;
  value: EditProvenance;
  onChange: (value: EditProvenance) => void;
  /** Where the stored record stands now (for an existing row). */
  current?: Provenance;
}

/**
 * Every admin edit asks for a source link and whether it was checked against that source.
 * Saving also stamps "last verified" with today's date; "verified" only becomes true when the
 * box is ticked.
 */
export function ProvenanceFields({ idPrefix, value, onChange, current }: ProvenanceFieldsProps) {
  return (
    <fieldset className="panel-prov">
      <legend className="kicker">Source and verification</legend>
      <div className="field">
        <label htmlFor={`${idPrefix}-source`}>Source link (required)</label>
        <input
          id={`${idPrefix}-source`}
          className="input"
          type="url"
          required
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={value.sourceUrl}
          aria-describedby={`${idPrefix}-source-hint`}
          onChange={(e) => {
            onChange({ ...value, sourceUrl: e.target.value });
          }}
        />
        <p className="hint" id={`${idPrefix}-source-hint`}>
          The official page this information comes from. Every edit needs one. Saving stamps today
          as the date last checked.
        </p>
      </div>
      <div className="check">
        <input
          id={`${idPrefix}-verified`}
          type="checkbox"
          checked={value.verified}
          onChange={(e) => {
            onChange({ ...value, verified: e.target.checked });
          }}
        />
        <label htmlFor={`${idPrefix}-verified`}>
          I checked this against the source (marks it verified)
        </label>
      </div>
      <p className="hint">
        Leave this unticked if you have not checked it: it keeps showing to the public as unverified
        sample data.
        {current && (
          <>
            {' '}
            Currently: <VerifiedTag verified={current.verified} />{' '}
            <StaleTag stale={current.stale} /> last checked <LastChecked p={current} />.
          </>
        )}
      </p>
    </fieldset>
  );
}

/** A form's saving state: pending flag, error, and a "saved" message. */
export function useSaver() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (work: () => Promise<void>, message: string) => {
    setSaving(true);
    setError(null);
    setSaved('');
    try {
      await work();
      if (mounted.current) setSaved(message);
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }, []);
  const fail = useCallback((e: unknown) => {
    setError(e);
    setSaved('');
  }, []);
  return { saving, error, saved, run, fail };
}

export const EMPTY_PROVENANCE: EditProvenance = { sourceUrl: '', verified: false };

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
