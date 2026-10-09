import { describe, expect, it } from 'vitest';
import { SEED_EVENTS } from './seed/seed-data.js';
import { matchText, scoreEvent, tokenize, type MatchableEvent } from './match.js';

const events: MatchableEvent[] = SEED_EVENTS.map((e, i) => ({
  id: e.slug,
  position: i + 1,
  keywords: e.keywords,
}));
const best = (text: string) => matchText(text, events)[0]?.eventId ?? null;

describe('tokenize', () => {
  it('lower-cases, strips apostrophes and punctuation', () => {
    expect(tokenize("My Father's passed away!")).toEqual(['my', 'fathers', 'passed', 'away']);
    expect(tokenize('start-up, shop & caf\u00e9')).toEqual(['start', 'up', 'shop', 'caf\u00e9']);
  });

  it('returns nothing for empty or symbol-only text', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('?!...')).toEqual([]);
  });

  it('keeps non-Latin scripts so Hindi and Kannada keywords can be added later', () => {
    expect(tokenize('मेरे पिता का निधन')).toEqual(['मेरे', 'पिता', 'का', 'निधन']);
    expect(tokenize('ನನ್ನ ತಂದೆ')).toEqual(['ನನ್ನ', 'ತಂದೆ']);
  });
});

describe('scoreEvent', () => {
  it('scores a phrase double and a word once', () => {
    expect(scoreEvent(tokenize('he passed away'), ['passed away']).score).toBe(2);
    expect(scoreEvent(tokenize('he died'), ['died']).score).toBe(1);
  });

  it('matches whole words only', () => {
    expect(scoreEvent(tokenize('renewing my passport'), ['pass']).score).toBe(0);
    expect(scoreEvent(tokenize('renewing my passport'), ['passport']).score).toBe(1);
  });

  it('matches a stem against the start of any word', () => {
    expect(scoreEvent(tokenize('we are relocating'), ['relocat*']).score).toBe(1);
    expect(scoreEvent(tokenize('the family is bereaved'), ['bereav*']).score).toBe(1);
    expect(scoreEvent(tokenize('an apartment'), ['parent*']).score).toBe(0);
  });

  it('counts a repeated keyword once', () => {
    expect(scoreEvent(tokenize('death death death'), ['death', 'death']).score).toBe(1);
  });

  it('needs a phrase in order and adjacent', () => {
    expect(scoreEvent(tokenize('away he passed'), ['passed away']).score).toBe(0);
    expect(scoreEvent(tokenize('passed quietly away'), ['passed away']).score).toBe(0);
  });
});

describe('matchText with the seeded events', () => {
  it.each([
    ['A parent has passed away', 'death'],
    ['Moving to Bengaluru with a toddler', 'move'],
    ['Starting a small business', 'biz'],
    ['my father passed away', 'death'],
    ["I'm moving to Bengaluru with a toddler", 'move'],
    ["I'm starting a small business", 'biz'],
    ['MY MOTHER DIED LAST WEEK', 'death'],
    ['we are relocating from Delhi with our baby', 'move'],
    ['I want to open a shop', 'biz'],
    ['need GST and udyam for my startup', 'biz'],
    ['my dad passed on yesterday', 'death'],
    ['funeral arrangements and certificates', 'death'],
    ['shifting house, new city, two kids', 'move'],
  ])('"%s" -> %s', (text, expected) => {
    expect(best(text)).toBe(expected);
  });

  it('does not treat "passport" as a death', () => {
    expect(best('I need to renew my passport')).toBeNull();
  });

  it('returns nothing for text with no keywords', () => {
    expect(matchText('hello there', events)).toEqual([]);
    expect(matchText('', events)).toEqual([]);
    expect(matchText('???', events)).toEqual([]);
  });

  it('prefers the stronger signal when two events both match', () => {
    // "business" + "starting a" outweighs the single mention of "father".
    expect(best('my father is starting a business')).toBe('biz');
    expect(best('my father passed away and left a business')).toBe('death');
  });

  it('lists every event that matched, best first, with the keywords that hit', () => {
    const result = matchText('my father passed away and left a business', events);
    expect(result.map((r) => r.eventId)).toEqual(['death', 'biz']);
    expect(result[0]?.matched).toEqual(expect.arrayContaining(['passed away']));
  });

  it('breaks ties by event position', () => {
    const tied: MatchableEvent[] = [
      { id: 'second', position: 2, keywords: ['house'] },
      { id: 'first', position: 1, keywords: ['house'] },
    ];
    expect(matchText('a house', tied).map((r) => r.eventId)).toEqual(['first', 'second']);
  });

  it('handles very long text', () => {
    const long = `${'lorem ipsum '.repeat(500)} died`;
    expect(best(long)).toBe('death');
  });
});
