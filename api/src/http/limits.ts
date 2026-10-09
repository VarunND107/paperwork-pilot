import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

export interface RateLimits {
  /** Requests per IP per 15 minutes for the whole API. */
  general: number;
  /** POST /match per IP per minute. */
  match: number;
  /** POST /cases per IP per hour. */
  createCase: number;
  /** POST /tips and POST /tips/:id/flag-stale per IP per hour. */
  tips: number;
  /** Admin login attempts per IP per 15 minutes. */
  adminLogin: number;
  /** Pro organisation sign-ups per IP per hour. */
  createOrg: number;
}

export const DEFAULT_LIMITS: RateLimits = {
  general: 1000,
  match: 60,
  createCase: 40,
  tips: 20,
  adminLogin: 10,
  createOrg: 10,
};

const MINUTE = 60_000;

export function limiter(windowMs: number, limit: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many requests. Please wait a little and try again.',
        },
      });
    },
  });
}

export function createLimiters(limits: RateLimits) {
  return {
    general: limiter(15 * MINUTE, limits.general),
    match: limiter(MINUTE, limits.match),
    createCase: limiter(60 * MINUTE, limits.createCase),
    tips: limiter(60 * MINUTE, limits.tips),
    adminLogin: limiter(15 * MINUTE, limits.adminLogin),
    createOrg: limiter(60 * MINUTE, limits.createOrg),
  };
}

export type Limiters = ReturnType<typeof createLimiters>;
