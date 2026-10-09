import { Router } from 'express';
import { HttpError } from '../errors.js';
import { loadEventDefinition } from '../services/definition.js';
import { buildRouteResponse, eventSummary } from '../services/views.js';
import type { AppContext } from './context.js';
import { idParam, routeQuery } from './schemas.js';

export function eventsRouter(ctx: AppContext): Router {
  const router = Router();

  // The situations a visitor can pick from.
  router.get('/events', async (_req, res) => {
    const events = await ctx.prisma.event.findMany({
      orderBy: { position: 'asc' },
      include: { steps: { select: { verified: true } } },
    });
    res.json({ events: events.map((e) => eventSummary(e, e.steps)) });
  });

  // The ordered route for one situation, as a preview with nothing done yet.
  // `:id` is the event id or its slug. `?eventDate=YYYY-MM-DD` adds computed deadlines.
  router.get('/events/:id/route', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { eventDate } = routeQuery.parse(req.query);
    const def = await loadEventDefinition(ctx.prisma, id);
    if (!def) throw HttpError.notFound('There is no such situation.');
    res.json(buildRouteResponse(def, eventDate ?? null, ctx.clock()));
  });

  return router;
}
