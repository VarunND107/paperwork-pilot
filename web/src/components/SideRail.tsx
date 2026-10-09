import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HashLink } from './HashLink';

const SECTIONS = ['situation', 'route', 'how', 'pros', 'start'] as const;

/** The transit-line page map on wide screens: the line fills as you scroll past each station. */
export function SideRail() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const elements = SECTIONS.map((id) => document.getElementById(id));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = elements.indexOf(entry.target as HTMLElement);
          if (index >= 0) setCurrent(index);
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    );
    elements.forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <nav className="rail" aria-label={t('rail.aria')}>
      <ol>
        {SECTIONS.map((id, i) => (
          <li key={id}>
            <HashLink
              hash={id}
              className={i < current ? 'passed' : undefined}
              aria-current={i === current ? 'true' : undefined}
            >
              <span>{t(`rail.${id}`)}</span>
            </HashLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}
