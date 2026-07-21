/**
 * Notification service (orchestrator).
 *
 * Owns all notification business logic (HTTP-agnostic per rules.md):
 *  - dispatch(): persist a Notification, then best-effort fan out to the
 *    requested channels (push / SMS / email). Delivery is fire-and-forget for
 *    now; in Phase 14 dispatch() will enqueue a BullMQ job instead of sending
 *    inline. Channel failures never throw — each records a DeliveryState.
 *  - list / markRead / markAllRead / unread count for the in-app inbox.
 *  - subscribe / unsubscribe for Web Push (VAPID) subscriptions.
 *
 * A dispatched notification is ALWAYS persisted even if every channel is
 * skipped/failed — the in-app inbox is the reliable channel; push/SMS/email are
 * best-effort reach.
 */
import { nanoid } from 'nanoid';
import { Types } from 'mongoose';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import { User, type IUser } from '../models/User';
import type { Language } from '../models/User';
import {
  Notification,
  type INotification,
  type NotificationType,
  type NotificationChannel,
  type ChannelDelivery,
} from '../models/Notification';
import { PushSubscription } from '../models/PushSubscription';
import { sendPushToUser } from './push.service';
import { sendSMS } from './sms.service';
import { sendEmail } from './email.service';
import { emitToUser } from '../config/socket';
import { enqueueNotification } from '../jobs/queues';
import { notificationTemplates } from './templates/notification.templates';

/** Default channels per notification type when the caller doesn't specify. */
const DEFAULT_CHANNELS: Record<NotificationType, NotificationChannel[]> = {
  scan_result: ['push'],
  outbreak_alert: ['push', 'sms'],
  treatment_reminder: ['push', 'sms'],
  model_updated: ['push'],
  feedback_thanks: ['push'],
  proposal_reviewed: ['push', 'email'],
  report_ready: ['push'],
};

export interface DispatchParams {
  /** Target user_id (string, from token) OR a resolved Mongo ObjectId. */
  userId?: string;
  userObjectId?: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Channels to attempt; defaults to DEFAULT_CHANNELS[type]. */
  channels?: NotificationChannel[];
}

/** Resolve a user_id string to a Mongo document (with fields needed to send). */
async function resolveUser(userId: string): Promise<IUser> {
  const user = await User.findOne({ user_id: userId });
  if (!user) throw new NotFoundError('User not found');
  return user;
}

/**
 * Persist a notification and best-effort deliver it across channels.
 *
 * Callers on hot paths (e.g. the scan pipeline) should invoke this
 * fire-and-forget: `void notificationService.dispatch(...).catch(...)`. It
 * resolves once the record is saved and channel attempts have settled.
 */
export async function dispatch(
  params: DispatchParams,
): Promise<INotification> {
  // Resolve the target user (needed for phone/email/language + ObjectId).
  let user: IUser | null = null;
  let userObjectId = params.userObjectId;

  if (params.userId) {
    user = await resolveUser(params.userId);
    userObjectId = user._id;
  } else if (userObjectId) {
    user = await User.findById(userObjectId);
  }

  if (!userObjectId) {
    throw new NotFoundError('Notification target user not resolved');
  }

  const channels = params.channels ?? DEFAULT_CHANNELS[params.type] ?? ['push'];

  // 1. Persist first — the in-app inbox is the reliable channel.
  const notification = await Notification.create({
    notification_id: `ntf_${nanoid()}`,
    user_id: userObjectId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data,
    channels,
    delivery: {},
    is_read: false,
    sent_at: new Date(),
  });

  // 1b. Push a real-time inbox event to the user's connected clients (Phase 12)
  //     so the notification badge updates instantly. Fire-and-forget; a no-op if
  //     the socket layer is down or the user has no open connection.
  if (user?.user_id) {
    emitToUser(user.user_id, 'notification:new', {
      notification_id: notification.notification_id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      created_at: notification.createdAt,
    });
  }

  // 2. Fan the notification out to its channels. When the queue layer is
  //    enabled the delivery is enqueued (retried by a worker); otherwise it runs
  //    inline right here. Either way the persisted doc + socket event above have
  //    already made the notification reachable, so this step is best-effort.
  const enqueued = await enqueueNotification({
    notificationId: notification.notification_id,
    channels,
  });
  if (!enqueued) {
    await deliverChannels(notification.notification_id, channels);
  }

  logger.info('Notification dispatched', {
    notification_id: notification.notification_id,
    type: params.type,
    channels,
    delivery_mode: enqueued ? 'queued' : 'inline',
  });

  return notification;
}

/**
 * Perform the best-effort channel fan-out for an already-persisted notification
 * and record the per-channel `delivery` outcomes on the document. This is the
 * worker entry point (jobs/workers.ts) and the inline fallback used when queues
 * are disabled. Idempotent-safe to re-run: it re-reads the notification and
 * overwrites `delivery`. Never throws for an unconfigured/failed channel.
 */
