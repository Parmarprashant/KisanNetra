/**
 * Web Push service (VAPID).
 *
 * Env-gated: if VAPID keys are not configured, every send is a no-op that
 * returns 'skipped' (logged once at startup). This keeps the app fully runnable
 * without push credentials. On send failure the push service returns a
 * DeliveryState instead of throwing, so a dead subscription never breaks the
 * notification pipeline; expired subscriptions (HTTP 404/410) are pruned.
 */
import webpush from 'web-push';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { PushSubscription } from '../models/PushSubscription';
import type { DeliveryState } from '../models/Notification';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const isConfigured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (isConfigured) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY as string,
    env.VAPID_PRIVATE_KEY as string,
  );
  logger.info('Web Push configured (VAPID)');
} else {
  logger.warn('Web Push not configured — push notifications will be skipped');
}

/** Expose the public VAPID key so clients can subscribe (safe to reveal). */
export function getVapidPublicKey(): string | undefined {
  return env.VAPID_PUBLIC_KEY;
}

/**
 * Send a push notification to every subscription owned by a user. Returns an
 * aggregate DeliveryState: 'skipped' if unconfigured or the user has no
 * subscriptions, 'sent' if at least one push succeeded, else 'failed'.
 */
export async function sendPushToUser(
  userObjectId: unknown,
  payload: PushPayload,
): Promise<DeliveryState> {
  if (!isConfigured) return 'skipped';

  const subs = await PushSubscription.find({ user_id: userObjectId });
  if (subs.length === 0) return 'skipped';

  const body = JSON.stringify(payload);
  let anySent = false;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          },
          body,
        );
        anySent = true;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 404/410 → the subscription is gone; prune it so we stop retrying.
        if (statusCode === 404 || statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(
            () => undefined,
          );
        }
        logger.warn('Push send failed', {
          statusCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );

  return anySent ? 'sent' : 'failed';
}
