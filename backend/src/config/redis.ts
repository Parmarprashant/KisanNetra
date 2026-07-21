/**
 * Redis client (ioredis).
 *
 * Uses lazyConnect so the client only dials Redis when connectRedis() is called
 * during bootstrap, keeping startup ordering explicit. `pubClient` / `subClient`
 * duplicates are provided ahead of the Socket.io Redis adapter (Phase 12).
 */
import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('close', () => logger.warn('Redis connection closed'));

// Duplicated connections reserved for the Socket.io pub/sub adapter (Phase 12).
export const pubClient = redis.duplicate({ lazyConnect: true });
export const subClient = redis.duplicate({ lazyConnect: true });

export async function connectRedis(): Promise<void> {
  // The rate-limit Redis store (Phase 15) issues a command at module import,
  // which auto-connects this lazy client before bootstrap reaches here. Only
  // dial explicitly if still idle; otherwise wait for the in-flight connect.
  if (redis.status === 'ready') return;
  if (redis.status === 'wait') {
    await redis.connect();
    return;
  }
  if (redis.status === 'connecting' || redis.status === 'connect') {
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
    return;
  }
  // Any other state (close/end) — attempt a fresh connect.
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
  pubClient.disconnect();
  subClient.disconnect();
  logger.info('Redis connections closed');
}
