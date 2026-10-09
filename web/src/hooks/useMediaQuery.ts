import { useEffect, useState } from 'react';

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

/** Tracks a CSS media query. Updates when the match changes (resize, theme change, ...). */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => {
      setValue(list.matches);
    };
    update();
    list.addEventListener('change', update);
    return () => {
      list.removeEventListener('change', update);
    };
  }, [query]);
  return value;
}

/** True when the visitor asked the system for less motion. Every animation must honour this. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** The board shows the detail card beside the list from this width, under the step below it. */
export const WIDE_QUERY = '(min-width: 900px)';
