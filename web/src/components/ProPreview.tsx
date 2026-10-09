import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAppData } from '../state/AppData';
import { cx } from '../lib/format';
import { Reveal } from './Reveal';

interface SampleRow {
  name: string;
  kind: string;
  done: number;
  next: string;
  tone: 'ok' | 'wait' | 'alert';
}

const STEPS_PER_ROUTE = 6;

/** The professional plan, as a clearly labelled sample (the real dashboard lives at /pro). */
export function ProPreview() {
  const { t } = useTranslation();
  const { config } = useAppData();
  const [filter, setFilter] = useState<'all' | 'attn'>('all');
  const rows = t('pros.rows', { returnObjects: true }) as SampleRow[];
  const roles = t('pros.roles', { returnObjects: true }) as { who: string; what: string }[];

  const visible = rows.filter((r) => filter === 'all' || r.tone !== 'ok');

  return (
    <section className="sec" id="pros">
      <div className="pros-grid">
        <Reveal>
          <div className="sec-head" style={{ marginBottom: '10px' }}>
            <p className="kicker">{t('pros.kicker')}</p>
            <h2>{t('pros.title')}</h2>
            <p>{t('pros.body')}</p>
          </div>
          <ul className="roles">
            {roles.map((role) => (
              <li key={role.who}>
                <b>{role.who}</b>
                <span>{role.what}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal className="dash" play>
          <div className="dash-top">
            <p className="kicker" id="pcount">
              {t('pros.clients', { count: visible.length })}
            </p>
            <div
              className="chips"
              style={{ margin: 0 }}
              role="group"
              aria-label={t('pros.filterAria')}
            >
              <button
                type="button"
                className="chip pfilter"
                aria-pressed={filter === 'all'}
                onClick={() => {
                  setFilter('all');
                }}
              >
                {t('pros.filterAll')}
              </button>
              <button
                type="button"
                className="chip pfilter"
                aria-pressed={filter === 'attn'}
                onClick={() => {
                  setFilter('attn');
                }}
              >
                {t('pros.filterAttention')}
              </button>
            </div>
          </div>
          <ul className="prow-list">
            {rows.map((row, i) => (
              <li
                className="prow"
                key={row.name}
                hidden={!(filter === 'all' || row.tone !== 'ok')}
                style={
                  {
                    '--w': `${Math.round((row.done / STEPS_PER_ROUTE) * 100)}%`,
                    '--d': `${i / 10}s`,
                  } as CSSProperties
                }
              >
                <div className="p-client">
                  <b>{row.name}</b>
                  <span className="mono">{row.kind}</span>
                </div>
                <div className="p-prog">
                  <div className="bar slim">
                    <span></span>
                  </div>
                  <span>{t('pros.stepsOf', { done: row.done, total: STEPS_PER_ROUTE })}</span>
                </div>
                <div className="p-next">
                  <span className="lab">{t('pros.next')}</span>
                  {row.next}
                </div>
                <span className={cx('pill', row.tone)}>{t(`pros.pill.${row.tone}`)}</span>
              </li>
            ))}
          </ul>
          <p className="dash-cap">
            {t('pros.caption')}
            {config?.proEnabled && (
              <>
                {' '}
                <Link className="link" to="/pro">
                  {t('pros.openDashboard')}
                </Link>
              </>
            )}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
