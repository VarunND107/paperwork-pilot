import type { DateOnly } from '../engine/types.js';

export interface DueStep {
  title: string;
  deadline: DateOnly;
  /** Days from today to the deadline. 0 is today. */
  daysLeft: number;
  /** Titles of steps that are not done yet and must come first. Empty for a step that is ready. */
  waitsFor: string[];
}

export interface ReminderInput {
  eventLabel: string;
  eventDateLabel: string;
  eventDate: DateOnly;
  steps: DueStep[];
  caseUrl: string;
  unsubscribeUrl: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-22" -> "22 Oct 2026". Fixed month names, so the text does not change with the ICU version. */
export function formatDate(value: DateOnly): string {
  const [y, m, d] = value.split('-').map(Number);
  return `${d ?? 1} ${MONTHS[(m ?? 1) - 1] ?? ''} ${y ?? 1970}`;
}

export function whenText(daysLeft: number): string {
  if (daysLeft <= 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  return `in ${daysLeft} days`;
}

/** The subject and plain-text body of one reminder email. Pure, so it is easy to test. */
export function composeReminder(input: ReminderInput): { subject: string; text: string } {
  const n = input.steps.length;
  const subject = `Reminder: ${n} ${n === 1 ? 'step is' : 'steps are'} due soon · ${input.eventLabel}`;

  const lines = input.steps.flatMap((s) => {
    const line = `- ${s.title}: due ${formatDate(s.deadline)} (${whenText(s.daysLeft)})`;
    return s.waitsFor.length > 0 ? [line, `  Finish first: ${s.waitsFor.join('; ')}`] : [line];
  });

  const text = [
    'Hello,',
    '',
    'You asked Paperwork Pilot to remind you about deadlines on your route.',
    '',
    `Due in the next 3 days (${input.eventLabel}):`,
    ...lines,
    '',
    `Open your route: ${input.caseUrl}`,
    '(It opens only in the browser where you started it.)',
    '',
    `Deadlines are counted from the date you entered (${input.eventDateLabel}: ${formatDate(input.eventDate)}).`,
    "Fees and rules change, so check each step's source before you rely on it.",
    'Paperwork Pilot is guidance, not legal advice.',
    '',
    `Stop these reminders: ${input.unsubscribeUrl}`,
    '',
  ].join('\n');

  return { subject, text };
}
