import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

/** Error with an HTTP status and a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new HttpError(400, code, message, details);
  }
  static unauthorized(message = 'Authentication required.') {
    return new HttpError(401, 'unauthorized', message);
  }
  static forbidden(message = 'You do not have access to this.') {
    return new HttpError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found.') {
    return new HttpError(404, 'not_found', message);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new HttpError(409, code, message, details);
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(HttpError.notFound('No such route.'));
};

// Express identifies error middleware by its four-argument signature.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ErrorBody = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.status).json(body);
    return;
  }
  if (err instanceof ZodError) {
    const body: ErrorBody = {
      error: {
        code: 'validation_error',
        message: 'The request was not valid.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
    res.status(400).json(body);
    return;
  }
  // body-parser: malformed JSON or payload too large.
  const status = (err as { status?: number; type?: string } | null)?.status;
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') {
    res
      .status(400)
      .json({ error: { code: 'invalid_json', message: 'Request body is not valid JSON.' } });
    return;
  }
  if (type === 'entity.too.large' || status === 413) {
    res.status(413).json({ error: { code: 'too_large', message: 'Request body is too large.' } });
    return;
  }
  console.error('Unhandled error', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Something went wrong.' } });
};
