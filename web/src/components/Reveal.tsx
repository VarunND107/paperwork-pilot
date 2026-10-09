import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useReducedMotion } from '../hooks/useMediaQuery';
import { usePlayOnView, useReveal } from '../hooks/useScrollEffects';
import { cx } from '../lib/format';

interface Props {
  as?: 'div' | 'article';
  className?: string;
  /** Start this element's one-off animations once it is on screen (the `data-play` hook). */
  play?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}

/** A block that fades and slides in the first time it scrolls into view (the design's `.rv`). */
export function Reveal({ as = 'div', className, play = false, style, children }: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  useReveal(ref, reduced);
  usePlayOnView(ref, reduced || !play);

  const common = {
    className: cx(className, 'rv'),
    style,
    'data-play': play ? '' : undefined,
  };
  return as === 'article' ? (
    <article ref={ref} {...common}>
      {children}
    </article>
  ) : (
    <div ref={ref as RefObject<HTMLDivElement>} {...common}>
      {children}
    </div>
  );
}
