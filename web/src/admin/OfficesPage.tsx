import { useState, type FormEvent } from 'react';
import { useAdmin } from './AdminContext';
import type { AdminOfficeRow, EditProvenance } from './types';
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

const BLANK = { name: '', kind: 'OFFICE', city: 'Bengaluru', address: '', url: '', hours: '' };

/** Offices and portals. Tips attach to these as well as to steps. */
export function OfficesPage() {
  const offices = useAdminResource<{ offices: AdminOfficeRow[] }>('/offices');
  const { request } = useAdmin();
  const saver = useSaver();
  const [editing, setEditing] = useState<AdminOfficeRow | 'new' | null>(null);
  const [form, setForm] = useState(BLANK);
  const [prov, setProv] = useState<EditProvenance>(EMPTY_PROVENANCE);

  const open = (target: AdminOfficeRow | 'new') => {
    setEditing(target);
    setForm(
      target === 'new'
        ? BLANK
        : {
            name: target.name,
            kind: target.kind,
            city: target.city,
            address: target.address ?? '',
            url: target.url ?? '',
            hours: target.hours ?? '',
          },
    );
    setProv({ sourceUrl: target === 'new' ? '' : (target.sourceUrl ?? ''), verified: false });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void saver.run(async () => {
      const body = {
        name: form.name,
        kind: form.kind,
        city: form.city,
        address: form.address.trim() || null,
        url: form.url.trim() || null,
        hours: form.hours.trim() || null,
        ...prov,
      };
      if (editing === 'new') await request('/offices', { method: 'POST', body });
      else if (editing) await request(`/offices/${editing.id}`, { method: 'PATCH', body });
      offices.reload();
      setEditing(null);
    }, 'Saved. Last checked is now today.');
  };

  const remove = async (office: AdminOfficeRow) => {
    const used =
      office.stepCount > 0 ? ` ${office.stepCount} steps use it and will lose the link.` : '';
    if (!window.confirm(`Delete "${office.name}"?${used}`)) return;
    try {
      await request(`/offices/${office.id}`, { method: 'DELETE' });
      setEditing(null);
      offices.reload();
    } catch (error) {
      saver.fail(error);
    }
  };

  return (
    <div className="stack">
      <h1 className="page-h1">Offices and portals</h1>
      <ErrorBox error={offices.error} />
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            open('new');
          }}
        >
          New office or portal
        </button>
        <SavedNote>{editing ? '' : saver.saved}</SavedNote>
      </div>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr">Offices and portals</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Kind</th>
              <th scope="col">Steps</th>
              <th scope="col">Status</th>
              <th scope="col">Last checked</th>
              <th scope="col">
                <span className="sr">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {offices.data?.offices.map((o) => (
              <tr key={o.id}>
                <th scope="row">
                  {o.name}
                  <div className="hint">{o.city}</div>
                </th>
                <td>{o.kind === 'PORTAL' ? 'Portal' : 'Office'}</td>
                <td>{o.stepCount}</td>
                <td>
                  <VerifiedTag verified={o.verified} /> <StaleTag stale={o.stale} />
                </td>
                <td>
                  <LastChecked p={o} />
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      open(o);
                    }}
                  >
                    Edit<span className="sr"> {o.name}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {offices.loading && !offices.data && <p role="status">Loading…</p>}
      </div>

      {editing && (
        <form className="panel" onSubmit={save} aria-labelledby="office-form-title">
          <h2 id="office-form-title">
            {editing === 'new' ? 'New office or portal' : `Edit "${editing.name}"`}
          </h2>
          <div className="form-grid">
            <Field id="of-name" label="Name">
              <input
                id="of-name"
                className="input"
                required
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                }}
              />
            </Field>
            <Field id="of-kind" label="Kind">
              <select
                id="of-kind"
                className="input"
                value={form.kind}
                onChange={(e) => {
                  setForm({ ...form, kind: e.target.value });
                }}
              >
                <option value="OFFICE">Office</option>
                <option value="PORTAL">Portal</option>
              </select>
            </Field>
            <Field id="of-city" label="City">
              <input
                id="of-city"
                className="input"
                required
                value={form.city}
                onChange={(e) => {
                  setForm({ ...form, city: e.target.value });
                }}
              />
            </Field>
            <Field id="of-url" label="Website (optional)">
              <input
                id="of-url"
                className="input"
                type="url"
                placeholder="https://"
                value={form.url}
                onChange={(e) => {
                  setForm({ ...form, url: e.target.value });
                }}
              />
            </Field>
            <Field id="of-address" label="Address (optional)">
              <input
                id="of-address"
                className="input"
                value={form.address}
                onChange={(e) => {
                  setForm({ ...form, address: e.target.value });
                }}
              />
            </Field>
            <Field id="of-hours" label="Opening hours (optional)">
              <input
                id="of-hours"
                className="input"
                value={form.hours}
                onChange={(e) => {
                  setForm({ ...form, hours: e.target.value });
                }}
              />
            </Field>
          </div>
          <ProvenanceFields
            idPrefix="of"
            value={prov}
            onChange={setProv}
            current={editing === 'new' ? undefined : editing}
          />
          <ErrorBox error={saver.error} />
          <div className="panel-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={saver.saving}>
              Save
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
