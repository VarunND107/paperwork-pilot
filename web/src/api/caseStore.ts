/**
 * Anonymous cases are identified by a secret token that lives only in this browser's localStorage.
 * localStorage can be unavailable (private windows, blocked site data), so every access is
 * wrapped and falls back to memory for the life of the page.
 */

const CASES_KEY = 'pp:cases'; // { [caseId]: token }
const DEMO_KEY = 'pp:demo'; // { [eventSlug]: caseId }
const VOTER_KEY = 'pp:voter';
const MEMBER_KEY = 'pp:member'; // professional plan access key
const FLAGGED_KEY = 'pp:flagged-tips'; // [tipId]

/** Holds only what localStorage refused to keep (blocked or full), never a shadow copy. */
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    /* fall through to memory */
  }
  return memory.get(key) ?? null;
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}

function readMap(key: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(read(key) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
    }
  } catch {
    /* corrupted: start again */
  }
  return {};
}

export interface CaseSession {
  id: string;
  token: string;
}

export const caseStore = {
  getToken(caseId: string): string | null {
    return readMap(CASES_KEY)[caseId] ?? null;
  },
  save(caseId: string, token: string): void {
    write(CASES_KEY, JSON.stringify({ ...readMap(CASES_KEY), [caseId]: token }));
  },
  forget(caseId: string): void {
    const next = readMap(CASES_KEY);
    delete next[caseId];
    write(CASES_KEY, JSON.stringify(next));
    const demo = readMap(DEMO_KEY);
    for (const [slug, id] of Object.entries(demo)) if (id === caseId) delete demo[slug];
    write(DEMO_KEY, JSON.stringify(demo));
  },
  /** The case this browser is using for the live demo of one situation, if any. */
  demoSession(eventSlug: string): CaseSession | null {
    const id = readMap(DEMO_KEY)[eventSlug];
    const token = id ? readMap(CASES_KEY)[id] : undefined;
    return id && token ? { id, token } : null;
  },
  setDemo(eventSlug: string, caseId: string): void {
    write(DEMO_KEY, JSON.stringify({ ...readMap(DEMO_KEY), [eventSlug]: caseId }));
  },
  /** Every case saved in this browser, newest-saved last. */
  caseIds(): string[] {
    return Object.keys(readMap(CASES_KEY));
  },
  /** The professional plan's access key for this browser, if someone signed in. */
  memberKey(): string | null {
    return read(MEMBER_KEY);
  },
  setMemberKey(key: string): void {
    write(MEMBER_KEY, key);
  },
  forgetMemberKey(): void {
    try {
      window.localStorage.removeItem(MEMBER_KEY);
    } catch {
      /* blocked: fall through to memory */
    }
    memory.delete(MEMBER_KEY);
  },
  /** Tips this browser has already flagged, so the button can say so after a reload. */
  flaggedTips(): string[] {
    try {
      const parsed: unknown = JSON.parse(read(FLAGGED_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  },
  markTipFlagged(tipId: string): void {
    const ids = caseStore.flaggedTips();
    if (!ids.includes(tipId)) write(FLAGGED_KEY, JSON.stringify([...ids, tipId].slice(-200)));
  },
  /** An anonymous id used only so one browser cannot flag the same tip twice. */
  voterId(): string {
    const existing = read(VOTER_KEY);
    if (existing && existing.length >= 16) return existing;
    const id = crypto.randomUUID();
    write(VOTER_KEY, id);
    return id;
  },
};
