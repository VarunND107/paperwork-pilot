import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { caseStore } from '../api/caseStore';
import { AppDataProvider } from '../state/AppData';
import { allEvents, freshCase } from '../test/fixtures';
import { expectNoA11yViolations } from '../test/utils';
import { CasePage } from './CasePage';

const TOKEN = 'pp_case_token_0123456789abcdef';

function mockCommon(emailProvider = 'console') {
  vi.spyOn(api, 'events').mockResolvedValue(allEvents);
  vi.spyOn(api, 'config').mockResolvedValue({
    proEnabled: false,
    adminEnabled: false,
    staleAfterDays: 90,
    disclaimer: 'Guidance, not legal advice.',
    emailProvider,
  });
}

function renderCase(id = 'case-1') {
  return render(
    <MemoryRouter initialEntries={[`/case/${id}`]}>
      <AppDataProvider>
        <Routes>
          <Route path="/case/:id" element={<CasePage />} />
          <Route path="/" element={<p>Landing</p>} />
        </Routes>
      </AppDataProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('CasePage: access', () => {
  it('explains that a case is saved on the device that created it when there is no token', () => {
    mockCommon();
    const get = vi.spyOn(api, 'getCase');
    renderCase();
    expect(
      screen.getByRole('heading', { level: 1, name: 'This case is saved on another device' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a new route' })).toHaveAttribute('href', '/');
    expect(get).not.toHaveBeenCalled();
  });

  it('shows the same message when the server rejects the token', async () => {
    mockCommon();
    caseStore.save('case-1', TOKEN);
    vi.spyOn(api, 'getCase').mockRejectedValue(new ApiError(401, 'unauthorized', 'nope'));
    renderCase();
    expect(
      await screen.findByRole('heading', { name: 'This case is saved on another device' }),
    ).toBeInTheDocument();
  });

  it('says the case was not found, and forgets the dead token', async () => {
    mockCommon();
    caseStore.save('case-1', TOKEN);
    vi.spyOn(api, 'getCase').mockRejectedValue(new ApiError(404, 'not_found', 'Case not found.'));
    renderCase();
    expect(
      await screen.findByRole('heading', { name: 'We could not find this case' }),
    ).toBeInTheDocument();
    expect(caseStore.getToken('case-1')).toBeNull();
  });
});

describe('CasePage: the full route view', () => {
  async function open(view = freshCase({ eventDate: null })) {
    mockCommon();
    caseStore.save('case-1', TOKEN);
    vi.spyOn(api, 'getCase').mockResolvedValue(view);
    const utils = renderCase();
    await screen.findByRole('list', { name: 'Steps in order' });
    return utils;
  }

  it('shows the route for this case with the real-case wording', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1, name: 'Your route' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /A parent has passed away/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset progress' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open full page' })).not.toBeInTheDocument();
  });

  it('has a reminders opt-in checkbox that is off by default', async () => {
    await open();
    const box = screen.getByRole('checkbox', {
      name: 'Email me a reminder 3 days before a deadline',
    });
    expect(box).not.toBeChecked();
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  });

  it('asks for an email when the visitor opts in, and says the email is only logged for now', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('checkbox', { name: /Email me a reminder/ }));
    const email = screen.getByLabelText('Email address');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAccessibleDescription(/Used only for reminders about this case/);
    expect(screen.getByText(/reminders are only written to the server log/)).toBeInTheDocument();
    expect(screen.getByText(/Add the date at the top of this page/)).toBeInTheDocument();
  });

  it('saves the opt-in with the email address', async () => {
    const user = userEvent.setup();
    await open();
    const patch = vi
      .spyOn(api, 'patchCase')
      .mockResolvedValue(freshCase({ remindersOptIn: true, reminderEmail: 'asha@example.com' }));
    await user.click(screen.getByRole('checkbox', { name: /Email me a reminder/ }));
    await user.type(screen.getByLabelText('Email address'), 'asha@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(patch).toHaveBeenCalledWith('case-1', TOKEN, {
      remindersOptIn: true,
      reminderEmail: 'asha@example.com',
    });
    expect(await screen.findByText('Reminder settings saved.')).toBeInTheDocument();
  });

  it('opts out by sending no email', async () => {
    const user = userEvent.setup();
    await open(freshCase({ remindersOptIn: true, reminderEmail: 'asha@example.com' }));
    const patch = vi.spyOn(api, 'patchCase').mockResolvedValue(freshCase());
    const box = screen.getByRole('checkbox', { name: /Email me a reminder/ });
    expect(box).toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(patch).toHaveBeenCalledWith('case-1', TOKEN, {
      remindersOptIn: false,
      reminderEmail: null,
    });
    expect(await screen.findByText('Reminders are off.')).toBeInTheDocument();
  });

  it("shows the server's message when saving fails", async () => {
    const user = userEvent.setup();
    await open();
    vi.spyOn(api, 'patchCase').mockRejectedValue(
      new ApiError(400, 'email_required', 'Add an email address to get reminders.'),
    );
    await user.click(screen.getByRole('checkbox', { name: /Email me a reminder/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Add an email address to get reminders.',
    );
  });

  it('does not mention the log when a real email provider is connected', async () => {
    const user = userEvent.setup();
    mockCommon('smtp');
    caseStore.save('case-1', TOKEN);
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    renderCase();
    await screen.findByRole('list', { name: 'Steps in order' });
    await user.click(screen.getByRole('checkbox', { name: /Email me a reminder/ }));
    expect(screen.queryByText(/written to the server log/)).not.toBeInTheDocument();
  });

  it('deletes the case after confirmation and goes back to the start', async () => {
    const user = userEvent.setup();
    await open();
    const del = vi.spyOn(api, 'deleteCase').mockResolvedValue(undefined);
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: 'Delete this case' }));
    expect(del).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete this case' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith('case-1', TOKEN);
    await waitFor(() => {
      expect(screen.getByText('Landing')).toBeInTheDocument();
    });
    expect(caseStore.getToken('case-1')).toBeNull();
  });

  it('states plainly that the case lives only in this browser', async () => {
    await open();
    expect(screen.getByText(/saved only in this browser/)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = await open();
    await expectNoA11yViolations(container);
  });
});
