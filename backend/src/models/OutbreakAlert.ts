/**
 * OutbreakAlert model (Phase 14).
 *
 * A persisted record of a detected disease outbreak in a district, raised by the
 * scheduled outbreak-detection worker when the same disease's scan count in a
 * district crosses a threshold over a rolling window. Distinct from the Phase-8
 * on-demand `detectOutbreaks` aggregation (a live read): this is the durable,
 * deduplicated alert that drives officer notifications and the admin alert view.
 *
 * Dedup: at most one active alert per (district, disease) within a cooldown
 * window — the worker checks for a recent alert before creating a new one, so a
 * persistent hotspot doesn't spam officers every run.
 */
import { Schema, model, Document, Types } from 'mongoose';

export const ALERT_LEVELS = ['high', 'critical'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export const ALERT_STATUSES = ['active', 'acknowledged', 'resolved'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export interface IOutbreakAlert extends Document {
  _id: Types.ObjectId;
  alert_id: string;
  district: string;
  disease_label: string;
  scan_count: number; // scans of this disease in the district over the window
  level: AlertLevel;
  status: AlertStatus;
  window_days: number; // detection window that produced this alert
  createdAt: Date;
  updatedAt: Date;
}

const OutbreakAlertSchema = new Schema<IOutbreakAlert>(
  {
    alert_id: { type: String, required: true, unique: true },
    district: { type: String, required: true },
    disease_label: { type: String, required: true },
    scan_count: { type: Number, required: true },
    level: { type: String, enum: ALERT_LEVELS, default: 'high' },
    status: { type: String, enum: ALERT_STATUSES, default: 'active' },
    window_days: { type: Number, required: true },
  },
  { timestamps: true },
);

OutbreakAlertSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

// Dedup lookup: most recent alert for a district+disease.
OutbreakAlertSchema.index({ district: 1, disease_label: 1, createdAt: -1 });
// Admin/officer views: active alerts newest-first.
OutbreakAlertSchema.index({ status: 1, createdAt: -1 });

export const OutbreakAlert = model<IOutbreakAlert>(
  'OutbreakAlert',
  OutbreakAlertSchema,
);
