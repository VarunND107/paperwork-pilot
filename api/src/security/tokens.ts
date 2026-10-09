import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type TokenKind = 'case' | 'member';

const PREFIX: Record<TokenKind, string> = { case: 'pp_case_', member: 'pp_member_' };

/** A fresh secret token. 256 bits of randomness, so it cannot be guessed. */
export function createToken(kind: TokenKind): string {
  return `${PREFIX[kind]}${randomBytes(32).toString('base64url')}`;
}

/** Only the hash is stored in the database; the token itself stays in the owner's browser. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Compares two hashes without leaking, through timing, how many leading characters matched. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function tokenKind(token: string): TokenKind | null {
  if (token.startsWith(PREFIX.case)) return 'case';
  if (token.startsWith(PREFIX.member)) return 'member';
  return null;
}

/** Reads `Authorization: Bearer <token>`. Returns null if the header is missing or malformed. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9_\-.~+/=]{10,200})$/i.exec(header.trim());
  return match?.[1] ?? null;
}
