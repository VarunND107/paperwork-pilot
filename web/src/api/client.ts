import type {
  AppConfig,
  CaseView,
  ClientFilters,
  ClientList,
  ClientRow,
  MemberView,
  OrgView,
  DateOnly,
  EventSummary,
  MatchResponse,
  StepChanges,
} from './types';

/** An error response from the API, or a network failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** The browser always talks to /api/*; Vite (dev) and nginx (Docker) strip the prefix. */
export async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection.');
  }

  if (res.status === 204) return undefined as T;
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? res.statusText,
      err?.details,
    );
  }
  return json as T;
}

export interface CaseWithToken {
  token: string;
  case: CaseView;
}

export interface StepResponse {
  case: CaseView;
  changes: StepChanges;
  unchanged: boolean;
}

export const api = {
  config: (signal?: AbortSignal) => call<AppConfig>('/config', { signal }),
  events: (signal?: AbortSignal) =>
    call<{ events: EventSummary[] }>('/events', { signal }).then((r) => r.events),
  match: (text: string, signal?: AbortSignal) =>
    call<MatchResponse>('/match', { method: 'POST', body: { text }, signal }),
  createCase: (eventId: string, eventDate?: DateOnly | null) =>
    call<CaseWithToken>('/cases', {
      method: 'POST',
      body: { eventId, ...(eventDate ? { eventDate } : {}) },
    }),
  getCase: (id: string, token: string, signal?: AbortSignal) =>
    call<{ case: CaseView }>(`/cases/${id}`, { token, signal }).then((r) => r.case),
  patchCase: (
    id: string,
    token: string,
    body: { eventDate?: DateOnly | null; remindersOptIn?: boolean; reminderEmail?: string | null },
  ) =>
    call<{ case: CaseView }>(`/cases/${id}`, { method: 'PATCH', token, body }).then((r) => r.case),
  setStepDone: (id: string, token: string, stepId: string, done: boolean) =>
    call<StepResponse>(`/cases/${id}/steps/${stepId}`, { method: 'PATCH', token, body: { done } }),
  setDocumentTicked: (id: string, token: string, documentId: string, ticked: boolean) =>
    call<{ case: CaseView }>(`/cases/${id}/documents/${documentId}`, {
      method: 'PATCH',
      token,
      body: { ticked },
    }).then((r) => r.case),
  resetCase: (id: string, token: string) =>
    call<{ case: CaseView }>(`/cases/${id}/reset`, { method: 'POST', token }).then((r) => r.case),
  deleteCase: (id: string, token: string) =>
    call<undefined>(`/cases/${id}`, { method: 'DELETE', token }),
  /** A visitor's tip about one step or one office. It waits for a moderator before it shows. */
  submitTip: (target: { stepId: string } | { officeId: string }, body: string) =>
    call<{ tip: { id: string; status: 'PENDING' } }>('/tips', {
      method: 'POST',
      body: { ...target, body },
    }),
  /** Says a tip looks out of date. One vote per browser, however often it is sent. */
  flagTip: (tipId: string, voterId: string) =>
    call<{ tip: { id: string; staleFlags: number } }>(`/tips/${tipId}/flag-stale`, {
      method: 'POST',
      headers: { 'X-Voter-Id': voterId },
    }),
  /** The link in a reminder email: proves itself with a signature, so no access token is needed. */
  unsubscribe: (caseId: string, sig: string) =>
    call<{ ok: true }>('/reminders/unsubscribe', { method: 'POST', body: { caseId, sig } }),
};

/** The professional plan. Every call carries the member's access key. */
export const proApi = {
  signUp: (body: { orgName: string; name: string; email: string }) =>
    call<{ token: string; org: OrgView; member: MemberView }>('/pro/orgs', {
      method: 'POST',
      body,
    }),
  me: (key: string, signal?: AbortSignal) =>
    call<{ member: MemberView; org: OrgView }>('/pro/me', { token: key, signal }),
  rotateKey: (key: string) =>
    call<{ token: string }>('/pro/me/rotate-key', { method: 'POST', token: key }),
  clients: (key: string, filters: ClientFilters = {}, signal?: AbortSignal) => {
    const query = new URLSearchParams();
    for (const name of ['filter', 'status', 'event', 'q'] as const) {
      const value = filters[name];
      if (value) query.set(name, value);
    }
    const qs = query.toString();
    return call<ClientList>(`/pro/clients${qs ? `?${qs}` : ''}`, { token: key, signal });
  },
  client: (key: string, id: string, signal?: AbortSignal) =>
    call<{ client: ClientRow }>(`/pro/clients/${id}`, { token: key, signal }).then((r) => r.client),
  addClient: (
    key: string,
    body: { clientName: string; eventId: string; eventDate?: string | null },
  ) =>
    call<{ client: ClientRow }>('/pro/clients', { method: 'POST', token: key, body }).then(
      (r) => r.client,
    ),
  renameClient: (key: string, id: string, clientName: string) =>
    call<{ client: ClientRow }>(`/pro/clients/${id}`, {
      method: 'PATCH',
      token: key,
      body: { clientName },
    }).then((r) => r.client),
  members: (key: string, signal?: AbortSignal) =>
    call<{ members: MemberView[] }>('/pro/members', { token: key, signal }).then((r) => r.members),
  addMember: (key: string, body: { name: string; email: string }) =>
    call<{ token: string; member: MemberView }>('/pro/members', {
      method: 'POST',
      token: key,
      body,
    }),
  removeMember: (key: string, id: string) =>
    call<undefined>(`/pro/members/${id}`, { method: 'DELETE', token: key }),
};
