import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { caseStore } from '../api/caseStore';
import { App } from '../App';
import { allEvents, freshCase, moveEvent } from '../test/fixtures';
import { expectNoA11yViolations } from '../test/utils';

const TOKEN = 'pp_case_token_0123456789abcdef';

function mockApi() {
  vi.spyOn(api, 'events').mockResolvedValue(allEvents);
  vi.spyOn(api, 'config').mockResolvedValue({
    proEnabled: false,
    adminEnabled: false,
    staleAfterDays: 90,
    disclaimer: 'Guidance, not legal advice.',
    emailProvider: 'console',
  });
  const create = vi.spyOn(api, 'createCase').mockImplementation((eventId) =>
    Promise.resolve({
      token: `${TOKEN}-${eventId}`,
      case: freshCase({
        id: `case-${eventId}`,
        event: allEvents.find((e) => e.slug === eventId) ?? allEvents[0]!,
      }),
    }),
  );
  const get = vi.spyOn(api, 'getCase').mockImplementation((id) =>
    Promise.resolve(
      freshCase({
        id,
        event: allEvents.find((e) => `case-${e.slug}` === id) ?? allEvents[0]!,
      }),
    ),
  );
  return { create, get };
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('LandingPage: the live demo runs on a real, persisted case', () => {
  it('shows the hero, the disclaimer, and the situations as chips', async () => {
    mockApi();
    renderApp();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Know the order before you join the queue.' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'A parent has passed away' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Moving to Bengaluru with a toddler' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not legal advice/i, { selector: 'footer p' })).toBeInTheDocument();
  });

  it('creates a case through the API on first visit and remembers its token', async () => {
    const { create } = mockApi();
    renderApp();
    await screen.findByRole('list', { name: 'Steps in order' });
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Get the medical certificate/ }).length,
      ).toBeGreaterThan(0);
    });
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith('death');
    expect(caseStore.demoSession('death')).toEqual({ id: 'case-death', token: `${TOKEN}-death` });
  });

  it('picks the same case up again on the next visit instead of creating another', async () => {
    const { create, get } = mockApi();
    caseStore.save('case-death', 'stored-token-0123456789');
    caseStore.setDemo('death', 'case-death');
    renderApp();
    await waitFor(() => {
      expect(get).toHaveBeenCalledWith(
        'case-death',
        'stored-token-0123456789',
        expect.any(AbortSignal),
      );
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('makes a fresh case when the stored one has disappeared', async () => {
    const { create, get } = mockApi();
    caseStore.save('case-death', 'stored-token-0123456789');
    caseStore.setDemo('death', 'case-death');
    get.mockRejectedValueOnce(new ApiError(404, 'not_found', 'Case not found.'));
    renderApp();
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith('death');
    });
    await waitFor(() => {
      expect(screen.getByText('0 of 3 steps done')).toBeInTheDocument();
    });
    expect(caseStore.getToken('case-death')).toBe(`${TOKEN}-death`);
  });

  it('switches situation from a chip and runs a separate case for it', async () => {
    const { create } = mockApi();
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('button', { name: 'Moving to Bengaluru with a toddler' });
    await user.click(screen.getByRole('button', { name: 'Moving to Bengaluru with a toddler' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith('move');
    });
    expect(
      screen.getByRole('button', { name: 'Moving to Bengaluru with a toddler' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('pp:last-event')).toBe('move');
  });

  it('opens a described situation (free text) through POST /match', async () => {
    const { create } = mockApi();
    vi.spyOn(api, 'match').mockResolvedValue({
      matched: moveEvent,
      candidates: [{ event: moveEvent, score: 3 }],
      suggestions: [],
    });
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('button', { name: 'A parent has passed away' });
    await user.type(
      screen.getByLabelText("What's happening in your life?"),
      'moving with a toddler{Enter}',
    );
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith('move');
    });
    expect(
      await screen.findByText('Route ready for: Moving to Bengaluru with a toddler.'),
    ).toBeInTheDocument();
  });

  it('links to the full page of the demo case', async () => {
    mockApi();
    renderApp();
    const link = await screen.findByRole('link', { name: 'Open full page' });
    expect(link).toHaveAttribute('href', '/case/case-death');
  });

  it('tells the visitor when the API is down, with a way to retry', async () => {
    vi.spyOn(api, 'events').mockRejectedValue(
      new ApiError(0, 'network', 'Could not reach the server.'),
    );
    vi.spyOn(api, 'config').mockRejectedValue(
      new ApiError(0, 'network', 'Could not reach the server.'),
    );
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the Pro preview and the final call to action', async () => {
    mockApi();
    renderApp();
    expect(
      screen.getByRole('heading', { name: "Every client's paperwork on one screen." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'The next form should not be a surprise.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Plot a route' })).toHaveAttribute(
      'href',
      '/#situation',
    );
    await screen.findByRole('list', { name: 'Steps in order' });
  });

  it('has a skip link and a labelled navigation', async () => {
    mockApi();
    renderApp();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Page sections' })).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Steps in order' });
  });

  it('has no accessibility violations', async () => {
    mockApi();
    const { container } = renderApp();
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: /Get the medical certificate/ }).length,
      ).toBeGreaterThan(0);
    });
    await expectNoA11yViolations(container);
  });
});
