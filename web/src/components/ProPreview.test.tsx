import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { AppDataProvider } from '../state/AppData';
import { expectNoA11yViolations } from '../test/utils';
import { ProPreview } from './ProPreview';

function setup(proEnabled = false) {
  vi.spyOn(api, 'events').mockResolvedValue([]);
  vi.spyOn(api, 'config').mockResolvedValue({
    proEnabled,
    adminEnabled: false,
    staleAfterDays: 90,
    disclaimer: 'Guidance, not legal advice.',
    emailProvider: 'console',
  });
  return render(
    <MemoryRouter>
      <AppDataProvider>
        <ProPreview />
      </AppDataProvider>
    </MemoryRouter>,
  );
}

const visibleRows = () =>
  Array.from(document.querySelectorAll('.prow')).filter((r) => !(r as HTMLElement).hidden);

describe('ProPreview', () => {
  it('shows the five sample clients, labelled as a preview with sample data', () => {
    setup();
    expect(screen.getByText('5 clients')).toBeInTheDocument();
    expect(visibleRows()).toHaveLength(5);
    expect(screen.getByText('Pro plan preview. Sample data.')).toBeInTheDocument();
    expect(screen.getByText('Estate · Sample case A')).toBeInTheDocument();
  });

  it('shows progress, next step and a status pill per client', () => {
    setup();
    const row = screen.getByText('Estate · Sample case C').closest('li') as HTMLElement;
    expect(within(row).getByText('1 of 6 steps')).toBeInTheDocument();
    expect(within(row).getByText('Register the death, due 2 days ago')).toBeInTheDocument();
    expect(within(row).getByText('Overdue')).toHaveClass('pill', 'alert');
    expect(row.style.getPropertyValue('--w')).toBe('17%');
    const ok = screen.getByText('Estate · Sample case A').closest('li') as HTMLElement;
    expect(within(ok).getByText('On track')).toHaveClass('pill', 'ok');
    expect(ok.style.getPropertyValue('--w')).toBe('67%');
    const wait = screen.getByText('Relocation · Sample employee B').closest('li') as HTMLElement;
    expect(within(wait).getByText('Needs document')).toHaveClass('pill', 'wait');
  });

  it('filters to the clients that need attention and updates the count', async () => {
    const user = userEvent.setup();
    setup();
    const all = screen.getByRole('button', { name: 'All clients' });
    const attention = screen.getByRole('button', { name: 'Needs attention' });
    expect(all).toHaveAttribute('aria-pressed', 'true');

    await user.click(attention);
    expect(attention).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('3 clients')).toBeInTheDocument();
    expect(visibleRows()).toHaveLength(3);
    expect(visibleRows().some((r) => r.textContent?.includes('On track'))).toBe(false);

    await user.click(all);
    expect(screen.getByText('5 clients')).toBeInTheDocument();
    expect(visibleRows()).toHaveLength(5);
  });

  it('only offers the real dashboard when the Pro plan is switched on', async () => {
    const { unmount } = setup(false);
    expect(screen.queryByRole('link', { name: 'Open the dashboard' })).not.toBeInTheDocument();
    unmount();
    setup(true);
    expect(await screen.findByRole('link', { name: 'Open the dashboard' })).toHaveAttribute(
      'href',
      '/pro',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = setup();
    await expectNoA11yViolations(container);
  });
});
