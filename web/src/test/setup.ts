import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import i18n from '../i18n';
import { setMedia } from './media';

class FakeIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(async () => {
  setMedia({});
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  // axe-core probes <canvas> for icon-font detection; jsdom has none and logs noise.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  await i18n.changeLanguage('en');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
