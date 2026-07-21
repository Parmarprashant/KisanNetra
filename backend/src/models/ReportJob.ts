/**
 * ReportJob model.
 *
 * An asynchronous export request: an officer/admin asks for a report (a
 * time-boxed slice of the analytics data), the system generates a PDF or CSV,
 * uploads it to S3/MinIO, and records the storage key so the file can be served
 * via a fresh pre-signed URL on download.
 *
 * In Phase 10 generation runs inline (queued → processing → complete/failed in
 * one request). Phase 14 moves the heavy work onto a BullMQ worker and fires a
 * `report:ready` notification on completion; this schema already models that
 * lifecycle so only the execution site changes.
 */
import { Schema, model, Document, Types } from 'mongoose';

/** Report kinds, each backed by a specific analytics source. */
export const REPORT_TYPES = [
  'district_weekly', // overview + top diseases + trends for a region/window
  'farmer_history', // one user's scan history
  'model_performance', // model accuracy from feedback
  'outbreak_incident', // district+disease hotspots over a window
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ['pdf', 'csv'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_STATUSES = [
  'queued',
  'processing',
  'complete',
  'failed',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface IReportJob extends Document {
  _id: Types.ObjectId;
  job_id: string;
  requested_by: Types.ObjectId;
  type: ReportType;
  params: Record<string, unknown>; // { from, to, region, user_id, threshold, ... }
  format: ReportFormat;
  status: ReportStatus;
  s3_key?: string; // set when complete — internal storage key, not exposed
  error?: string; // failure reason when status = failed
  completed_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReportJobSchema = new Schema<IReportJob>(
  {
    job_id: { type: String, required: true, unique: true },
    requested_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: { type: String, enum: REPORT_TYPES, required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    format: { type: String, enum: REPORT_FORMATS, required: true },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      default: 'queued',
    },
    s3_key: String,
    error: String,
    completed_at: Date,
  },
  { timestamps: true },
);

// Serialization: hide internal fields (storage key + Mongoose version).
ReportJobSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    delete obj.s3_key; // download issues a fresh pre-signed URL instead
    return obj;
  },
});

// Primary access path: a user's own report jobs, newest first.
ReportJobSchema.index({ requested_by: 1, createdAt: -1 });
ReportJobSchema.index({ status: 1, createdAt: -1 });

export const ReportJob = model<IReportJob>('ReportJob', ReportJobSchema);
