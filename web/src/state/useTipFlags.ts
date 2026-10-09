import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { caseStore } from '../api/caseStore';
import type { TipView } from '../api/types';

/** "This tip looks out of date": one vote per browser, remembered across reloads. */
export function useTipFlags() {
  const { t } = useTranslation();
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(
    () => new Set(caseStore.flaggedTips()),
  );
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());

  const flag = useCallback(
    async (tip: TipView) => {
      try {
        await api.flagTip(tip.id, caseStore.voterId());
        caseStore.markTipFlagged(tip.id);
        setFlagged((prev) => new Set(prev).add(tip.id));
        setErrors((prev) => {
          const next = new Map(prev);
          next.delete(tip.id);
          return next;
        });
      } catch {
        setErrors((prev) => new Map(prev).set(tip.id, t('tips.flagFailed')));
      }
    },
    [t],
  );

  return { flagged, errors, flag };
}
