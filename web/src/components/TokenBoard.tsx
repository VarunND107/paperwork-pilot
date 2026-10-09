import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useMediaQuery';
import { cx } from '../lib/format';

const FIRST = 37;
const YOURS = 42;

/**
 * The queue token display: "now serving" counts up to your token, then starts over.
 * It is decoration (hidden from assistive tech). With reduced motion it stands still.
 */
export function TokenBoard() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [serving, setServing] = useState(FIRST);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      setServing((n) => (n >= YOURS ? FIRST : n + 1));
    }, 2300);
    return () => {
      window.clearInterval(id);
    };
  }, [reduced]);

  const ahead = YOURS - serving;

  return (
    <aside className="token" aria-hidden="true">
      <div className="tk-row">
        <span>{t('token.nowServing')}</span>
        <span className="tk-live"></span>
      </div>
      <div className={cx('tk-num', !reduced && 'tick')} id="tk-num" key={serving}>
        {String(serving).padStart(3, '0')}
      </div>
      <div className="tk-row">
        <span>{t('token.yourToken')}</span>
        <span className="tk-you">{String(YOURS).padStart(3, '0')}</span>
      </div>
      <div className={cx('tk-msg', ahead <= 0 && 'go')} id="tk-msg">
        {ahead > 0 ? t('token.ahead', { count: ahead }) : t('token.yourTurn')}
      </div>
      <p className="tk-foot">{t('token.foot')}</p>
    </aside>
  );
}
