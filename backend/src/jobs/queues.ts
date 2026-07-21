/**
 * BullMQ queue definitions (Phase 14).
 *
 * Central registry of background-work queues plus typed enqueue helpers. All
 * queues share one Redis instance (a dedicated connection — BullMQ requires
 * `maxRetriesPerRequest: null`, which differs from the app's ioredis client, so
 * we do NOT reuse `config/redis`).
 *
 * Degradation contract: when `QUEUE_ENABLED` is false the queues are never
 * created and every `enqueue*` helper returns `false` (a no-op). Callers use
 * that signal to fall back to inline execution, so the API runs fully without a
 * worker process — mirroring the env-gated notification channels and the
 * non-fatal S3/Qdrant bootstrap.
 *
 * Job payloads are typed here (the single source of truth) and imported by both
 * the enqueue side (services) and the consume side (jobs/workers.ts).
 */
import { Queue, type QueueOptions, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { NotificationChannel } from '../models/Notification';

/** Logical queue names — also used as the BullMQ queue keys. */
export const QUEUE_NAMES = {
  notifications: 'notifications',
  reports: 'report-generation',
  outbreak: 'outbreak-detection',
  cleanup: 'cleanup',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Job payloads (shared contract, enqueue ↔ worker) ────────────────

/** notifications: deliver the best-effort channel fan-out for a persisted notification. */
export interface NotificationJobData {
  notificationId: string; // notification_id of the already-persisted doc
  channels: NotificationChannel[];
}

/**
 * notifications (delayed 'reminder' job): fire a treatment-reminder notification
 * some days after a scan. Unlike a 'deliver' job this has no pre-persisted
 * notification — the worker calls notificationService.dispatch() at fire time.
 */
export interface TreatmentReminderJobData {
  userId: string; // user_id string of the farmer
  disease: string;
  language: string;
  scanId: string;
}

/** reports: generate a persisted (queued) report job's file. */
export interface ReportJobData {
  jobId: string; // job_id of the already-persisted ReportJob
}

/** outbreak: run detection + alerting (scheduled; no per-run payload). */
export type OutbreakJobData = Record<string, never>;

/** cleanup: prune old records (scheduled; no per-run payload). */
export type CleanupJobData = Record<string, never>;

// ─── Connection + queue construction (lazy, gated) ───────────────────

const enabled = env.QUEUE_ENABLED;

/**
 * A dedicated ioredis connection for BullMQ. `maxRetriesPerRequest: null` is
 * required by BullMQ's blocking commands. Created only when queues are enabled.
 */
let connection: Redis | undefined;
function getConnection(): Redis {
  if (!connection) {
    connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    connection.on('error', (err) =>
      logger.error('BullMQ Redis error', { error: err.message }),
    );
  }
  return connection;
}

/** Sensible defaults: retry with backoff, and don't let Redis fill with old jobs. */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

const queues = new Map<QueueName, Queue>();

/** Get (creating on first use) a queue, or undefined when queues are disabled. */
function getQueue(name: QueueName): Queue | undefined {
  if (!enabled) return undefined;
  let q = queues.get(name);
  if (!q) {
    const opts: QueueOptions = {
      connection: getConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };
    q = new Queue(name, opts);
    queues.set(name, q);
  }
  return q;
}

/** Whether the queue layer is active (callers use this to pick async vs inline). */
export function isQueuesEnabled(): boolean {
  return enabled;
}

/** The shared BullMQ connection (workers reuse it). Undefined when disabled. */
export function getQueueConnection(): Redis | undefined {
  return enabled ? getConnection() : undefined;
}

// ─── Typed enqueue helpers ───────────────────────────────────────────
//
// Each returns true when the job was enqueued, false when queues are disabled
// (so the caller runs the work inline instead). Enqueue failures are logged and
// also return false — never throw on the hot path.

async function add<T extends object>(
  name: QueueName,
  jobName: string,
  data: T,
  opts?: JobsOptions,
): Promise<boolean> {
  const q = getQueue(name);
  if (!q) return false;
  try {
    await q.add(jobName, data, opts);
    return true;
  } catch (err) {
    logger.error('Failed to enqueue job — falling back to inline', {
      queue: name,
      jobName,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export function enqueueNotification(
  data: NotificationJobData,
): Promise<boolean> {
  return add(QUEUE_NAMES.notifications, 'deliver', data);
}

export function enqueueReport(data: ReportJobData): Promise<boolean> {
  return add(QUEUE_NAMES.reports, 'generate', data);
}

/** Enqueue a delayed treatment reminder (rides the notifications queue). */
export function enqueueTreatmentReminder(
  data: TreatmentReminderJobData & { delayMs: number },
): Promise<boolean> {
  const { delayMs, ...rest } = data;
  return add(QUEUE_NAMES.notifications, 'reminder', rest, { delay: delayMs });
}

// ─── Stats (admin system health) ─────────────────────────────────────

export interface QueueStats {
  status: 'active' | 'disabled';
  queues?: Record<string, Record<string, number>>;
  note?: string;
}

/** Aggregate job counts per queue for the admin health endpoint. */
export async function getQueueStats(): Promise<QueueStats> {
  if (!enabled) {
    return { status: 'disabled', note: 'QUEUE_ENABLED is false' };
  }
  const result: Record<string, Record<string, number>> = {};
  for (const name of Object.values(QUEUE_NAMES)) {
    const q = getQueue(name);
    if (!q) continue;
    try {
      result[name] = await q.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
    } catch (err) {
      logger.warn('Failed to read queue counts', {
        queue: name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { status: 'active', queues: result };
}

/** Close all queues + the shared connection (graceful shutdown). */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => undefined)));
  queues.clear();
  if (connection) {
    connection.disconnect();
    connection = undefined;
  }
}
