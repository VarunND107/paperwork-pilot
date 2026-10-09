import { useTranslation } from 'react-i18next';

/** The disclaimer lives here on every page: guidance, not legal advice. */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="foot">
      <p>{t('app.disclaimer')}</p>
      <p>{t('app.builtIn')}</p>
    </footer>
  );
}
