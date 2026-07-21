/**
 * BullMQ workers (Phase 14).
 *
 * Thin glue that consumes jobs and delegates to the owning service (per
 * rules.md — no business logic here). Workers are created in-process and started
 * from server.ts after datastores connect; they share the queue layer's Redis
 * connection. When queues are disabled, `startWorkers()` is a no-op (the app
 * runs everything inline).
 *
 * Job → handler map:
 *   notifications / 'deliver'   → notificationService.deliverChannels
 *   notifications / 'reminder'  → notificationService.dispatchTreatmentReminder
 *   report-generation / 'generate' → reportService.generateReport
 *   outbreak-detection / 'detect'  → outbreakService.detectAndAlert
 *   cleanup / 'prune'             → cleanupOldReports
 */
import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  QUEUE_NAMES,
  getQueueConnection,
  isQueuesEnabled,
  type NotificationJobData,
  type TreatmentReminderJobData,
  type ReportJobData,
} from './queues';
import * as notificationService from '../services/notification.service';
import * as reportService from '../services/report.service';
import * as outbreakService from '../services/outbreak.service';
import { ReportJob } from '../models/ReportJob';

let workers: Worker[] = [];

/** Prune report jobs older than the retention window (cleanup job body). */
async function cleanupOldReports(): Promise<void> {
  const cutoff = new Date(
    Date.now() - env.REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await ReportJob.deleteMany({
    status: { $in: ['complete', 'failed'] },
    createdAt: { $lt: cutoff },
  });
  logger.info('Cleanup: pruned old report jobs', {
    deleted: result.deletedCount ?? 0,
    olderThanDays: env.REPORT_RETENTION_DAYS,
  });
}

/**
 * Start all in-process workers. No-op when queues are disabled. Returns the
 * number of workers started.
 */
export function startWorkers(): number {
  if (!isQueuesEnabled()) {
    logger.info('Queues disabled — workers not started (inline execution)');
    return 0;
  }
  const connection = getQueueConnection() as Redis;

  // notifications: multiplexes 'deliver' and 'reminder' job names.
  const notifWorker = new Worker(
    QUEUE_NAMES.notifications,
    async (job: Job) => {
      if (job.name === 'reminder') {
        const data = job.data as TreatmentReminderJobData;
        await notificationService.dispatchTreatmentReminder(data);
        return;
      }
      // default: 'deliver'
      const data = job.data as NotificationJobData;
      await notificationService.deliverChannels(data.notificationId, data.channels);
    },
    { connection },
  );

  const reportWorker = new Worker(
    QUEUE_NAMES.reports,
    async (job: Job) => {
      const data = job.data as ReportJobData;
      await reportService.generateReport(data.jobId);
    },
    { connection },
  );

  const outbreakWorker = new Worker(
    QUEUE_NAMES.outbreak,
    async () => {
      await outbreakService.detectAndAlert();
    },
    { connection },
  );

  const cleanupWorker = new Worker(
    QUEUE_NAMES.cleanup,
    async () => {
      await cleanupOldReports();
    },
    { connection },
  );

  workers = [notifWorker, reportWorker, outbreakWorker, cleanupWorker];

  for (const w of workers) {
    w.on('failed', (job, err) =>
      logger.warn('Job failed', {
        queue: w.name,
        jobId: job?.id,
        attempts: job?.attemptsMade,
        error: err.message,
      }),
    );
    w.on('error', (err) =>
      logger.error('Worker error', { queue: w.name, error: err.message }),
    );
  }

  logger.info(`Started ${workers.length} BullMQ workers`);
  return workers.length;
}

/** Close all workers (graceful shutdown). */
export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  workers = [];
}
