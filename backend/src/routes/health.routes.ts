/**
 * Health check routes. Public (no auth) — used by load balancers and monitoring.
 */
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { redis } from '../config/redis';
import { apiResponse } from '../utils/apiResponse';

const router = Router();

const MONGO_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

// GET /api/v1/health — liveness + dependency status
router.get('/', async (_req: Request, res: Response) => {
  let redisStatus = 'unknown';
  try {
    redisStatus = (await redis.ping()) === 'PONG' ? 'connected' : 'error';
  } catch {
    redisStatus = 'error';
  }

  const mongoStatus = MONGO_STATES[mongoose.connection.readyState] ?? 'unknown';
  const healthy = mongoStatus === 'connected' && redisStatus === 'connected';

  res.status(healthy ? 200 : 503).json(
    apiResponse.success({
      status: healthy ? 'ok' : 'degraded',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        mongodb: mongoStatus,
        redis: redisStatus,
      },
    }),
  );
});

export default router;
