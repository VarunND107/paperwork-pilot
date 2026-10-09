import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import type { CaseSession } from '../api/caseStore';
import type { StepResponse } from '../api/client';
import { caseAfterStepOne, freshCase } from '../test/fixtures';
import { useCaseBoard } from './useCaseBoard';

const session: CaseSession = { id: 'case-1', token: 'pp_case_token_0123456789' };

function stepResponse(over: Partial<StepResponse> = {}): StepResponse {
  return {
    case: caseAfterStepOne(),
    changes: { unlocked: ['s2'], relocked: [], reopened: [] },
    unchanged: false,
    ...over,
  };
}

async function loaded(s: CaseSession | null = session) {
  const hook = renderHook(() => useCaseBoard(s));
  await waitFor(() => {
    expect(hook.result.current.state.status).toBe(s ? 'ready' : 'idle');
  });
  return hook;
}

describe('useCaseBoard: loading', () => {
  it('loads the case with its token and selects the next step', async () => {
    const get = vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    const { result } = await loaded();
    expect(get).toHaveBeenCalledWith('case-1', session.token, expect.any(AbortSignal));
    expect(result.current.state.view?.id).toBe('case-1');
    expect(result.current.state.selectedId).toBe('s1');
  });

  it('does nothing without a session', async () => {
    const get = vi.spyOn(api, 'getCase');
    const { result } = await loaded(null);
    expect(get).not.toHaveBeenCalled();
    expect(result.current.state.view).toBeNull();
  });

  it.each([
    [401, 'no-access'],
    [404, 'not-found'],
    [500, 'error'],
  ] as const)('maps HTTP %i to the %s state', async (status, expected) => {
    vi.spyOn(api, 'getCase').mockRejectedValue(new ApiError(status, 'x', 'boom'));
    const { result } = renderHook(() => useCaseBoard(session));
    await waitFor(() => {
      expect(result.current.state.status).toBe(expected);
    });
  });

  it('can retry after an error', async () => {
    const get = vi
      .spyOn(api, 'getCase')
      .mockRejectedValueOnce(new ApiError(0, 'network', 'offline'))
      .mockResolvedValue(freshCase());
    const { result } = renderHook(() => useCaseBoard(session));
    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });
    act(() => {
      result.current.reload();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('useCaseBoard: marking steps done', () => {
  it('calls the API, replaces the case with the recomputed one, and announces what unlocked', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    const done = vi.spyOn(api, 'setStepDone').mockResolvedValue(stepResponse());
    const { result } = await loaded();

    await act(async () => {
      await result.current.complete('s1');
    });
    expect(done).toHaveBeenCalledWith('case-1', session.token, 's1', true);
    const { state } = result.current;
    expect(state.view?.progress.done).toBe(1);
    expect(state.flashIds).toEqual(['s2']);
    expect(state.slamStepId).toBe('s1');
    expect(state.slamKey).toBe(1);
    expect(state.announcement).toBe('Step 1 done. 1 more step is now ready.');
    expect(state.busy).toBe(false);
  });

  it('announces plain "Step N done." when nothing unlocked', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    vi.spyOn(api, 'setStepDone').mockResolvedValue(
      stepResponse({ changes: { unlocked: [], relocked: [], reopened: [] } }),
    );
    const { result } = await loaded();
    await act(async () => {
      await result.current.complete('s1');
    });
    expect(result.current.state.announcement).toBe('Step 1 done.');
  });

  it('does not replay the stamp when the server says nothing changed', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    vi.spyOn(api, 'setStepDone').mockResolvedValue(stepResponse({ unchanged: true }));
    const { result } = await loaded();
    await act(async () => {
      await result.current.complete('s1');
    });
    expect(result.current.state.slamStepId).toBeNull();
  });

  it('says what went wrong and re-syncs when the server refuses', async () => {
    const get = vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    vi.spyOn(api, 'setStepDone').mockRejectedValue(
      new ApiError(
        409,
        'documents_missing',
        'Tick each document you are carrying before you mark this step done.',
      ),
    );
    const { result } = await loaded();
    await act(async () => {
      await result.current.complete('s1');
    });
    expect(result.current.state.announcement).toBe(
      'That did not work: Tick each document you are carrying before you mark this step done.',
    );
    expect(get).toHaveBeenCalledTimes(2); // initial load + re-sync
    expect(result.current.state.busy).toBe(false);
  });
});

describe('useCaseBoard: undo', () => {
  it('reports how many later steps were re-locked', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(caseAfterStepOne());
    const undo = vi.spyOn(api, 'setStepDone').mockResolvedValue(
      stepResponse({
        case: freshCase(),
        changes: { unlocked: [], relocked: ['s2'], reopened: ['s1', 's2', 's3'] },
      }),
    );
    const { result } = await loaded();
    await act(async () => {
      await result.current.undo('s1');
    });
    expect(undo).toHaveBeenCalledWith('case-1', session.token, 's1', false);
    expect(result.current.state.view?.progress.done).toBe(0);
    expect(result.current.state.announcement).toBe(
      'Step 1 reopened. 2 later steps are locked again.',
    );
    expect(result.current.state.slamStepId).toBeNull();
  });

  it('says only "reopened" when no later step was affected', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(caseAfterStepOne());
    vi.spyOn(api, 'setStepDone').mockResolvedValue(
      stepResponse({
        case: freshCase(),
        changes: { unlocked: [], relocked: [], reopened: ['s1'] },
      }),
    );
    const { result } = await loaded();
    await act(async () => {
      await result.current.undo('s1');
    });
    expect(result.current.state.announcement).toBe('Step 1 reopened.');
  });
});

