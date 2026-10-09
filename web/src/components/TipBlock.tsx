import { useTranslation } from 'react-i18next';
import type { TipView } from '../api/types';
import { formatTimestamp } from '../lib/format';

interface Props {
  tip: TipView;
  /** Lets a visitor say the tip looks out of date. Provided once tips can be flagged. */
  onFlag?: (tip: TipView) => void;
  flagged?: boolean;
}

/** One tip. Sample tips say so; visitor tips show the date they were written. */
export function TipBlock({ tip, onFlag, flagged }: Props) {
  const { t, i18n } = useTranslation();
  const kicker =
    tip.origin === 'USER' && tip.createdAt
      ? t('tips.kickerUser', { date: formatTimestamp(tip.createdAt, i18n.language) })
      : t('tips.kickerSample');
  return (
    <div className="tip">
      <span className="kicker">{kicker}</span>
      <p>{tip.body}</p>
      {tip.staleFlags > 0 && (
        <p className="tip-flags">{t('tips.flaggedStale', { count: tip.staleFlags })}</p>
      )}
      {onFlag && tip.origin === 'USER' && (
        <button
          type="button"
          className="link"
          disabled={flagged}
          onClick={() => {
            onFlag(tip);
          }}
        >
          {flagged ? t('tips.flagged') : t('tips.flag')}
        </button>
      )}
    </div>
  );
}
