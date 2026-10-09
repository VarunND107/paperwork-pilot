import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { caseStore } from '../api/caseStore';
import { api, ApiError, proApi } from '../api/client';
import type { ClientList, ClientRow, MemberView } from '../api/types';
import { AppDataProvider } from '../state/AppData';
import { allEvents } from '../test/fixtures';
import { expectNoA11yViolations } from '../test/utils';
import ProApp from './ProApp';

const KEY = 'pp_member_abcdefghijklmnopqrstuvwxyz0123456789';
const owner: MemberView = {
  id: 'm1',
  name: 'Meera Rao',
  email: 'meera@example.com',
  role: 'OWNER',
  createdAt: '2026-10-01T00:00:00.000Z',
};
const colleague: MemberView = {
  ...owner,
  id: 'm2',
  name: 'Dev Nair',
  email: 'dev@example.com',
  role: 'MEMBER',
};
const org = { id: 'o1', name: 'Rao & Co' };

const overdueRow: ClientRow = {
  id: 'c1',
  clientName: 'Chandra Late',
  event: { id: 'e1', slug: 'death', label: 'A parent has passed away' },
  eventDate: '2026-08-30',
  startedAt: '2026-09-01T00:00:00.000Z',
  progress: { done: 1, total: 6 },
  status: 'overdue',
  next: { id: 's2', number: 2, title: 'Register the death', deadline: '2026-09-20', daysLeft: -19 },
  missingDocuments: [],
  overdueSteps: 2,
};
const docRow: ClientRow = {
  ...overdueRow,
  id: 'c2',
  clientName: 'Anil Docs',
  eventDate: null,
  status: 'needs_document',
  progress: { done: 0, total: 6 },
  next: {
    id: 's1',
    number: 1,
    title: 'Get the medical certificate',
    deadline: null,
    daysLeft: null,
  },
  missingDocuments: ['Hospital discharge or death summary', 'ID of the person who died'],
  overdueSteps: 0,
};
const calmRow: ClientRow = {
  ...overdueRow,
  id: 'c3',
  clientName: 'Zed Calm',
  eventDate: null,
  status: 'on_track',
  progress: { done: 6, total: 6 },
  next: null,
  missingDocuments: [],
  overdueSteps: 0,
};
const list = (clients: ClientRow[], total = clients.length): ClientList => ({
  clients,
  counts: {
    all: clients.length,
    onTrack: clients.filter((c) => c.status === 'on_track').length,
    needsDocument: clients.filter((c) => c.status === 'needs_document').length,
    overdue: clients.filter((c) => c.status === 'overdue').length,
  },
  total,
  truncated: false,
});

function mockServer(proEnabled = true) {
  vi.spyOn(api, 'events').mockResolvedValue(allEvents);
  vi.spyOn(api, 'config').mockResolvedValue({
    proEnabled,
    adminEnabled: false,
    staleAfterDays: 90,
    disclaimer: 'Guidance, not legal advice.',
    emailProvider: 'console',
  });
}

