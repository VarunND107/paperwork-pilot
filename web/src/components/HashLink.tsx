import { useEffect, type ComponentProps } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useReducedMotion } from '../hooks/useMediaQuery';

/** A link to a section of the landing page that works from any route (`/#how`). */
export function HashLink({
  hash,
  ...rest
}: { hash: string } & Omit<ComponentProps<typeof Link>, 'to'>) {
  return <Link to={{ pathname: '/', hash: `#${hash}` }} {...rest} />;
}

/**
 * React Router does not scroll on its own. After a navigation, scroll to the #section if there is
 * one, otherwise back to the top. Smooth scrolling is skipped for reduced-motion visitors.
 */
export function ScrollManager() {
  const { pathname, hash } = useLocation();
  const reduced = useReducedMotion();

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash, reduced]);

  return null;
}
