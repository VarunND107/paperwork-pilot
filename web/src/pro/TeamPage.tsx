import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, proApi } from '../api/client';
import type { MemberView } from '../api/types';
import { KeyNotice } from './KeyNotice';
import { usePro } from './ProContext';

/** The people in the organisation. Owners add and remove people; anyone can replace their own key. */
export function TeamPage() {
  const { t } = useTranslation();
  const { key, member, replaceKey } = usePro();
  const isOwner = member.role === 'OWNER';
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [issued, setIssued] = useState<{ key: string; intro: string } | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      proApi
        .members(key, signal)
        .then(setMembers)
        .catch((e: unknown) => {
          if (!signal?.aborted) {
            setMessage({
              text: e instanceof ApiError ? e.message : t('proApp.loadError'),
              error: true,
            });
          }
        }),
    [key, t],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  const fail = (error: unknown) => {
    setMessage({
      text: error instanceof ApiError ? error.message : t('proApp.loadError'),
      error: true,
    });
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const added = await proApi.addMember(key, form);
      setIssued({ key: added.token, intro: t('proApp.team.added', { name: added.member.name }) });
      setForm({ name: '', email: '' });
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: MemberView) => {
    if (!window.confirm(t('proApp.team.removeConfirm', { name: m.name }))) return;
    try {
      await proApi.removeMember(key, m.id);
      setMessage({ text: t('proApp.team.removed', { name: m.name }), error: false });
      await load();
    } catch (error) {
      fail(error);
    }
  };

  const rotate = async () => {
    if (!window.confirm(t('proApp.team.rotateConfirm'))) return;
    try {
      const { token } = await proApi.rotateKey(key);
      replaceKey(token);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <div className="stack">
      <h1 className="page-h1">{t('proApp.team.title')}</h1>

      <section className="panel" aria-labelledby="team-members">
        <h2 className="panel-title" id="team-members">
          {t('proApp.team.members')}
        </h2>
        <ul className="team-list">
          {members?.map((m) => (
            <li key={m.id}>
              <span>
                <b>{m.name}</b>
                {m.id === member.id ? ` (${t('proApp.team.you')})` : ''}
                <span className="hint">
                  {' '}
                  · {m.email} ·{' '}
                  {m.role === 'OWNER' ? t('proApp.team.owner') : t('proApp.team.member')}
                </span>
              </span>
              {isOwner && m.id !== member.id && (
                <button type="button" className="btn btn-sm" onClick={() => void remove(m)}>
                  {t('proApp.team.remove')}
                  <span className="sr"> {m.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
        <p
          className={message?.error ? 'form-msg is-error' : 'form-msg'}
          role={message?.error ? 'alert' : 'status'}
        >
          {message?.text}
        </p>
      </section>

      {issued && (
        <KeyNotice
          secret={issued.key}
          intro={issued.intro}
          onDone={() => {
            setIssued(null);
          }}
        />
      )}

      {isOwner ? (
        <form className="panel" onSubmit={(e) => void add(e)} aria-labelledby="team-add">
          <h2 className="panel-title" id="team-add">
            {t('proApp.team.add')}
          </h2>
          <p className="hint">{t('proApp.team.addHint')}</p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="team-name">{t('proApp.team.name')}</label>
              <input
                id="team-name"
                className="input"
                required
                maxLength={80}
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="team-email">{t('proApp.team.email')}</label>
              <input
                id="team-email"
                className="input"
                type="email"
                required
                maxLength={254}
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value });
                }}
              />
            </div>
          </div>
          <div className="panel-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {t('proApp.team.addSubmit')}
            </button>
          </div>
        </form>
      ) : (
        <p className="hint">{t('proApp.team.ownersOnly')}</p>
      )}

      <section className="panel" aria-labelledby="team-key">
        <h2 className="panel-title" id="team-key">
          {t('proApp.team.rotate')}
        </h2>
        <p className="hint">{t('proApp.team.rotateBody')}</p>
        <div className="panel-actions">
          <button type="button" className="btn btn-sm" onClick={() => void rotate()}>
            {t('proApp.team.rotate')}
          </button>
        </div>
      </section>
    </div>
  );
}
