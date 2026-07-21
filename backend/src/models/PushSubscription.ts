/**
 * PushSubscription model.
 *
 * A Web Push (VAPID) subscription registered by a client's service worker. Each
 * browser/device produces a unique `endpoint`; a user may have several (phone,
 * desktop, ...). The `keys` (p256dh + auth) are required by the Web Push
 * protocol to encrypt the payload. Stale subscriptions (HTTP 410/404 from the
 * push service) are pruned by push.service on send failure.
 */
import { Schema, model, Document, Types } from 'mongoose';

export interface IPushSubscription extends Document {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  endpoint: string; // unique per browser/device — the push service URL
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    user_agent: String,
  },
  { timestamps: true },
);

// Serialization: drop internal Mongoose field.
PushSubscriptionSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

// Fan-out path: fetch all of a user's subscriptions when sending a push.
PushSubscriptionSchema.index({ user_id: 1 });

export const PushSubscription = model<IPushSubscription>(
  'PushSubscription',
  PushSubscriptionSchema,
);
