/**
 * JWT token utilities.
 *
 * Access tokens are short-lived and carry the user's id/role/language plus a
 * unique `jti` so individual tokens can be revoked (blacklisted) on logout.
 * Refresh tokens are long-lived, single-active-per-user, and stored in Redis so
 * they can be rotated and revoked server-side.
 *
 * Redis key patterns (see architecture.md):
 *   session:{userId}   → current valid refresh token jti (TTL = refresh expiry)
 *   blacklist:{jti}    → revoked access token          (TTL = remaining access life)
 */
import jwt, { SignOptions } from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { env } from '../config/env';
import { redis } from '../config/redis';
import type { Role, Language } from '../models/User';

export interface AccessPayload {
  sub: string; // user_id
  role: Role;
  lang: Language;
  region?: string; // district scope for extension officers (regional guard)
  jti: string;
  exp?: number;
  iat?: number;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  exp?: number;
  iat?: number;
}

const sessionKey = (userId: string) => `session:${userId}`;
const blacklistKey = (jti: string) => `blacklist:${jti}`;
const pwdResetKey = (userId: string) => `pwdreset:${userId}`;

/** Purpose claim that scopes a password-reset token to that single use. */
const PWD_RESET_PURPOSE = 'pwd_reset';
/** Password-reset token lifetime (seconds) — short-lived by design. */
const PWD_RESET_TTL_SECONDS = 60 * 60; // 1 hour

export interface PasswordResetPayload {
  sub: string; // user_id
  jti: string;
  purpose: string;
  exp?: number;
  iat?: number;
}

/** Sign a short-lived access token with a unique jti. */
export function signAccessToken(payload: {
  sub: string;
  role: Role;
  lang: Language;
  region?: string;
}): string {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign({ ...payload, jti: nanoid() }, env.JWT_SECRET, options);
}

/** Sign a long-lived refresh token. Returns the token and its jti. */
export function signRefreshToken(userId: string): { token: string; jti: string } {
  const jti = nanoid();
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  };
  const token = jwt.sign({ sub: userId, jti }, env.JWT_SECRET, options);
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, env.JWT_SECRET) as RefreshPayload;
}

/**
 * Persist the active refresh token jti for a user, keyed by user id.
 * Only one refresh token is valid at a time (rotation invalidates the old one).
 */
export async function saveRefreshSession(
  userId: string,
  jti: string,
  expSeconds: number,
): Promise<void> {
  const ttl = expSeconds - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis.setex(sessionKey(userId), ttl, jti);
}

/** Check that a refresh token's jti matches the currently stored session. */
export async function isRefreshSessionValid(
  userId: string,
  jti: string,
): Promise<boolean> {
  const stored = await redis.get(sessionKey(userId));
  return stored !== null && stored === jti;
}

/** Remove a user's refresh session (logout / password reset). */
export async function revokeRefreshSession(userId: string): Promise<void> {
  await redis.del(sessionKey(userId));
}

/** Blacklist an access token by jti until it would naturally expire. */
export async function blacklistAccessToken(
  jti: string,
  expSeconds: number,
): Promise<void> {
  const ttl = expSeconds - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis.setex(blacklistKey(jti), ttl, '1');
}

export async function isAccessTokenBlacklisted(jti: string): Promise<boolean> {
  return (await redis.get(blacklistKey(jti))) !== null;
}

// ─── Password reset tokens ───────────────────────────────────────────
//
// A password-reset token is a short-lived, purpose-scoped JWT. Its jti is
// stored in Redis (pwdreset:{userId}) so the token is single-use and can be
// invalidated the moment it is consumed or superseded by a newer request.

/** Sign a single-use password-reset token and record its jti in Redis. */
export async function signPasswordResetToken(
  userId: string,
): Promise<{ token: string; expiresInSeconds: number }> {
  const jti = nanoid();
  const options: SignOptions = { expiresIn: PWD_RESET_TTL_SECONDS };
  const token = jwt.sign(
    { sub: userId, jti, purpose: PWD_RESET_PURPOSE },
    env.JWT_SECRET,
    options,
  );
  // Latest request wins — overwrites any prior outstanding reset token.
  await redis.setex(pwdResetKey(userId), PWD_RESET_TTL_SECONDS, jti);
  return { token, expiresInSeconds: PWD_RESET_TTL_SECONDS };
}

/**
 * Verify a password-reset token: valid signature, correct purpose, and its jti
 * still matches the one stored in Redis (not consumed/superseded). Throws a
 * jwt error on a bad/expired signature; returns null when the jti no longer
 * matches. On success returns the payload.
 */
export async function verifyPasswordResetToken(
  token: string,
): Promise<PasswordResetPayload | null> {
  const payload = jwt.verify(token, env.JWT_SECRET) as PasswordResetPayload;
  if (payload.purpose !== PWD_RESET_PURPOSE) return null;
  const stored = await redis.get(pwdResetKey(payload.sub));
  if (stored === null || stored !== payload.jti) return null;
  return payload;
}

/** Consume (invalidate) a user's outstanding password-reset token. */
export async function consumePasswordResetToken(
  userId: string,
): Promise<void> {
  await redis.del(pwdResetKey(userId));
}
