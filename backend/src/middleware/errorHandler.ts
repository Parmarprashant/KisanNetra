/**
 * Global error handling middleware.
 *
 * Per rules.md:
 *  - Never expose internal stack traces to clients.
 *  - Always log unexpected failures.
 *  - Map typed AppErrors to their status/code; treat everything else as 500.
 *
 * Also exports notFoundHandler for unmatched routes.
 */
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/errors';
import { apiResponse } from '../utils/apiResponse';
import { isProduction } from '../config/env';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res
    .status(404)
    .json(
      apiResponse.error('not_found', `Route not found: ${req.method} ${req.originalUrl}`),
    );
}

// Express identifies error handlers by their 4-arg signature; `_next` is required.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 1. Zod validation errors → 422
  if (err instanceof ZodError) {
    res
      .status(422)
      .json(
        apiResponse.error(
          'validation_error',
          'Request validation failed',
          err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
    return;
  }

  // 2. Mongoose validation / cast errors → 400
  if (err instanceof mongoose.Error.ValidationError) {
    res
      .status(400)
      .json(apiResponse.error('validation_error', err.message));
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res
      .status(400)
      .json(apiResponse.error('invalid_id', `Invalid value for '${err.path}'`));
    return;
  }

  // 3. Known typed application errors
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error('Non-operational AppError', {
        message: err.message,
        stack: err.stack,
      });
    }
    res
      .status(err.statusCode)
      .json(apiResponse.error(err.code, err.message, err.details));
    return;
  }

  // 4. Unknown / unexpected errors → 500 (log full detail, hide from client)
  const error = err as Error;
  logger.error('Unhandled error', {
    message: error?.message,
    stack: error?.stack,
    path: req.originalUrl,
    method: req.method,
  });

  res
    .status(500)
    .json(
      apiResponse.error(
        'internal_server_error',
        isProduction ? 'An unexpected error occurred' : error?.message ?? 'Unknown error',
      ),
    );
}
