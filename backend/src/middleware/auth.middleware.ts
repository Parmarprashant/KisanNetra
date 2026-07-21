/**
 * Authentication middleware.
 *
 * Verifies the Bearer access token, rejects blacklisted (revoked) tokens, and
 * populates `req.user` with the authenticated context. Throws typed
 * UnauthorizedError so the global error handler produces a consistent 401.
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  verifyAccessToken,
  isAccessTokenBlacklisted,
} from '../utils/tokenUtils';
import { UnauthorizedError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';

export const authenticateJWT = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token required', 'token_missing');
    }

    const token = header.slice('Bearer '.length).trim();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Access token expired', 'token_expired');
      }
      throw new UnauthorizedError('Invalid access token', 'token_invalid');
    }

    if (await isAccessTokenBlacklisted(payload.jti)) {
      throw new UnauthorizedError('Token has been revoked', 'token_revoked');
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      lang: payload.lang,
      region: payload.region,
      jti: payload.jti,
      exp: payload.exp ?? 0,
    };

    next();
  },
);
