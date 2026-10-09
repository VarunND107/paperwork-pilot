import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { ApiError, call } from '../api/client';
import { AdminContext, type AdminContextValue } from './AdminContext';
import { DocumentsPage } from './DocumentsPage';
import { EventPage } from './EventPage';
import { EventsPage } from './EventsPage';
import { OfficesPage } from './OfficesPage';
import { StepEditorPage } from './StepEditorPage';
import { TipsPage } from './TipsPage';
import type { SessionInfo } from './types';
import { ErrorBox } from './ui';

/** `/admin`: the content admin panel. Protected by ADMIN_PASSWORD; off when none is set. */
export default function AdminApp() {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    call<SessionInfo>('/admin/session')
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback<AdminContextValue['request']>(async (path, options) => {
    try {
      return await call(`/admin${path}`, options);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setInfo({ enabled: true, authenticated: false });
      }
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    await call('/admin/logout', { method: 'POST' });
    setInfo({ enabled: true, authenticated: false });
  }, []);

  const value = useMemo(() => ({ request, signOut }), [request, signOut]);

  if (loadError) {
    return (
      <div className="page">
        <h1 className="page-h1">Admin</h1>
        <ErrorBox error={loadError} />
      </div>
    );
  }
  if (!info) {
    return (
      <div className="page">
        <p role="status">Loading…</p>
      </div>
    );
  }
  if (!info.enabled) {
    return (
      <div className="page" id="admin-disabled">
        <h1 className="page-h1">Admin panel is off</h1>
        <p className="lede">
          Set <code>ADMIN_PASSWORD</code> in the server&apos;s environment (the <code>.env</code>{' '}
          file) and restart to turn it on.
        </p>
      </div>
    );
  }
  if (!info.authenticated) {
    return (
      <LoginForm
        onSignedIn={() => {
          setInfo({ enabled: true, authenticated: true });
        }}
      />
    );
  }

  return (
    <AdminContext.Provider value={value}>
      <div className="page admin">
        <div className="admin-bar">
          <nav aria-label="Admin">
            <ul className="admin-nav">
              <li>
                <NavLink to="/admin/events">Situations</NavLink>
              </li>
              <li>
                <NavLink to="/admin/documents">Documents</NavLink>
              </li>
              <li>
                <NavLink to="/admin/offices">Offices</NavLink>
              </li>
              <li>
                <NavLink to="/admin/tips">Tips</NavLink>
              </li>
            </ul>
          </nav>
          <button type="button" className="btn btn-sm" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        <Routes>
          <Route index element={<Navigate to="events" replace />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="events/:id" element={<EventPage />} />
          <Route path="steps/:id" element={<StepEditorPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="offices" element={<OfficesPage />} />
          <Route path="tips" element={<TipsPage />} />
          <Route path="*" element={<Navigate to="events" replace />} />
        </Routes>
      </div>
    </AdminContext.Provider>
  );
}

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call('/admin/login', { method: 'POST', body: { password } });
      onSignedIn();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" id="admin-login">
      <h1 className="page-h1">Admin sign in</h1>
      <form className="panel" onSubmit={(e) => void submit(e)}>
        <div className="field">
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </div>
        <ErrorBox error={error} />
        <div className="panel-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}
