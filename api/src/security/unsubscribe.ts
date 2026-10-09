import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Every reminder carries an unsubscribe link. The link names the case and a signature made with
 * SESSION_SECRET, so nobody can unsubscribe a case they have not been emailed about, and the link
 * contains no access token.
 */
export function unsubscribeSignature(caseId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${caseId}`).digest('base64url');
}

export function verifyUnsubscribeSignature(
  caseId: string,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(unsubscribeSignature(caseId, secret));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(publicUrl: string, caseId: string, secret: string): string {
  const query = new URLSearchParams({ case: caseId, sig: unsubscribeSignature(caseId, secret) });
  return `${publicUrl}/unsubscribe?${query.toString()}`;
}
