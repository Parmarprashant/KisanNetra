/**
 * Audit-log routes (/api/v1/audit-logs) — Phase 13.
 *
 * Read-only, admin-only. The audit trail is written implicitly by the actions
 * across the app (fire-and-forget audit.service.log()); this router only exposes
 * the browse/search view for administrators.
 */
import { Router } from 'express';
import * as auditController from '../controllers/auditlog.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate';
import { AuditLogQuerySchema } from '../validators/audit.validators';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('admin'));

router.get(
  '/',
  validate({ query: AuditLogQuerySchema }),
  auditController.listAuditLogs,
);

export default router;
