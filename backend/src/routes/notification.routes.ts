/**
 * Notification routes (/api/v1/notifications).
 *
 * All routes require authentication and operate on the caller's own
 * notifications / push subscriptions. Static paths (read-all, subscribe,
 * vapid-public-key) are declared before the dynamic `/:id/read` route.
 */
import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import {
  NotificationListQuerySchema,
  NotificationIdParamSchema,
  PushSubscribeSchema,
  PushUnsubscribeSchema,
} from '../validators/notification.validators';

const router = Router();

router.use(authenticateJWT);

// ─── Web Push subscription (static paths first) ─────────────────────
router.get('/vapid-public-key', notificationController.getVapidKey);

router.post(
  '/subscribe',
  validate({ body: PushSubscribeSchema }),
  notificationController.subscribe,
);

router.delete(
  '/subscribe',
  validate({ body: PushUnsubscribeSchema }),
  notificationController.unsubscribe,
);

// ─── Inbox ──────────────────────────────────────────────────────────
router.patch('/read-all', notificationController.markAllRead);

router.get(
  '/',
  validate({ query: NotificationListQuerySchema }),
  notificationController.listNotifications,
);

router.patch(
  '/:id/read',
  validate({ params: NotificationIdParamSchema }),
  notificationController.markRead,
);

export default router;
