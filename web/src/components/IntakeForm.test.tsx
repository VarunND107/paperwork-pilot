import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import type { MatchResponse } from '../api/types';
import { allEvents, bizEvent, deathEvent, moveEvent } from '../test/fixtures';
import { setMedia } from '../test/media';
import { expectNoA11yViolations } from '../test/utils';
import { IntakeForm } from './IntakeForm';

const NO_MATCH: MatchResponse = { matched: null, candidates: [], suggestions: allEvents };

function setup(currentSlug: string | null = 'death') {
  const onSelect = vi.fn();
  const view = render(
    <IntakeForm events={allEvents} currentSlug={currentSlug} onSelect={onSelect} />,
  );
  return { onSelect, ...view };
}

describe('IntakeForm', () => {
  it('has a labelled text box, a submit button and a live status region', () => {
    setup();
    expect(screen.getByLabelText("What's happening in your life?")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plot my route' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText("What's happening in your life?")).toHaveAccessibleDescription('');
  });

  it('asks for text when submitted empty', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.click(screen.getByRole('button', { name: 'Plot my route' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Type what is happening, or pick one of the situations below.',
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('sends the text to POST /match and selects the matched situation', async () => {
    const match = vi.spyOn(api, 'match').mockResolvedValue({
      matched: moveEvent,
      candidates: [{ event: moveEvent, score: 3 }],
      suggestions: [],
    });
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.type(
      screen.getByLabelText("What's happening in your life?"),
      "I'm moving to Bengaluru with a toddler",
    );
    await user.click(screen.getByRole('button', { name: 'Plot my route' }));
    expect(match).toHaveBeenCalledWith("I'm moving to Bengaluru with a toddler");
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(moveEvent);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Route ready for: Moving to Bengaluru with a toddler.',
    );
  });

  it('submits with the Enter key', async () => {
    const match = vi.spyOn(api, 'match').mockResolvedValue(NO_MATCH);
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("What's happening in your life?"), 'hello{Enter}');
    expect(match).toHaveBeenCalledOnce();
  });

  it('says so, and offers the situations, when nothing matches', async () => {
    vi.spyOn(api, 'match').mockResolvedValue(NO_MATCH);
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.type(screen.getByLabelText("What's happening in your life?"), 'weather');
    await user.click(screen.getByRole('button', { name: 'Plot my route' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'This demo covers three situations. Pick one below to see its route.',
      );
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('degrades gracefully when the API is unreachable', async () => {
    vi.spyOn(api, 'match').mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.type(screen.getByLabelText("What's happening in your life?"), 'my father died');
    await user.click(screen.getByRole('button', { name: 'Plot my route' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Could not work that out/);
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Plot my route' })).toBeEnabled();
  });

  it('shows one chip per situation, with the current one pressed', () => {
    setup('move');
    const group = screen.getByRole('group', { name: 'Pick a situation' });
    const chips = Array.from(group.querySelectorAll('button'));
    expect(chips.map((c) => c.textContent)).toEqual([
      'A parent has passed away',
      'Moving to Bengaluru with a toddler',
      'Starting a small business',
    ]);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('selects a situation when its chip is clicked', async () => {
    const user = userEvent.setup();
    const { onSelect } = setup();
    await user.click(screen.getByRole('button', { name: 'Starting a small business' }));
    expect(onSelect).toHaveBeenCalledWith(bizEvent);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Route ready for: Starting a small business.',
    );
  });

  it('shows no chips and marks the group busy while situations load', () => {
    render(<IntakeForm events={null} currentSlug={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Pick a situation' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('button', { name: /passed away/ })).not.toBeInTheDocument();
  });

  it('is keyboard navigable: text box, submit, then the chips', async () => {
    const user = userEvent.setup();
    setup();
    await user.tab();
    expect(screen.getByLabelText("What's happening in your life?")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Plot my route' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: deathEvent.label })).toHaveFocus();
  });

  it('has no accessibility violations', async () => {
    const { container } = setup();
    await expectNoA11yViolations(container);
  });
});

describe('IntakeForm typed placeholder', () => {
  it('types out each phrase, pauses while focused, and rests with reduced motion', async () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <IntakeForm events={allEvents} currentSlug="death" onSelect={vi.fn()} />,
    );
    const input = screen.getByLabelText("What's happening in your life?");
    expect(input).toHaveAttribute('placeholder', 'my father passed away');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(input).toHaveAttribute('placeholder', 'm');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55 * 3);
    });
    expect(input.getAttribute('placeholder')?.startsWith('my f')).toBe(true);

    // Focusing the box freezes the animation.
    act(() => {
      input.focus();
    });
    const frozen = input.getAttribute('placeholder');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(input).toHaveAttribute('placeholder', frozen ?? '');

    setMedia({ reduced: true });
    rerender(<IntakeForm events={allEvents} currentSlug="move" onSelect={vi.fn()} />);
  });

  it('shows the first phrase and never animates when reduced motion is requested', async () => {
    setMedia({ reduced: true });
    vi.useFakeTimers();
    render(<IntakeForm events={allEvents} currentSlug="death" onSelect={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByLabelText("What's happening in your life?")).toHaveAttribute(
      'placeholder',
      'my father passed away',
    );
  });
});
