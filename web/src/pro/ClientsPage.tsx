import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, proApi } from '../api/client';
import type { ClientList, ClientRow, HealthStatus } from '../api/types';
import { cx, formatDateOnly } from '../lib/format';
import { useAppData } from '../state/AppData';
import { usePro } from './ProContext';

const TONE: Record<HealthStatus, 'ok' | 'wait' | 'alert'> = {
  on_track: 'ok',
  needs_document: 'wait',
  overdue: 'alert',
};
const STATUSES: HealthStatus[] = ['on_track', 'needs_document', 'overdue'];

/** "2 days overdue", "due today", "due in 3 days". */
function useDeadlineText() {
  const { t } = useTranslation();
  return (daysLeft: number | null): string => {
    if (daysLeft === null) return '';
    if (daysLeft < 0) return t('proApp.clients.overdue', { count: -daysLeft });
    if (daysLeft === 0) return t('proApp.clients.dueToday');
    return t('proApp.clients.dueIn', { count: daysLeft });
  };
}

function Row({ row }: { row: ClientRow }) {
  const { t, i18n } = useTranslation();
  const deadlineText = useDeadlineText();
  const percent =
    row.progress.total === 0 ? 0 : Math.round((row.progress.done / row.progress.total) * 100);
  const next = row.next;
  return (
    <li className="prow" style={{ '--w': `${percent}%` } as CSSProperties}>
      <div className="p-client">
        <Link className="p-link" to={`/pro/clients/${row.id}`}>
          <b>{row.clientName}</b>
        </Link>
        <span className="mono">
          {row.event.label}
          {row.eventDate ? ` · ${formatDateOnly(row.eventDate, i18n.language)}` : ''}
        </span>
      </div>
      <div className="p-prog">
        <div className="bar slim" aria-hidden="true">
          <span></span>
        </div>
        <span>{t('pros.stepsOf', { done: row.progress.done, total: row.progress.total })}</span>
      </div>
      <div className="p-next">
        <span className="lab">{t('proApp.clients.next')}</span>
        {next ? next.title : t('proApp.clients.routeDone')}
        {next && deadlineText(next.daysLeft) && (
          <span className="p-note">{deadlineText(next.daysLeft)}</span>
        )}
        {row.missingDocuments.length > 0 && (
          <span className="p-note">
            {t('proApp.clients.needs', { documents: row.missingDocuments.join('; ') })}
          </span>
        )}
      </div>
      <span className={cx('pill', TONE[row.status])}>{t(`pros.pill.${TONE[row.status]}`)}</span>
    </li>
  );
}

