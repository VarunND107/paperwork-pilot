import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { createLimiters, DEFAULT_LIMITS, type RateLimits } from './http/limits.js';
import { adminRouter } from './routes/admin.js';
import { casesRouter } from './routes/cases.js';
import type { AppContext } from './routes/context.js';
import { eventsRouter } from './routes/events.js';
import { matchRouter } from './routes/match.js';
import { metaRouter } from './routes/meta.js';

export interface AppDeps {
  config: Config;
  prisma: Db;
  /** The current instant. Defaults to the real clock; tests pass a fixed one. */
  clock?: () => Date;
  rateLimits?: Partial<RateLimits>;
}

/** Limits are effectively off under test so suites can make many requests. */
const TEST_LIMITS: RateLimits = Object.fromEntries(
  Object.keys(DEFAULT_LIMITS).map((k) => [k, 1_000_000]),
) as unknown as RateLimits;

export function createApp(deps: AppDeps): Express {
  const { config, prisma } = deps;
  const limits: RateLimits = {
    ...(config.nodeEnv === 'test' ? TEST_LIMITS : DEFAULT_LIMITS),
    ...deps.rateLimits,
  };
  const ctx: AppContext = {
    config,
    prisma,
    clock: deps.clock ?? (() => new Date()),
    limiters: createLimiters(limits),
  };

  const app = express();
  app.disable('x-powered-by');
  // The API sits behind the web container's reverse proxy.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(metaRouter(ctx)); // health and config are not rate limited
  app.use(ctx.limiters.general);
  app.use(express.json({ limit: '100kb' }));

  app.use(eventsRouter(ctx));
  app.use(matchRouter(ctx));
  app.use(casesRouter(ctx));
  app.use(adminRouter(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
