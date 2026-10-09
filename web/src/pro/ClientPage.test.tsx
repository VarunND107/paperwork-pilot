import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, proApi } from '../api/client';
import type { ClientRow } from '../api/types';
import { AppDataProvider } from '../state/AppData';
import { allEvents, freshCase } from '../test/fixtures';
import { ProContext } from './ProContext';
import { ClientPage } from './ClientPage';

const KEY = 'pp_member_abcdefghijklmnopqrstuvwxyz0123456789';
const row: ClientRow = {
  id: 'case-1',
  clientName: 'Anita Kumar',
  event: { id: 'e1', slug: 'death', label: 'A parent has passed away' },
  eventDate: null,
  startedAt: '2026-10-01T00:00:00.000Z',
  progress: { done: 0, total: 3 },
  status: 'needs_document',
  next: null,
  missingDocuments: [],
  overdueSteps: 0,
};

function renderClient() {
  return render(
    <MemoryRouter initialEntries={['/pro/clients/case-1']}>
      <AppDataProvider>
        <ProContext.Provider
          value={{
            key: KEY,
            member: {
              id: 'm1',
              name: 'Meera',
              email: 'm@example.com',
              role: 'OWNER',
              createdAt: '2026-10-01T00:00:00.000Z',
            },
            org: { id: 'o1', name: 'Rao & Co' },
            signOut: vi.fn(),
            replaceKey: vi.fn(),
          }}
        >
          <Routes>
            <Route path="/pro/clients/:id" element={<ClientPage />} />
            <Route path="/pro" element={<p>Dashboard</p>} />
          </Routes>
        </ProContext.Provider>
      </AppDataProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(api, 'events').mockResolvedValue(allEvents);
  vi.spyOn(api, 'config').mockResolvedValue({
    proEnabled: true,
    adminEnabled: false,
    staleAfterDays: 90,
    disclaimer: 'Guidance, not legal advice.',
    emailProvider: 'console',
  });
});

describe('ClientPage', () => {
  it("opens the client's route with the member's access key", async () => {
    vi.spyOn(proApi, 'client').mockResolvedValue(row);
    const getCase = vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    renderClient();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Anita Kumar' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(getCase).toHaveBeenCalledWith('case-1', KEY, expect.anything());
    });
    expect(
      await screen.findByRole('heading', { level: 3, name: 'Get the medical certificate' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All clients/ })).toHaveAttribute('href', '/pro');
  });

  it('renames the client', async () => {
    vi.spyOn(proApi, 'client').mockResolvedValue(row);
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    const rename = vi
      .spyOn(proApi, 'renameClient')
      .mockResolvedValue({ ...row, clientName: 'Anita K.' });
    const user = userEvent.setup();
    renderClient();
    const input = await screen.findByLabelText('Client name');
    await waitFor(() => {
      expect(input).toHaveValue('Anita Kumar');
    });
    await user.clear(input);
    await user.type(input, 'Anita K.');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => {
      expect(rename).toHaveBeenCalledWith(KEY, 'case-1', 'Anita K.');
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Anita K.' })).toBeInTheDocument();
    expect(screen.getByText('Name saved.')).toBeInTheDocument();
  });

  it('deletes the client after confirming and goes back to the dashboard', async () => {
    vi.spyOn(proApi, 'client').mockResolvedValue(row);
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    const del = vi.spyOn(api, 'deleteCase').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    renderClient();
    const button = await screen.findByRole('button', { name: 'Delete this client' });
    await user.click(button);
    expect(del).not.toHaveBeenCalled();
    await user.click(button);
    await waitFor(() => {
      expect(del).toHaveBeenCalledWith('case-1', KEY);
    });
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('says so when the client does not exist, or belongs to another organisation', async () => {
    vi.spyOn(proApi, 'client').mockRejectedValue(
      new ApiError(404, 'not_found', 'There is no such client.'),
    );
    vi.spyOn(api, 'getCase').mockRejectedValue(new ApiError(404, 'not_found', 'Case not found.'));
    renderClient();
    expect(
      await screen.findByRole('heading', { name: 'We could not find this client' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All clients' })).toHaveAttribute('href', '/pro');
  });
});