/** The client dashboard: progress, next step and a status pill for every client, with filters. */
export function ClientsPage() {
  const { t } = useTranslation();
  const { key } = usePro();
  const { events } = useAppData();
  const navigate = useNavigate();

  const [attention, setAttention] = useState(false);
  const [status, setStatus] = useState<'' | HealthStatus>('');
  const [event, setEvent] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState<ClientList | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(text.trim());
    }, 250);
    return () => {
      clearTimeout(id);
    };
  }, [text]);

  useEffect(() => {
    const controller = new AbortController();
    proApi
      .clients(
        key,
        {
          ...(attention ? { filter: 'attention' as const } : {}),
          ...(status ? { status } : {}),
          ...(event ? { event } : {}),
          ...(q ? { q } : {}),
        },
        controller.signal,
      )
      .then((result) => {
        setList(result);
        setError('');
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setError(e instanceof ApiError ? e.message : t('proApp.loadError'));
        }
      });
    return () => {
      controller.abort();
    };
  }, [key, attention, status, event, q, t]);

  const filtered = attention || status !== '' || event !== '' || q !== '';
  const counts = list?.counts;

  // ---- add a client
  const [add, setAdd] = useState({ clientName: '', eventId: '', eventDate: '' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError('');
    try {
      const client = await proApi.addClient(key, {
        clientName: add.clientName,
        eventId: add.eventId,
        eventDate: add.eventDate || null,
      });
      void navigate(`/pro/clients/${client.id}`);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : t('proApp.loadError'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="stack">
      <h1 className="page-h1">{t('proApp.clients.title')}</h1>

      <section className="dash" aria-label={t('proApp.clients.list')}>
        <div className="pro-toolbar">
          <div className="field">
            <label htmlFor="pro-search">{t('proApp.clients.search')}</label>
            <input
              id="pro-search"
              className="input"
              type="search"
              maxLength={80}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="pro-situation">{t('proApp.clients.situation')}</label>
            <select
              id="pro-situation"
              className="input"
              value={event}
              onChange={(e) => {
                setEvent(e.target.value);
              }}
            >
              <option value="">{t('proApp.clients.allSituations')}</option>
              {events?.map((ev) => (
                <option key={ev.id} value={ev.slug}>
                  {ev.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pro-status">{t('proApp.clients.status')}</label>
            <select
              id="pro-status"
              className="input"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as '' | HealthStatus);
              }}
            >
              <option value="">{t('proApp.clients.allStatuses')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`pros.pill.${TONE[s]}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="dash-top">
          <p className="kicker" role="status">
            {list ? t('pros.clients', { count: list.clients.length }) : t('proApp.loading')}
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
              aria-pressed={!attention}
              onClick={() => {
                setAttention(false);
              }}
            >
              {t('pros.filterAll')}
            </button>
            <button
              type="button"
              className="chip pfilter"
              aria-pressed={attention}
              onClick={() => {
                setAttention(true);
              }}
            >
              {t('pros.filterAttention')}
            </button>
          </div>
        </div>
        {counts && counts.all > 0 && (
          <p className="hint">
            {t('proApp.clients.summary', {
              onTrack: counts.onTrack,
              needs: counts.needsDocument,
              overdue: counts.overdue,
            })}
          </p>
        )}
        {error && (
          <p className="form-msg is-error" role="alert">
            {error}
          </p>
        )}
        {list && list.clients.length === 0 && (
          <p>
            {filtered && list.total > 0
              ? t('proApp.clients.emptyFiltered')
              : t('proApp.clients.empty')}
          </p>
        )}
        <ul className="prow-list">
          {list?.clients.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </ul>
        {list?.truncated && (
          <p className="hint">{t('proApp.clients.truncated', { count: list.clients.length })}</p>
        )}
        <p className="dash-cap">{t('proApp.clients.listCaption')}</p>
      </section>

      <form className="panel" onSubmit={(e) => void submit(e)} aria-labelledby="pro-add-title">
        <h2 className="panel-title" id="pro-add-title">
          {t('proApp.clients.addTitle')}
        </h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="pro-client-name">{t('proApp.clients.clientName')}</label>
            <input
              id="pro-client-name"
              className="input"
              required
              maxLength={80}
              aria-describedby="pro-client-name-hint"
              value={add.clientName}
              onChange={(e) => {
                setAdd({ ...add, clientName: e.target.value });
              }}
            />
            <p className="hint" id="pro-client-name-hint">
              {t('proApp.clients.clientNameHint')}
            </p>
          </div>
          <div className="field">
            <label htmlFor="pro-client-event">{t('proApp.clients.situation')}</label>
            <select
              id="pro-client-event"
              className="input"
              required
              value={add.eventId}
              onChange={(e) => {
                setAdd({ ...add, eventId: e.target.value });
              }}
            >
              <option value="" disabled>
                …
              </option>
              {events?.map((ev) => (
                <option key={ev.id} value={ev.slug}>
                  {ev.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pro-client-date">{t('proApp.clients.eventDate')}</label>
            <input
              id="pro-client-date"
              className="input"
              type="date"
              aria-describedby="pro-client-date-hint"
              value={add.eventDate}
              onChange={(e) => {
                setAdd({ ...add, eventDate: e.target.value });
              }}
            />
            <p className="hint" id="pro-client-date-hint">
              {t('proApp.clients.eventDateHint')}
            </p>
          </div>
        </div>
        <div className="panel-actions">
          <button type="submit" className="btn btn-primary" disabled={adding}>
            {adding ? t('proApp.clients.adding') : t('proApp.clients.addSubmit')}
          </button>
          <p className="form-msg is-error" role="alert">
            {addError}
          </p>
        </div>
      </form>
    </div>
  );
}
