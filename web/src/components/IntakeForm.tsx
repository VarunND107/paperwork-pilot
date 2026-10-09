import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { EventSummary } from '../api/types';
import { useReducedMotion } from '../hooks/useMediaQuery';

interface Props {
  /** null while the situations are loading. */
  events: EventSummary[] | null;
  currentSlug: string | null;
  /** The visitor chose (or described) a situation. */
  onSelect: (event: EventSummary) => void;
}

/** The placeholder types itself out, a phrase at a time, until the visitor focuses or types. */
function useTypedPlaceholder(
  phrases: readonly string[],
  reduced: boolean,
  input: React.RefObject<HTMLInputElement | null>,
): string {
  const [text, setText] = useState(phrases[0] ?? '');
  const key = phrases.join('|');

  useEffect(() => {
    const list = key.split('|');
    if (reduced || list.length === 0 || list[0] === '') {
      setText(list[0] ?? '');
      return;
    }
    let phrase = 0;
    let chars = 0;
    let deleting = false;
    let timer = 0;
    const step = () => {
      const el = input.current;
      if (document.activeElement === el || el?.value) {
        timer = window.setTimeout(step, 900);
        return;
      }
      const current = list[phrase] ?? '';
      let wait: number;
      if (!deleting) {
        chars++;
        setText(current.slice(0, chars));
        wait = 55;
        if (chars === current.length) {
          deleting = true;
          wait = 1700;
        }
      } else {
        chars--;
        setText(current.slice(0, chars));
        wait = 26;
        if (chars === 0) {
          deleting = false;
          phrase = (phrase + 1) % list.length;
          wait = 350;
        }
      }
      timer = window.setTimeout(step, wait);
    };
    timer = window.setTimeout(step, 1200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [key, reduced, input]);

  return text;
}

export function IntakeForm({ events, currentSlug, onSelect }: Props) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const phrases = t('intake.placeholders', { returnObjects: true }) as string[];
  const placeholder = useTypedPlaceholder(phrases, reduced, inputRef);

  const choose = (event: EventSummary) => {
    onSelect(event);
    setStatus(t('intake.statusReady', { label: event.label }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) {
      setStatus(t('intake.statusEmpty'));
      return;
    }
    setBusy(true);
    try {
      const result = await api.match(value);
      if (result.matched) choose(result.matched);
      else setStatus(t('intake.statusNoMatch'));
    } catch {
      setStatus(t('intake.statusError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="intake" id="intake" noValidate onSubmit={(e) => void submit(e)}>
      <label className="kicker intake-label" htmlFor="sit">
        {t('intake.label')}
      </label>
      <div className="intake-row">
        <input
          id="sit"
          name="sit"
          type="text"
          autoComplete="off"
          maxLength={300}
          placeholder={placeholder}
          aria-describedby="sit-status"
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {t('intake.submit')}
        </button>
      </div>
      <div className="chips" role="group" aria-label={t('intake.chipsAria')} aria-busy={!events}>
        {events?.map((event) => (
          <button
            key={event.id}
            type="button"
            className="chip"
            data-event={event.slug}
            aria-pressed={event.slug === currentSlug}
            onClick={() => {
              choose(event);
            }}
          >
            {event.label}
          </button>
        ))}
      </div>
      <p className="status" id="sit-status" role="status" aria-live="polite">
        {status}
      </p>
    </form>
  );
}
