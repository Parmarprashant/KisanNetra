/**
 * Auth routes (/api/v1/auth).
 *
 * Routes only map endpoints → middleware → controller. Validation runs before
 * controllers; logout requires a valid access token.
 */
import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticateJWT } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimiter';
import { RegisterSchema, LoginSchema, ForgotPasswordSchema, ResetPasswordSchema } from '../validators/auth.validators';

const router = Router();

router.post('/register', validate({ body: RegisterSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: LoginSchema }), authController.login);
router.post('/refresh', authLimiter, authController.refresh);
router.post('/logout', authenticateJWT, authController.logout);
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: ForgotPasswordSchema }),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: ResetPasswordSchema }),
  authController.resetPassword,
);

export default router;
