/**
 * Scan routes (/api/v1/scans).
 *
 * All routes require authentication. For submission, the upload middleware runs
 * BEFORE validation because Multer parses the multipart form (populating
 * req.body with the text fields) that the Zod schema then validates.
 */
import { Router } from 'express';
import * as scanController from '../controllers/scan.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { scanLimiter } from '../middleware/rateLimiter';
import { uploadLeafImage } from '../middleware/upload.middleware';
import {
  ScanSubmitSchema,
  ScanListQuerySchema,
  ScanIdParamSchema,
  FeedbackSchema,
} from '../validators/scan.validators';

const router = Router();

router.use(authenticateJWT);

router.post(
  '/',
  scanLimiter,
  uploadLeafImage,
  validate({ body: ScanSubmitSchema }),
  scanController.submitScan,
);

router.get('/', validate({ query: ScanListQuerySchema }), scanController.listScans);

router.get(
  '/:id',
  validate({ params: ScanIdParamSchema }),
  scanController.getScan,
);

router.patch(
  '/:id/feedback',
  validate({ params: ScanIdParamSchema, body: FeedbackSchema }),
  scanController.submitFeedback,
);

router.delete(
  '/:id',
  validate({ params: ScanIdParamSchema }),
  scanController.deleteScan,
);

export default router;
