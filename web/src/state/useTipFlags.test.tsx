import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { caseStore } from '../api/caseStore';
import type { TipView } from '../api/types';
import { useTipFlags } from './useTipFlags';

const tip: TipView = {
  id: 't1',
  scope: 'step',
  body: 'Go after 2 pm.',
  origin: 'USER',
  createdAt: '2026-09-01T05:00:00.000Z',
  staleFlags: 0,
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('useTipFlags', () => {
  it("sends this browser's anonymous id and remembers the flag", async () => {
    const send = vi.spyOn(api, 'flagTip').mockResolvedValue({ tip: { id: 't1', staleFlags: 1 } });
    const { result } = renderHook(() => useTipFlags());
    expect(result.current.flagged.has('t1')).toBe(false);
    await act(() => result.current.flag(tip));
    expect(send).toHaveBeenCalledWith('t1', caseStore.voterId());
    expect(result.current.flagged.has('t1')).toBe(true);
    expect(caseStore.flaggedTips()).toEqual(['t1']);
  });

  it('remembers flags after a reload', () => {
    caseStore.markTipFlagged('t1');
    const { result } = renderHook(() => useTipFlags());
    expect(result.current.flagged.has('t1')).toBe(true);
  });

  it('keeps the same anonymous id between flags', () => {
    expect(caseStore.voterId()).toBe(caseStore.voterId());
    expect(caseStore.voterId().length).toBeGreaterThanOrEqual(16);
  });

  it('reports a failure and does not remember it as flagged', async () => {
    vi.spyOn(api, 'flagTip').mockRejectedValue(new ApiError(0, 'network', 'offline'));
    const { result } = renderHook(() => useTipFlags());
    await act(() => result.current.flag(tip));
    expect(result.current.flagged.has('t1')).toBe(false);
    expect(result.current.errors.get('t1')).toBe(
      'We could not record that. Try again in a moment.',
    );
    expect(caseStore.flaggedTips()).toEqual([]);
  });

  it('clears the failure when a retry works', async () => {
    const send = vi
      .spyOn(api, 'flagTip')
      .mockRejectedValueOnce(new ApiError(0, 'network', 'offline'))
      .mockResolvedValueOnce({ tip: { id: 't1', staleFlags: 1 } });
    const { result } = renderHook(() => useTipFlags());
    await act(() => result.current.flag(tip));
    await act(() => result.current.flag(tip));
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.current.errors.has('t1')).toBe(false);
    expect(result.current.flagged.has('t1')).toBe(true);
  });
});
