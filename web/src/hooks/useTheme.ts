import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'pp-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches
    ? 'dark'
    : 'light';
}

function savedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null;
  }
}

/** Applies a saved choice before React renders, so the page does not flash the wrong theme. */
export function applySavedTheme(): void {
  const saved = savedTheme();
  if (saved) document.documentElement.setAttribute('data-theme', saved);
}

function currentTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' || attr === 'light' ? attr : systemTheme();
}

/**
 * Light or dark. Until the visitor picks one, the system preference decides (the CSS handles it
 * with prefers-color-scheme). Picking one sets data-theme on <html> and remembers it.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(DARK_QUERY);
    const sync = () => {
      setTheme(currentTheme());
    };
    list.addEventListener('change', sync);
    return () => {
      list.removeEventListener('change', sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies for this visit */
    }
    setTheme(next);
  }, []);

  return { theme, toggle };
}
