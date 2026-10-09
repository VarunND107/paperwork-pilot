import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setMedia } from '../test/media';
import { TokenBoard } from './TokenBoard';

const num = (c: HTMLElement) => c.querySelector('#tk-num')?.textContent;
const msg = (c: HTMLElement) => c.querySelector('#tk-msg');

describe('TokenBoard', () => {
  it('starts at 037 with five people ahead, and is hidden from assistive technology', () => {
    const { container } = render(<TokenBoard />);
    expect(num(container)).toBe('037');
    expect(msg(container)?.textContent).toBe('5 AHEAD OF YOU');
    expect(container.querySelector('aside')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.tk-you')?.textContent).toBe('042');
  });

  it('counts up every 2.3 seconds until it is your turn, then starts over', () => {
    vi.useFakeTimers();
    const { container } = render(<TokenBoard />);
    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(num(container)).toBe('038');
    expect(msg(container)?.textContent).toBe('4 AHEAD OF YOU');

    act(() => {
      vi.advanceTimersByTime(2300 * 4);
    });
    expect(num(container)).toBe('042');
    expect(msg(container)?.textContent).toBe('YOUR TURN. COUNTER 4');
    expect(msg(container)).toHaveClass('go');

    act(() => {
      vi.advanceTimersByTime(2300);
    });
    expect(num(container)).toBe('037');
    expect(msg(container)).not.toHaveClass('go');
  });

  it('plays the flip animation on each new number', () => {
    const { container } = render(<TokenBoard />);
    expect(container.querySelector('#tk-num')).toHaveClass('tick');
  });

  it('stands still when the visitor prefers reduced motion', () => {
    setMedia({ reduced: true });
    vi.useFakeTimers();
    const { container } = render(<TokenBoard />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(num(container)).toBe('037');
    expect(container.querySelector('#tk-num')).not.toHaveClass('tick');
  });
});
