import type { Request } from 'express';
import type { Db } from '../db.js';
import type { Case } from '../generated/prisma/client.js';
import { HttpError } from '../errors.js';
import { bearerToken, hashesMatch, hashToken, tokenKind } from '../security/tokens.js';

/**
 * Anonymous cases are protected by a secret token that only the creating browser holds.
 * No token: 401 (without saying whether the case exists). Wrong token or unknown case: 404.
 *
 * With the professional plan on (`allowMembers`), a member's access key also opens the cases of
 * their own organisation, and only those.
 */
export async function requireCaseAccess(
  db: Db,
  req: Request,
  caseId: string,
  allowMembers = false,
): Promise<Case> {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    throw HttpError.unauthorized(
      'This case is saved on the device that created it. Open it there, or start a new one.',
    );
  }
  const row = await db.case.findUnique({ where: { id: caseId } });
  if (allowMembers && tokenKind(token) === 'member') {
    const member = await db.orgMember.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { orgId: true },
    });
    if (!row || !member || row.orgId === null || row.orgId !== member.orgId) {
      throw HttpError.notFound('Case not found.');
    }
    return row;
  }
  const presented = hashToken(token);
  if (!row || !hashesMatch(presented, row.tokenHash)) {
    throw HttpError.notFound('Case not found.');
  }
  return row;
}
