/**
 * Analytics routes (/api/v1/analytics).
 *
 * Read-only dashboard endpoints. All require an extension officer or admin
 * (farmers/agronomists have no analytics access). `requireRegionalScope` runs on
 * every route so an extension officer's queries are pinned to their own
 * district; admins may pass any `region` (or none for all-India).
 *
 * Model accuracy is additionally restricted to admins — it reflects on the AI
 * system as a whole, not a regional operational concern.
 */
import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole, requireRegionalScope } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate';
import {
  AnalyticsOverviewQuerySchema,
  ScanTrendsQuerySchema,
  TopDiseasesQuerySchema,
  HeatmapQuerySchema,
  ModelAccuracyQuerySchema,
  OutbreakQuerySchema,
  OutbreakAlertsQuerySchema,
} from '../validators/analytics.validators';

const router = Router();

// Every analytics route: authenticated, officer/admin only, region-scoped.
router.use(authenticateJWT);
router.use(requireRole('extension_officer', 'admin'));
router.use(requireRegionalScope);

router.get(
  '/overview',
  validate({ query: AnalyticsOverviewQuerySchema }),
  analyticsController.getOverview,
);

router.get(
  '/scans',
  validate({ query: ScanTrendsQuerySchema }),
  analyticsController.getScanTrends,
);

router.get(
  '/diseases/top',
  validate({ query: TopDiseasesQuerySchema }),
  analyticsController.getTopDiseases,
);

router.get(
  '/diseases/heatmap',
  validate({ query: HeatmapQuerySchema }),
  analyticsController.getHeatmap,
);

router.get(
  '/outbreaks',
  validate({ query: OutbreakQuerySchema }),
  analyticsController.getOutbreaks,
);

router.get(
  '/outbreak-alerts',
  validate({ query: OutbreakAlertsQuerySchema }),
  analyticsController.getOutbreakAlerts,
);

// Admin-only: overall model accuracy from feedback.
router.get(
  '/model/accuracy',
  requireRole('admin'),
  validate({ query: ModelAccuracyQuerySchema }),
  analyticsController.getModelAccuracy,
);

export default router;
