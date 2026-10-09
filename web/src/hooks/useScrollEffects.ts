import { useEffect, type RefObject } from 'react';

/** Writes how far down the page the visitor is (0 to 1) into the --p CSS variable on <html>. */
export function useScrollProgress(): void {
  useEffect(() => {
    const root = document.documentElement;
    let ticking = false;
    const update = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = root.scrollHeight - root.clientHeight;
        const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        root.style.setProperty('--p', p.toFixed(4));
        ticking = false;
      });
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', update);
      root.style.removeProperty('--p');
    };
  }, []);
}

/**
 * Elements below the fold fade and slide in once as they scroll into view (the `.rv` class).
 * Nothing is hidden when the visitor prefers reduced motion or the browser cannot observe.
 */
export function useReveal(ref: RefObject<HTMLElement | null>, reducedMotion: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) return;
    el.classList.add('rv-hide');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.remove('rv-hide');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.classList.remove('rv-hide');
    };
  }, [ref, reducedMotion]);
}

/** Adds the `play` class once 30% of the element is visible, to start its one-off animation. */
export function usePlayOnView(ref: RefObject<HTMLElement | null>, reducedMotion: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('play');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref, reducedMotion]);
}
