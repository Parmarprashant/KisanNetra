/**
 * Notification validators (Zod).
 *
 * Covers the in-app inbox (list / mark read) and Web Push subscription
 * management. Inputs are validated before the controller runs (per rules.md).
 */
import { z } from 'zod';

// ─── Inbox ───────────────────────────────────────────────────────────

export const NotificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  // Accept common truthy strings for a query flag; default false.
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const NotificationIdParamSchema = z.object({
  id: z.string().min(1),
});

// ─── Web Push subscription ───────────────────────────────────────────

/**
 * Matches the browser PushSubscription.toJSON() shape produced by a service
 * worker. `.strict()` on keys blocks stray fields; endpoint must be a URL.
 */
export const PushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z
    .object({
      p256dh: z.string().min(1).max(500),
      auth: z.string().min(1).max(500),
    })
    .strict(),
});

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;
export type PushSubscribeInput = z.infer<typeof PushSubscribeSchema>;
