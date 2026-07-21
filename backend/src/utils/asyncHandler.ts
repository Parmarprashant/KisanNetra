/**
 * asyncHandler — wraps async route handlers so thrown errors / rejected
 * promises are forwarded to Express's error handling chain (our global
 * errorHandler) instead of crashing the process. This lets controllers simply
 * `throw` typed errors per rules.md.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export const asyncHandler =
  (fn: AsyncRequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
