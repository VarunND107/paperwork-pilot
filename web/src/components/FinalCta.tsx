import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useMediaQuery';
import { focusIntakeSoon } from './Header';
import { HashLink } from './HashLink';

export function FinalCta() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  return (
    <section className="final" id="start">
      <p className="kicker">{t('final.kicker')}</p>
      <h2>{t('final.title')}</h2>
      <p>{t('final.body')}</p>
      <div className="actions">
        <HashLink
          className="btn btn-primary"
          hash="situation"
          id="try-bottom"
          onClick={() => {
            focusIntakeSoon(reduced);
          }}
        >
          {t('final.plot')}
        </HashLink>
        <HashLink className="btn" hash="pros">
          {t('final.seePros')}
        </HashLink>
      </div>
    </section>
  );
}
