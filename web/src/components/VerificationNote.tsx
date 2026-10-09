import { useTranslation } from 'react-i18next';
import type { VerificationView } from '../api/types';
import { cx, formatTimestamp, hostOf } from '../lib/format';

export const STALE_AFTER_DAYS = 90;

/**
 * "Last verified" and the source, on every step. Sample data is never described as verified:
 * until an admin has checked a step against its source, this says so in plain words.
 */
export function VerificationNote({ verification }: { verification: VerificationView }) {
  const { t, i18n } = useTranslation();
  const { verified, lastVerifiedAt, stale, sourceUrl } = verification;
  const date = lastVerifiedAt ? formatTimestamp(lastVerifiedAt, i18n.language) : '';

  let status: string;
  if (!verified) {
    status = lastVerifiedAt
      ? t('verify.unverifiedEdited', { date })
      : `${t('verify.sample')} ${t('verify.neverVerified')}`;
  } else if (stale) {
    status = t('verify.staleVerified', { date, days: STALE_AFTER_DAYS });
  } else {
    status = t('verify.lastVerified', { date });
  }

  return (
    <div className={cx('d-source', !verified && 'is-unverified', verified && stale && 'is-stale')}>
      <span className="kicker">{t('verify.heading')}</span>
      <p className="d-source-status">{status}</p>
      <p className="d-source-link">
        {verified ? t('verify.source') : t('verify.sourceUnchecked')}:{' '}
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          {hostOf(sourceUrl)}
        </a>
      </p>
    </div>
  );
}
