import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { caseStore } from '../api/caseStore';
import { CaseSettings } from '../components/CaseSettings';
import { RouteBoard } from '../components/RouteBoard';
import { useCaseBoard } from '../state/useCaseBoard';

/** `/case/:id`: the full route view of one case, openable only where its token is stored. */
export function CasePage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const token = caseStore.getToken(id);
  const session = useMemo(() => (token ? { id, token } : null), [id, token]);
  const board = useCaseBoard(session);
  const { status, view } = { status: board.state.status, view: board.state.view };

  useEffect(() => {
    if (status === 'not-found') caseStore.forget(id);
  }, [status, id]);

  if (!session || status === 'no-access') {
    return (
      <div className="page" id="case-no-access">
        <h1 className="page-h1">{t('casePage.noAccessTitle')}</h1>
        <p className="lede">{t('casePage.noAccessBody')}</p>
        <p>
          <Link className="btn btn-primary" to="/">
            {t('casePage.startNew')}
          </Link>
        </p>
      </div>
    );
  }
  if (status === 'not-found') {
    return (
      <div className="page" id="case-not-found">
        <h1 className="page-h1">{t('casePage.notFoundTitle')}</h1>
        <p className="lede">{t('casePage.notFoundBody')}</p>
        <p>
          <Link className="btn btn-primary" to="/">
            {t('casePage.backToDemo')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page-h1">{t('casePage.title')}</h1>
      <RouteBoard board={board} fallbackEvent={null} variant="case" />
      {view && session && <CaseSettings view={view} session={session} onView={board.replaceView} />}
    </div>
  );
}