function renderPro(path = '/pro') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppDataProvider>
        <Routes>
          <Route path="/pro/*" element={<ProApp />} />
          <Route path="/" element={<p>Landing</p>} />
        </Routes>
      </AppDataProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('Pro: switched off', () => {
  it('says the plan is not switched on, and offers a way back', async () => {
    mockServer(false);
    renderPro();
    expect(
      await screen.findByRole('heading', { name: 'The professional plan is not switched on' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute('href', '/');
  });
});

describe('Pro: signing in', () => {
  beforeEach(() => {
    mockServer();
  });

  it('offers to start an organisation or sign in, and is honest that it is an interim sign-in', async () => {
    const { container } = renderPro();
    expect(
      await screen.findByRole('heading', { name: 'Start an organisation' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in with an access key' })).toBeInTheDocument();
    expect(screen.getByText(/there is no email login yet/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('creates an organisation, shows the access key once, and opens the dashboard', async () => {
    const signUp = vi.spyOn(proApi, 'signUp').mockResolvedValue({ token: KEY, org, member: owner });
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: owner, org });
    vi.spyOn(proApi, 'clients').mockResolvedValue(list([]));
    const user = userEvent.setup();
    renderPro();
    await user.type(await screen.findByLabelText('Organisation name'), 'Rao & Co');
    await user.type(screen.getByLabelText('Your name'), 'Meera Rao');
    await user.type(screen.getByLabelText('Your email'), 'meera@example.com');
    await user.click(screen.getByRole('button', { name: 'Create organisation' }));

    expect(signUp).toHaveBeenCalledWith({
      orgName: 'Rao & Co',
      name: 'Meera Rao',
      email: 'meera@example.com',
    });
    expect(await screen.findByRole('heading', { name: 'Your access key' })).toBeInTheDocument();
    expect(screen.getByLabelText('Access key')).toHaveValue(KEY);
    expect(caseStore.memberKey()).toBe(KEY);
    expect(screen.getByRole('heading', { name: 'Clients' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'I have saved it' }));
    expect(screen.queryByRole('heading', { name: 'Your access key' })).not.toBeInTheDocument();
  });

  it('shows what the server refused when starting an organisation', async () => {
    vi.spyOn(proApi, 'signUp').mockRejectedValue(
      new ApiError(400, 'validation_error', 'The request was not valid.', [
        { path: 'email', message: 'Enter a valid email address.' },
      ]),
    );
    const user = userEvent.setup();
    renderPro();
    await user.type(await screen.findByLabelText('Organisation name'), 'Rao & Co');
    await user.type(screen.getByLabelText('Your name'), 'Meera');
    await user.type(screen.getByLabelText('Your email'), 'meera@example.com');
    await user.click(screen.getByRole('button', { name: 'Create organisation' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(caseStore.memberKey()).toBeNull();
  });

  it('signs in with an access key', async () => {
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: colleague, org });
    vi.spyOn(proApi, 'clients').mockResolvedValue(list([]));
    const user = userEvent.setup();
    renderPro();
    await user.type(await screen.findByLabelText('Access key'), `  ${KEY}  `);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument();
    expect(caseStore.memberKey()).toBe(KEY);
    // A key typed in is not shown again.
    expect(screen.queryByRole('heading', { name: 'Your access key' })).not.toBeInTheDocument();
  });

  it('says so when the access key is wrong', async () => {
    vi.spyOn(proApi, 'me').mockRejectedValue(new ApiError(401, 'unauthorized', 'nope'));
    const user = userEvent.setup();
    renderPro();
    await user.type(await screen.findByLabelText('Access key'), 'pp_member_wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('That access key is not valid.')).toBeInTheDocument();
    expect(caseStore.memberKey()).toBeNull();
  });

  it('forgets a stored key the server no longer accepts, and says why', async () => {
    caseStore.setMemberKey(KEY);
    vi.spyOn(proApi, 'me').mockRejectedValue(new ApiError(401, 'unauthorized', 'nope'));
    renderPro();
    expect(
      await screen.findByText('That access key is no longer valid. Sign in again.'),
    ).toBeInTheDocument();
    expect(caseStore.memberKey()).toBeNull();
  });

  it('offers a retry when the server cannot be reached', async () => {
    caseStore.setMemberKey(KEY);
    const me = vi
      .spyOn(proApi, 'me')
      .mockRejectedValueOnce(new ApiError(0, 'network', 'offline'))
      .mockResolvedValue({ member: owner, org });
    vi.spyOn(proApi, 'clients').mockResolvedValue(list([]));
    const user = userEvent.setup();
    renderPro();
    await screen.findByText(/could not load the professional plan/);
    expect(caseStore.memberKey()).toBe(KEY);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument();
    expect(me).toHaveBeenCalledTimes(2);
  });

  it('signs out by forgetting the key in this browser', async () => {
    caseStore.setMemberKey(KEY);
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: owner, org });
    vi.spyOn(proApi, 'clients').mockResolvedValue(list([]));
    const user = userEvent.setup();
    renderPro();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', { name: 'Start an organisation' }),
    ).toBeInTheDocument();
    expect(caseStore.memberKey()).toBeNull();
  });
});

describe('Pro: the dashboard', () => {
  let clients: MockInstance<typeof proApi.clients>;
  beforeEach(() => {
    mockServer();
    caseStore.setMemberKey(KEY);
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: owner, org });
    clients = vi.spyOn(proApi, 'clients').mockResolvedValue(list([overdueRow, docRow, calmRow]));
  });

  it('shows each client with progress, the next step and a status pill', async () => {
    renderPro();
    await screen.findByText('Chandra Late');
    const rows = screen.getAllByRole('listitem');
    const row = (name: string) => rows.find((r) => within(r).queryByRole('link', { name }))!;

    const late = row('Chandra Late');
    expect(within(late).getByText('1 of 6 steps')).toBeInTheDocument();
    expect(within(late).getByText('Register the death')).toBeInTheDocument();
    expect(within(late).getByText('19 days overdue')).toBeInTheDocument();
    expect(within(late).getByText('Overdue')).toBeInTheDocument();
    expect(within(late).getByRole('link', { name: 'Chandra Late' })).toHaveAttribute(
      'href',
      '/pro/clients/c1',
    );

    const docs = row('Anil Docs');
    expect(within(docs).getByText('Needs document')).toBeInTheDocument();
    expect(
      within(docs).getByText(
        'Needs: Hospital discharge or death summary; ID of the person who died',
      ),
    ).toBeInTheDocument();

    const calm = row('Zed Calm');
    expect(within(calm).getByText('On track')).toBeInTheDocument();
    expect(within(calm).getByText('Route complete')).toBeInTheDocument();
    expect(screen.getByText('1 on track · 1 need a document · 1 overdue')).toBeInTheDocument();
    expect(screen.getByText('3 clients')).toBeInTheDocument();
  });

  it('asks the server for "needs attention" and goes back to all clients', async () => {
    const user = userEvent.setup();
    renderPro();
    await screen.findByText('Chandra Late');
    expect(screen.getByRole('button', { name: 'All clients' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    clients.mockResolvedValue(list([overdueRow, docRow], 3));
    await user.click(screen.getByRole('button', { name: 'Needs attention' }));
    await waitFor(() => {
      expect(clients).toHaveBeenLastCalledWith(KEY, { filter: 'attention' }, expect.anything());
    });
    expect(screen.getByRole('button', { name: 'Needs attention' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByText('2 clients')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All clients' }));
    await waitFor(() => {
      expect(clients).toHaveBeenLastCalledWith(KEY, {}, expect.anything());
    });
  });

  it('filters by status and by situation', async () => {
    const user = userEvent.setup();
    renderPro();
    await screen.findByText('Chandra Late');
    await user.selectOptions(screen.getByLabelText('Status'), 'overdue');
    await waitFor(() => {
      expect(clients).toHaveBeenLastCalledWith(KEY, { status: 'overdue' }, expect.anything());
    });
    await user.selectOptions(
      screen.getByLabelText('Situation', { selector: '#pro-situation' }),
      'move',
    );
    await waitFor(() => {
      expect(clients).toHaveBeenLastCalledWith(
        KEY,
        { status: 'overdue', event: 'move' },
        expect.anything(),
      );
    });
  });

  it('searches by name once typing pauses', async () => {
    const user = userEvent.setup();
    renderPro();
    await screen.findByText('Chandra Late');
    await user.type(screen.getByLabelText('Search clients'), 'anil');
    await waitFor(() => {
      expect(clients).toHaveBeenLastCalledWith(KEY, { q: 'anil' }, expect.anything());
    });
  });

  it('explains an empty list, and a list emptied by filters', async () => {
    clients.mockResolvedValue(list([], 0));
    const view = renderPro();
    expect(await screen.findByText('No clients yet. Add the first one below.')).toBeInTheDocument();
    view.unmount();

    clients.mockResolvedValue(list([], 5));
    const user = userEvent.setup();
    renderPro();
    await user.click(await screen.findByRole('button', { name: 'Needs attention' }));
    expect(await screen.findByText('No clients match these filters.')).toBeInTheDocument();
  });

  it('adds a client and opens their route', async () => {
    const add = vi
      .spyOn(proApi, 'addClient')
      .mockResolvedValue({ ...docRow, id: 'new1', clientName: 'Nisha Rao' });
    vi.spyOn(proApi, 'client').mockResolvedValue({
      ...docRow,
      id: 'new1',
      clientName: 'Nisha Rao',
    });
    const user = userEvent.setup();
    renderPro();
    await screen.findByText('Chandra Late');
    await user.type(screen.getByLabelText('Client name'), 'Nisha Rao');
    await user.selectOptions(
      screen.getByLabelText('Situation', { selector: '#pro-client-event' }),
      'death',
    );
    await user.type(screen.getByLabelText('Date (optional)'), '2026-09-20');
    await user.click(screen.getByRole('button', { name: 'Add client' }));
    await waitFor(() => {
      expect(add).toHaveBeenCalledWith(KEY, {
        clientName: 'Nisha Rao',
        eventId: 'death',
        eventDate: '2026-09-20',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Nisha Rao' })).toBeInTheDocument();
  });

  it('shows why a client could not be added', async () => {
    vi.spyOn(proApi, 'addClient').mockRejectedValue(
      new ApiError(400, 'invalid_event_date', 'That date looks wrong.'),
    );
    const user = userEvent.setup();
    renderPro();
    await screen.findByText('Chandra Late');
    await user.type(screen.getByLabelText('Client name'), 'Nisha Rao');
    await user.selectOptions(
      screen.getByLabelText('Situation', { selector: '#pro-client-event' }),
      'death',
    );
    await user.click(screen.getByRole('button', { name: 'Add client' }));
    expect(await screen.findByText('That date looks wrong.')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPro();
    await screen.findByText('Chandra Late');
    await expectNoA11yViolations(container);
  });
});

describe('Pro: the team', () => {
  beforeEach(() => {
    mockServer();
    caseStore.setMemberKey(KEY);
    vi.spyOn(proApi, 'clients').mockResolvedValue(list([]));
  });

  it("lets an owner add a colleague, and shows that colleague's key once", async () => {
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: owner, org });
    const members = vi.spyOn(proApi, 'members').mockResolvedValue([owner]);
    const add = vi
      .spyOn(proApi, 'addMember')
      .mockResolvedValue({ token: 'pp_member_colleague-key-0123456789', member: colleague });
    const user = userEvent.setup();
    renderPro('/pro/team');
    expect(await screen.findByText(/\(you\)/)).toBeInTheDocument();
    members.mockResolvedValue([owner, colleague]);
    await user.type(screen.getByLabelText('Name'), 'Dev Nair');
    await user.type(screen.getByLabelText('Email'), 'dev@example.com');
    await user.click(screen.getByRole('button', { name: 'Add colleague' }));
    expect(add).toHaveBeenCalledWith(KEY, { name: 'Dev Nair', email: 'dev@example.com' });
    expect(
      await screen.findByText('Dev Nair was added. Give them this access key now.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Access key')).toHaveValue('pp_member_colleague-key-0123456789');
    expect(await screen.findByRole('button', { name: 'Remove Dev Nair' })).toBeInTheDocument();
  });

  it('removes a colleague after confirming, and never offers to remove yourself', async () => {
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: owner, org });
    const members = vi.spyOn(proApi, 'members').mockResolvedValue([owner, colleague]);
    const remove = vi.spyOn(proApi, 'removeMember').mockResolvedValue(undefined);
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const user = userEvent.setup();
    renderPro('/pro/team');
    const button = await screen.findByRole('button', { name: 'Remove Dev Nair' });
    expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(1);
    await user.click(button);
    expect(remove).not.toHaveBeenCalled();
    members.mockResolvedValue([owner]);
    await user.click(button);
    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith(KEY, 'm2');
    });
    expect(await screen.findByText('Dev Nair was removed.')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('keeps adding and removing to owners', async () => {
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: colleague, org });
    vi.spyOn(proApi, 'members').mockResolvedValue([owner, colleague]);
    renderPro('/pro/team');
    expect(await screen.findByText('Only an owner can add or remove people.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add colleague' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('replaces the access key and stores the new one', async () => {
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: owner, org });
    vi.spyOn(proApi, 'members').mockResolvedValue([owner]);
    const rotate = vi
      .spyOn(proApi, 'rotateKey')
      .mockResolvedValue({ token: 'pp_member_rotated-key-0123456789' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPro('/pro/team');
    await user.click(await screen.findByRole('button', { name: 'Replace my access key' }));
    await waitFor(() => {
      expect(rotate).toHaveBeenCalledWith(KEY);
    });
    expect(await screen.findByLabelText('Access key')).toHaveValue(
      'pp_member_rotated-key-0123456789',
    );
    expect(caseStore.memberKey()).toBe('pp_member_rotated-key-0123456789');
  });

  it('has no accessibility violations', async () => {
    vi.spyOn(proApi, 'me').mockResolvedValue({ member: owner, org });
    vi.spyOn(proApi, 'members').mockResolvedValue([owner, colleague]);
    const { container } = renderPro('/pro/team');
    await screen.findByRole('button', { name: 'Remove Dev Nair' });
    await expectNoA11yViolations(container);
  });
});
