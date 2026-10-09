import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import i18n, { detectLanguage, SUPPORTED_LANGUAGES, setLanguage } from './index';
import en from './locales/en.json';
import hi from './locales/hi.json';
import kn from './locales/kn.json';

function flatten(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [prefix];
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe('i18n scaffolding', () => {
  it('supports English, Hindi and Kannada', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['en', 'hi', 'kn']);
  });

  it('only fills in English: hi and kn are empty scaffolds', () => {
    expect(Object.keys(hi)).toEqual([]);
    expect(Object.keys(kn)).toEqual([]);
    expect(flatten(en).length).toBeGreaterThan(100);
  });

  it('falls back to English key by key', async () => {
    await i18n.changeLanguage('hi');
    expect(i18n.t('hero.kicker')).toBe(en.hero.kicker);
    await i18n.changeLanguage('kn');
    expect(i18n.t('app.disclaimer')).toBe(en.app.disclaimer);
    await i18n.changeLanguage('en');
  });

  it('uses a translation as soon as one exists', async () => {
    i18n.addResourceBundle(
      'hi',
      'translation',
      { header: { how: 'यह कैसे काम करता है' } },
      true,
      true,
    );
    await i18n.changeLanguage('hi');
    expect(i18n.t('header.how')).toBe('यह कैसे काम करता है');
    expect(i18n.t('header.pros')).toBe(en.header.pros);
    i18n.removeResourceBundle('hi', 'translation');
    await i18n.changeLanguage('en');
  });

  it('detects the language from ?lng= first, then storage, then English', () => {
    expect(detectLanguage('?lng=kn')).toBe('kn');
    expect(detectLanguage('?lng=fr')).toBe('en');
    window.localStorage.setItem('pp-lang', 'hi');
    expect(detectLanguage('')).toBe('hi');
    expect(detectLanguage('?lng=kn')).toBe('kn');
    window.localStorage.setItem('pp-lang', 'xx');
    expect(detectLanguage('')).toBe('en');
  });

  it('remembers the chosen language and sets <html lang>', async () => {
    setLanguage('hi');
    expect(window.localStorage.getItem('pp-lang')).toBe('hi');
    await i18n.changeLanguage('hi');
    expect(document.documentElement.lang).toBe('hi');
    await i18n.changeLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('has every plain key that the source asks for (no missing strings)', () => {
    const known = new Set(flatten(en));
    // Plural keys are stored as key_one / key_other but requested as key.
    for (const key of [...known]) known.add(key.replace(/_(one|other|zero|two|few|many)$/, ''));
    const missing: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) {
        const key = match[1] ?? '';
        if (!known.has(key)) missing.push(`${file.split('/src/')[1]}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
