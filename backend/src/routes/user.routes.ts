/**
 * User routes (/api/v1/users).
 *
 * All routes require authentication. Listing all users is admin-only, which
 * exercises the RBAC middleware.
 */
import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate';
import { ListUsersQuerySchema } from '../validators/user.validators';

const router = Router();

// Every user route requires a valid access token.
router.use(authenticateJWT);

router.get('/me', userController.getMe);

router.get(
  '/',
  requireRole('admin'),
  validate({ query: ListUsersQuerySchema }),
  userController.listUsers,
);

export default router;
