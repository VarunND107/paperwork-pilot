/**
 * Keyword matching from free text to an event. Deliberately simple and explainable: each event has
 * a list of keywords the admin can edit. Replace with something smarter later; keep this contract.
 *
 * A keyword is one of:
 *   word        matches a whole word          "death"
 *   two words   matches that exact phrase     "passed away"  (counts double)
 *   stem*       matches any word starting so  "bereav*"
 */

export interface MatchableEvent {
  id: string;
  position: number;
  keywords: readonly string[];
}

export interface MatchScore {
  eventId: string;
  score: number;
  /** The keywords that matched, for debugging and for the admin panel. */
  matched: string[];
}

/** Lower-case, drop apostrophes, and split on anything that is not a letter or digit. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0);
}

function containsPhrase(tokens: readonly string[], phrase: readonly string[]): boolean {
  if (phrase.length === 0 || phrase.length > tokens.length) return false;
  for (let i = 0; i <= tokens.length - phrase.length; i++) {
    if (phrase.every((word, j) => tokens[i + j] === word)) return true;
  }
  return false;
}

export function scoreEvent(tokens: readonly string[], keywords: readonly string[]): MatchScore {
  const matched: string[] = [];
  let score = 0;
  const seen = new Set<string>();
  for (const raw of keywords) {
    const isStem = raw.trim().endsWith('*');
    const words = tokenize(raw.replace(/\*+$/, ''));
    if (words.length === 0) continue;
    const key = `${words.join(' ')}${isStem ? '*' : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let hit = false;
    if (isStem && words.length === 1) {
      const stem = words[0] ?? '';
      hit = tokens.some((t) => t.startsWith(stem));
    } else {
      hit = containsPhrase(tokens, words);
    }
    if (hit) {
      matched.push(raw);
      score += words.length > 1 ? 2 : 1;
    }
  }
  return { eventId: '', score, matched };
}

/**
 * Scores every event against the text. Returns only events with at least one hit, best first.
 * Ties go to the event with the lowest position, so the result is stable.
 */
export function matchText(text: string, events: readonly MatchableEvent[]): MatchScore[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];
  return events
    .map((event) => ({
      position: event.position,
      ...scoreEvent(tokens, event.keywords),
      eventId: event.id,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position)
    .map(({ eventId, score, matched }) => ({ eventId, score, matched }));
}
