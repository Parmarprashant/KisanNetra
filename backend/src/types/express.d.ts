/**
 * Express type augmentation.
 *
 * Adds the authenticated user context to `Request`, populated by
 * `authenticateJWT`. Keeping this in one place avoids `any` casts across
 * controllers and middleware.
 */
import type { Role, Language } from '../models/User';

export interface AuthUser {
  id: string; // user_id (from token `sub`)
  role: Role;
  lang: Language;
  jti: string;
  exp: number; // access token expiry (unix seconds) — used for blacklisting
  region?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
