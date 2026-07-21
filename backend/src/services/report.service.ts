/**
 * Report service.
 *
 * Owns report business logic (HTTP-agnostic per rules.md): create a ReportJob,
 * gather the right analytics slice for its type, render it to PDF/CSV, upload to
 * S3/MinIO, and track the job lifecycle. Also exposes status lookup and a fresh
 * download URL.
 *
 * Generation is synchronous in Phase 10 (create → generate → upload within the
 * request). The job lifecycle (queued→processing→complete/failed) is modeled so
 * Phase 14 can move generation to a BullMQ worker and fire `report:ready`
 * without changing the API surface.
 */
import { nanoid } from 'nanoid';
import { Types } from 'mongoose';
import {
  ReportJob,
  IReportJob,
  type ReportType,
  type ReportFormat,
} from '../models/ReportJob';
import { User } from '../models/User';
import { Scan } from '../models/Scan';
import * as analyticsService from './analytics.service';
import * as notificationService from './notification.service';
import {
  uploadBuffer,
  getPresignedDownloadUrl,
} from './image.service';
import { renderPDF, renderCSV, type ReportDocument } from './reports/report.renderers';
import { enqueueReport, isQueuesEnabled } from '../jobs/queues';
import { emitToUser } from '../config/socket';
import { logger } from '../utils/logger';
import { NotFoundError, BadRequestError } from '../utils/errors';

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (weekly default)

const CONTENT_TYPE: Record<ReportFormat, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
};

export interface CreateReportParams {
  requestedByUserId: string; // user_id string from token
  type: ReportType;
  format: ReportFormat;
  params: {
    from?: string;
    to?: string;
    region?: string;
    user_id?: string; // target farmer for farmer_history
    threshold?: number;
    disease?: string;
  };
}

async function resolveUserObjectId(userId: string): Promise<Types.ObjectId> {
  const user = await User.findOne({ user_id: userId }).select('_id').lean();
  if (!user) throw new NotFoundError('User not found');
  return user._id as Types.ObjectId;
}

