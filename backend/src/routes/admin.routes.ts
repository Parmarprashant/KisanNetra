/**
 * Admin routes (/api/v1/admin).
 *
 * Every route requires a valid access token AND the admin role, enforced once at
 * the router level. Static `/system/*` paths are declared before the dynamic
 * `/users/:id` routes (Express matches top-down).
 *
 * Note: treatment-proposal review (list / approve / reject) already lives under
 * /api/v1/treatments/proposals* (Phase 5, admin-gated) and is reused as-is — it
 * is not duplicated here.
 */
import { Router } from 'express';
import * as adminController from '../controllers/admin.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate';
import {
  AdminListUsersQuerySchema,
  UserIdParamSchema,
  ChangeRoleSchema,
  SuspendSchema,
} from '../validators/admin.validators';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('admin'));

// ─── System (static paths first) ────────────────────────────────────
router.get('/system/health', adminController.getSystemHealth);

// ─── User management ────────────────────────────────────────────────
router.get(
  '/users',
  validate({ query: AdminListUsersQuerySchema }),
  adminController.listUsers,
);

router.get(
  '/users/:id',
  validate({ params: UserIdParamSchema }),
  adminController.getUser,
);

router.patch(
  '/users/:id/role',
  validate({ params: UserIdParamSchema, body: ChangeRoleSchema }),
  adminController.changeRole,
);

router.patch(
  '/users/:id/suspend',
  validate({ params: UserIdParamSchema, body: SuspendSchema }),
  adminController.suspendUser,
);

router.delete(
  '/users/:id',
  validate({ params: UserIdParamSchema }),
  adminController.deleteUser,
);

export default router;
