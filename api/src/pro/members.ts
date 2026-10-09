import type { Request } from 'express';
import type { Db } from '../db.js';
import type { OrgMember } from '../generated/prisma/client.js';
import { HttpError } from '../errors.js';
import { bearerToken, createToken, hashToken, tokenKind } from '../security/tokens.js';
import type { MemberView, OrgView } from './types.js';

export function memberView(
  m: Pick<OrgMember, 'id' | 'name' | 'email' | 'role' | 'createdAt'>,
): MemberView {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    createdAt: m.createdAt.toISOString(),
  };
}

export interface Session {
  member: OrgMember;
  org: OrgView;
}

/**
 * Who is calling: a member of an organisation, by the secret access key in `Authorization`.
 * Until email login exists the key is the whole credential, so only its hash is stored.
 */
export async function requireMember(db: Db, req: Request): Promise<Session> {
  const token = bearerToken(req.headers.authorization);
  if (!token || tokenKind(token) !== 'member') {
    throw HttpError.unauthorized('Sign in with your access key to use the professional plan.');
  }
  const member = await db.orgMember.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { org: { select: { id: true, name: true } } },
  });
  if (!member) throw HttpError.unauthorized('That access key is not valid.');
  const { org, ...rest } = member;
  return { member: rest, org };
}

export function requireOwner(session: Session): void {
  if (session.member.role !== 'OWNER') {
    throw HttpError.forbidden('Only an owner of the organisation can do this.');
  }
}

/** A new organisation with its first member, who owns it. The access key is shown once. */
export async function createOrganization(
  db: Db,
  input: { orgName: string; name: string; email: string },
): Promise<{ token: string; org: OrgView; member: MemberView }> {
  const token = createToken('member');
  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: input.email },
      create: { email: input.email, name: input.name },
      update: {},
    });
    const org = await tx.organization.create({ data: { name: input.orgName } });
    const member = await tx.orgMember.create({
      data: {
        orgId: org.id,
        userId: user.id,
        email: input.email,
        name: input.name,
        role: 'OWNER',
        tokenHash: hashToken(token),
      },
    });
    return { org, member };
  });
  return {
    token,
    org: { id: created.org.id, name: created.org.name },
    member: memberView(created.member),
  };
}

export async function listMembers(db: Db, orgId: string): Promise<MemberView[]> {
  const members = await db.orgMember.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
  return members.map(memberView);
}

/** An owner adds a colleague and hands them the access key shown here, once. */
export async function addMember(
  db: Db,
  orgId: string,
  input: { name: string; email: string },
): Promise<{ token: string; member: MemberView }> {
  const taken = await db.orgMember.findUnique({
    where: { orgId_email: { orgId, email: input.email } },
    select: { id: true },
  });
  if (taken) {
    throw HttpError.conflict('member_exists', 'Someone with that email is already in your team.');
  }
  const token = createToken('member');
  const member = await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: input.email },
      create: { email: input.email, name: input.name },
      update: {},
    });
    return tx.orgMember.create({
      data: {
        orgId,
        userId: user.id,
        email: input.email,
        name: input.name,
        role: 'MEMBER',
        tokenHash: hashToken(token),
      },
    });
  });
  return { token, member: memberView(member) };
}

export async function removeMember(db: Db, session: Session, memberId: string): Promise<void> {
  if (memberId === session.member.id) {
    throw HttpError.badRequest('cannot_remove_self', 'You cannot remove yourself from your team.');
  }
  const { count } = await db.orgMember.deleteMany({
    where: { id: memberId, orgId: session.org.id },
  });
  if (count === 0) throw HttpError.notFound('There is no such team member.');
}

/** Replaces the caller's access key. The old one stops working at once. */
export async function rotateKey(db: Db, session: Session): Promise<string> {
  const token = createToken('member');
  await db.orgMember.update({
    where: { id: session.member.id },
    data: { tokenHash: hashToken(token) },
  });
  return token;
}
