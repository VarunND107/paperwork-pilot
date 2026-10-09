import type { Db, Prisma } from '../db.js';
import { HttpError } from '../errors.js';
import type { AdminTipList, AdminTipRow, TipFilter } from './types.js';

const MAX_ROWS = 200;

const FLAGGED = { status: 'APPROVED', flags: { some: {} } } satisfies Prisma.TipWhereInput;
const PENDING = { status: 'PENDING' } satisfies Prisma.TipWhereInput;

function whereFor(filter: TipFilter): Prisma.TipWhereInput {
  switch (filter) {
    case 'pending':
      return PENDING;
    case 'flagged':
      return FLAGGED;
    case 'approved':
      return { status: 'APPROVED' };
    case 'rejected':
      return { status: 'REJECTED' };
    case 'all':
      return {};
    case 'queue':
      return { OR: [PENDING, FLAGGED] };
  }
}

const INCLUDE = {
  step: { select: { id: true, title: true, event: { select: { label: true } } } },
  office: { select: { id: true, name: true, city: true } },
  _count: { select: { flags: true } },
} satisfies Prisma.TipInclude;

type TipRecord = Prisma.TipGetPayload<{ include: typeof INCLUDE }>;

function row(tip: TipRecord): AdminTipRow {
  const target: AdminTipRow['target'] = tip.step
    ? { kind: 'step', id: tip.step.id, label: tip.step.title, context: tip.step.event.label }
    : tip.office
      ? { kind: 'office', id: tip.office.id, label: tip.office.name, context: tip.office.city }
      : { kind: 'step', id: '', label: '(removed)', context: null };
  return {
    id: tip.id,
    body: tip.body,
    status: tip.status,
    origin: tip.origin,
    createdAt: tip.createdAt.toISOString(),
    moderatedAt: tip.moderatedAt?.toISOString() ?? null,
    flagCount: tip._count.flags,
    target,
  };
}

/** The moderation queue: oldest first, so nothing waits forever. Other views show newest first. */
export async function listTips(db: Db, filter: TipFilter): Promise<AdminTipList> {
  const [tips, pending, flagged] = await Promise.all([
    db.tip.findMany({
      where: whereFor(filter),
      orderBy: { createdAt: filter === 'queue' || filter === 'pending' ? 'asc' : 'desc' },
      take: MAX_ROWS,
      include: INCLUDE,
    }),
    db.tip.count({ where: PENDING }),
    db.tip.count({ where: FLAGGED }),
  ]);
  return { tips: tips.map(row), counts: { pending, flagged } };
}

export interface TipChange {
  status?: 'APPROVED' | 'REJECTED' | undefined;
  clearFlags?: true | undefined;
  body?: string | undefined;
}

export async function moderateTip(
  db: Db,
  id: string,
  change: TipChange,
  now: Date,
): Promise<AdminTipRow> {
  return db.$transaction(async (tx) => {
    const found = await tx.tip.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw HttpError.notFound('There is no such tip.');
    if (change.clearFlags) await tx.tipFlag.deleteMany({ where: { tipId: id } });
    const tip = await tx.tip.update({
      where: { id },
      data: {
        ...(change.status !== undefined ? { status: change.status, moderatedAt: now } : {}),
        ...(change.body !== undefined ? { body: change.body } : {}),
      },
      include: INCLUDE,
    });
    return row(tip);
  });
}

export async function deleteTip(db: Db, id: string): Promise<void> {
  const { count } = await db.tip.deleteMany({ where: { id } });
  if (count === 0) throw HttpError.notFound('There is no such tip.');
}
