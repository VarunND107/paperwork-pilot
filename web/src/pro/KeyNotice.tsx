import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  secret: string;
  /** What this key is for, for example "Priya was added. Give them this access key now." */
  intro?: string;
  onDone: () => void;
}

/** An access key is shown once. It can be copied, or selected by hand. */
export function KeyNotice({ secret, intro, onDone }: Props) {
  const { t } = useTranslation();
  const uid = useId();
  const [copy, setCopy] = useState('');

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopy(t('proApp.keyShown.copied'));
    } catch {
      setCopy(t('proApp.keyShown.copyFailed'));
    }
  };

  return (
    <section className="panel" aria-labelledby={`${uid}-title`}>
      <h2 className="panel-title" id={`${uid}-title`}>
        {t('proApp.keyShown.title')}
      </h2>
      <p>{intro ?? t('proApp.keyShown.body')}</p>
      <div className="field">
        <label htmlFor={`${uid}-key`}>{t('proApp.keyShown.label')}</label>
        <input
          id={`${uid}-key`}
          className="input mono-input"
          readOnly
          value={secret}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
      </div>
      <div className="panel-actions">
        <button type="button" className="btn btn-sm" onClick={() => void copyKey()}>
          {t('proApp.keyShown.copy')}
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={onDone}>
          {t('proApp.keyShown.done')}
        </button>
        <p className="form-msg" role="status">
          {copy}
        </p>
      </div>
    </section>
  );
}
