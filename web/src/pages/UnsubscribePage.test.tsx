import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { expectNoA11yViolations } from '../test/utils';
import { UnsubscribePage } from './UnsubscribePage';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <UnsubscribePage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UnsubscribePage', () => {
  it('changes nothing until the button is pressed', () => {
    const spy = vi.spyOn(api, 'unsubscribe');
    renderAt('/unsubscribe?case=c1&sig=s1');
    expect(screen.getByRole('heading', { level: 1, name: 'Stop reminders' })).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends the signed link and confirms', async () => {
    const spy = vi.spyOn(api, 'unsubscribe').mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const { container } = renderAt('/unsubscribe?case=c1&sig=s1');
    await user.click(screen.getByRole('button', { name: 'Stop reminders' }));
    expect(spy).toHaveBeenCalledWith('c1', 's1');
    expect(await screen.findByRole('heading', { name: 'Reminders stopped' })).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('email address has been removed');
    await expectNoA11yViolations(container);
  });

  it('says so when the link is not valid', async () => {
    vi.spyOn(api, 'unsubscribe').mockRejectedValue(new ApiError(403, 'forbidden', 'no'));
    const user = userEvent.setup();
    renderAt('/unsubscribe?case=c1&sig=bad');
    await user.click(screen.getByRole('button', { name: 'Stop reminders' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid');
    expect(screen.getByRole('button', { name: 'Stop reminders' })).toBeEnabled();
  });

  it('says to try again when the server cannot be reached', async () => {
    vi.spyOn(api, 'unsubscribe').mockRejectedValue(new ApiError(0, 'network', 'offline'));
    const user = userEvent.setup();
    renderAt('/unsubscribe?case=c1&sig=s1');
    await user.click(screen.getByRole('button', { name: 'Stop reminders' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in a moment');
  });

  it('explains an incomplete link and offers no button', async () => {
    const { container } = renderAt('/unsubscribe?case=c1');
    expect(screen.getByRole('heading', { name: 'This link is incomplete' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
