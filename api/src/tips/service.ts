import { createHmac } from 'node:crypto';
import type { Db, DbOrTx } from '../db.js';
import { HttpError } from '../errors.js';

/** No more than this many tips wait for review on one step or office, so the queue cannot be flooded. */
export const MAX_PENDING_PER_TARGET = 25;

export interface SubmitTip {
  stepId?: string | undefined;
  officeId?: string | undefined;
  body: string;
}

export async function submitTip(db: Db, input: SubmitTip): Promise<{ id: string }> {
  if (input.stepId !== undefined) {
    const step = await db.step.findUnique({ where: { id: input.stepId }, select: { id: true } });
    if (!step) throw HttpError.notFound('There is no such step.');
  } else if (input.officeId !== undefined) {
    const office = await db.office.findUnique({
      where: { id: input.officeId },
      select: { id: true },
    });
    if (!office) throw HttpError.notFound('There is no such office.');
  }

  const waiting = await db.tip.count({
    where: {
      status: 'PENDING',
      ...(input.stepId !== undefined ? { stepId: input.stepId } : { officeId: input.officeId }),
    },
  });
  if (waiting >= MAX_PENDING_PER_TARGET) {
    throw new HttpError(
      429,
      'tips_queue_full',
      'Many tips are waiting for review here. Please try again in a few days.',
    );
  }

  const tip = await db.tip.create({
    data: {
      body: input.body,
      status: 'PENDING',
      origin: 'USER',
      ...(input.stepId !== undefined ? { stepId: input.stepId } : { officeId: input.officeId }),
    },
    select: { id: true },
  });
  return tip;
}

/** Only a hash of the anonymous browser id is stored, keyed with the server secret. */
export function voterHash(secret: string, voter: string): string {
  return createHmac('sha256', secret).update(`tip-voter:${voter}`).digest('base64url');
}

/** One vote per browser per tip. Repeating it changes nothing. */
export async function flagStale(
  db: DbOrTx,
  tipId: string,
  voter: string,
  secret: string,
): Promise<{ id: string; staleFlags: number }> {
  const tip = await db.tip.findFirst({
    where: { id: tipId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!tip) throw HttpError.notFound('There is no such tip.');
  await db.tipFlag.createMany({
    data: [{ tipId, voterHash: voterHash(secret, voter) }],
    skipDuplicates: true,
  });
  const staleFlags = await db.tipFlag.count({ where: { tipId } });
  return { id: tipId, staleFlags };
}
