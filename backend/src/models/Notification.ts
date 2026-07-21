/**
 * Notification model.
 *
 * A record of something the system told a user about: a scan result, an
 * outbreak alert, a treatment reminder, etc. One document represents the
 * notification itself; the multi-channel delivery (push / SMS / email) is
 * best-effort and its per-channel outcome is recorded in `delivery` so a failed
 * SMS never hides the in-app notification the user can still read.
 *
 * Persisted synchronously by notification.service.dispatch(); channel fan-out is
 * fire-and-forget for now and moves onto BullMQ in Phase 14.
 */
import { Schema, model, Document, Types } from 'mongoose';

/** Notification categories the system can raise. */
export const NOTIFICATION_TYPES = [
  'scan_result',
  'outbreak_alert',
  'treatment_reminder',
  'model_updated',
  'feedback_thanks',
  'proposal_reviewed',
  'report_ready',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Delivery channels a notification can be fanned out to. */
export const NOTIFICATION_CHANNELS = ['push', 'sms', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Per-channel delivery outcome (best-effort — 'skipped' when unconfigured). */
export const DELIVERY_STATES = ['sent', 'failed', 'skipped'] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export type ChannelDelivery = Partial<Record<NotificationChannel, DeliveryState>>;

export interface INotification extends Document {
  _id: Types.ObjectId;
  notification_id: string;
  user_id: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>; // payload for deep-linking (scan_id, disease…)
  channels: NotificationChannel[]; // channels attempted for this notification
  delivery: ChannelDelivery; // outcome per attempted channel
  is_read: boolean;
  sent_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    notification_id: { type: String, required: true, unique: true },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: Schema.Types.Mixed,
    channels: { type: [String], enum: NOTIFICATION_CHANNELS, default: [] },
    // Free-form per-channel state; kept as Mixed since keys are the channels.
    delivery: { type: Schema.Types.Mixed, default: {} },
    is_read: { type: Boolean, default: false },
    sent_at: Date,
  },
  { timestamps: true },
);

// Serialization: drop internal Mongoose field.
NotificationSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

// Primary access path: a user's notifications, newest first (paginated list).
NotificationSchema.index({ user_id: 1, createdAt: -1 });
// Unread badge count / "mark all read" scoping.
NotificationSchema.index({ user_id: 1, is_read: 1 });

export const Notification = model<INotification>(
  'Notification',
  NotificationSchema,
);
