import { describe, expect, it } from 'vitest';
import { composeReminder, formatDate, whenText } from './message.js';

const base = {
  eventLabel: 'A parent has passed away',
  eventDateLabel: 'Date of death',
  eventDate: '2026-09-20',
  caseUrl: 'http://localhost:8080/case/abc',
  unsubscribeUrl: 'http://localhost:8080/unsubscribe?case=abc&sig=xyz',
};

describe('formatDate and whenText', () => {
  it('formats a calendar date the Indian way', () => {
    expect(formatDate('2026-10-11')).toBe('11 Oct 2026');
    expect(formatDate('2027-01-01')).toBe('1 Jan 2027');
  });
  it('says today, tomorrow, or in N days', () => {
    expect(whenText(0)).toBe('today');
    expect(whenText(1)).toBe('tomorrow');
    expect(whenText(3)).toBe('in 3 days');
  });
});

describe('composeReminder', () => {
  it('uses a singular subject for one step', () => {
    const { subject } = composeReminder({
      ...base,
      steps: [{ title: 'Register the death', deadline: '2026-10-11', daysLeft: 2, waitsFor: [] }],
    });
    expect(subject).toBe('Reminder: 1 step is due soon · A parent has passed away');
  });

  it('uses a plural subject for several steps and lists each', () => {
    const { subject, text } = composeReminder({
      ...base,
      steps: [
        { title: 'Register the death', deadline: '2026-10-11', daysLeft: 2, waitsFor: [] },
        { title: 'Collect certified copies', deadline: '2026-10-09', daysLeft: 0, waitsFor: [] },
      ],
    });
    expect(subject).toContain('2 steps are due soon');
    expect(text).toContain('- Register the death: due 11 Oct 2026 (in 2 days)');
    expect(text).toContain('- Collect certified copies: due 9 Oct 2026 (today)');
  });

  it('says what must be finished first for a step that is still locked', () => {
    const { text } = composeReminder({
      ...base,
      steps: [
        {
          title: 'Settle bank accounts',
          deadline: '2026-10-11',
          daysLeft: 2,
          waitsFor: ['Collect certified copies', 'Get the legal heir certificate'],
        },
      ],
    });
    expect(text).toContain(
      '  Finish first: Collect certified copies; Get the legal heir certificate',
    );
  });

  it('carries the links, the date it counted from and the disclaimer', () => {
    const { text } = composeReminder({
      ...base,
      steps: [{ title: 'Register the death', deadline: '2026-10-11', daysLeft: 2, waitsFor: [] }],
    });
    expect(text).toContain('Open your route: http://localhost:8080/case/abc');
    expect(text).toContain(
      'Stop these reminders: http://localhost:8080/unsubscribe?case=abc&sig=xyz',
    );
    expect(text).toContain('Date of death: 20 Sep 2026');
    expect(text).toContain('guidance, not legal advice');
    expect(text).toContain("check each step's source");
  });

  it('is plain text: no HTML', () => {
    const { text } = composeReminder({
      ...base,
      steps: [
        { title: 'Register <b>the</b> death', deadline: '2026-10-11', daysLeft: 2, waitsFor: [] },
      ],
    });
    expect(text).not.toMatch(/<(html|body|a |img|script)/i);
  });
});
