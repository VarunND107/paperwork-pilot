import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { applySavedTheme } from '../hooks/useTheme';
import { setMedia } from '../test/media';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('offers dark when the page is light, and is a labelled button', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Switch to dark theme' });
    expect(button).toHaveAttribute('data-mode', 'light');
  });

  it('switches to dark, remembers it, and back again', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('pp-theme')).toBe('dark');
    const back = screen.getByRole('button', { name: 'Switch to light theme' });
    expect(back).toHaveAttribute('data-mode', 'dark');

    await user.click(back);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(window.localStorage.getItem('pp-theme')).toBe('light');
  });

  it('follows the system preference until the visitor chooses', () => {
    setMedia({ dark: true });
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('applies a saved choice before the first paint', () => {
    window.localStorage.setItem('pp-theme', 'dark');
    applySavedTheme();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('ignores a corrupted saved value', () => {
    window.localStorage.setItem('pp-theme', 'purple');
    applySavedTheme();
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('still works when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('skips the spin animation when the visitor prefers reduced motion', async () => {
    setMedia({ reduced: true });
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).not.toHaveClass('spin');
  });
});