/** Resolve a {from,to} window, defaulting to the last 7 days. */
function resolveWindow(p: CreateReportParams['params']): { from: Date; to: Date } {
  const to = p.to ? new Date(p.to) : new Date();
  const from = p.from ? new Date(p.from) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
  return { from, to };
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Data gathering per report type ──────────────────────────────────

async function buildDistrictWeekly(
  p: CreateReportParams['params'],
): Promise<ReportDocument> {
  const { from, to } = resolveWindow(p);
  const filter = { from, to, region: p.region };

  const [overview, topDiseases, trends] = await Promise.all([
    analyticsService.getOverview(filter),
    analyticsService.getTopDiseases(filter, 10),
    analyticsService.getScanTrends(filter, 'day'),
  ]);

  return {
    title: 'District Weekly Report',
    meta: [
      ['Region', p.region ?? 'All India'],
      ['Period', `${fmtDate(from)} → ${fmtDate(to)}`],
    ],
    tables: [
      {
        heading: 'Overview',
        columns: ['Metric', 'Value'],
        rows: [
          ['Total scans', overview.total_scans],
          ['Healthy', overview.healthy],
          ['Diseased', overview.diseased],
          ['Low confidence', overview.low_confidence],
          ['Distinct diseases', overview.distinct_diseases],
          ['Distinct crops', overview.distinct_crops],
        ],
      },
      {
        heading: 'Top diseases',
        columns: ['Disease', 'Count'],
        rows: topDiseases.map((d) => [d.disease_label, d.count]),
      },
      {
        heading: 'Daily scan volume',
        columns: ['Date', 'Scans'],
        rows: trends.map((t) => [t.period, t.count]),
      },
    ],
  };
}

async function buildFarmerHistory(
  p: CreateReportParams['params'],
): Promise<ReportDocument> {
  if (!p.user_id) {
    throw new BadRequestError(
      'farmer_history requires a target user_id in params',
      'missing_user_id',
    );
  }
  const farmer = await User.findOne({ user_id: p.user_id, is_deleted: false });
  if (!farmer) throw new NotFoundError('Target user not found');

  const { from, to } = resolveWindow(p);
  const scans = await Scan.find({
    user_id: farmer._id,
    is_deleted: false,
    createdAt: { $gte: from, $lte: to },
  })
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean();

  return {
    title: 'Farmer Scan History',
    meta: [
      ['Farmer', `${farmer.name} (${farmer.user_id})`],
      ['Region', farmer.region ?? '—'],
      ['Period', `${fmtDate(from)} → ${fmtDate(to)}`],
      ['Total scans', String(scans.length)],
    ],
    tables: [
      {
        heading: 'Scans',
        columns: ['Date', 'Crop', 'Diagnosis', 'Confidence', 'Feedback'],
        rows: scans.map((s) => [
          fmtDate(s.createdAt as Date),
          s.crop_type,
          s.prediction?.disease_label ?? '—',
          s.prediction?.confidence != null
            ? `${Math.round(s.prediction.confidence * 100)}%`
            : '—',
          s.feedback ?? '—',
        ]),
      },
    ],
  };
}

async function buildModelPerformance(
  p: CreateReportParams['params'],
): Promise<ReportDocument> {
  const { from, to } = resolveWindow(p);
  const acc = await analyticsService.getModelAccuracy({ from, to, region: p.region });

  return {
    title: 'Model Performance Report',
    meta: [
      ['Region', p.region ?? 'All India'],
      ['Period', `${fmtDate(from)} → ${fmtDate(to)}`],
    ],
    tables: [
      {
        heading: 'Accuracy (from farmer feedback)',
        columns: ['Metric', 'Value'],
        rows: [
          ['Total feedback', acc.total_feedback],
          ['Correct', acc.correct],
          ['Incorrect', acc.incorrect],
          [
            'Accuracy',
            acc.accuracy != null ? `${(acc.accuracy * 100).toFixed(1)}%` : 'N/A',
          ],
        ],
      },
    ],
  };
}

async function buildOutbreakIncident(
  p: CreateReportParams['params'],
): Promise<ReportDocument> {
  const { from, to } = resolveWindow(p);
  const threshold = p.threshold ?? 10;
  const outbreaks = await analyticsService.detectOutbreaks({
    from,
    to,
    threshold,
    region: p.region,
  });

  return {
    title: 'Outbreak Incident Report',
    meta: [
      ['Region', p.region ?? 'All India'],
      ['Period', `${fmtDate(from)} → ${fmtDate(to)}`],
      ['Threshold', String(threshold)],
    ],
    tables: [
      {
        heading: 'Detected hotspots (district × disease)',
        columns: ['District', 'Disease', 'Count'],
        rows: outbreaks.map((o) => [o.district, o.disease_label, o.count]),
      },
    ],
  };
}

async function gatherReport(
  type: ReportType,
  params: CreateReportParams['params'],
): Promise<ReportDocument> {
  switch (type) {
    case 'district_weekly':
      return buildDistrictWeekly(params);
    case 'farmer_history':
      return buildFarmerHistory(params);
    case 'model_performance':
      return buildModelPerformance(params);
    case 'outbreak_incident':
      return buildOutbreakIncident(params);
    default:
      // Exhaustive — the validator restricts type, but keep TS honest.
      throw new BadRequestError('Unsupported report type', 'unsupported_report');
  }
}

// ─── Orchestration ───────────────────────────────────────────────────

/**
 * Create a report job. The job is persisted as 'queued'; generation is then
 * either handed to a BullMQ worker (queues enabled) or run inline right here
 * (queues disabled — the Phase 10 behaviour). Either way the returned job
 * reflects the outcome the caller can report: 'queued' for async, or
 * 'complete'/'failed' when generated inline.
 */
export async function createReport(
  input: CreateReportParams,
): Promise<IReportJob> {
  const requesterId = await resolveUserObjectId(input.requestedByUserId);

  const job = await ReportJob.create({
    job_id: `rpt_${nanoid()}`,
    requested_by: requesterId,
    type: input.type,
    params: input.params,
    format: input.format,
    status: 'queued',
  });

  const enqueued = await enqueueReport({ jobId: job.job_id });
  if (enqueued) {
    logger.info('Report generation queued', { job_id: job.job_id });
    return job; // status: 'queued' — worker will complete it + fire report:ready
  }

  // Inline fallback (queues disabled): generate now, mirroring Phase 10.
  await generateReport(job.job_id);
  const refreshed = await ReportJob.findOne({ job_id: job.job_id });
  return refreshed ?? job;
}

/**
 * Generate (or regenerate) a persisted report job's file: gather data → render →
 * upload → mark complete, then fire a `report:ready` notification + socket event.
 * This is the BullMQ worker entry point AND the inline fallback. On failure the
 * job is marked 'failed' and the error is rethrown so the worker can retry.
 */
export async function generateReport(jobId: string): Promise<void> {
  const job = await ReportJob.findOne({ job_id: jobId });
  if (!job) {
    logger.warn('generateReport: job not found', { job_id: jobId });
    return;
  }

  const params = job.params as CreateReportParams['params'];
  try {
    job.status = 'processing';
    await job.save();

    const doc = await gatherReport(job.type, params);
    const buffer = job.format === 'pdf' ? await renderPDF(doc) : renderCSV(doc);

    // requested_by is an ObjectId ref; resolve the user_id string for the S3 key.
    const owner = await User.findById(job.requested_by).select('user_id').lean();
    const ownerKey = owner?.user_id ?? String(job.requested_by);
    const s3Key = `reports/${ownerKey}/${job.job_id}.${job.format}`;
    await uploadBuffer(s3Key, buffer, CONTENT_TYPE[job.format]);

    job.s3_key = s3Key;
    job.status = 'complete';
    job.completed_at = new Date();
    await job.save();

    logger.info('Report generated', {
      job_id: job.job_id,
      type: job.type,
      format: job.format,
      bytes: buffer.length,
    });

    await announceReady(job);
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    await job.save().catch(() => undefined);
    logger.error('Report generation failed', {
      job_id: job.job_id,
      error: job.error,
    });
    throw err;
  }
}

/**
 * Notify the requester that their report is ready — a real-time `report:ready`
 * socket event (Phase 12) plus a persisted in-app notification. Best-effort.
 */
async function announceReady(job: IReportJob): Promise<void> {
  const owner = await User.findById(job.requested_by).select('user_id').lean();
  if (!owner) return;

  emitToUser(owner.user_id, 'report:ready', {
    job_id: job.job_id,
    type: job.type,
    format: job.format,
  });

  // Only bother with an inbox notification for async (queued) generation — for
  // an inline request the caller already has the result in the HTTP response.
  if (isQueuesEnabled()) {
    void notificationService
      .dispatch({
        userObjectId: job.requested_by,
        type: 'report_ready',
        title: 'Report ready',
        body: `Your ${job.type} report is ready to download.`,
        data: { job_id: job.job_id, type: job.type, format: job.format },
        channels: ['push'],
      })
      .catch(() => undefined);
  }
}

/** Fetch a report job owned by the user (status polling). */
export async function getReport(
  userId: string,
  jobId: string,
): Promise<IReportJob> {
  const requesterId = await resolveUserObjectId(userId);
  const job = await ReportJob.findOne({
    job_id: jobId,
    requested_by: requesterId,
  });
  if (!job) throw new NotFoundError('Report not found');
  return job;
}

export interface ListReportsOptions {
  userId: string;
  page: number;
  limit: number;
}

export async function listReports(opts: ListReportsOptions): Promise<{
  reports: IReportJob[];
  total: number;
  page: number;
  limit: number;
}> {
  const requesterId = await resolveUserObjectId(opts.userId);
  const skip = (opts.page - 1) * opts.limit;
  const [reports, total] = await Promise.all([
    ReportJob.find({ requested_by: requesterId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(opts.limit),
    ReportJob.countDocuments({ requested_by: requesterId }),
  ]);
  return { reports, total, page: opts.page, limit: opts.limit };
}

/**
 * Return a fresh pre-signed download URL for a completed report. Throws if the
 * job isn't complete yet (or failed) so the controller can respond clearly.
 */
export async function getDownloadUrl(
  userId: string,
  jobId: string,
): Promise<{ url: string; filename: string }> {
  const job = await getReport(userId, jobId);
  if (job.status !== 'complete' || !job.s3_key) {
    throw new BadRequestError(
      `Report is not ready (status: ${job.status})`,
      'report_not_ready',
    );
  }
  const filename = `${job.type}_${job.job_id}.${job.format}`;
  const url = await getPresignedDownloadUrl(job.s3_key, filename);
  return { url, filename };
}
