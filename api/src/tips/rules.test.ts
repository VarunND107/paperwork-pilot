import { describe, expect, it } from 'vitest';
import { submitTipBody, tipProblem, tipText, voterId } from './rules.js';

describe('tipProblem', () => {
  it.each([
    'See https://example.com for the form',
    'Go to http://bbmp.gov.in',
    'Open www.kaveri.gov.in first',
    'The portal bescom.co.in is slow',
    'Try nadakacheri.com in the morning',
  ])('refuses a link: %s', (text) => {
    expect(tipProblem(text)).toBe('A tip cannot contain links.');
  });

  it('refuses an email address', () => {
    expect(tipProblem('Write to ravi@example.org for help')).toBe(
      'A tip cannot contain an email address.',
    );
  });

  it.each(['Call 98450 12345 and ask', 'Aadhaar 1234 5678 9012 works', 'Ring +91-9845012345'])(
    'refuses a phone or Aadhaar-sized number: %s',
    (text) => {
      expect(tipProblem(text)).toMatch(/long number/);
    },
  );

  it.each([
    'Bring 2 photocopies. The fee was Rs 50 last week.',
    'Go after 2 pm. The queue is shortest on Tuesdays, e.g. before 10:30.',
    'Ask for Form 21 and the acknowledgement slip.',
    'The fee is Rs 1,00,000 for the large plot.',
  ])('allows ordinary advice: %s', (text) => {
    expect(tipProblem(text)).toBeNull();
  });
});

describe('tipText', () => {
  it('trims and collapses whitespace and control characters into single spaces', () => {
    expect(tipText.parse('  Take the  original\n\nand a copy\t today \u0007 ')).toBe(
      'Take the original and a copy today',
    );
  });
  it('needs 10 to 400 characters, counted after cleaning', () => {
    expect(tipText.safeParse('too short').success).toBe(false);
    expect(tipText.safeParse('x'.repeat(400)).success).toBe(true);
    expect(tipText.safeParse('x'.repeat(401)).success).toBe(false);
    expect(tipText.safeParse(`   ${'x '.repeat(5)}   `).success).toBe(false);
  });
  it('is not a string it can use', () => {
    expect(tipText.safeParse(42).success).toBe(false);
    expect(tipText.safeParse(null).success).toBe(false);
  });
});

describe('submitTipBody', () => {
  const body = 'Ask for the acknowledgement slip.';
  it('needs exactly one target', () => {
    expect(submitTipBody.safeParse({ stepId: 's1', body }).success).toBe(true);
    expect(submitTipBody.safeParse({ officeId: 'o1', body }).success).toBe(true);
    expect(submitTipBody.safeParse({ body }).success).toBe(false);
    expect(submitTipBody.safeParse({ stepId: 's1', officeId: 'o1', body }).success).toBe(false);
  });
  it('refuses fields it does not know, so a tip cannot set its own status', () => {
    expect(submitTipBody.safeParse({ stepId: 's1', body, status: 'APPROVED' }).success).toBe(false);
  });
});

describe('voterId', () => {
  it('accepts a random browser id and nothing odd', () => {
    expect(voterId.safeParse('3f9c1e2a-77b4-4d0e-9a51-0c2f7d6b8e11').success).toBe(true);
    expect(voterId.safeParse('short').success).toBe(false);
    expect(voterId.safeParse('has spaces and !!! in it......').success).toBe(false);
    expect(voterId.safeParse(undefined).success).toBe(false);
  });
});
