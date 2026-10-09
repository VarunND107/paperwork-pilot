import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'pp_admin';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** A session is `<expiry>.<signature>`: nothing secret inside, forged only with SESSION_SECRET. */
export function createAdminSession(secret: string, now: Date): string {
  const payload = Buffer.from(JSON.stringify({ exp: now.getTime() + SESSION_TTL_MS })).toString(
    'base64url',
  );
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyAdminSession(secret: string, value: string | undefined, now: Date): boolean {
  if (!value) return false;
  const [payload, signature, ...rest] = value.split('.');
  if (!payload || !signature || rest.length > 0) return false;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof parsed.exp === 'number' && parsed.exp > now.getTime();
  } catch {
    return false;
  }
}

/** Compares passwords without leaking their length or content through timing. */
export function passwordMatches(expected: string, given: string, secret: string): boolean {
  const a = createHmac('sha256', secret).update(expected).digest();
  const b = createHmac('sha256', secret).update(given).digest();
  return timingSafeEqual(a, b);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) result[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}
