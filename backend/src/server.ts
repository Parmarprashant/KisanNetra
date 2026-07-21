/**
 * HTTP server entry point.
 *
 * Connects to datastores first (fail-fast), then starts the HTTP server.
 * Handles graceful shutdown on SIGINT/SIGTERM and guards against unhandled
 * rejections / uncaught exceptions. Socket.io is initialized here in Phase 12.
 */
import http from 'http';
import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { connectMongoDB, disconnectMongoDB } from './config/db';
import { connectRedis, disconnectRedis } from './config/redis';
import { ensureBucket } from './config/s3';
import { initializeQdrantCollection } from './services/qdrant.service';
import { initSocketServer, closeSocketServer } from './config/socket';
import { startWorkers, stopWorkers } from './jobs/workers';
import { registerSchedules } from './jobs/scheduler';
import { closeQueues } from './jobs/queues';

const server = http.createServer(app);

async function start(): Promise<void> {
  try {
    await connectMongoDB();
    
    // Optional services (skip if not available in dev)
    try {
      await connectRedis();
    } catch (err) {
      logger.warn('Redis not available, skipping', { error: err instanceof Error ? err.message : String(err) });
    }
    
    try {
      await ensureBucket();
    } catch (err) {
      logger.warn('S3/MinIO not available, skipping', { error: err instanceof Error ? err.message : String(err) });
    }
    
    try {
      await initializeQdrantCollection();
    } catch (err) {
      logger.warn('Qdrant not available, skipping', { error: err instanceof Error ? err.message : String(err) });
    }
    
    try {
      await initSocketServer(server);
    } catch (err) {
      logger.warn('Socket.io init failed, skipping', { error: err instanceof Error ? err.message : String(err) });
    }
    
    try {
      startWorkers();
    } catch (err) {
      logger.warn('Workers not started', { error: err instanceof Error ? err.message : String(err) });
    }
    
    try {
      await registerSchedules();
    } catch (err) {
      logger.warn('Schedules not registered', { error: err instanceof Error ? err.message : String(err) });
    }

    server.listen(env.PORT, () => {
      logger.info(`🌿 Krishi Raksha API listening on port ${env.PORT}`, {
        env: env.NODE_ENV,
        url: `${env.API_URL}/api/v1/health`,
      });
    });
  } catch (err) {
    logger.error('Failed to start server', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(async () => {
    await stopWorkers().catch(() => undefined);
    await closeQueues().catch(() => undefined);
    await closeSocketServer().catch(() => undefined);
    await disconnectMongoDB().catch(() => undefined);
    await disconnectRedis().catch(() => undefined);
    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Force-exit if graceful shutdown hangs.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

void start();

export { server };
