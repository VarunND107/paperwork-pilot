import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type * as ClientModule from '../api/client';
import { expectNoA11yViolations } from '../test/utils';
import AdminApp from './AdminApp';
import { parseKeywords } from './EventsPage';
import type {
  AdminDocumentRow,
  AdminEventRow,
  AdminOfficeRow,
  AdminStepRow,
  SessionInfo,
} from './types';

// ---- a fake admin API behind the client's `call` ---------------------------------------------

interface Call {
  method: string;
  path: string;
  body: unknown;
}
const fake = vi.hoisted(() => ({
  handler: null as null | ((call: Call) => unknown),
  calls: [] as Call[],
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return {
    ...actual,
    call: (path: string, options?: { method?: string; body?: unknown }) => {
      const entry = { method: options?.method ?? 'GET', path, body: options?.body };
      fake.calls.push(entry);
      return Promise.resolve().then(() => fake.handler?.(entry));
    },
  };
});

type Routes = Record<string, unknown>;

/** Answers `METHOD /path` with a value, or calls a function; unknown requests fail loudly. */
function serve(routes: Routes): void {
  fake.handler = (c) => {
    const key = `${c.method} ${c.path}`;
    if (!(key in routes)) throw new ApiError(404, 'not_found', `Unexpected request: ${key}`);
    const answer = routes[key];
    return typeof answer === 'function' ? (answer as (c: Call) => unknown)(c) : answer;
  };
}

const signedIn: SessionInfo = { enabled: true, authenticated: true };
const prov = {
  sourceUrl: 'https://crsorgi.gov.in/',
  lastVerifiedAt: null,
  verified: false,
  stale: true,
};

function adminStep(over: Partial<AdminStepRow> & { id: string; title: string }): AdminStepRow {
  return {
    eventId: 'e1',
    position: 1,
    form: 'Form 2',
    whereText: 'Ward office',
    officeId: null,
    officeName: null,
    fee: 'Free',
    waitText: 'Same day',
    dueText: 'Within 21 days',
    dueAmount: 21,
    dueUnit: 'DAY',
    needs: [],
    documents: [],
    updatedAt: '2026-10-09T00:00:00.000Z',
    ...prov,
    ...over,
  };
}
const eventRow = (over: Partial<AdminEventRow> = {}): AdminEventRow => ({
  id: 'e1',
  slug: 'death',
  label: 'A parent has passed away',
  place: 'Bengaluru, Karnataka',
  eventDateLabel: 'Date of death',
  keywords: ['died', 'funeral'],
  position: 1,
  stepCount: 3,
  staleStepCount: 3,
  unverifiedStepCount: 3,
  caseCount: 0,
  ...prov,
  ...over,
});

const stepA = adminStep({ id: 's1', title: 'Get the medical certificate', position: 1 });
const stepB = adminStep({
  id: 's2',
  title: 'Register the death',
  position: 2,
  needs: [{ id: 's1', title: 'Get the medical certificate' }],
  documents: [
    {
      id: 'sd1',
      documentId: 'd1',
      documentName: 'Medical certificate',
      role: 'REQUIRES',
      producedByStepId: 's1',
      label: null,
      position: 0,
    },
  ],
  lastVerifiedAt: '2026-10-01T00:00:00.000Z',
  verified: true,
  stale: false,
});
const stepC = adminStep({
  id: 's3',
  title: 'Collect certified copies',
  position: 3,
  needs: [{ id: 's2', title: 'Register the death' }],
});
const docs: AdminDocumentRow[] = [
  { id: 'd1', name: 'Medical certificate', description: null, stepCount: 2, caseCount: 0, ...prov },
  {
    id: 'd2',
    name: 'ID of the applicant',
    description: 'Aadhaar or PAN',
    stepCount: 1,
    caseCount: 0,
    ...prov,
  },
];
const offices: AdminOfficeRow[] = [
  {
    id: 'o1',
    name: 'Ward health office',
    kind: 'OFFICE',
    city: 'Bengaluru',
    address: null,
    url: null,
    hours: null,
    stepCount: 2,
    ...prov,
  },
  {
    id: 'o2',
    name: 'GST portal',
    kind: 'PORTAL',
    city: 'Bengaluru',
    address: null,
    url: 'https://www.gst.gov.in/',
    hours: null,
    stepCount: 1,
    ...prov,
    verified: true,
    stale: false,
    lastVerifiedAt: '2026-10-01T00:00:00.000Z',
  },
];

const baseRoutes: Routes = {
  'GET /admin/session': signedIn,
  'GET /admin/events': { events: [eventRow()] },
  'GET /admin/documents': { documents: docs },
  'GET /admin/offices': { offices },
  'GET /admin/events/e1': { event: eventRow(), steps: [stepA, stepB, stepC] },
  'GET /admin/steps/s2': {
    step: stepB,
    event: { id: 'e1', slug: 'death', label: 'A parent has passed away' },
    siblings: [
      { id: 's1', title: stepA.title, position: 1, needs: [] },
      { id: 's2', title: stepB.title, position: 2, needs: ['s1'] },
      { id: 's3', title: stepC.title, position: 3, needs: ['s2'] },
    ],
  },
};

function renderAdmin(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="admin/*" element={<AdminApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fake.calls.length = 0;
  fake.handler = null;
});

const sent = (method: string, path: string) =>
  fake.calls.filter((c) => c.method === method && c.path === path);

// ---- sign in -----------------------------------------------------------------------------------

describe('Admin: sign in', () => {
  it('says the panel is off when no ADMIN_PASSWORD is set', async () => {
    serve({ 'GET /admin/session': { enabled: false, authenticated: false } });
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Admin panel is off' })).toBeInTheDocument();
    expect(screen.getByText('ADMIN_PASSWORD')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('asks for the password, and shows a wrong password as an alert', async () => {
    const user = userEvent.setup();
    serve({
      'GET /admin/session': { enabled: true, authenticated: false },
      'POST /admin/login': () => {
        throw new ApiError(401, 'invalid_password', 'That password is not right.');
      },
    });
    renderAdmin();
    await user.type(await screen.findByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('signs in and shows the admin navigation', async () => {
    const user = userEvent.setup();
    serve({
      'GET /admin/session': { enabled: true, authenticated: false },
      'POST /admin/login': { ok: true },
      'GET /admin/events': { events: [eventRow()] },
    });
    renderAdmin();
    await user.type(await screen.findByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const nav = await screen.findByRole('navigation', { name: 'Admin' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Situations', 'Documents', 'Offices', 'Tips']);
    expect(sent('POST', '/admin/login')[0]?.body).toEqual({ password: 'secret' });
  });

  it('goes back to the sign-in form when the session ends mid-use', async () => {
    serve({
      ...baseRoutes,
      'GET /admin/events': () => {
        throw new ApiError(401, 'unauthorized', 'Sign in to use the admin panel.');
      },
    });
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument();
  });

  it('signs out', async () => {
    const user = userEvent.setup();
    serve({ ...baseRoutes, 'POST /admin/logout': { ok: true } });
    renderAdmin();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Admin sign in' })).toBeInTheDocument();
    expect(sent('POST', '/admin/logout')).toHaveLength(1);
  });
});

// ---- situations ----------------------------------------------------------------------------------

describe('Admin: situations', () => {
  it('lists situations with how many steps are stale', async () => {
    serve(baseRoutes);
    renderAdmin();
    const link = await screen.findByRole('link', { name: 'A parent has passed away' });
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText('3 stale')).toHaveClass('tag', 'alert');
    expect(within(row).getByText('3 steps not verified')).toBeInTheDocument();
    expect(within(row).getByText('stale')).toBeInTheDocument(); // the situation itself was never checked
  });

  it('creates a situation, sending the source and a cleaned keyword list', async () => {
    const user = userEvent.setup();
    serve({
      ...baseRoutes,
      'POST /admin/events': () => ({ event: eventRow({ id: 'e9', label: 'Getting married' }) }),
      'GET /admin/events/e9': { event: eventRow({ id: 'e9' }), steps: [] },
    });
    renderAdmin();
    await screen.findByRole('link', { name: 'A parent has passed away' });
    await user.type(screen.getByLabelText('Name shown to visitors'), 'Getting married');
    await user.type(screen.getByLabelText(/^Address/), 'marriage');
    await user.type(screen.getByLabelText('Match words'), 'marriage, wedding\nmarri*');
    await user.type(
      screen.getByLabelText('Source link (required)'),
      'https://example.gov.in/marriage',
    );
    await user.click(screen.getByRole('button', { name: 'Create situation' }));
    await waitFor(() => {
      expect(sent('POST', '/admin/events')).toHaveLength(1);
    });
    expect(sent('POST', '/admin/events')[0]?.body).toEqual({
      slug: 'marriage',
      label: 'Getting married',
      place: 'Bengaluru, Karnataka',
      eventDateLabel: 'Date of the event',
      keywords: ['marriage', 'wedding', 'marri*'],
      sourceUrl: 'https://example.gov.in/marriage',
      verified: false,
    });
  });

  it('will not send an edit without a source link', async () => {
    const user = userEvent.setup();
    serve(baseRoutes);
    renderAdmin();
    await screen.findByRole('link', { name: 'A parent has passed away' });
    await user.type(screen.getByLabelText('Name shown to visitors'), 'Getting married');
    await user.type(screen.getByLabelText(/^Address/), 'marriage');
    await user.click(screen.getByRole('button', { name: 'Create situation' }));
    expect(sent('POST', '/admin/events')).toHaveLength(0);
  });

  it('shows a server refusal (for example a duplicate address)', async () => {
    const user = userEvent.setup();
    serve({
      ...baseRoutes,
      'POST /admin/events': () => {
        throw new ApiError(
          409,
          'slug_taken',
          'There is already a situation with the address "death".',
        );
      },
    });
    renderAdmin();
    await screen.findByRole('link', { name: 'A parent has passed away' });
    await user.type(screen.getByLabelText('Name shown to visitors'), 'Again');
    await user.type(screen.getByLabelText(/^Address/), 'death');
    await user.type(screen.getByLabelText('Source link (required)'), 'https://example.gov.in/');
    await user.click(screen.getByRole('button', { name: 'Create situation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already a situation');
  });

  it('shows validation problems field by field', async () => {
    const user = userEvent.setup();
    serve({
      ...baseRoutes,
      'POST /admin/events': () => {
        throw new ApiError(400, 'validation_error', 'The request was not valid.', [
          { path: 'sourceUrl', message: 'Enter a full web address starting with https://' },
        ]);
      },
    });
    renderAdmin();
    await screen.findByRole('link', { name: 'A parent has passed away' });
    await user.type(screen.getByLabelText('Name shown to visitors'), 'X event');
    await user.type(screen.getByLabelText(/^Address/), 'x-event');
    await user.type(screen.getByLabelText('Source link (required)'), 'https://example.gov.in/');
    await user.click(screen.getByRole('button', { name: 'Create situation' }));
    expect(await screen.findByText(/sourceUrl: Enter a full web address/)).toBeInTheDocument();
  });
});

describe('Admin: a situation and its steps (the stale badge)', () => {
  it('flags stale steps and leaves fresh ones alone', async () => {
    serve(baseRoutes);
    renderAdmin('/admin/events/e1');
    const stale = (
      await screen.findByRole('link', { name: 'Get the medical certificate' })
    ).closest('tr') as HTMLElement;
    const fresh = screen
      .getByRole('link', { name: 'Register the death' })
      .closest('tr') as HTMLElement;
    expect(within(stale).getByText('stale')).toHaveClass('tag', 'alert');
    expect(within(stale).getByText('not verified')).toBeInTheDocument();
    expect(within(stale).getByText('never')).toBeInTheDocument();
    expect(within(fresh).queryByText('stale')).not.toBeInTheDocument();
    expect(within(fresh).getByText('verified')).toHaveClass('tag', 'ok');
    expect(within(fresh).getByText('Get the medical certificate')).toBeInTheDocument(); // "waits for"
  });

  it('adds a step and goes to its editor', async () => {
    const user = userEvent.setup();
    serve({
      ...baseRoutes,
      'POST /admin/events/e1/steps': () => ({ step: adminStep({ id: 's2', title: 'New step' }) }),
    });
    renderAdmin('/admin/events/e1');
    await screen.findByRole('link', { name: 'Register the death' });
    for (const [label, value] of [
      ['Title', 'New step'],
      ['Form', 'Form'],
      ['Where (office or portal)', 'Ward'],
      ['Fee', 'Free'],
      ['Typical wait', 'A day'],
      ['Deadline wording', 'Soon'],
    ] as const) {
      await user.type(
        screen.getByLabelText(label, {
          selector: '#as-title, #as-form, #as-where, #as-fee, #as-wait, #as-due',
        }),
        value,
      );
    }
    await user.type(
      screen.getAllByLabelText('Source link (required)')[0] as HTMLElement,
      'https://example.gov.in/x',
    );
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    await waitFor(() => {
      expect(sent('POST', '/admin/events/e1/steps')).toHaveLength(1);
    });
    expect(sent('POST', '/admin/events/e1/steps')[0]?.body).toMatchObject({
      title: 'New step',
      verified: false,
      sourceUrl: 'https://example.gov.in/x',
    });
  });

  it('refuses to delete a situation that has cases and shows why', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    serve({
      ...baseRoutes,
      'DELETE /admin/events/e1': () => {
        throw new ApiError(
          409,
          'event_in_use',
          '2 cases use this situation, so it cannot be deleted.',
        );
      },
    });
    renderAdmin('/admin/events/e1');
    await user.click(await screen.findByRole('button', { name: 'Delete situation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('2 cases use this situation');
  });
});

// ---- the step editor ---------------------------------------------------------------------------

describe('Admin: the step editor', () => {
  async function openEditor() {
    serve({ ...baseRoutes });
    const view = renderAdmin('/admin/steps/s2');
    await screen.findByRole('heading', { level: 1, name: 'Register the death' });
    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Register the death');
    });
    return view;
  }

  it('shows the step with its current values, freshness and the other steps to wait for', async () => {
    await openEditor();
    expect(screen.getByLabelText('Form')).toHaveValue('Form 2');
    expect(screen.getByLabelText('Amount')).toHaveValue(21);
    expect(screen.getByLabelText(/^Unit/)).toHaveValue('DAY');
    const needs = screen.getByRole('group', { name: 'Steps this step waits for' });
    expect(within(needs).getByLabelText('1. Get the medical certificate')).toBeChecked();
    expect(within(needs).getByLabelText('3. Collect certified copies')).not.toBeChecked();
    expect(within(needs).queryByLabelText(/2\. Register the death/)).not.toBeInTheDocument(); // not itself
    expect(screen.getByLabelText('Document 1')).toHaveValue('d1');
    expect(screen.getByLabelText('Comes from step')).toHaveValue('s1');
  });

  it('never ticks "verified" by itself', async () => {
    await openEditor();
    expect(
      screen.getByRole('checkbox', { name: /I checked this against the source/ }),
    ).not.toBeChecked();
    expect(screen.getByLabelText('Source link (required)')).toHaveValue('https://crsorgi.gov.in/');
  });

  it('saves with the source, the verified flag, dependencies and documents', async () => {
    const user = userEvent.setup();
    await openEditor();
    fake.handler = (c) => {
      if (c.method === 'PATCH')
        return { step: { ...stepB, fee: 'Rs 10', verified: true, stale: false } };
      return undefined;
    };
    await user.clear(screen.getByLabelText('Fee'));
    await user.type(screen.getByLabelText('Fee'), 'Rs 10');
    await user.click(screen.getByLabelText('3. Collect certified copies'));
    await user.clear(screen.getByLabelText('Source link (required)'));
    await user.type(screen.getByLabelText('Source link (required)'), 'https://example.gov.in/fee');
    await user.click(screen.getByRole('checkbox', { name: /I checked this against the source/ }));
    await user.click(screen.getByRole('button', { name: 'Save step' }));

    expect(await screen.findByText('Saved. Last checked is now today.')).toBeInTheDocument();
    const patch = sent('PATCH', '/admin/steps/s2')[0]?.body as Record<string, unknown>;
    expect(patch).toMatchObject({
      title: 'Register the death',
      fee: 'Rs 10',
      officeId: null,
      dueAmount: 21,
      dueUnit: 'DAY',
      position: 2,
      needs: ['s1', 's3'],
      sourceUrl: 'https://example.gov.in/fee',
      verified: true,
    });
    expect(patch.documents).toEqual([
      { documentId: 'd1', role: 'REQUIRES', producedByStepId: 's1', label: null },
    ]);
  });

  it('will not save without a source link', async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.clear(screen.getByLabelText('Source link (required)'));
    await user.click(screen.getByRole('button', { name: 'Save step' }));
    expect(sent('PATCH', '/admin/steps/s2')).toHaveLength(0);
  });

  it('blocks a dependency loop with a clear message and the path, keeping the edits', async () => {
    const user = userEvent.setup();
    await openEditor();
    fake.handler = (c) => {
      if (c.method === 'PATCH') {
        throw new ApiError(
          409,
          'dependency_cycle',
          'Not saved: this would create a loop. "Register the death" needs "Collect certified copies", which needs "Register the death". A step cannot depend, even indirectly, on itself. Remove one of these dependencies.',
          {
            cycle: ['s2', 's3', 's2'],
            titles: ['Register the death', 'Collect certified copies', 'Register the death'],
          },
        );
      }
      return undefined;
    };
    await user.click(screen.getByLabelText('3. Collect certified copies'));
    await user.click(screen.getByRole('button', { name: 'Save step' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not saved: this would create a loop.');
    const loop = within(alert).getByRole('list', { name: 'The loop' });
    expect(
      within(loop)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Register the death', 'Collect certified copies', 'Register the death']);
    expect(screen.queryByText('Saved. Last checked is now today.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('3. Collect certified copies')).toBeChecked(); // the edit is still there
  });

  it('explains a document that can never be held', async () => {
    const user = userEvent.setup();
    await openEditor();
    fake.handler = () => {
      throw new ApiError(
        409,
        'document_not_upstream',
        'Not saved: "Register the death" asks for "Medical certificate", which only comes from a step it does not wait for.',
      );
    };
    await user.click(screen.getByLabelText('1. Get the medical certificate'));
    await user.click(screen.getByRole('button', { name: 'Save step' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'only comes from a step it does not wait for',
    );
  });

  it('adds and removes document rows', async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.click(screen.getByRole('button', { name: 'Add a document' }));
    expect(screen.getByLabelText('Document 2')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Document 2'), 'd2');
    await user.type(
      screen.getAllByLabelText('Wording on this step (optional)')[1] as HTMLElement,
      'ID card',
    );
    fake.handler = () => ({ step: stepB });
    await user.click(screen.getByRole('button', { name: 'Save step' }));
    await screen.findByText('Saved. Last checked is now today.');
    expect(
      (sent('PATCH', '/admin/steps/s2')[0]?.body as { documents: unknown[] }).documents,
    ).toEqual([
      { documentId: 'd1', role: 'REQUIRES', producedByStepId: 's1', label: null },
      { documentId: 'd2', role: 'REQUIRES', producedByStepId: null, label: 'ID card' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Remove document 1' }));
    expect(screen.queryByLabelText('Document 2')).not.toBeInTheDocument();
  });

  it('hides "comes from" for a document the step hands over', async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.selectOptions(screen.getByLabelText('Role'), 'PRODUCES');
    expect(screen.queryByLabelText('Comes from step')).not.toBeInTheDocument();
  });

  it('clears the deadline when the unit is cleared', async () => {
    const user = userEvent.setup();
    await openEditor();
    fake.handler = () => ({ step: stepB });
    await user.clear(screen.getByLabelText('Amount'));
    await user.selectOptions(screen.getByLabelText(/^Unit/), '');
    await user.click(screen.getByRole('button', { name: 'Save step' }));
    await screen.findByText('Saved. Last checked is now today.');
    expect(sent('PATCH', '/admin/steps/s2')[0]?.body).toMatchObject({
      dueAmount: null,
      dueUnit: null,
    });
  });

  it('has no accessibility violations', async () => {
    const { container } = await openEditor();
    await expectNoA11yViolations(container);
  });
});

// ---- documents and offices ----------------------------------------------------------------------

describe('Admin: documents', () => {
  it('lists documents with usage, and creates one with a source', async () => {
    const user = userEvent.setup();
    serve({
      ...baseRoutes,
      'POST /admin/documents': () => ({ document: docs[0] }),
    });
    renderAdmin('/admin/documents');
    expect(
      await screen.findByRole('rowheader', { name: 'Medical certificate' }),
    ).toBeInTheDocument();
    expect(screen.getByText('2 step entries')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New document' }));
    await user.type(screen.getByLabelText('Name'), 'Ration card');
    await user.type(
      screen.getByLabelText('Source link (required)'),
      'https://example.gov.in/ration',
    );
    await user.click(screen.getByRole('button', { name: 'Save document' }));
    await waitFor(() => {
      expect(sent('POST', '/admin/documents')).toHaveLength(1);
    });
    expect(sent('POST', '/admin/documents')[0]?.body).toEqual({
      name: 'Ration card',
      description: null,
      sourceUrl: 'https://example.gov.in/ration',
      verified: false,
    });
  });

  it('shows why a document in use cannot be deleted', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    serve({
      ...baseRoutes,
      'DELETE /admin/documents/d1': () => {
        throw new ApiError(
          409,
          'document_in_use',
          '"Medical certificate" is used by 2 step entries. Remove it from those steps first.',
        );
      },
    });
    renderAdmin('/admin/documents');
    await user.click(await screen.findByRole('button', { name: 'Edit Medical certificate' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('is used by 2 step entries');
  });
});

describe('Admin: offices', () => {
  it('lists offices and portals with their status', async () => {
    serve(baseRoutes);
    renderAdmin('/admin/offices');
    const ward = (await screen.findByRole('rowheader', { name: /Ward health office/ })).closest(
      'tr',
    ) as HTMLElement;
    const gst = screen.getByRole('rowheader', { name: /GST portal/ }).closest('tr') as HTMLElement;
    expect(within(ward).getByText('stale')).toBeInTheDocument();
    expect(within(gst).getByText('verified')).toBeInTheDocument();
    expect(within(gst).getByText('Portal')).toBeInTheDocument();
  });

  it('edits an office, sending empty optional fields as null', async () => {
    const user = userEvent.setup();
    serve({ ...baseRoutes, 'PATCH /admin/offices/o1': () => ({ office: offices[0] }) });
    renderAdmin('/admin/offices');
    await user.click(await screen.findByRole('button', { name: 'Edit Ward health office' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Ward health office');
    await user.clear(screen.getByLabelText('Source link (required)'));
    await user.type(screen.getByLabelText('Source link (required)'), 'https://bbmp.gov.in/');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(sent('PATCH', '/admin/offices/o1')).toHaveLength(1);
    });
    expect(sent('PATCH', '/admin/offices/o1')[0]?.body).toEqual({
      name: 'Ward health office',
      kind: 'OFFICE',
      city: 'Bengaluru',
      address: null,
      url: null,
      hours: null,
      sourceUrl: 'https://bbmp.gov.in/',
      verified: false,
    });
  });
});

describe('parseKeywords', () => {
  it('splits on commas and new lines and drops blanks', () => {
    expect(parseKeywords(' a, b\n\nc ,, ')).toEqual(['a', 'b', 'c']);
    expect(parseKeywords('')).toEqual([]);
  });
});

describe('Admin: accessibility', () => {
  it('has no axe violations on the situations list', async () => {
    serve(baseRoutes);
    const { container } = renderAdmin('/admin/events');
    await screen.findByRole('link', { name: 'A parent has passed away' });
    await expectNoA11yViolations(container);
  });

  it('has no axe violations on a situation page', async () => {
    serve(baseRoutes);
    const { container } = renderAdmin('/admin/events/e1');
    await screen.findByRole('link', { name: 'Register the death' });
    await expectNoA11yViolations(container);
  });

  it('has no axe violations on the sign-in form', async () => {
    serve({ 'GET /admin/session': { enabled: true, authenticated: false } });
    const { container } = renderAdmin();
    await screen.findByLabelText('Password');
    await expectNoA11yViolations(container);
  });
});
