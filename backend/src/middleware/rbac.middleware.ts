/**
 * Role-Based Access Control (RBAC) middleware.
 *
 * Must run AFTER authenticateJWT (which populates req.user).
 *  - requireRole(...roles): allow only the listed roles.
 *  - requireRegionalScope: force extension officers to their own district by
 *    injecting a region filter into the query, preventing cross-region access.
 */
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import type { Role } from '../models/User';

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions for this action');
    }
    next();
  };

/**
 * Regional scope guard. Extension officers may only access data within their
 * assigned district — we overwrite any client-supplied `region` with theirs.
 * Other roles pass through unchanged.
 */
export const requireRegionalScope = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (!req.user) {
    throw new UnauthorizedError('Authentication required');
  }
  if (req.user.role === 'extension_officer' && req.user.region) {
    req.query.region = req.user.region;
  }
  next();
};
