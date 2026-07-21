/**
 * Recurring job scheduler (Phase 14).
 *
 * Registers repeatable jobs on their queues so the workers run them on a cron
 * schedule. Uses BullMQ's `repeat` — a job's repeat key is deterministic, so
 * re-registering on every boot updates rather than duplicates the schedule.
 * No-op when queues are disabled.
 *
 * Schedules:
 *   outbreak-detection / 'detect' — every 6 hours (detect + alert hotspots)
 *   cleanup / 'prune'             — daily at 02:30 (prune old report jobs)
 */
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import { QUEUE_NAMES, getQueueConnection, isQueuesEnabled } from './queues';

export async function registerSchedules(): Promise<void> {
  if (!isQueuesEnabled()) return;
  const connection = getQueueConnection() as Redis;

  const outbreakQueue = new Queue(QUEUE_NAMES.outbreak, { connection });
  const cleanupQueue = new Queue(QUEUE_NAMES.cleanup, { connection });

  // Outbreak detection — every 6 hours.
  await outbreakQueue.add(
    'detect',
    {},
    {
      repeat: { pattern: '0 */6 * * *' },
      jobId: 'outbreak-detect-cron', // stable id → one schedule, not N
      removeOnComplete: 20,
      removeOnFail: 50,
    },
  );

  // Report-job cleanup — daily at 02:30.
  await cleanupQueue.add(
    'prune',
    {},
    {
      repeat: { pattern: '30 2 * * *' },
      jobId: 'cleanup-cron',
      removeOnComplete: 10,
      removeOnFail: 20,
    },
  );

  await outbreakQueue.close();
  await cleanupQueue.close();

  logger.info('Registered recurring jobs (outbreak detection, cleanup)');
}
