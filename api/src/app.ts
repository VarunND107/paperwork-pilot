import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';

export function createApp(config: Config): Express {
  const app = express();
  app.disable('x-powered-by');
  // The API sits behind the web container's reverse proxy.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: config.nodeEnv });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
