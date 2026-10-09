import { z } from 'zod';
import { isDateOnly } from '../engine/dates.js';

/** A real calendar date as YYYY-MM-DD. */
export const dateOnly = z.string().refine(isDateOnly, 'Use a real date in YYYY-MM-DD form.');

export const idParam = z.string().min(1).max(100);

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.').max(254));

export const matchBody = z.strictObject({ text: z.string().trim().min(1).max(300) });

export const routeQuery = z.object({ eventDate: dateOnly.optional() });

export const createCaseBody = z.strictObject({
  eventId: idParam,
  eventDate: dateOnly.nullish(),
});

export const patchCaseBody = z
  .strictObject({
    eventDate: dateOnly.nullable().optional(),
    remindersOptIn: z.boolean().optional(),
    reminderEmail: email.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change.');

export const patchStepBody = z.strictObject({ done: z.boolean() });

export const patchDocumentBody = z.strictObject({ ticked: z.boolean() });
