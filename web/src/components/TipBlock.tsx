import { useTranslation } from 'react-i18next';
import type { TipView } from '../api/types';
import { formatTimestamp } from '../lib/format';

interface Props {
  tip: TipView;
  /** The office a tip about an office is for. */
  officeName?: string | undefined;
  /** Lets a visitor say the tip looks out of date. */
  onFlag?: ((tip: TipView) => void) | undefined;
  flagged?: boolean | undefined;
  /** Why flagging failed, if it did. */
  flagError?: string | null | undefined;
}

/** One tip. Sample tips say so; visitor tips show the date they were written. */
export function TipBlock({ tip, officeName, onFlag, flagged, flagError }: Props) {
  const { t, i18n } = useTranslation();
  const date =
    tip.origin === 'USER' && tip.createdAt ? formatTimestamp(tip.createdAt, i18n.language) : null;
  const kicker =
    date === null
      ? t('tips.kickerSample')
      : tip.scope === 'office' && officeName
        ? t('tips.kickerUserOffice', { office: officeName, date })
        : t('tips.kickerUser', { date });
  const canFlag = onFlag !== undefined && tip.origin === 'USER';
  return (
    <div className="tip">
      <span className="kicker">{kicker}</span>
      <p>{tip.body}</p>
      {tip.staleFlags > 0 && (
        <p className="tip-flags">{t('tips.flaggedStale', { count: tip.staleFlags })}</p>
      )}
      {canFlag && (
        <button
          type="button"
          className="link"
          aria-disabled={flagged ? 'true' : undefined}
          onClick={() => {
            if (!flagged) onFlag(tip);
          }}
        >
          {flagged ? t('tips.flagged') : t('tips.flag')}
        </button>
      )}
      {/* Always present, so a change is announced. */}
      <p className="tip-flags" role={flagError ? 'alert' : 'status'}>
        {flagError ?? ''}
      </p>
    </div>
  );
}
