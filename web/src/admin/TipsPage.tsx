import { useState } from 'react';
import { formatTimestamp } from '../lib/format';
import { useAdmin } from './AdminContext';
import type { AdminTipList, AdminTipRow, TipFilter } from './types';
import { ErrorBox, SavedNote, useAdminResource, useSaver } from './ui';

const FILTERS: { value: TipFilter; label: string }[] = [
  { value: 'queue', label: 'Needs review (waiting or flagged)' },
  { value: 'pending', label: 'Waiting for a first review' },
  { value: 'flagged', label: 'Flagged as out of date' },
  { value: 'approved', label: 'Approved (public)' },
  { value: 'rejected', label: 'Rejected (hidden)' },
  { value: 'all', label: 'All tips' },
];

const STATUS_TAG = {
  PENDING: <span className="tag wait">waiting</span>,
  APPROVED: <span className="tag ok">public</span>,
  REJECTED: <span className="tag alert">hidden</span>,
} as const;

/** Visitor tips. Nothing a visitor writes is public until it is approved here. */
export function TipsPage() {
  const [filter, setFilter] = useState<TipFilter>('queue');
  const list = useAdminResource<AdminTipList>(`/tips?filter=${filter}`);
  const { request } = useAdmin();
  const saver = useSaver();
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);

  /** Runs a change, reloads the list, and says whether it worked. */
  const act = async (work: () => Promise<unknown>, message: string): Promise<boolean> => {
    let worked = false;
    await saver.run(async () => {
      await work();
      worked = true;
      list.reload();
    }, message);
    return worked;
  };

  const patch = (tip: AdminTipRow, body: Record<string, unknown>, message: string) =>
    act(() => request(`/tips/${tip.id}`, { method: 'PATCH', body }), message);

  const remove = (tip: AdminTipRow) => {
    if (!window.confirm('Delete this tip for good? Its flags go with it.')) return;
    void act(() => request(`/tips/${tip.id}`, { method: 'DELETE' }), 'Tip deleted.');
  };

  const counts = list.data?.counts;
  return (
    <div className="stack">
      <h1 className="page-h1">Tips from visitors</h1>
      <p className="lede">
        A tip appears on the route only after you approve it. Approved tips that visitors flag as
        out of date come back here to be checked, reworded, hidden or cleared.
      </p>
      {counts && (
        <p role="status">
          {counts.pending} waiting for a first review, {counts.flagged} flagged as out of date.
        </p>
      )}
      <div className="field">
        <label htmlFor="tip-filter">Show</label>
        <select
          id="tip-filter"
          className="input"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as TipFilter);
          }}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox error={list.error ?? saver.error} />
      <SavedNote>{saver.saved}</SavedNote>

      {list.data && list.data.tips.length === 0 && <p>Nothing here.</p>}
      {list.loading && !list.data && <p role="status">Loading…</p>}
      <ul className="tip-queue">
        {list.data?.tips.map((tip) => {
          const isEditing = editing?.id === tip.id;
          return (
            <li key={tip.id} className="panel" aria-label={`Tip about ${tip.target.label}`}>
              <p className="kicker">
                {tip.target.kind === 'step' ? 'Step' : 'Office'}: {tip.target.label}
                {tip.target.context ? ` · ${tip.target.context}` : ''}
              </p>
              <p>
                {STATUS_TAG[tip.status]}{' '}
                {tip.origin === 'SEED' ? (
                  <span className="tag wait">sample</span>
                ) : (
                  <span className="tag">visitor</span>
                )}{' '}
                {tip.flagCount > 0 && (
                  <span className="tag alert">
                    flagged out of date by {tip.flagCount}{' '}
                    {tip.flagCount === 1 ? 'person' : 'people'}
                  </span>
                )}
              </p>
              {isEditing ? (
                <div className="field">
                  <label htmlFor={`tip-edit-${tip.id}`}>Tip text</label>
                  <textarea
                    id={`tip-edit-${tip.id}`}
                    className="input"
                    rows={4}
                    maxLength={400}
                    value={editing.body}
                    onChange={(e) => {
                      setEditing({ id: tip.id, body: e.target.value });
                    }}
                  />
                  <p className="hint">
                    Same rules as visitors: 10 to 400 characters, no links, emails or long numbers.
                  </p>
                </div>
              ) : (
                <p>{tip.body}</p>
              )}
              <p className="hint">Written {formatTimestamp(tip.createdAt)}</p>
              <div className="panel-actions">
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={saver.saving}
                      onClick={() => {
                        void patch(tip, { body: editing.body }, 'Tip text saved.').then(
                          (worked) => {
                            if (worked) setEditing(null);
                          },
                        );
                      }}
                    >
                      Save text
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setEditing(null);
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {tip.status !== 'APPROVED' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={saver.saving}
                        onClick={() => void patch(tip, { status: 'APPROVED' }, 'Tip approved.')}
                      >
                        Approve<span className="sr"> tip about {tip.target.label}</span>
                      </button>
                    )}
                    {tip.status !== 'REJECTED' && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={saver.saving}
                        onClick={() => void patch(tip, { status: 'REJECTED' }, 'Tip hidden.')}
                      >
                        {tip.status === 'APPROVED' ? 'Hide' : 'Reject'}
                        <span className="sr"> tip about {tip.target.label}</span>
                      </button>
                    )}
                    {tip.flagCount > 0 && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={saver.saving}
                        onClick={() => void patch(tip, { clearFlags: true }, 'Flags cleared.')}
                      >
                        Clear flags<span className="sr"> on tip about {tip.target.label}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        setEditing({ id: tip.id, body: tip.body });
                      }}
                    >
                      Edit text<span className="sr"> of tip about {tip.target.label}</span>
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => remove(tip)}>
                      Delete<span className="sr"> tip about {tip.target.label}</span>
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
