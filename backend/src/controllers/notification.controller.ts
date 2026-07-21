/**
 * Notification controller (thin).
 *
 * Extracts validated input, delegates to notification.service, and shapes the
 * HTTP response. No business logic here (per rules.md).
 */
import { Request, Response } from 'express';
import * as notificationService from '../services/notification.service';
import { getVapidPublicKey } from '../services/push.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';

// GET /api/v1/notifications
export const listNotifications = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, limit, unread } = req.query as unknown as {
      page: number;
      limit: number;
      unread?: boolean;
    };

    const result = await notificationService.listNotifications({
      userId: req.user!.id,
      page,
      limit,
      unreadOnly: unread,
    });

    res.json(
      apiResponse.success(
        { notifications: result.notifications, unread: result.unread },
        { total: result.total, page: result.page, limit: result.limit },
      ),
    );
  },
);

// PATCH /api/v1/notifications/:id/read
export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const notification = await notificationService.markRead(
    req.user!.id,
    req.params.id,
  );
  res.json(
    apiResponse.success({
      notification_id: notification.notification_id,
      is_read: notification.is_read,
    }),
  );
});

// PATCH /api/v1/notifications/read-all
export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  const updated = await notificationService.markAllRead(req.user!.id);
  res.json(apiResponse.success({ updated }));
});

// GET /api/v1/notifications/vapid-public-key
export const getVapidKey = asyncHandler(
  async (_req: Request, res: Response) => {
    res.json(apiResponse.success({ public_key: getVapidPublicKey() ?? null }));
  },
);

// POST /api/v1/notifications/subscribe
export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const { endpoint, keys } = req.body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  const { created } = await notificationService.subscribePush({
    userId: req.user!.id,
    endpoint,
    keys,
    userAgent: req.get('user-agent') ?? undefined,
  });

  res.status(created ? 201 : 200).json(
    apiResponse.success({
      message: created ? 'Subscription registered' : 'Subscription updated',
    }),
  );
});

// DELETE /api/v1/notifications/subscribe
export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  const { endpoint } = req.body as { endpoint: string };
  await notificationService.unsubscribePush(req.user!.id, endpoint);
  res.json(apiResponse.success({ message: 'Subscription removed' }));
});
