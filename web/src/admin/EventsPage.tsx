import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdmin } from './AdminContext';
import type { AdminEventRow, EditProvenance } from './types';
import {
  EMPTY_PROVENANCE,
  ErrorBox,
  Field,
  LastChecked,
  ProvenanceFields,
  StaleTag,
  useAdminResource,
  useSaver,
  VerifiedTag,
} from './ui';

/** Splits "a, b\nc" into trimmed, non-empty keywords. */
export function parseKeywords(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function EventsPage() {
  const events = useAdminResource<{ events: AdminEventRow[] }>('/events');
  const { request } = useAdmin();
  const navigate = useNavigate();
  const saver = useSaver();

  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [place, setPlace] = useState('Bengaluru, Karnataka');
  const [dateLabel, setDateLabel] = useState('Date of the event');
  const [keywords, setKeywords] = useState('');
  const [prov, setProv] = useState<EditProvenance>(EMPTY_PROVENANCE);

  const create = (e: FormEvent) => {
    e.preventDefault();
    void saver.run(async () => {
      const res = await request<{ event: AdminEventRow }>('/events', {
        method: 'POST',
        body: {
          slug,
          label,
          place,
          eventDateLabel: dateLabel,
          keywords: parseKeywords(keywords),
          ...prov,
        },
      });
      void navigate(`/admin/events/${res.event.id}`);
    }, 'Created.');
  };

  return (
    <div className="stack">
      <h1 className="page-h1">Situations</h1>
      <ErrorBox error={events.error} />
      <div className="table-wrap">
        <table className="table">
          <caption className="sr">Situations and how fresh their steps are</caption>
          <thead>
            <tr>
              <th scope="col">Situation</th>
              <th scope="col">Steps</th>
              <th scope="col">Freshness</th>
              <th scope="col">Cases</th>
              <th scope="col">Last checked</th>
            </tr>
          </thead>
          <tbody>
            {events.data?.events.map((event) => (
              <tr key={event.id}>
                <th scope="row">
                  <Link to={`/admin/events/${event.id}`}>{event.label}</Link>
                  <div className="hint">/{event.slug}</div>
                </th>
                <td>{event.stepCount}</td>
                <td>
                  <VerifiedTag verified={event.unverifiedStepCount === 0 && event.stepCount > 0} />
                  {event.staleStepCount > 0 && (
                    <span className="tag alert">{event.staleStepCount} stale</span>
                  )}
                  {event.unverifiedStepCount > 0 && (
                    <div className="hint">{event.unverifiedStepCount} steps not verified</div>
                  )}
                </td>
                <td>{event.caseCount}</td>
                <td>
                  <LastChecked p={event} /> <StaleTag stale={event.stale} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.loading && !events.data && <p role="status">Loading…</p>}
      </div>

      <form className="panel" onSubmit={create} aria-labelledby="new-event-title">
        <h2 id="new-event-title">New situation</h2>
        <div className="form-grid">
          <Field id="ne-label" label="Name shown to visitors">
            <input
              id="ne-label"
              className="input"
              required
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
              }}
            />
          </Field>
          <Field
            id="ne-slug"
            label="Address (lower-case, hyphens)"
            hint="Used in links, for example moving-house."
          >
            <input
              id="ne-slug"
              className="input"
              required
              value={slug}
              aria-describedby="ne-slug-hint"
              onChange={(e) => {
                setSlug(e.target.value);
              }}
            />
          </Field>
          <Field id="ne-place" label="Place">
            <input
              id="ne-place"
              className="input"
              required
              value={place}
              onChange={(e) => {
                setPlace(e.target.value);
              }}
            />
          </Field>
          <Field id="ne-date" label="What the event date means" hint="For example: Date of death.">
            <input
              id="ne-date"
              className="input"
              required
              value={dateLabel}
              aria-describedby="ne-date-hint"
              onChange={(e) => {
                setDateLabel(e.target.value);
              }}
            />
          </Field>
        </div>
        <Field
          id="ne-keywords"
          label="Match words"
          hint="Separate with commas or new lines. A trailing * matches word starts, for example bereav*."
        >
          <textarea
            id="ne-keywords"
            className="input"
            rows={3}
            value={keywords}
            aria-describedby="ne-keywords-hint"
            onChange={(e) => {
              setKeywords(e.target.value);
            }}
          />
        </Field>
        <ProvenanceFields idPrefix="ne" value={prov} onChange={setProv} />
        <ErrorBox error={saver.error} />
        <div className="panel-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={saver.saving}>
            Create situation
          </button>
        </div>
      </form>
    </div>
  );
}
