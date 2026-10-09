import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <h1 className="page-h1">{t('app.notFoundTitle')}</h1>
      <p className="lede">{t('app.notFoundBody')}</p>
      <p>
        <Link className="btn btn-primary" to="/">
          {t('app.backHome')}
        </Link>
      </p>
    </div>
  );
}
