import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, proApi } from '../api/client';
import type { ClientRow } from '../api/types';
import { RouteBoard } from '../components/RouteBoard';
import { useCaseBoard } from '../state/useCaseBoard';
import { usePro } from './ProContext';

/** One client's own route: the same board a private visitor has, worked by the team. */
export function ClientPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { key } = usePro();
  const navigate = useNavigate();
  const session = useMemo(() => ({ id, token: key }), [id, key]);
  const board = useCaseBoard(session);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setClient(null);
    setMissing(false);
    proApi
      .client(key, id, controller.signal)
      .then((row) => {
        setClient(row);
        setName(row.clientName);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setMessage({ text: t('proApp.client.loadError'), error: true });
      });
    return () => {
      controller.abort();
    };
  }, [key, id, t]);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const row = await proApi.renameClient(key, id, name);
      setClient(row);
      setName(row.clientName);
      setMessage({ text: t('proApp.client.renamed'), error: false });
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : t('app.networkError'),
        error: true,
      });
    }
  };

  const remove = async () => {
    if (!window.confirm(t('proApp.client.deleteConfirm'))) return;
    try {
      await api.deleteCase(id, key);
      void navigate('/pro');
    } catch (error) {
      setMessage({
        text: error instanceof ApiError ? error.message : t('app.networkError'),
        error: true,
      });
    }
  };

  if (missing || board.state.status === 'not-found') {
    return (
      <div className="stack" id="client-not-found">
        <h1 className="page-h1">{t('proApp.client.notFound')}</h1>
        <p>
          <Link className="btn btn-primary" to="/pro">
            {t('proApp.client.back')}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p>
        <Link className="link" to="/pro">
          ← {t('proApp.client.back')}
        </Link>
      </p>
      <h1 className="page-h1">{client?.clientName ?? t('proApp.loading')}</h1>
      <form className="pro-toolbar" onSubmit={(e) => void rename(e)}>
        <div className="field">
          <label htmlFor="client-name">{t('proApp.client.rename')}</label>
          <input
            id="client-name"
            className="input"
            required
            maxLength={80}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </div>
        <button type="submit" className="btn btn-sm">
          {t('proApp.client.renameSave')}
        </button>
        <p
          className={message?.error ? 'form-msg is-error' : 'form-msg'}
          role={message?.error ? 'alert' : 'status'}
        >
          {message?.text}
        </p>
      </form>
      <RouteBoard board={board} fallbackEvent={null} variant="case" />
      <div className="panel-danger">
        <button type="button" className="btn btn-sm" onClick={() => void remove()}>
          {t('proApp.client.delete')}
        </button>
      </div>
    </div>
  );
}
