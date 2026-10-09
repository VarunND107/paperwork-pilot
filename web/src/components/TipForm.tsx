import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { StepView } from '../api/types';

const MAX = 400;

/** A message from a refused tip: the server says exactly what is wrong (a link, too short, ...). */
function refusal(error: unknown, fallback: string): string {
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

/** "Add a tip" for the step, or for the office it goes to. Tips wait for a moderator. */
export function TipForm({ step }: { step: StepView }) {
  const { t } = useTranslation();
  const uid = useId();
  const openRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState<'step' | 'office'>('step');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const close = () => {
    setOpen(false);
    setError('');
    // The button that opened the form comes back; put focus there.
    requestAnimationFrame(() => openRef.current?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (body.trim() === '') {
      setError(t('tips.empty'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const target =
        about === 'office' && step.office ? { officeId: step.office.id } : { stepId: step.id };
      await api.submitTip(target, body);
      setBody('');
      setSent(true);
      close();
    } catch (err) {
      setError(refusal(err, t('tips.failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tip-form">
      {!open && (
        <button
          ref={openRef}
          type="button"
          className="btn btn-sm"
          aria-expanded="false"
          aria-controls={`${uid}-form`}
          onClick={() => {
            setSent(false);
            setOpen(true);
          }}
        >
          {t('tips.add')}
        </button>
      )}
      {/* Always present, so the thank-you is announced after the form closes. */}
      <p className="form-msg" role="status">
        {sent ? t('tips.sent') : ''}
      </p>
      {open && (
        <form
          id={`${uid}-form`}
          className="panel"
          onSubmit={(e) => void submit(e)}
          aria-labelledby={`${uid}-title`}
          noValidate
        >
          <h4 className="panel-title" id={`${uid}-title`}>
            {t('tips.formTitle')}
          </h4>
          {step.office && (
            <div className="field">
              <label htmlFor={`${uid}-about`}>{t('tips.aboutLabel')}</label>
              <select
                id={`${uid}-about`}
                className="input"
                value={about}
                onChange={(e) => {
                  setAbout(e.target.value === 'office' ? 'office' : 'step');
                }}
              >
                <option value="step">{t('tips.aboutStep')}</option>
                <option value="office">
                  {t('tips.aboutOffice', { office: step.office.name })}
                </option>
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor={`${uid}-body`}>{t('tips.bodyLabel')}</label>
            <textarea
              id={`${uid}-body`}
              className="input"
              rows={4}
              maxLength={MAX}
              value={body}
              aria-describedby={`${uid}-hint`}
              onChange={(e) => {
                setBody(e.target.value);
              }}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- the visitor just asked for this form
              autoFocus
            />
            <p className="hint" id={`${uid}-hint`}>
              {t('tips.bodyHint')} {t('tips.count', { count: body.length })}
            </p>
          </div>
          <div className="panel-actions">
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              {busy ? t('tips.sending') : t('tips.send')}
            </button>
            <button type="button" className="btn btn-sm" onClick={close}>
              {t('tips.cancel')}
            </button>
            <p
              className={error ? 'form-msg is-error' : 'form-msg'}
              role={error ? 'alert' : 'status'}
            >
              {error}
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
