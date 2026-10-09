import { Router } from 'express';
import { matchText } from '../match.js';
import { eventSummary } from '../services/views.js';
import type { EventSummary } from '../services/types.js';
import type { AppContext } from './context.js';
import { matchBody } from './schemas.js';

export interface MatchResponse {
  /** The best match, or null when nothing in the text pointed at a situation. */
  matched: EventSummary | null;
  /** Every situation that matched, best first. */
  candidates: { event: EventSummary; score: number }[];
  /** When nothing matched: every situation, so the visitor can pick one. */
  suggestions: EventSummary[];
}

export function matchRouter(ctx: AppContext): Router {
  const router = Router();

  // Free text -> situation. Keyword-based for now; keywords live on each event.
  router.post('/match', ctx.limiters.match, async (req, res) => {
    const { text } = matchBody.parse(req.body);
    const events = await ctx.prisma.event.findMany({
      orderBy: { position: 'asc' },
      include: { steps: { select: { verified: true } } },
    });
    const summaries = new Map(events.map((e) => [e.id, eventSummary(e, e.steps)]));
    const scores = matchText(
      text,
      events.map((e) => ({ id: e.id, position: e.position, keywords: e.keywords })),
    );
    const candidates = scores.flatMap((s) => {
      const event = summaries.get(s.eventId);
      return event ? [{ event, score: s.score }] : [];
    });
    const body: MatchResponse = {
      matched: candidates[0]?.event ?? null,
      candidates,
      suggestions: candidates.length === 0 ? [...summaries.values()] : [],
    };
    res.json(body);
  });

  return router;
}
