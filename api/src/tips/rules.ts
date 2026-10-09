import { z } from 'zod';

export const TIP_MIN = 10;
export const TIP_MAX = 400;

/** Tips are public, so they carry no way to reach or identify a person, and no links. */
const LINK =
  /https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(?:com|in|org|net|gov|edu|co|io|info|me|xyz|app|ly)\b/i;
const EMAIL = /\S+@\S+\.\S+/;
const LONG_NUMBER = /(?:\d[\s-]?){10,}/;

/** What is wrong with a tip's text, or null when it is acceptable. */
export function tipProblem(text: string): string | null {
  if (EMAIL.test(text)) return 'A tip cannot contain an email address.';
  if (LINK.test(text)) return 'A tip cannot contain links.';
  if (LONG_NUMBER.test(text)) {
    return 'A tip cannot contain a phone, Aadhaar or other long number.';
  }
  return null;
}

/** One short paragraph: control characters and runs of whitespace collapse to a single space. */
export const tipText = z
  .string()
  .transform((s) => s.replace(/[\s\p{Cc}]+/gu, ' ').trim())
  .pipe(
    z
      .string()
      .min(TIP_MIN, `Write at least ${TIP_MIN} characters.`)
      .max(TIP_MAX, `Keep it under ${TIP_MAX} characters.`)
      .superRefine((s, ctx) => {
        const problem = tipProblem(s);
        if (problem) ctx.addIssue({ code: 'custom', message: problem });
      }),
  );

const target = z.string().min(1).max(100);

/** A tip is about exactly one step or one office. */
export const submitTipBody = z
  .strictObject({
    stepId: target.optional(),
    officeId: target.optional(),
    body: tipText,
  })
  .refine((v) => (v.stepId === undefined) !== (v.officeId === undefined), {
    message: 'Say whether the tip is about a step or an office, not both.',
    path: ['stepId'],
  });

/** An anonymous browser id, sent as `X-Voter-Id`. Only its hash is stored. */
export const voterId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
