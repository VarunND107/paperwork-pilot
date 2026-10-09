import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { EventSummary, StepView } from '../api/types';
import { useMediaQuery, useReducedMotion, WIDE_QUERY } from '../hooks/useMediaQuery';
import { cx } from '../lib/format';
import type { CaseBoard } from '../state/useCaseBoard';
import { useTipFlags } from '../state/useTipFlags';
import { StepDetail } from './StepDetail';
import { TipForm } from './TipForm';

const ICON_CHECK = (
  <svg viewBox="0 0 16 16" width="16" height="16">
    <path
      d="M3 8.5l3.2 3.2L13 4.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
const ICON_LOCK = (
  <svg viewBox="0 0 16 16" width="14" height="14">
    <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

interface Props {
  board: CaseBoard;
  /** Shown as the title while the case is still loading. */
  fallbackEvent: EventSummary | null;
  /** "demo" is the landing-page demo; "case" is the full page of someone's own case. */
  variant: 'demo' | 'case';
  /** A link to the full page of this case (demo only). */
  fullPageHref?: string;
  /** Something went wrong before a case existed (for example creating it failed). */
  error?: string | null;
  /** Extra content inside the detail card, below the tips. */
  detailExtras?: (step: StepView) => ReactNode;
}

export function RouteBoard({
  board,
  fallbackEvent,
  variant,
  fullPageHref,
  error,
  detailExtras,
}: Props) {
  const { t } = useTranslation();
  const tipFlags = useTipFlags();
  const reduced = useReducedMotion();
  const wide = useMediaQuery(WIDE_QUERY);
  const { state } = board;
  const view = state.view;
  const event = view?.event ?? fallbackEvent;
  const focusRequest = useRef<string | null>(null);

  const selected = view?.steps.find((s) => s.id === state.selectedId) ?? null;
  const nextStep = view?.steps.find((s) => s.id === view.progress.nextStepId) ?? null;
  const done = view?.progress.done ?? 0;
  const total = view?.progress.total ?? event?.stepCount ?? 0;
  const percent = total > 0 ? (done / total) * 100 : 0;

  // After the visitor picks a step, keep keyboard focus on it; on narrow screens bring it into view.
  useEffect(() => {
    const id = focusRequest.current;
    if (!id || id !== state.selectedId) return;
    focusRequest.current = null;
    const safe = id.replace(/["\\]/g, '\\$&');
    document
      .querySelector<HTMLElement>(`.stn-btn[data-id="${safe}"]`)
      ?.focus({ preventScroll: true });
    if (!wide) {
      document
        .querySelector<HTMLElement>(`.stn[data-id="${safe}"]`)
        ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    }
  }, [state.selectedId, state.freshKey, wide, reduced]);

  const choose = (id: string) => {
    focusRequest.current = id;
    board.select(id);
  };

  const onReset = () => {
    if (variant === 'case' && !window.confirm(t('board.resetConfirm'))) return;
    void board.reset();
  };

  const detail = (step: StepView) => (
    <StepDetail
      key={`${step.id}:${state.freshKey}:${state.slamKey}`}
      step={step}
      total={total}
      nextStep={nextStep}
      busy={state.busy}
      fresh={state.freshKey > 0}
      slam={state.slamStepId === step.id}
      onToggleDocument={(documentId, ticked) => {
        void board.toggleDocument(documentId, ticked);
      }}
      onComplete={() => {
        void board.complete(step.id);
      }}
      onUndo={() => {
        void board.undo(step.id);
      }}
      onJump={choose}
      onOpen={choose}
      onFlagTip={(tip) => {
        void tipFlags.flag(tip);
      }}
      flaggedTips={tipFlags.flagged}
      tipErrors={tipFlags.errors}
    >
      <TipForm step={step} />
      {detailExtras?.(step)}
    </StepDetail>
  );

  const badgeFor = (step: StepView): string => {
    if (step.status === 'done') return t('step.badgeDone');
    if (step.status === 'ready') return step.isNext ? t('step.badgeNext') : t('step.badgeReady');
    return t('step.badgeAfter', { numbers: step.blockedBy.map((b) => b.number).join(', ') });
  };

  return (
    <section
      className="board"
      id="route"
      aria-labelledby="board-title"
      aria-busy={state.status === 'loading'}
    >
      <div className="board-head">
        <div>
          <p className="kicker">
            {event && !event.isSample ? t('board.kickerChecked') : t('board.kickerSample')}
          </p>
          <h2 className="board-title" id="board-title">
            {event?.label ?? ''}
            <small id="board-place">{event?.place ?? ''}</small>
          </h2>
          {view && (
            <div className="board-date">
              <label className="kicker" htmlFor="event-date">
                {view.event.eventDateLabel}
              </label>
              <input
                id="event-date"
                type="date"
                value={view.eventDate ?? ''}
                min={shiftYears(view.today, -10)}
                max={shiftYears(view.today, 5)}
                aria-describedby={view.eventDate ? undefined : 'event-date-hint'}
                disabled={state.busy}
                onChange={(e) => {
                  void board.setEventDate(e.target.value || null);
                }}
              />
              {!view.eventDate && (
                <span className="hint" id="event-date-hint">
                  {t('board.eventDateHint')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="board-meter">
          <div className="meter-row">
            <span id="count">{t('board.stepsDone', { done, total })}</span>
            <button
              type="button"
              className="link"
              id="reset"
              onClick={onReset}
              disabled={!view || state.busy}
            >
              {variant === 'demo' ? t('board.resetDemo') : t('board.resetCase')}
            </button>
            {fullPageHref && (
              <Link className="link" to={fullPageHref}>
                {t('board.openFull')}
              </Link>
            )}
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-label={t('board.stepsDone', { done, total })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
          >
            <span id="barfill" style={{ '--w': `${percent}%` } as CSSProperties}></span>
          </div>
        </div>
      </div>

      {(state.status === 'error' || error) && (
        <div role="alert" className="board-error">
          <p>{error ?? state.error ?? t('board.loadError')}</p>
          <button type="button" className="btn btn-sm" onClick={board.reload}>
            {t('app.retry')}
          </button>
        </div>
      )}
      {!view && !error && state.status !== 'error' && (
        <p className="board-note" role="status">
          {t('board.loading')}
        </p>
      )}

      <div className="board-body">
        <ol
          className="route"
          id="route-list"
          aria-label={t('board.stepsAria')}
          key={state.enterKey}
        >
          {view?.steps.map((step, i) => {
            const isSelected = step.id === state.selectedId;
            return (
              <li
                key={step.id}
                className={cx(
                  'stn',
                  state.enterKey > 0 && 'enter',
                  isSelected && 'is-selected',
                  step.isNext && 'next',
                  state.flashIds.includes(step.id) && 'unlock',
                )}
                data-state={step.status}
                data-id={step.id}
                style={{ '--i': i } as CSSProperties}
              >
                <button
                  type="button"
                  className="stn-btn"
                  data-id={step.id}
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => {
                    choose(step.id);
                  }}
                >
                  <span className="node" aria-hidden="true">
                    {step.status === 'done'
                      ? ICON_CHECK
                      : step.status === 'locked'
                        ? ICON_LOCK
                        : step.number}
                  </span>
                  <span className="stn-text">
                    <span className="stn-title">{step.title}</span>
                    <span className="stn-meta">{step.form}</span>
                  </span>
                  <span className="badge">{badgeFor(step)}</span>
                </button>
                {!wide && isSelected && selected && detail(selected)}
              </li>
            );
          })}
        </ol>
        <div className="detail-slot" id="detail-slot">
          {wide && selected && detail(selected)}
        </div>
      </div>

      <p className="board-note">{variant === 'demo' ? t('board.note') : t('board.noteCase')}</p>
      <p className="sr" id="live" role="status" aria-live="polite">
        {state.announcement}
      </p>
    </section>
  );
}

/** "2026-10-09" shifted by whole years, for the date input's min and max. */
function shiftYears(date: string, years: number): string {
  const [y, m, d] = date.split('-');
  return `${String(Number(y) + years).padStart(4, '0')}-${m}-${d}`;
}
