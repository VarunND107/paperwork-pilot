import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useMediaQuery';
import { useTheme } from '../hooks/useTheme';
import { cx } from '../lib/format';

/** Light / dark switch. Remembers the choice; until then the system preference decides. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  const reduced = useReducedMotion();
  const [spin, setSpin] = useState(false);

  const onClick = () => {
    toggle();
    if (!reduced) {
      setSpin(false);
      requestAnimationFrame(() => {
        setSpin(true);
      });
    }
  };

  return (
    <button
      type="button"
      className={cx('theme-btn', spin && 'spin')}
      id="theme"
      data-mode={theme}
      aria-label={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')}
      onClick={onClick}
    >
      <svg
        className="sun"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" />
      </svg>
      <svg className="moon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a.6.6 0 0 0-.8-.7A9.6 9.6 0 1 0 21.2 15.4a.6.6 0 0 0-.7-.8z" />
      </svg>
    </button>
  );
}