describe('useCaseBoard: documents', () => {
  it("ticks optimistically, then takes the server's answer", async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    let resolve: (v: ReturnType<typeof freshCase>) => void = () => undefined;
    vi.spyOn(api, 'setDocumentTicked').mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { result } = await loaded();

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.toggleDocument('d-id', true);
    });
    // Before the server answers the tick is already visible.
    expect(result.current.state.view?.steps[0]?.documents[1]?.state).toBe('ticked');
    expect(result.current.state.busy).toBe(true);

    const serverView = freshCase();
    const s1 = serverView.steps[0];
    if (!s1) throw new Error('fixture');
    serverView.steps[0] = {
      ...s1,
      documents: s1.documents.map((d) => (d.documentId === 'd-id' ? { ...d, state: 'ticked' } : d)),
    };
    await act(async () => {
      resolve(serverView);
      await pending;
    });
    expect(result.current.state.view?.steps[0]?.documents[1]?.state).toBe('ticked');
    expect(result.current.state.busy).toBe(false);
  });

  it('puts things right when the tick is refused', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    vi.spyOn(api, 'setDocumentTicked').mockRejectedValue(
      new ApiError(409, 'document_not_tickable', 'Nope.'),
    );
    const { result } = await loaded();
    await act(async () => {
      await result.current.toggleDocument('d-id', true);
    });
    expect(result.current.state.view?.steps[0]?.documents[1]?.state).toBe('open');
    expect(result.current.state.announcement).toContain('Nope.');
  });
});

describe('useCaseBoard: reset, date, selection', () => {
  it('reset replaces the case and replays the entrance', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(caseAfterStepOne());
    const reset = vi.spyOn(api, 'resetCase').mockResolvedValue(freshCase());
    const { result } = await loaded();
    const before = result.current.state.enterKey;
    await act(async () => {
      await result.current.reset();
    });
    expect(reset).toHaveBeenCalledWith('case-1', session.token);
    expect(result.current.state.view?.progress.done).toBe(0);
    expect(result.current.state.selectedId).toBe('s1');
    expect(result.current.state.enterKey).toBe(before + 1);
  });

  it('sets the event date and announces it', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    const patch = vi
      .spyOn(api, 'patchCase')
      .mockResolvedValue(freshCase({ eventDate: '2026-10-01' }));
    const { result } = await loaded();
    await act(async () => {
      await result.current.setEventDate('2026-10-01');
    });
    expect(patch).toHaveBeenCalledWith('case-1', session.token, { eventDate: '2026-10-01' });
    expect(result.current.state.view?.eventDate).toBe('2026-10-01');
    expect(result.current.state.announcement).toBe('Date saved. Deadlines updated.');
  });

  it('announces when the date is cleared', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase({ eventDate: '2026-10-01' }));
    vi.spyOn(api, 'patchCase').mockResolvedValue(freshCase());
    const { result } = await loaded();
    await act(async () => {
      await result.current.setEventDate(null);
    });
    expect(result.current.state.announcement).toBe('Date cleared.');
  });

  it('selects a step', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    const { result } = await loaded();
    act(() => {
      result.current.select('s3');
    });
    expect(result.current.state.selectedId).toBe('s3');
  });

  it('accepts a view returned by another call', async () => {
    vi.spyOn(api, 'getCase').mockResolvedValue(freshCase());
    const { result } = await loaded();
    act(() => {
      result.current.replaceView(
        freshCase({ remindersOptIn: true, reminderEmail: 'a@example.com' }),
      );
    });
    expect(result.current.state.view?.reminderEmail).toBe('a@example.com');
  });
});
