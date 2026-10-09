import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type * as ClientModule from '../api/client';
import { expectNoA11yViolations } from '../test/utils';
import AdminApp from './AdminApp';
import type { AdminTipList, AdminTipRow } from './types';

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

const pending: AdminTipRow = {
  id: 't1',
  body: 'Ask for the acknowledgement slip.',
  status: 'PENDING',
  origin: 'USER',
  createdAt: '2026-09-01T05:00:00.000Z',
  moderatedAt: null,
  flagCount: 0,
  target: {
    kind: 'step',
    id: 's1',
    label: 'Register the death',
    context: 'A parent has passed away',
  },
};
const flagged: AdminTipRow = {
  ...pending,
  id: 't2',
  body: 'The office moved to the second floor.',
  status: 'APPROVED',
  flagCount: 2,
  target: { kind: 'office', id: 'o1', label: 'Ward office', context: 'Bengaluru' },
};

let queue: AdminTipList;
let failNext: ApiError | null;

function serve() {
  fake.handler = (c) => {
    if (c.path === '/admin/session') return { enabled: true, authenticated: true };
    if (failNext && c.method !== 'GET') {
      const error = failNext;
      failNext = null;
      throw error;
    }
    if (c.method === 'GET' && c.path.startsWith('/admin/tips')) return queue;
    if (c.method === 'PATCH' && c.path.startsWith('/admin/tips/')) return { tip: pending };
    if (c.method === 'DELETE' && c.path.startsWith('/admin/tips/')) return undefined;
    throw new ApiError(404, 'not_found', `Unexpected request: ${c.method} ${c.path}`);
  };
}

