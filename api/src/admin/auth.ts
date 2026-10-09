import type { Request, RequestHandler } from 'express';
import type { Config } from '../config.js';
import { HttpError } from '../errors.js';
import { ADMIN_COOKIE, parseCookies, verifyAdminSession } from './session.js';

/** A state-changing request must come from this site, not from another origin. */
function sameOrigin(req: Request, config: Config): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // not a browser cross-origin request
  try {
    const host = new URL(origin).host;
    return host === req.get('host') || host === new URL(config.publicUrl).host;
  } catch {
    return false;
  }
}

/**
 * Everything under /admin except login needs a valid session cookie. The cookie is httpOnly and
 * SameSite=Strict; on top of that, writes are refused when the Origin header names another site.
 */
export function requireAdmin(config: Config, clock: () => Date): RequestHandler {
  return (req, _res, next) => {
    if (!config.adminPassword) {
      throw new HttpError(
        503,
        'admin_disabled',
        'The admin panel is switched off. Set ADMIN_PASSWORD to turn it on.',
      );
    }
    const cookie = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
    if (!verifyAdminSession(config.sessionSecret, cookie, clock())) {
      throw HttpError.unauthorized('Sign in to use the admin panel.');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req, config)) {
      throw HttpError.forbidden('This request came from another site.');
    }
    next();
  };
}
