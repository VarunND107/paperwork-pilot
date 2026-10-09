import { describe, expect, it } from 'vitest';
import { bearerToken, createToken, hashesMatch, hashToken, tokenKind } from './tokens.js';

describe('tokens', () => {
  it('creates distinct, prefixed, unguessable tokens', () => {
    const a = createToken('case');
    const b = createToken('case');
    expect(a).not.toBe(b);
    expect(a.startsWith('pp_case_')).toBe(true);
    expect(a.length).toBeGreaterThan(40);
    expect(createToken('member').startsWith('pp_member_')).toBe(true);
  });

  it('hashes deterministically and never returns the token', () => {
    const token = createToken('case');
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
    expect(hashToken(token)).not.toBe(hashToken(`${token}x`));
  });

  it('compares hashes', () => {
    const h = hashToken('one');
    expect(hashesMatch(h, hashToken('one'))).toBe(true);
    expect(hashesMatch(h, hashToken('two'))).toBe(false);
    expect(hashesMatch(h, 'short')).toBe(false);
  });

  it('tells the kinds apart', () => {
    expect(tokenKind(createToken('case'))).toBe('case');
    expect(tokenKind(createToken('member'))).toBe('member');
    expect(tokenKind('something-else')).toBeNull();
  });
});

describe('bearerToken', () => {
  const token = createToken('case');
  it('reads a Bearer header', () => {
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer ${token}`)).toBe(token);
  });
  it('rejects missing and malformed headers', () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken(token)).toBeNull();
    expect(bearerToken('Basic abcdef1234567890')).toBeNull();
    expect(bearerToken('Bearer short')).toBeNull();
    expect(bearerToken(`Bearer ${'a'.repeat(300)}`)).toBeNull();
    expect(bearerToken('Bearer has spaces inside token')).toBeNull();
  });
});
