import { useEffect, useMemo, useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { caseStore } from '../api/caseStore';
import { ApiError, proApi } from '../api/client';
import type { MemberView, OrgView } from '../api/types';
import { useAppData } from '../state/AppData';
import { ClientPage } from './ClientPage';
import { ClientsPage } from './ClientsPage';
import { KeyNotice } from './KeyNotice';
import { ProContext, type ProContextValue } from './ProContext';
import { SignedOut } from './SignedOut';
import { TeamPage } from './TeamPage';

interface Session {
  member: MemberView;
  org: OrgView;
}

/** `/pro`: the professional plan. Only exists when the server has PRO_ENABLED on. */
export default function ProApp() {
  const { t } = useTranslation();
  const { config, error: appError } = useAppData();
  const [key, setKey] = useState<string | null>(() => caseStore.memberKey());
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [notice, setNotice] = useState('');
  const [issued, setIssued] = useState<string | null>(null);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!key || !config?.proEnabled) {
      setSession(null);
      setPhase('idle');
      return;
    }
    const controller = new AbortController();
    setPhase((p) => (p === 'ready' ? p : 'loading'));
    proApi
      .me(key, controller.signal)
      .then((s) => {
        setSession(s);
        setPhase('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          caseStore.forgetMemberKey();
          setKey(null);
          setNotice(t('proApp.keyExpired'));
        } else {
          setPhase('error');
        }
      });
    return () => {
      controller.abort();
    };
  }, [key, config?.proEnabled, attempt, t]);

  const value = useMemo<ProContextValue | null>(() => {
    if (!key || !session) return null;
    return {
      key,
      member: session.member,
      org: session.org,
      signOut: () => {
        caseStore.forgetMemberKey();
        setKey(null);
        setSession(null);
        setIssued(null);
        setNotice('');
      },
      replaceKey: (next) => {
        caseStore.setMemberKey(next);
        setKey(next);
        setIssued(next);
      },
    };
  }, [key, session]);

  if (!config) {
    return appError ? (
      <div className="page">
        <p className="form-msg is-error" role="alert">
          {t('proApp.loadError')}
        </p>
      </div>
    ) : (
      <p className="page-loading" role="status">
        {t('proApp.loading')}
      </p>
    );
  }
  if (!config.proEnabled) {
    return (
      <div className="page" id="pro-off">
        <h1 className="page-h1">{t('proApp.offTitle')}</h1>
        <p className="lede">{t('proApp.offBody')}</p>
        <p>
          <Link className="btn btn-primary" to="/">
            {t('app.backHome')}
          </Link>
        </p>
      </div>
    );
  }
  if (!key) {
    return (
      <SignedOut
        notice={notice}
        onKey={(next, fresh) => {
          caseStore.setMemberKey(next);
          setKey(next);
          setNotice('');
          setIssued(fresh ? next : null);
        }}
      />
    );
  }
  if (phase === 'error') {
    return (
      <div className="page">
        <p className="form-msg is-error" role="alert">
          {t('proApp.loadError')}
        </p>
        <p>
          <button type="button" className="btn btn-sm" onClick={retry}>
            {t('proApp.retry')}
          </button>
        </p>
      </div>
    );
  }
  if (!value) {
    return (
      <p className="page-loading" role="status">
        {t('proApp.loading')}
      </p>
    );
  }

  return (
    <ProContext.Provider value={value}>
      <div className="page pro">
        <div className="pro-bar">
          <nav aria-label={t('proApp.nav.aria')}>
            <ul className="admin-nav">
              <li>
                <NavLink to="/pro" end>
                  {t('proApp.nav.clients')}
                </NavLink>
              </li>
              <li>
                <NavLink to="/pro/team">{t('proApp.nav.team')}</NavLink>
              </li>
            </ul>
          </nav>
          <p className="hint">
            {t('proApp.nav.signedInAs', { name: value.member.name, org: value.org.name })}
          </p>
          <button type="button" className="btn btn-sm" onClick={value.signOut}>
            {t('proApp.nav.signOut')}
          </button>
        </div>
        {issued && (
          <KeyNotice
            secret={issued}
            onDone={() => {
              setIssued(null);
            }}
          />
        )}
        <Routes>
          <Route index element={<ClientsPage />} />
          <Route path="clients/:id" element={<ClientPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="*" element={<Navigate to="/pro" replace />} />
        </Routes>
      </div>
    </ProContext.Provider>
  );
}