export async function deliverChannels(
  notificationId: string,
  channels: NotificationChannel[],
): Promise<void> {
  const notification = await Notification.findOne({
    notification_id: notificationId,
  });
  if (!notification) {
    logger.warn('deliverChannels: notification not found', { notificationId });
    return;
  }

  // The target user's contact fields (phone/email) are needed for SMS/email.
  const user = await User.findById(notification.user_id);

  const delivery: ChannelDelivery = {};
  await Promise.all(
    channels.map(async (channel) => {
      try {
        if (channel === 'push') {
          delivery.push = await sendPushToUser(notification.user_id, {
            title: notification.title,
            body: notification.body,
            data: notification.data,
          });
        } else if (channel === 'sms') {
          delivery.sms = await sendSMS(user?.phone, notification.body);
        } else if (channel === 'email') {
          delivery.email = await sendEmail({
            to: user?.email,
            subject: notification.title,
            text: notification.body,
          });
        }
      } catch (err) {
        // Defensive: channel services already swallow their own errors, but
        // guard here so one channel can never reject the whole fan-out.
        delivery[channel] = 'failed';
        logger.warn('Notification channel threw unexpectedly', {
          channel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  notification.delivery = delivery;
  await notification.save().catch((err) => {
    logger.warn('Failed to persist notification delivery state', {
      notification_id: notification.notification_id,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Fire a treatment-reminder notification (the delayed 'reminder' job's body).
 * Resolves the farmer, renders the localized template, and dispatches — so the
 * reminder rides the same persist → socket → channel path as any notification.
 * Skips silently if the user no longer exists / is inactive.
 */
export async function dispatchTreatmentReminder(params: {
  userId: string;
  disease: string;
  language: string;
  scanId: string;
}): Promise<void> {
  const user = await User.findOne({
    user_id: params.userId,
    is_active: true,
    is_deleted: false,
  }).select('_id');
  if (!user) return;

  const lang = (params.language as Language) ?? 'en';
  const { title, body } = notificationTemplates.treatment_reminder(
    lang,
    params.disease,
  );

  await dispatch({
    userObjectId: user._id,
    type: 'treatment_reminder',
    title,
    body,
    data: { scan_id: params.scanId, disease: params.disease },
  });
}

export interface ListNotificationsOptions {
  userId: string;
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

export async function listNotifications(
  opts: ListNotificationsOptions,
): Promise<{
  notifications: INotification[];
  total: number;
  unread: number;
  page: number;
  limit: number;
}> {
  const user = await resolveUser(opts.userId);
  const filter: Record<string, unknown> = { user_id: user._id };
  if (opts.unreadOnly) filter.is_read = false;

  const skip = (opts.page - 1) * opts.limit;
  const [notifications, total, unread] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(opts.limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user_id: user._id, is_read: false }),
  ]);

  return { notifications, total, unread, page: opts.page, limit: opts.limit };
}

/** Mark a single notification (owned by the user) as read. */
export async function markRead(
  userId: string,
  notificationId: string,
): Promise<INotification> {
  const user = await resolveUser(userId);
  const notification = await Notification.findOneAndUpdate(
    { notification_id: notificationId, user_id: user._id },
    { is_read: true },
    { new: true },
  );
  if (!notification) throw new NotFoundError('Notification not found');
  return notification;
}

/** Mark all of a user's notifications as read. Returns the count updated. */
export async function markAllRead(userId: string): Promise<number> {
  const user = await resolveUser(userId);
  const result = await Notification.updateMany(
    { user_id: user._id, is_read: false },
    { is_read: true },
  );
  return result.modifiedCount ?? 0;
}

// ─── Web Push subscriptions ──────────────────────────────────────────

export interface SubscribeParams {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

/**
 * Register (or refresh) a Web Push subscription. Idempotent on `endpoint`:
 * re-subscribing the same browser updates the keys/owner instead of creating a
 * duplicate.
 */
export async function subscribePush(
  params: SubscribeParams,
): Promise<{ created: boolean }> {
  const user = await resolveUser(params.userId);

  const result = await PushSubscription.findOneAndUpdate(
    { endpoint: params.endpoint },
    {
      user_id: user._id,
      endpoint: params.endpoint,
      keys: params.keys,
      user_agent: params.userAgent,
    },
    { upsert: true, new: true, includeResultMetadata: true },
  );

  // lastErrorObject.updatedExisting is false when a doc was inserted.
  const created = !result.lastErrorObject?.updatedExisting;
  return { created };
}

/** Remove a Web Push subscription by endpoint (only if owned by the user). */
export async function unsubscribePush(
  userId: string,
  endpoint: string,
): Promise<void> {
  const user = await resolveUser(userId);
  const result = await PushSubscription.deleteOne({
    endpoint,
    user_id: user._id,
  });
  if (result.deletedCount === 0) {
    throw new NotFoundError('Push subscription not found');
  }
}
