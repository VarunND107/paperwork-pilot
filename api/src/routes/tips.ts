import { Router } from 'express';
import { HttpError } from '../errors.js';
import { submitTipBody, voterId } from '../tips/rules.js';
import { flagStale, submitTip } from '../tips/service.js';
import type { AppContext } from './context.js';
import { idParam } from './schemas.js';

/**
 * Visitor tips. Anyone can write one (it waits for a moderator, then shows with its date) and any
 * browser can say once that a tip looks out of date. Nobody signs in; nothing identifies a person.
 */
export function tipsRouter(ctx: AppContext): Router {
  const router = Router();

  router.post('/tips', ctx.limiters.tips, async (req, res) => {
    const body = submitTipBody.parse(req.body);
    const tip = await submitTip(ctx.prisma, body);
    res.status(201).json({ tip: { id: tip.id, status: 'PENDING' } });
  });

  router.post('/tips/:id/flag-stale', ctx.limiters.tips, async (req, res) => {
    const id = idParam.parse(req.params.id);
    const voter = voterId.safeParse(req.get('x-voter-id'));
    if (!voter.success) {
      throw HttpError.badRequest('voter_required', 'Could not tell which browser this came from.');
    }
    const tip = await flagStale(ctx.prisma, id, voter.data, ctx.config.sessionSecret);
    res.json({ tip });
  });

  return router;
}
