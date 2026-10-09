import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import kn from './locales/kn.json';

/**
 * Scaffolding for English, Hindi and Kannada. Only English is filled in: hi.json and kn.json are
 * empty on purpose and fall back to English key by key, so adding a translation later is just
 * adding strings to those files.
 */
export const SUPPORTED_LANGUAGES = ['en', 'hi', 'kn'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'pp-lang';

function isLanguage(value: string | null | undefined): value is Language {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** ?lng=hi wins, then the saved choice, then English. */
export function detectLanguage(search = window.location.search): Language {
  const fromQuery = new URLSearchParams(search).get('lng');
  if (isLanguage(fromQuery)) return fromQuery;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'en';
}

export function setLanguage(lang: Language): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage unavailable */
  }
  void i18n.changeLanguage(lang);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    kn: { translation: kn },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
  showSupportNotice: false,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
