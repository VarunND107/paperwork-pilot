import { useState, type FormEvent } from 'react';
import { useAdmin } from './AdminContext';
import type { AdminDocumentRow, EditProvenance } from './types';
import {
  EMPTY_PROVENANCE,
  ErrorBox,
  Field,
  LastChecked,
  ProvenanceFields,
  SavedNote,
  StaleTag,
  useAdminResource,
  useSaver,
  VerifiedTag,
} from './ui';

/** The catalog of documents that steps ask for or hand over. */
export function DocumentsPage() {
  const docs = useAdminResource<{ documents: AdminDocumentRow[] }>('/documents');
  const { request } = useAdmin();
  const saver = useSaver();
  const [editing, setEditing] = useState<AdminDocumentRow | 'new' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prov, setProv] = useState<EditProvenance>(EMPTY_PROVENANCE);

  const open = (target: AdminDocumentRow | 'new') => {
    setEditing(target);
    setName(target === 'new' ? '' : target.name);
    setDescription(target === 'new' ? '' : (target.description ?? ''));
    setProv({ sourceUrl: target === 'new' ? '' : (target.sourceUrl ?? ''), verified: false });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void saver.run(async () => {
      const body = { name, description: description.trim() ? description.trim() : null, ...prov };
      if (editing === 'new') await request('/documents', { method: 'POST', body });
      else if (editing) await request(`/documents/${editing.id}`, { method: 'PATCH', body });
      docs.reload();
      setEditing(null);
    }, 'Saved. Last checked is now today.');
  };

  const remove = async (doc: AdminDocumentRow) => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    try {
      await request(`/documents/${doc.id}`, { method: 'DELETE' });
      setEditing(null);
      docs.reload();
    } catch (error) {
      saver.fail(error);
    }
  };

  return (
    <div className="stack">
      <h1 className="page-h1">Documents</h1>
      <ErrorBox error={docs.error} />
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            open('new');
          }}
        >
          New document
        </button>
        <SavedNote>{editing ? '' : saver.saved}</SavedNote>
      </div>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr">Documents steps can ask for</caption>
          <thead>
            <tr>
              <th scope="col">Document</th>
              <th scope="col">Used in</th>
              <th scope="col">Status</th>
              <th scope="col">Last checked</th>
              <th scope="col">
                <span className="sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {docs.data?.documents.map((d) => (
              <tr key={d.id}>
                <th scope="row">{d.name}</th>
                <td>
                  {d.stepCount} step {d.stepCount === 1 ? 'entry' : 'entries'}
                </td>
                <td>
                  <VerifiedTag verified={d.verified} /> <StaleTag stale={d.stale} />
                </td>
                <td>
                  <LastChecked p={d} />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      open(d);
                    }}
                  >
                    Edit<span className="sr"> {d.name}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs.loading && !docs.data && <p role="status">Loading…</p>}
      </div>

      {editing && (
        <form className="panel" onSubmit={save} aria-labelledby="doc-form-title">
          <h2 id="doc-form-title">
            {editing === 'new' ? 'New document' : `Edit "${editing.name}"`}
          </h2>
          <Field id="doc-name" label="Name">
            <input
              id="doc-name"
              className="input"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </Field>
          <Field id="doc-desc" label="Note (optional)">
            <input
              id="doc-desc"
              className="input"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
            />
          </Field>
          <ProvenanceFields
            idPrefix="doc"
            value={prov}
            onChange={setProv}
            current={editing === 'new' ? undefined : editing}
          />
          <ErrorBox error={saver.error} />
          <div className="panel-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saver.saving}>
              Save document
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
            {editing !== 'new' && (
              <button type="button" className="btn btn-sm" onClick={() => void remove(editing)}>
                Delete
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
