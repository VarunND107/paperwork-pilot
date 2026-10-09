import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../hooks/useMediaQuery';
import { useScrollProgress } from '../hooks/useScrollEffects';
import { HashLink } from './HashLink';
import { ThemeToggle } from './ThemeToggle';

/** After a "try the demo" link scrolls to the form, put the cursor in the text box. */
export function focusIntakeSoon(reduced: boolean): void {
  window.setTimeout(
    () => {
      document.getElementById('sit')?.focus({ preventScroll: true });
    },
    reduced ? 0 : 450,
  );
}

export function Header() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  useScrollProgress();

  return (
    <header className="top">
      <HashLink className="logo" hash="situation" aria-label={t('header.logoAria')}>
        <svg className="logo-mark" viewBox="0 0 38 20" width="38" height="20" aria-hidden="true">
          <path
            d="M5 10h18"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <circle
            cx="5"
            cy="10"
            r="3.2"
            fill="var(--ground)"
            stroke="currentColor"
            strokeWidth="2.6"
          />
          <path d="M25 2.5 36 10 25 17.5z" fill="var(--accent)" />
        </svg>
        <span>{t('app.name')}</span>
      </HashLink>
      <nav className="nav" aria-label={t('header.mainNav')}>
        <HashLink hash="how">{t('header.how')}</HashLink>
        <HashLink hash="pros">{t('header.pros')}</HashLink>
        <ThemeToggle />
        <HashLink
          className="btn btn-sm btn-primary"
          hash="situation"
          id="try-top"
          onClick={() => {
            focusIntakeSoon(reduced);
          }}
        >
          {t('header.demo')}
        </HashLink>
      </nav>
    </header>
  );
}
