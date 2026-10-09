import { z } from 'zod';
import { dateOnly, email, idParam } from '../routes/schemas.js';

const label = (max: number) => z.string().trim().min(1).max(max);

export const createOrgBody = z.strictObject({
  orgName: label(80),
  name: label(80),
  email,
});

export const addMemberBody = z.strictObject({ name: label(80), email });

export const createClientBody = z.strictObject({
  clientName: label(80),
  eventId: idParam,
  eventDate: dateOnly.nullish(),
});

export const renameClientBody = z.strictObject({ clientName: label(80) });

export const clientsQuery = z.object({
  /** "attention" is everything that is not on track. */
  filter: z.enum(['all', 'attention']).default('all'),
  status: z.enum(['on_track', 'needs_document', 'overdue']).optional(),
  /** A situation, by id or slug. */
  event: idParam.optional(),
  q: z.string().trim().max(80).optional(),
});
