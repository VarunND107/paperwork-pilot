import { describe, expect, it, vi } from 'vitest';
import { caseStore } from './caseStore';

describe('caseStore', () => {
  it('remembers a case token', () => {
    caseStore.save('c1', 'pp_case_token_one');
    expect(caseStore.getToken('c1')).toBe('pp_case_token_one');
    expect(caseStore.getToken('other')).toBeNull();
    expect(caseStore.caseIds()).toEqual(['c1']);
  });

  it('keeps several cases side by side', () => {
    caseStore.save('c1', 'a');
    caseStore.save('c2', 'b');
    expect(caseStore.getToken('c1')).toBe('a');
    expect(caseStore.getToken('c2')).toBe('b');
  });

  it('finds the demo case for a situation only while its token is stored', () => {
    expect(caseStore.demoSession('death')).toBeNull();
    caseStore.save('c1', 'tok');
    caseStore.setDemo('death', 'c1');
    expect(caseStore.demoSession('death')).toEqual({ id: 'c1', token: 'tok' });
    expect(caseStore.demoSession('move')).toBeNull();
  });

  it('forgetting a case also forgets it as a demo case', () => {
    caseStore.save('c1', 'tok');
    caseStore.setDemo('death', 'c1');
    caseStore.forget('c1');
    expect(caseStore.getToken('c1')).toBeNull();
    expect(caseStore.demoSession('death')).toBeNull();
  });

  it('starts again from corrupted data instead of crashing', () => {
    window.localStorage.setItem('pp:cases', '{not json');
    window.localStorage.setItem('pp:demo', '[1,2,3]');
    expect(caseStore.getToken('c1')).toBeNull();
    expect(caseStore.demoSession('death')).toBeNull();
    caseStore.save('c1', 'tok');
    expect(caseStore.getToken('c1')).toBe('tok');
  });

  it('ignores stored values that are not strings', () => {
    window.localStorage.setItem('pp:cases', JSON.stringify({ c1: 5, c2: 'ok' }));
    expect(caseStore.getToken('c1')).toBeNull();
    expect(caseStore.getToken('c2')).toBe('ok');
  });

  it('keeps working in memory when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    caseStore.save('mem-1', 'tok-mem');
    expect(caseStore.getToken('mem-1')).toBe('tok-mem');
  });

  it('does not bring back data that was cleared from localStorage', () => {
    caseStore.save('c1', 'tok');
    caseStore.setDemo('death', 'c1');
    window.localStorage.clear();
    expect(caseStore.getToken('c1')).toBeNull();
    expect(caseStore.demoSession('death')).toBeNull();
  });

  it('gives a stable anonymous voter id', () => {
    const first = caseStore.voterId();
    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(caseStore.voterId()).toBe(first);
  });
});
