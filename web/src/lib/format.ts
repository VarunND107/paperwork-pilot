const LOCALES: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', kn: 'kn-IN' };

/** "en" -> "en-IN": dates and numbers follow Indian conventions in every supported language. */
export function localeFor(language: string): string {
  return LOCALES[language.split('-')[0] ?? ''] ?? 'en-IN';
}

/** "2026-10-22" -> "22 Oct 2026". Dates are calendar dates, so no time-zone shifting. */
export function formatDateOnly(value: string, language = 'en'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** "2026-09-20T00:00:00.000Z" -> "20 Sept 2026" in India time. */
export function formatTimestamp(value: string, language = 'en'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

/** "https://www.uidai.gov.in/en/" -> "uidai.gov.in" */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Joins class names, skipping anything falsy. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
