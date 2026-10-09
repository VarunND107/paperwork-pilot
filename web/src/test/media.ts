import { vi } from 'vitest';

export interface MediaState {
  /** (min-width: 900px): the board shows the detail card beside the list. */
  wide?: boolean;
  /** prefers-reduced-motion: reduce */
  reduced?: boolean;
  /** prefers-color-scheme: dark */
  dark?: boolean;
}

/** jsdom has no matchMedia. This installs one whose answers the test controls. */
export function setMedia(state: MediaState = {}): void {
  window.matchMedia = vi.fn((query: string) => ({
    matches:
      (query.includes('min-width: 900px') && !!state.wide) ||
      (query.includes('prefers-reduced-motion') && !!state.reduced) ||
      (query.includes('prefers-color-scheme: dark') && !!state.dark),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }));
}
