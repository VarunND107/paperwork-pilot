import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAdmin } from './AdminContext';
import { parseKeywords } from './EventsPage';
import type { AdminEventRow, AdminStepRow, EditProvenance } from './types';
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
  event: AdminEventRow;
  steps: AdminStepRow[];
}

export function EventPage() {
  const { id = '' } = useParams();
  const detail = useAdminResource<Detail>(`/events/${id}`);
  const { request } = useAdmin();
  const navigate = useNavigate();

  const eventSaver = useSaver();
  const stepSaver = useSaver();
  const [form, setForm] = useState({
    label: '',
    slug: '',
    place: '',
    eventDateLabel: '',
    keywords: '',
  });
  const [prov, setProv] = useState<EditProvenance>(EMPTY_PROVENANCE);
  const [step, setStep] = useState({
    title: '',
    form: '',
    whereText: '',
    fee: '',
    waitText: '',
    dueText: '',
  });
  const [stepProv, setStepProv] = useState<EditProvenance>(EMPTY_PROVENANCE);

  const event = detail.data?.event;
  useEffect(() => {
    if (!event) return;
    setForm({
      label: event.label,
      slug: event.slug,
      place: event.place,
      eventDateLabel: event.eventDateLabel,
      keywords: event.keywords.join(', '),
    });
    setProv({ sourceUrl: event.sourceUrl ?? '', verified: false });
  }, [event]);

  const saveEvent = (e: FormEvent) => {
    e.preventDefault();
    void eventSaver.run(async () => {
      const res = await request<{ event: AdminEventRow }>(`/events/${id}`, {
        method: 'PATCH',
        body: {
          label: form.label,
          slug: form.slug,
          place: form.place,
          eventDateLabel: form.eventDateLabel,
          keywords: parseKeywords(form.keywords),
          ...prov,
        },
      });
      if (detail.data) detail.setData({ ...detail.data, event: res.event });
    }, 'Saved. Last checked is now today.');
  };

  const removeEvent = async () => {
    if (!window.confirm('Delete this situation and all of its steps?')) return;
    try {
      await request(`/events/${id}`, { method: 'DELETE' });
      void navigate('/admin/events');
    } catch (error) {
      eventSaver.fail(error);
    }
  };

  const addStep = (e: FormEvent) => {
    e.preventDefault();
    void stepSaver.run(async () => {
      const res = await request<{ step: AdminStepRow }>(`/events/${id}/steps`, {
        method: 'POST',
        body: { ...step, ...stepProv },
      });
      void navigate(`/admin/steps/${res.step.id}`);
    }, 'Step added.');
  };

  if (detail.error) return <ErrorBox error={detail.error} />;
  if (!detail.data) return <p role="status">Loading…</p>;

  const steps = detail.data.steps;
  return (
    <div className="stack">
      <p>
        <Link to="/admin/events">← All situations</Link>
      </p>
      <h1 className="page-h1">{detail.data.event.label}</h1>

      <section aria-labelledby="steps-title" className="stack">
        <h2 id="steps-title" className="panel-title">
          Steps in order
        </h2>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr">Steps of this situation and whether they are fresh</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Step</th>
                <th scope="col">Waits for</th>
                <th scope="col">Status</th>
                <th scope="col">Last checked</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.id}>
                  <td>{s.position}</td>
                  <th scope="row">
                    <Link to={`/admin/steps/${s.id}`}>{s.title}</Link>
                    <div className="hint">{s.officeName ?? s.whereText}</div>
                  </th>
                  <td>
                    {s.needs.length === 0 ? (
                      <span className="hint">nothing</span>
                    ) : (
                      s.needs.map((n) => n.title).join(', ')
                    )}
                  </td>
                  <td>
                    <VerifiedTag verified={s.verified} /> <StaleTag stale={s.stale} />
                  </td>
                  <td>
                    <LastChecked p={s} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {steps.length === 0 && <p className="hint">No steps yet. Add the first one below.</p>}
        </div>
      </section>

      <form className="panel" onSubmit={addStep} aria-labelledby="add-step-title">
        <h2 id="add-step-title">Add a step</h2>
        <p className="hint">
          Add the basics here. You set what it waits for and its documents next.
        </p>
        <div className="form-grid">
          <Field id="as-title" label="Title">
            <input
              id="as-title"
              className="input"
              required
              value={step.title}
              onChange={(e) => {
                setStep({ ...step, title: e.target.value });
              }}
            />
          </Field>
          <Field id="as-form" label="Form">
            <input
              id="as-form"
              className="input"
              required
              value={step.form}
              onChange={(e) => {
                setStep({ ...step, form: e.target.value });
              }}
            />
          </Field>
          <Field id="as-where" label="Where (office or portal)">
            <input
              id="as-where"
              className="input"
              required
              value={step.whereText}
              onChange={(e) => {
                setStep({ ...step, whereText: e.target.value });
              }}
            />
          </Field>
          <Field id="as-fee" label="Fee">
            <input
              id="as-fee"
              className="input"
              required
              value={step.fee}
              onChange={(e) => {
                setStep({ ...step, fee: e.target.value });
              }}
            />
          </Field>
          <Field id="as-wait" label="Typical wait">
            <input
              id="as-wait"
              className="input"
              required
              value={step.waitText}
              onChange={(e) => {
                setStep({ ...step, waitText: e.target.value });
              }}
            />
          </Field>
          <Field id="as-due" label="Deadline wording">
            <input
              id="as-due"
              className="input"
              required
              value={step.dueText}
              onChange={(e) => {
                setStep({ ...step, dueText: e.target.value });
              }}
            />
          </Field>
        </div>
        <ProvenanceFields idPrefix="as" value={stepProv} onChange={setStepProv} />
        <ErrorBox error={stepSaver.error} />
        <div className="panel-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={stepSaver.saving}>
            Add step
          </button>
        </div>
      </form>

      <form className="panel" onSubmit={saveEvent} aria-labelledby="edit-event-title">
        <h2 id="edit-event-title">Situation details</h2>
        <div className="form-grid">
          <Field id="ev-label" label="Name shown to visitors">
            <input
              id="ev-label"
              className="input"
              required
              value={form.label}
              onChange={(e) => {
                setForm({ ...form, label: e.target.value });
              }}
            />
          </Field>
          <Field id="ev-slug" label="Address">
            <input
              id="ev-slug"
              className="input"
              required
              value={form.slug}
              onChange={(e) => {
                setForm({ ...form, slug: e.target.value });
              }}
            />
          </Field>
          <Field id="ev-place" label="Place">
            <input
              id="ev-place"
              className="input"
              required
              value={form.place}
              onChange={(e) => {
                setForm({ ...form, place: e.target.value });
              }}
            />
          </Field>
          <Field id="ev-date" label="What the event date means">
            <input
              id="ev-date"
              className="input"
              required
              value={form.eventDateLabel}
              onChange={(e) => {
                setForm({ ...form, eventDateLabel: e.target.value });
              }}
            />
          </Field>
        </div>
        <Field
          id="ev-keywords"
          label="Match words"
          hint="Words that make free text land on this situation. A trailing * matches word starts."
        >
          <textarea
            id="ev-keywords"
            className="input"
            rows={3}
            value={form.keywords}
            aria-describedby="ev-keywords-hint"
            onChange={(e) => {
              setForm({ ...form, keywords: e.target.value });
            }}
          />
        </Field>
        <ProvenanceFields
          idPrefix="ev"
          value={prov}
          onChange={setProv}
          current={detail.data.event}
        />
        <ErrorBox error={eventSaver.error} />
        <div className="panel-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={eventSaver.saving}>
            Save situation
          </button>
          <SavedNote>{eventSaver.saved}</SavedNote>
        </div>
        <div className="panel-danger">
          <h3>Delete this situation</h3>
          <p className="hint">
            Removes the situation and its steps. Not possible while people have cases on it (
            {detail.data.event.caseCount} now).
          </p>
          <button type="button" className="btn btn-sm" onClick={() => void removeEvent()}>
            Delete situation
          </button>
        </div>
      </form>
    </div>
  );
}
