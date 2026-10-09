import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { CaseView } from '../api/types';
import { initialBoardState, type BoardState } from '../state/boardReducer';
import type { CaseBoard } from '../state/useCaseBoard';
import { caseAfterStepOne, deathEvent, freshCase } from '../test/fixtures';
import { setMedia } from '../test/media';
import { expectNoA11yViolations } from '../test/utils';
import { RouteBoard } from './RouteBoard';

function fakeBoard(view: CaseView | null, over: Partial<BoardState> = {}): CaseBoard {
  return {
    state: {
      ...initialBoardState,
      status: view ? 'ready' : 'loading',
      view,
      selectedId: view?.progress.nextStepId ?? null,
      enterKey: 1,
      freshKey: 1,
      ...over,
    },
    select: vi.fn(),
    toggleDocument: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    setEventDate: vi.fn().mockResolvedValue(undefined),
    replaceView: vi.fn(),
    reload: vi.fn(),
  };
}

function setup(board: CaseBoard, props: Partial<React.ComponentProps<typeof RouteBoard>> = {}) {
  return render(
    <MemoryRouter>
      <RouteBoard board={board} fallbackEvent={deathEvent} variant="demo" {...props} />
    </MemoryRouter>,
  );
}

describe('RouteBoard: the route', () => {
  it('shows the event, its place, the steps in order and the progress', () => {
    setup(fakeBoard(freshCase()));
    expect(
      screen.getByRole('heading', { level: 2, name: /A parent has passed away/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Bengaluru, Karnataka')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Steps in order' });
    const titles = Array.from(list.querySelectorAll('.stn-btn')).map(
      (b) => b.querySelector('.stn-title')?.textContent,
    );
    expect(titles).toEqual([
      'Get the medical certificate',
      'Register the death',
      'Collect certified copies',
    ]);
    expect(screen.getByText('0 of 3 steps done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3');
  });

  it('badges each step: Done, Next up, Ready and After N', () => {
    const view = caseAfterStepOne();
    setup(fakeBoard(view));
    const badges = Array.from(document.querySelectorAll('.stn-btn .badge')).map(
      (b) => b.textContent,
    );
    expect(badges).toEqual(['Done', 'Next up', 'After 2']);
    const states = Array.from(document.querySelectorAll('.stn')).map((li) =>
      li.getAttribute('data-state'),
    );
    expect(states).toEqual(['done', 'ready', 'locked']);
  });

  it('says "Ready" for a ready step that is not the next one', () => {
    const view = freshCase();
    const s3 = view.steps[2];
    if (!s3) throw new Error('fixture');
    view.steps[2] = { ...s3, status: 'ready', blockedBy: [], isNext: false };
    setup(fakeBoard(view));
    expect(document.querySelectorAll('.stn-btn .badge')[2]).toHaveTextContent('Ready');
  });

  it('shows progress after a step is done', () => {
    setup(fakeBoard(caseAfterStepOne()));
    expect(screen.getByText('1 of 3 steps done')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(document.querySelector('#barfill')).toHaveStyle({ '--w': `${(1 / 3) * 100}%` });
  });

  it('marks the selected step and the next step', () => {
    setup(fakeBoard(freshCase()));
    const first = screen.getByRole('button', { name: /Get the medical certificate/ });
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(first.closest('li')).toHaveClass('is-selected', 'next');
    expect(screen.getByRole('button', { name: /Register the death/ })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('selects a step on click and with the keyboard', async () => {
    const user = userEvent.setup();
    const board = fakeBoard(freshCase());
    setup(board);
    await user.click(screen.getByRole('button', { name: /Register the death/ }));
    expect(board.select).toHaveBeenCalledWith('s2');
    screen.getByRole('button', { name: /Collect certified copies/ }).focus();
    await user.keyboard('{Enter}');
    expect(board.select).toHaveBeenCalledWith('s3');
  });

  it('bounces a step that has just unlocked', () => {
    setup(fakeBoard(caseAfterStepOne(), { flashIds: ['s2'] }));
    expect(screen.getByRole('button', { name: /Register the death/ }).closest('li')).toHaveClass(
      'unlock',
    );
  });
});

describe('RouteBoard: layout', () => {
  it('puts the detail card beside the list on wide screens', () => {
    setMedia({ wide: true });
    setup(fakeBoard(freshCase()));
    const slot = document.querySelector('#detail-slot');
    expect(slot?.querySelector('#detail')).not.toBeNull();
    expect(document.querySelector('li.stn #detail')).toBeNull();
  });

  it('opens the detail card under the selected step on narrow screens', () => {
    setMedia({ wide: false });
    setup(fakeBoard(freshCase(), { selectedId: 's2' }));
    const selectedLi = document.querySelector('li.stn.is-selected');
    expect(selectedLi?.getAttribute('data-id')).toBe('s2');
    expect(selectedLi?.querySelector('#detail')).not.toBeNull();
    expect(document.querySelector('#detail-slot #detail')).toBeNull();
    expect(document.querySelectorAll('#detail')).toHaveLength(1);
  });
});

describe('RouteBoard: situation and honesty', () => {
  it('calls the route a sample while the data is unverified', () => {
    setup(fakeBoard(freshCase()));
    expect(screen.getByText('Sample route. Figures are for illustration.')).toBeInTheDocument();
  });

  it('stops calling it a sample once every step is verified', () => {
    setup(fakeBoard(freshCase({ event: { ...deathEvent, isSample: false } })));
    expect(screen.queryByText(/Sample route/)).not.toBeInTheDocument();
    expect(screen.getByText(/Route checked against official sources/)).toBeInTheDocument();
  });

  it('uses different guidance text for the demo and a real case', () => {
    const { unmount } = setup(fakeBoard(freshCase()));
    expect(screen.getByText(/In the live product every step shows its source/)).toBeInTheDocument();
    unmount();
    setup(fakeBoard(freshCase()), { variant: 'case' });
    expect(screen.queryByText(/In the live product/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Every step shows its source and when it was last verified/),
    ).toBeInTheDocument();
  });
});

describe('RouteBoard: event date', () => {
  it('asks for the date of the event and sets it', async () => {
    const user = userEvent.setup();
    const board = fakeBoard(freshCase());
    setup(board);
    const input = screen.getByLabelText('Date of death');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveAttribute('min', '2016-10-09');
    expect(input).toHaveAttribute('max', '2031-10-09');
    expect(input).toHaveAccessibleDescription('Add the date to see deadlines.');
    await user.type(input, '2026-10-01');
    expect(board.setEventDate).toHaveBeenLastCalledWith('2026-10-01');
  });

  it('shows an existing date and no hint, and clearing it passes null', async () => {
    const user = userEvent.setup();
    const board = fakeBoard(freshCase({ eventDate: '2026-10-01' }));
    setup(board);
    const input = screen.getByLabelText('Date of death');
    expect(input).toHaveValue('2026-10-01');
    expect(screen.queryByText('Add the date to see deadlines.')).not.toBeInTheDocument();
    await user.clear(input);
    expect(board.setEventDate).toHaveBeenLastCalledWith(null);
  });

  it("uses the situation's own wording for the date", () => {
    const view = freshCase({ event: { ...deathEvent, eventDateLabel: 'Move-in date' } });
    setup(fakeBoard(view));
    expect(screen.getByLabelText('Move-in date')).toBeInTheDocument();
  });
});

describe('RouteBoard: reset, links, states', () => {
  it('resets the demo straight away', async () => {
    const user = userEvent.setup();
    const board = fakeBoard(caseAfterStepOne());
    setup(board);
    await user.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(board.reset).toHaveBeenCalledOnce();
  });

  it('asks before resetting a real case', async () => {
    const user = userEvent.setup();
    const board = fakeBoard(caseAfterStepOne());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setup(board, { variant: 'case' });
    await user.click(screen.getByRole('button', { name: 'Reset progress' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(board.reset).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Reset progress' }));
    expect(board.reset).toHaveBeenCalledOnce();
  });

  it('links the demo to the full case page', () => {
    setup(fakeBoard(freshCase()), { fullPageHref: '/case/case-1' });
    expect(screen.getByRole('link', { name: 'Open full page' })).toHaveAttribute(
      'href',
      '/case/case-1',
    );
  });

  it('shows a loading message while there is no case yet', () => {
    setup(fakeBoard(null), { fallbackEvent: deathEvent });
    expect(screen.getByText('Loading your route…')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /A parent has passed away/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset demo' })).toBeDisabled();
  });

  it('shows an error with a retry', async () => {
    const user = userEvent.setup();
    const board = fakeBoard(null, { status: 'error', error: 'Could not reach the server.' });
    setup(board);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(board.reload).toHaveBeenCalledOnce();
  });

  it('shows an error passed in from outside (for example case creation failing)', () => {
    setup(fakeBoard(null), { error: 'Could not create your case.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not create your case.');
  });

  it('reads out announcements through a polite live region', () => {
    setup(fakeBoard(freshCase(), { announcement: 'Step 1 done. 1 more step is now ready.' }));
    const live = document.querySelector('#live');
    expect(live).toHaveAttribute('role', 'status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Step 1 done. 1 more step is now ready.');
  });

  it('wires the detail card to the controller', async () => {
    const user = userEvent.setup();
    const board = fakeBoard(freshCase());
    setMedia({ wide: true });
    setup(board);
    await user.click(screen.getByRole('checkbox', { name: 'ID of the person who died' }));
    expect(board.toggleDocument).toHaveBeenCalledWith('d-id', true);
  });
});

describe('RouteBoard: accessibility', () => {
  it.each([
    ['wide', true],
    ['narrow', false],
  ])('has no axe violations (%s)', async (_n, wide) => {
    setMedia({ wide });
    const { container } = setup(fakeBoard(freshCase({ eventDate: '2026-10-01' })), {
      fullPageHref: '/case/case-1',
    });
    await expectNoA11yViolations(container);
  });
});
