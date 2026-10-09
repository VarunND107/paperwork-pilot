import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, proApi } from '../api/client';

interface Props {
  notice: string;
  /** A key that works (new or typed). `fresh` is true when it was just created. */
  onKey: (key: string, fresh: boolean) => void;
}

function problem(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  const details = error.details;
  if (error.code === 'validation_error' && Array.isArray(details)) {
    const messages = details
      .map((d: unknown) => (d && typeof d === 'object' && 'message' in d ? String(d.message) : ''))
      .filter(Boolean);
    if (messages.length > 0) return messages.join(' ');
  }
  return error.status === 0 ? fallback : error.message;
}

/** Start an organisation, or sign in with an access key. */
export function SignedOut({ notice, onKey }: Props) {
  const { t } = useTranslation();
  const [org, setOrg] = useState({ orgName: '', name: '', email: '' });
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgError, setOrgError] = useState('');
  const [typedKey, setTypedKey] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setOrgBusy(true);
    setOrgError('');
    try {
      const { token } = await proApi.signUp(org);
      onKey(token, true);
    } catch (error) {
      setOrgError(problem(error, t('proApp.loadError')));
    } finally {
      setOrgBusy(false);
    }
  };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    const key = typedKey.trim();
    setKeyBusy(true);
    setKeyError('');
    try {
      await proApi.me(key);
      onKey(key, false);
    } catch (error) {
      setKeyError(
        error instanceof ApiError && error.status === 401
          ? t('proApp.signIn.invalid')
          : problem(error, t('proApp.loadError')),
      );
    } finally {
      setKeyBusy(false);
    }
  };

  return (
    <div className="page pro">
      <h1 className="page-h1">{t('proApp.title')}</h1>
      <p className="lede">{t('pros.body')}</p>
      <p className="hint" role="note">
        {t('proApp.interim')}
      </p>
      {notice && (
        <p className="form-msg is-error" role="alert">
          {notice}
        </p>
      )}
      <div className="pro-forms">
        <form className="panel" onSubmit={(e) => void create(e)} aria-labelledby="pro-signup-title">
          <h2 className="panel-title" id="pro-signup-title">
            {t('proApp.signUp.title')}
          </h2>
          <div className="field">
            <label htmlFor="pro-org">{t('proApp.signUp.orgName')}</label>
            <input
              id="pro-org"
              className="input"
              required
              maxLength={80}
              autoComplete="organization"
              value={org.orgName}
              onChange={(e) => {
                setOrg({ ...org, orgName: e.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="pro-name">{t('proApp.signUp.yourName')}</label>
            <input
              id="pro-name"
              className="input"
              required
              maxLength={80}
              autoComplete="name"
              value={org.name}
              onChange={(e) => {
                setOrg({ ...org, name: e.target.value });
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="pro-email">{t('proApp.signUp.email')}</label>
            <input
              id="pro-email"
              className="input"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={org.email}
              onChange={(e) => {
                setOrg({ ...org, email: e.target.value });
              }}
            />
          </div>
          <div className="panel-actions">
            <button type="submit" className="btn btn-primary" disabled={orgBusy}>
              {orgBusy ? t('proApp.signUp.working') : t('proApp.signUp.submit')}
            </button>
            <p className="form-msg is-error" role="alert">
              {orgError}
            </p>
          </div>
        </form>

        <form className="panel" onSubmit={(e) => void signIn(e)} aria-labelledby="pro-signin-title">
          <h2 className="panel-title" id="pro-signin-title">
            {t('proApp.signIn.title')}
          </h2>
          <div className="field">
            <label htmlFor="pro-key">{t('proApp.signIn.label')}</label>
            <input
              id="pro-key"
              className="input mono-input"
              type="password"
              required
              autoComplete="off"
              spellCheck={false}
              value={typedKey}
              onChange={(e) => {
                setTypedKey(e.target.value);
              }}
            />
          </div>
          <div className="panel-actions">
            <button type="submit" className="btn btn-primary" disabled={keyBusy}>
              {keyBusy ? t('proApp.signIn.working') : t('proApp.signIn.submit')}
            </button>
            <p className="form-msg is-error" role="alert">
              {keyError}
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
