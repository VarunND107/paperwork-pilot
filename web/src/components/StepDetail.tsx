import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StepView } from '../api/types';
import { cx, formatDateOnly } from '../lib/format';
import { TipBlock } from './TipBlock';
import { VerificationNote } from './VerificationNote';

interface Props {
  step: StepView;
  total: number;
  /** The step to do next, if any. Used for "Step N is ready" once this one is done. */
  nextStep: StepView | null;
  busy: boolean;
  /** Play the card's enter animation. */
  fresh: boolean;
  /** Play the rubber stamp slam (a step was just completed). */
  slam: boolean;
  onToggleDocument: (documentId: string, ticked: boolean) => void;
  onComplete: () => void;
  onUndo: () => void;
  onJump: (stepId: string) => void;
  onOpen: (stepId: string) => void;
  /** Extra content under the tips, for example the "add a tip" form. */
  children?: ReactNode;
}

export function StepDetail({
  step,
  total,
  nextStep,
  busy,
  fresh,
  slam,
  onToggleDocument,
  onComplete,
  onUndo,
  onJump,
  onOpen,
  children,
}: Props) {
  const { t, i18n } = useTranslation();
  const actionsRef = useRef<HTMLDivElement>(null);

  // After the stamp lands, move focus to the next sensible action (as the design does).
  useEffect(() => {
    if (slam)
      actionsRef.current?.querySelector<HTMLElement>('[data-act]')?.focus({ preventScroll: true });
  }, [slam]);

  const badge =
    step.status === 'done'
      ? t('step.badgeDone')
      : step.status === 'ready'
        ? t('step.badgeReady')
        : t('step.badgeLocked');

  return (
    <article
      className={cx('detail', fresh && 'fresh', slam && 'slam')}
      id="detail"
      data-state={step.status}
      aria-label={t('board.detailAria')}
    >
      <div className="d-top">
        <p className="kicker">{t('step.stepOf', { n: step.number, total })}</p>
        <span className="badge">{badge}</span>
      </div>
      <h3 className="d-title" id="d-title" tabIndex={-1}>
        {step.title}
      </h3>

      {step.status === 'locked' && step.blockedBy.length > 0 && (
        <div className="blocked" role="note">
          <strong>{t('step.notYet')}</strong>{' '}
          {step.blockedBy.length > 1 ? t('step.waitsForMany') : t('step.waitsForOne')}
          {step.blockedBy.map((b) => (
            <button
              type="button"
              className="jump"
              key={b.id}
              onClick={() => {
                onJump(b.id);
              }}
            >
              {t('step.jump', { n: b.number, title: b.title })}
            </button>
          ))}
        </div>
      )}

      <dl className="facts">
        <div>
          <dt>{t('step.form')}</dt>
          <dd>{step.form}</dd>
        </div>
        <div>
          <dt>{t('step.where')}</dt>
          <dd>
            {step.where}
            {step.office?.url && (
              <>
                {' '}
                <a href={step.office.url} target="_blank" rel="noopener noreferrer">
                  {t('step.portal')}
                </a>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('step.fee')}</dt>
          <dd>{step.fee}</dd>
        </div>
        <div>
          <dt>{t('step.wait')}</dt>
          <dd>{step.wait}</dd>
        </div>
        <div className="ticket">
          <dt>{t('step.deadline')}</dt>
          <dd>
            {step.due}
            {step.deadline && (
              <span
                className="d-deadline"
                data-state={step.status === 'done' ? 'none' : step.deadlineState}
              >
                {deadlineText(step, t, i18n.language)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <fieldset className="docs">
        <legend className="kicker">{t('step.docsLegend')}</legend>
        <ul>
          {step.documents.map((doc, i) => {
            const id = `doc-${step.id}-${i}`;
            const from = doc.comesFrom?.number;
            const held = doc.state === 'auto' || doc.state === 'ticked';
            const locked = doc.state === 'auto' || doc.state === 'wait';
            return (
              <li className="doc" key={`${doc.documentId}-${i}`}>
                <input
                  type="checkbox"
                  id={id}
                  checked={held}
                  disabled={locked}
                  aria-describedby={from ? `${id}-from` : undefined}
                  onChange={(e) => {
                    onToggleDocument(doc.documentId, e.target.checked);
                  }}
                />
                <label htmlFor={id}>{doc.label}</label>
                {from !== undefined && (
                  <span id={`${id}-from`} className={cx('from', doc.state === 'auto' && 'got')}>
                    {doc.state === 'auto'
                      ? t('step.docFrom', { n: from })
                      : t('step.docComesFrom', { n: from })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      {step.tips.map((tip) => (
        <TipBlock key={tip.id} tip={tip} />
      ))}
      {children}

      <VerificationNote verification={step.verification} />

      <div className="d-actions" id="d-actions" ref={actionsRef}>
        {step.status === 'done' ? (
          <>
            <p className="d-msg">
              {nextStep ? t('step.doneNext', { n: nextStep.number }) : t('step.doneComplete')}
            </p>
            {nextStep && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                data-act="next"
                data-id={nextStep.id}
                onClick={() => {
                  onOpen(nextStep.id);
                }}
              >
                {t('step.openStep', { n: nextStep.number })}
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
              data-act="undo"
              disabled={busy}
              onClick={onUndo}
            >
              {t('step.undo')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary"
              data-act="done"
              disabled={!step.canComplete || busy}
              aria-describedby="d-hint"
              onClick={onComplete}
            >
              {t('step.markDone')}
            </button>
            <p className="d-hint" id="d-hint" aria-live="polite">
              {step.status === 'locked'
                ? t('step.hintLocked')
                : step.docsComplete
                  ? t('step.hintAllTicked')
                  : t('step.hintTick')}
            </p>
          </>
        )}
      </div>

      <div className="stamp" aria-hidden="true">
        {t('step.stamp')}
        <small>
          {step.verification.verified ? t('step.stampSmall') : t('step.stampSmallSample')}
        </small>
      </div>
    </article>
  );
}

/** "By 22 Oct 2026 · 13 days left", "Due today", or "By 22 Oct 2026 · Overdue by 2 days". */
function deadlineText(
  step: StepView,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string,
): string {
  const by = t('step.deadlineBy', { date: formatDateOnly(step.deadline ?? '', locale) });
  if (step.status === 'done' || step.daysLeft === null) return by;
  if (step.daysLeft < 0) return `${by} · ${t('step.deadlineOverdue', { count: -step.daysLeft })}`;
  if (step.daysLeft === 0) return `${by} · ${t('step.deadlineToday')}`;
  return `${by} · ${t('step.deadlineLeft', { count: step.daysLeft })}`;
}
