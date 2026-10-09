import { Router } from 'express';
import { STALE_AFTER_DAYS } from '../engine/verification.js';
import { DISCLAIMER } from '../services/types.js';
import type { AppContext } from './context.js';

export function metaRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    try {
      await ctx.prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', env: ctx.config.nodeEnv });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  // Runtime flags for the web app, so it does not need rebuilding to turn a feature on.
  router.get('/config', (_req, res) => {
    res.json({
      proEnabled: ctx.config.proEnabled,
      adminEnabled: ctx.config.adminPassword !== '',
      emailProvider: ctx.config.emailProvider,
      staleAfterDays: STALE_AFTER_DAYS,
      disclaimer: DISCLAIMER,
    });
  });

  return router;
}
