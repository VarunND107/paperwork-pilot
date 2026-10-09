import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { caseStore, type CaseSession } from '../api/caseStore';
import type { CaseView } from '../api/types';
import { useAppData } from '../state/AppData';

interface Props {
  view: CaseView;
  session: CaseSession;
  onView: (view: CaseView) => void;
}

/** Reminders (opt-in) and the right to delete everything, on the full case page. */
export function CaseSettings({ view, session, onView }: Props) {
  const { t } = useTranslation();
  const { config } = useAppData();
  const navigate = useNavigate();
  const [wantReminders, setWantReminders] = useState(view.remindersOptIn);
  const [email, setEmail] = useState(view.reminderEmail ?? '');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const next = await api.patchCase(session.id, session.token, {
        remindersOptIn: wantReminders,
        reminderEmail: wantReminders ? email.trim() : null,
      });
      onView(next);
      setMessage({
        text: next.remindersOptIn ? t('casePage.remindersSaved') : t('casePage.remindersOff'),
        error: false,
      });
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : t('app.networkError'),
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('casePage.deleteConfirm'))) return;
    try {
      await api.deleteCase(session.id, session.token);
      caseStore.forget(session.id);
      void navigate('/');
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : t('app.networkError'),
        error: true,
      });
    }
  };

  return (
    <section className="panel" aria-labelledby="settings-title">
      <h2 className="panel-title" id="settings-title">
        {t('casePage.settingsTitle')}
      </h2>
      <form onSubmit={(e) => void save(e)} noValidate>
        <div className="check">
          <input
            type="checkbox"
            id="remind-opt"
            checked={wantReminders}
            onChange={(e) => {
              setWantReminders(e.target.checked);
            }}
          />
          <label htmlFor="remind-opt">{t('casePage.remindLabel')}</label>
        </div>
        {wantReminders && (
          <div className="field">
            <label htmlFor="remind-email">{t('casePage.emailLabel')}</label>
            <input
              id="remind-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              className="input"
              value={email}
              aria-describedby="remind-email-hint"
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            <p className="hint" id="remind-email-hint">
              {t('casePage.emailHint')}
            </p>
            {!view.eventDate && <p className="hint">{t('casePage.remindNeedsDate')}</p>}
          </div>
        )}
        <p className="hint">{t('casePage.unsubscribeNote')}</p>
        {config?.emailProvider === 'console' && <p className="hint">{t('casePage.consoleNote')}</p>}
        <div className="panel-actions">
          <button type="submit" className="btn btn-sm btn-primary" disabled={saving}>
            {t('app.save')}
          </button>
          <p
            className={message?.error ? 'form-msg is-error' : 'form-msg'}
            role={message?.error ? 'alert' : 'status'}
          >
            {message?.text}
          </p>
        </div>
      </form>

      <div className="panel-danger">
        <h3>{t('casePage.deleteTitle')}</h3>
        <p className="hint">{t('casePage.deleteBody')}</p>
        <button type="button" className="btn btn-sm" onClick={() => void remove()}>
          {t('casePage.deleteTitle')}
        </button>
      </div>
      <p className="hint">{t('casePage.deviceNote')}</p>
    </section>
  );
}