function renderTips() {
  return render(
    <MemoryRouter initialEntries={['/admin/tips']}>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

const writes = () =>
  fake.calls.filter((c) => c.method !== 'GET' && c.path.startsWith('/admin/tips'));

beforeEach(() => {
  fake.calls = [];
  failNext = null;
  queue = { tips: [pending, flagged], counts: { pending: 1, flagged: 1 } };
  serve();
});

describe('Admin: tips', () => {
  it('is in the navigation and shows what is waiting', async () => {
    renderTips();
    expect(await screen.findByRole('heading', { name: 'Tips from visitors' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tips' })).toHaveAttribute('aria-current', 'page');
    expect(
      await screen.findByText('1 waiting for a first review, 1 flagged as out of date.'),
    ).toBeInTheDocument();
    expect(fake.calls.find((c) => c.path.startsWith('/admin/tips'))?.path).toBe(
      '/admin/tips?filter=queue',
    );
  });

  it('says what each tip is about and how many people flagged it', async () => {
    renderTips();
    const step = await screen.findByRole('listitem', { name: 'Tip about Register the death' });
    expect(
      within(step).getByText('Step: Register the death · A parent has passed away'),
    ).toBeInTheDocument();
    expect(within(step).getByText('waiting')).toBeInTheDocument();
    const office = screen.getByRole('listitem', { name: 'Tip about Ward office' });
    expect(within(office).getByText('Office: Ward office · Bengaluru')).toBeInTheDocument();
    expect(within(office).getByText('flagged out of date by 2 people')).toBeInTheDocument();
    expect(within(office).getByText('public')).toBeInTheDocument();
  });

  it('approves a waiting tip and reloads the queue', async () => {
    const user = userEvent.setup();
    renderTips();
    const step = await screen.findByRole('listitem', { name: 'Tip about Register the death' });
    await user.click(within(step).getByRole('button', { name: /^Approve/ }));
    await waitFor(() => {
      expect(writes()).toEqual([
        { method: 'PATCH', path: '/admin/tips/t1', body: { status: 'APPROVED' } },
      ]);
    });
    expect(await screen.findByText('Tip approved.')).toBeInTheDocument();
    expect(
      fake.calls.filter((c) => c.method === 'GET' && c.path.startsWith('/admin/tips')),
    ).toHaveLength(2);
  });

  it('rejects a waiting tip, and calls it "hide" once it is public', async () => {
    const user = userEvent.setup();
    renderTips();
    const step = await screen.findByRole('listitem', { name: 'Tip about Register the death' });
    expect(within(step).getByRole('button', { name: /^Reject/ })).toBeInTheDocument();
    const office = screen.getByRole('listitem', { name: 'Tip about Ward office' });
    expect(within(office).queryByRole('button', { name: /^Approve/ })).not.toBeInTheDocument();
    await user.click(within(office).getByRole('button', { name: /^Hide/ }));
    await waitFor(() => {
      expect(writes()).toEqual([
        { method: 'PATCH', path: '/admin/tips/t2', body: { status: 'REJECTED' } },
      ]);
    });
  });

  it('clears the flags of a flagged tip', async () => {
    const user = userEvent.setup();
    renderTips();
    const office = await screen.findByRole('listitem', { name: 'Tip about Ward office' });
    await user.click(within(office).getByRole('button', { name: /^Clear flags/ }));
    await waitFor(() => {
      expect(writes()).toEqual([
        { method: 'PATCH', path: '/admin/tips/t2', body: { clearFlags: true } },
      ]);
    });
    const step = screen.getByRole('listitem', { name: 'Tip about Register the death' });
    expect(within(step).queryByRole('button', { name: /^Clear flags/ })).not.toBeInTheDocument();
  });

  it('rewords a tip', async () => {
    const user = userEvent.setup();
    renderTips();
    const step = await screen.findByRole('listitem', { name: 'Tip about Register the death' });
    await user.click(within(step).getByRole('button', { name: /^Edit text/ }));
    const box = screen.getByLabelText('Tip text');
    expect(box).toHaveValue('Ask for the acknowledgement slip.');
    await user.clear(box);
    await user.type(box, 'Ask for the slip before you leave.');
    await user.click(screen.getByRole('button', { name: 'Save text' }));
    await waitFor(() => {
      expect(writes()).toEqual([
        {
          method: 'PATCH',
          path: '/admin/tips/t1',
          body: { body: 'Ask for the slip before you leave.' },
        },
      ]);
    });
    await waitFor(() => {
      expect(screen.queryByLabelText('Tip text')).not.toBeInTheDocument();
    });
  });

  it('shows why a reworded tip was refused and keeps the editor open', async () => {
    const user = userEvent.setup();
    renderTips();
    const step = await screen.findByRole('listitem', { name: 'Tip about Register the death' });
    await user.click(within(step).getByRole('button', { name: /^Edit text/ }));
    failNext = new ApiError(400, 'validation_error', 'The request was not valid.', [
      { path: 'body', message: 'A tip cannot contain links.' },
    ]);
    await user.click(screen.getByRole('button', { name: 'Save text' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A tip cannot contain links.');
    expect(screen.getByLabelText('Tip text')).toBeInTheDocument();
  });

  it('deletes only after confirming', async () => {
    const user = userEvent.setup();
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderTips();
    const step = await screen.findByRole('listitem', { name: 'Tip about Register the death' });
    await user.click(within(step).getByRole('button', { name: /^Delete/ }));
    expect(writes()).toEqual([]);
    await user.click(within(step).getByRole('button', { name: /^Delete/ }));
    await waitFor(() => {
      expect(writes()).toEqual([{ method: 'DELETE', path: '/admin/tips/t1', body: undefined }]);
    });
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('switches the list with the filter', async () => {
    const user = userEvent.setup();
    renderTips();
    await screen.findByRole('heading', { name: 'Tips from visitors' });
    await user.selectOptions(screen.getByLabelText('Show'), 'rejected');
    await waitFor(() => {
      expect(fake.calls.some((c) => c.path === '/admin/tips?filter=rejected')).toBe(true);
    });
  });

  it('says so when there is nothing to review', async () => {
    queue = { tips: [], counts: { pending: 0, flagged: 0 } };
    renderTips();
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderTips();
    await screen.findByRole('listitem', { name: 'Tip about Register the death' });
    await expectNoA11yViolations(container);
  });
});
