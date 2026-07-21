/**
 * Rate limiting middleware (Phase 15 — Security Hardening).
 *
 * Exposes three limiters, all sharing a single Redis-backed store so counters
 * are consistent across horizontally-scaled instances and survive restarts:
 *   - generalLimiter — broad per-IP cap, applied globally.
 *   - authLimiter    — strict per-IP cap on brute-forceable auth endpoints.
 *   - scanLimiter    — per-user cap on the expensive scan pipeline.
 *
 * Degrade-don't-crash: if the Redis store can't be constructed, each limiter
 * falls back to express-rate-limit's default in-memory store (single-instance
 * counting still works) rather than failing startup — mirroring the queue /
 * socket / S3 bootstrap posture elsewhere in the app.
 */
import rateLimit, { Options, Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';
import { apiResponse } from '../utils/apiResponse';
import { logger } from '../utils/logger';

/**
 * Build a Redis-backed store with a per-limiter key prefix. Returns undefined
 * on failure so the limiter falls back to the in-memory store.
 */
function redisStore(prefix: string): Store | undefined {
  try {
    return new RedisStore({
      // ioredis: forward the command straight through to the shared client.
      sendCommand: (command: string, ...args: string[]) =>
        redis.call(command, ...args) as Promise<never>,
      prefix,
    });
  } catch (err) {
    logger.warn('Rate-limit Redis store unavailable — falling back to memory', {
      prefix,
      error: (err as Error).message,
    });
    return undefined;
  }
}

const COMMON: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
};

/** Broad safety net against request floods. Applied globally in app.ts. */
export const generalLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 1000, // 1 minute
  limit: 100,
  store: redisStore('rl:general:'),
  message: apiResponse.error(
    'rate_limit_exceeded',
    'Too many requests. Please try again shortly.',
  ),
});

/** Brute-force protection for auth endpoints (login, refresh, password reset). */
export const authLimiter = rateLimit({
  ...COMMON,
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  store: redisStore('rl:auth:'),
  message: apiResponse.error(
    'too_many_attempts',
    'Too many attempts. Please try again in a few minutes.',
  ),
});

/** Throttles the expensive scan pipeline. Runs after auth, so keys by user id. */
export const scanLimiter = rateLimit({
  ...COMMON,
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  store: redisStore('rl:scan:'),
  keyGenerator: (req) => req.user?.id ?? 'anonymous',
  message: apiResponse.error(
    'scan_rate_limit_exceeded',
    'Scan limit reached. Please try again later.',
  ),
});
