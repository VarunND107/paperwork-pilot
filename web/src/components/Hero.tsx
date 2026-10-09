import { Fragment, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventSummary } from '../api/types';
import { IntakeForm } from './IntakeForm';
import { TokenBoard } from './TokenBoard';

interface Props {
  events: EventSummary[] | null;
  currentSlug: string | null;
  onSelect: (event: EventSummary) => void;
}

const word = (k: number): CSSProperties => ({ '--k': k }) as CSSProperties;

export function Hero({ events, currentSlug, onSelect }: Props) {
  const { t } = useTranslation();
  const words = t('hero.words', { returnObjects: true }) as string[];
  const markFrom = Number(t('hero.markFrom'));
  const markTo = Number(t('hero.markTo'));

  const spans = words.map((w, k) => (
    <span className="w" style={word(k)} key={k}>
      {w}
    </span>
  ));
  const before = spans.slice(0, markFrom);
  const marked = spans.slice(markFrom, markTo + 1);
  const after = spans.slice(markTo + 1);

  const join = (items: React.ReactNode[]) =>
    items.map((item, i) => (
      <Fragment key={i}>
        {i > 0 && ' '}
        {item}
      </Fragment>
    ));

  return (
    <section className="hero" id="situation">
      <div>
        <p className="kicker">{t('hero.kicker')}</p>
        <h1 className="h1" aria-label={t('hero.titleAria')}>
          {join(before)} <span className="mark">{join(marked)}</span> {join(after)}
        </h1>
        <p className="lede">{t('hero.lede')}</p>
        <IntakeForm events={events} currentSlug={currentSlug} onSelect={onSelect} />
      </div>
      <TokenBoard />
    </section>
  );
}
