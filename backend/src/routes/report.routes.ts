/**
 * Report routes (/api/v1/reports).
 *
 * Report generation is an officer/admin capability (farmers don't export
 * platform data). Regional scoping for officers is enforced in the controller
 * because the region lives in the request body `params`, not the query.
 * Static `/:id/download` is declared distinctly from `/:id`.
 */
import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate';
import {
  CreateReportSchema,
  ReportListQuerySchema,
  ReportIdParamSchema,
} from '../validators/report.validators';

const router = Router();

router.use(authenticateJWT);
router.use(requireRole('extension_officer', 'admin'));

router.post(
  '/',
  validate({ body: CreateReportSchema }),
  reportController.createReport,
);

router.get(
  '/',
  validate({ query: ReportListQuerySchema }),
  reportController.listReports,
);

router.get(
  '/:id/download',
  validate({ params: ReportIdParamSchema }),
  reportController.downloadReport,
);

router.get(
  '/:id',
  validate({ params: ReportIdParamSchema }),
  reportController.getReport,
);

export default router;
