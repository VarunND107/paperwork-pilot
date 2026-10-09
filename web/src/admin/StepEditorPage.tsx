import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAdmin } from './AdminContext';
import type { AdminDocumentRow, AdminOfficeRow, AdminStepRow, EditProvenance } from './types';
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

interface Detail {
  step: AdminStepRow;
  event: { id: string; slug: string; label: string };
  siblings: { id: string; title: string; position: number; needs: string[] }[];
}

interface DocRow {
  key: number;
  documentId: string;
  role: 'REQUIRES' | 'PRODUCES';
  producedByStepId: string;
  label: string;
}

export function StepEditorPage() {
  const { id = '' } = useParams();
  const detail = useAdminResource<Detail>(`/steps/${id}`);
  const documents = useAdminResource<{ documents: AdminDocumentRow[] }>('/documents');
  const offices = useAdminResource<{ offices: AdminOfficeRow[] }>('/offices');
  const { request } = useAdmin();
  const navigate = useNavigate();
  const saver = useSaver();
  const nextKey = useRef(1);

  const [fields, setFields] = useState({
    title: '',
    form: '',
    whereText: '',
    officeId: '',
    fee: '',
    waitText: '',
    dueText: '',
    dueAmount: '',
    dueUnit: '',
    position: '',
  });
  const [needs, setNeeds] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<DocRow[]>([]);
  const [prov, setProv] = useState<EditProvenance>(EMPTY_PROVENANCE);

  const step = detail.data?.step;
  useEffect(() => {
    if (!step) return;
    setFields({
      title: step.title,
      form: step.form,
      whereText: step.whereText,
      officeId: step.officeId ?? '',
      fee: step.fee,
      waitText: step.waitText,
      dueText: step.dueText,
      dueAmount: step.dueAmount === null ? '' : String(step.dueAmount),
      dueUnit: step.dueUnit ?? '',
      position: String(step.position),
    });
    setNeeds(new Set(step.needs.map((n) => n.id)));
    setRows(
      step.documents.map((d) => ({
        key: nextKey.current++,
        documentId: d.documentId,
        role: d.role,
        producedByStepId: d.producedByStepId ?? '',
        label: d.label ?? '',
      })),
    );
    setProv({ sourceUrl: step.sourceUrl, verified: false });
  }, [step]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    void saver.run(async () => {
      const res = await request<{ step: AdminStepRow }>(`/steps/${id}`, {
        method: 'PATCH',
        body: {
          title: fields.title,
          form: fields.form,
          whereText: fields.whereText,
          officeId: fields.officeId || null,
          fee: fields.fee,
          waitText: fields.waitText,
          dueText: fields.dueText,
          dueAmount: fields.dueAmount === '' ? null : Number(fields.dueAmount),
          dueUnit: fields.dueUnit === '' ? null : fields.dueUnit,
          position: Number(fields.position),
          needs: [...needs],
          documents: rows.map((r) => ({
            documentId: r.documentId,
            role: r.role,
            producedByStepId:
              r.role === 'REQUIRES' && r.producedByStepId ? r.producedByStepId : null,
            label: r.label.trim() ? r.label.trim() : null,
          })),
          ...prov,
        },
      });
      if (detail.data) detail.setData({ ...detail.data, step: res.step });
    }, 'Saved. Last checked is now today.');
  };

  const remove = async () => {
    if (!window.confirm('Delete this step? Steps that wait for it will stop waiting.')) return;
    try {
      await request(`/steps/${id}`, { method: 'DELETE' });
      void navigate(`/admin/events/${detail.data?.event.id ?? ''}`);
    } catch (error) {
      saver.fail(error);
    }
  };

  if (detail.error) return <ErrorBox error={detail.error} />;
  if (!detail.data || !step) return <p role="status">Loading…</p>;

  const siblings = detail.data.siblings;
  const others = siblings.filter((s) => s.id !== id);
  const numberOf = (sid: string) => siblings.findIndex((s) => s.id === sid) + 1;
  const docList = documents.data?.documents ?? [];
  const officeList = offices.data?.offices ?? [];

  const setRow = (key: number, patch: Partial<DocRow>) => {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  return (
    <div className="stack">
      <p>
        <Link to={`/admin/events/${detail.data.event.id}`}>← {detail.data.event.label}</Link>
      </p>
      <h1 className="page-h1">{step.title}</h1>
      <p>
        <VerifiedTag verified={step.verified} /> <StaleTag stale={step.stale} /> last checked{' '}
        <LastChecked p={step} />
      </p>

      <form className="stack" onSubmit={save} aria-label="Edit step">
        <section className="panel" aria-labelledby="basics-title">
          <h2 id="basics-title">The step</h2>
          <div className="form-grid">
            <Field id="st-title" label="Title">
              <input
                id="st-title"
                className="input"
                required
                value={fields.title}
                onChange={(e) => {
                  setFields({ ...fields, title: e.target.value });
                }}
              />
            </Field>
            <Field id="st-form" label="Form">
              <input
                id="st-form"
                className="input"
                required
                value={fields.form}
                onChange={(e) => {
                  setFields({ ...fields, form: e.target.value });
                }}
              />
            </Field>
            <Field id="st-where" label="Where (wording shown to visitors)">
              <input
                id="st-where"
                className="input"
                required
                value={fields.whereText}
                onChange={(e) => {
                  setFields({ ...fields, whereText: e.target.value });
                }}
              />
            </Field>
            <Field id="st-office" label="Office or portal (for tips and links)">
              <select
                id="st-office"
                className="input"
                value={fields.officeId}
                onChange={(e) => {
                  setFields({ ...fields, officeId: e.target.value });
                }}
              >
                <option value="">None</option>
                {officeList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.kind === 'PORTAL' ? 'portal' : 'office'})
                  </option>
                ))}
              </select>
            </Field>
            <Field id="st-fee" label="Fee">
              <input
                id="st-fee"
                className="input"
                required
                value={fields.fee}
                onChange={(e) => {
                  setFields({ ...fields, fee: e.target.value });
                }}
              />
            </Field>
            <Field id="st-wait" label="Typical wait">
              <input
                id="st-wait"
                className="input"
                required
                value={fields.waitText}
                onChange={(e) => {
                  setFields({ ...fields, waitText: e.target.value });
                }}
              />
            </Field>
            <Field id="st-due" label="Deadline wording">
              <input
                id="st-due"
                className="input"
                required
                value={fields.dueText}
                onChange={(e) => {
                  setFields({ ...fields, dueText: e.target.value });
                }}
              />
            </Field>
            <Field
              id="st-pos"
              label="Order position"
              hint="Breaks ties when several steps could come next."
            >
              <input
                id="st-pos"
                className="input"
                type="number"
                min={0}
                required
                value={fields.position}
                aria-describedby="st-pos-hint"
                onChange={(e) => {
                  setFields({ ...fields, position: e.target.value });
                }}
              />
            </Field>
          </div>
          <fieldset className="panel-prov">
            <legend className="kicker">Deadline the app can count (optional)</legend>
            <div className="form-grid">
              <Field id="st-amount" label="Amount" hint='For "within 21 days", enter 21.'>
                <input
                  id="st-amount"
                  className="input"
                  type="number"
                  min={0}
                  value={fields.dueAmount}
                  aria-describedby="st-amount-hint"
                  onChange={(e) => {
                    setFields({ ...fields, dueAmount: e.target.value });
                  }}
                />
              </Field>
              <Field id="st-unit" label="Unit (counted from the event date)">
                <select
                  id="st-unit"
                  className="input"
                  value={fields.dueUnit}
                  onChange={(e) => {
                    setFields({ ...fields, dueUnit: e.target.value });
                  }}
                >
                  <option value="">No countable deadline</option>
                  <option value="DAY">Days</option>
                  <option value="WEEK">Weeks</option>
                  <option value="MONTH">Months</option>
                </select>
              </Field>
            </div>
          </fieldset>
        </section>

        <section className="panel" aria-labelledby="needs-title">
          <h2 id="needs-title">Waits for</h2>
          <p className="hint">
            This step is locked until every ticked step is done. A loop is refused when you save.
          </p>
          <fieldset className="panel-prov">
            <legend className="sr">Steps this step waits for</legend>
            {others.length === 0 && <p className="hint">There are no other steps yet.</p>}
            {others.map((o) => (
              <div className="check" key={o.id}>
                <input
                  type="checkbox"
                  id={`need-${o.id}`}
                  checked={needs.has(o.id)}
                  onChange={(e) => {
                    setNeeds((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(o.id);
                      else next.delete(o.id);
                      return next;
                    });
                  }}
                />
                <label htmlFor={`need-${o.id}`}>
                  {numberOf(o.id)}. {o.title}
                </label>
              </div>
            ))}
          </fieldset>
        </section>

        <section className="panel" aria-labelledby="docs-title">
          <h2 id="docs-title">Documents</h2>
          <p className="hint">
            What the visitor carries, and what finishing this step hands over. A document that comes
            from an earlier step is ticked for the visitor when that step is done.
          </p>
          <ul className="doc-rows">
            {rows.map((r, i) => (
              <li key={r.key}>
                <Field id={`dr-${r.key}-doc`} label={`Document ${i + 1}`}>
                  <select
                    id={`dr-${r.key}-doc`}
                    className="input"
                    value={r.documentId}
                    onChange={(e) => {
                      setRow(r.key, { documentId: e.target.value });
                    }}
                  >
                    {docList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id={`dr-${r.key}-role`} label="Role">
                  <select
                    id={`dr-${r.key}-role`}
                    className="input"
                    value={r.role}
                    onChange={(e) => {
                      setRow(r.key, { role: e.target.value as DocRow['role'] });
                    }}
                  >
                    <option value="REQUIRES">Visitor carries it</option>
                    <option value="PRODUCES">This step hands it over</option>
                  </select>
                </Field>
                {r.role === 'REQUIRES' && (
                  <Field id={`dr-${r.key}-from`} label="Comes from step">
                    <select
                      id={`dr-${r.key}-from`}
                      className="input"
                      value={r.producedByStepId}
                      onChange={(e) => {
                        setRow(r.key, { producedByStepId: e.target.value });
                      }}
                    >
                      <option value="">The visitor gets it themselves</option>
                      {others.map((o) => (
                        <option key={o.id} value={o.id}>
                          {numberOf(o.id)}. {o.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field id={`dr-${r.key}-label`} label="Wording on this step (optional)">
                  <input
                    id={`dr-${r.key}-label`}
                    className="input"
                    value={r.label}
                    onChange={(e) => {
                      setRow(r.key, { label: e.target.value });
                    }}
                  />
                </Field>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setRows((current) => current.filter((x) => x.key !== r.key));
                  }}
                >
                  Remove<span className="sr"> document {i + 1}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={docList.length === 0}
              onClick={() => {
                const first = docList[0];
                if (!first) return;
                setRows((current) => [
                  ...current,
                  {
                    key: nextKey.current++,
                    documentId: first.id,
                    role: 'REQUIRES',
                    producedByStepId: '',
                    label: '',
                  },
                ]);
              }}
            >
              Add a document
            </button>
          </div>
        </section>

        <section className="panel" aria-labelledby="save-title">
          <h2 id="save-title">Save</h2>
          <ProvenanceFields idPrefix="se" value={prov} onChange={setProv} current={step} />
          <ErrorBox error={saver.error} />
          <div className="panel-actions">
            <button type="submit" className="btn btn-primary" disabled={saver.saving}>
              Save step
            </button>
            <SavedNote>{saver.saved}</SavedNote>
          </div>
          <div className="panel-danger">
            <h3>Delete this step</h3>
            <button type="button" className="btn btn-sm" onClick={() => void remove()}>
              Delete step
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
