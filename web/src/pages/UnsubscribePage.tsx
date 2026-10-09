import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';

type Phase = 'idle' | 'working' | 'done' | 'error';

/**
 * `/unsubscribe?case=…&sig=…`: the link in every reminder email. Opening the link changes nothing
 * (mail scanners open links); the visitor presses the button, which POSTs the signed link.
 */
export function UnsubscribePage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const caseId = params.get('case') ?? '';
  const sig = params.get('sig') ?? '';
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');

  const stop = async () => {
    setPhase('working');
    setError('');
    try {
      await api.unsubscribe(caseId, sig);
      setPhase('done');
    } catch (e) {
      const badLink = e instanceof ApiError && (e.status === 400 || e.status === 403);
      setError(badLink ? t('unsubscribe.badLink') : t('unsubscribe.failed'));
      setPhase('error');
    }
  };

  const back = (
    <p>
      <Link className="btn" to="/">
        {t('unsubscribe.backHome')}
      </Link>
    </p>
  );

  if (!caseId || !sig) {
    return (
      <div className="page" id="unsubscribe-incomplete">
        <h1 className="page-h1">{t('unsubscribe.incompleteTitle')}</h1>
        <p className="lede">{t('unsubscribe.incomplete')}</p>
        {back}
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="page" id="unsubscribe-done">
        <h1 className="page-h1" tabIndex={-1} ref={(el) => el?.focus()}>
          {t('unsubscribe.doneTitle')}
        </h1>
        <p className="lede" role="status">
          {t('unsubscribe.done')}
        </p>
        {back}
      </div>
    );
  }

  return (
    <div className="page" id="unsubscribe">
      <h1 className="page-h1">{t('unsubscribe.title')}</h1>
      <p className="lede">{t('unsubscribe.body')}</p>
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={phase === 'working'}
          onClick={() => void stop()}
        >
          {phase === 'working' ? t('unsubscribe.working') : t('unsubscribe.button')}
        </button>
        <p
          className={phase === 'error' ? 'form-msg is-error' : 'form-msg'}
          role={phase === 'error' ? 'alert' : 'status'}
        >
          {phase === 'error' ? error : ''}
        </p>
      </div>
    </div>
  );
}
