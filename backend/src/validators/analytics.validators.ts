/**
 * Analytics validators (Zod).
 *
 * All analytics endpoints are read-only and share a common date-range +
 * dimension filter. `from`/`to` are optional ISO dates; the controller defaults
 * an unset range to the last 30 days. `region` supplied by a client is only
 * honoured for admins — for extension officers the RBAC regional-scope guard
 * overwrites it with their own district before the controller runs.
 */
import { z } from 'zod';
import { SUPPORTED_CROPS } from '../models/Scan';

const isoDate = z.string().datetime({ offset: true });

/** Shared filter accepted by every analytics query. */
const baseFilter = {
  from: isoDate.optional(),
  to: isoDate.optional(),
  region: z.string().min(1).max(100).optional(),
  crop: z.enum(SUPPORTED_CROPS).optional(),
  disease: z.string().min(1).max(120).optional(),
};

export const AnalyticsOverviewQuerySchema = z.object({ ...baseFilter });

export const ScanTrendsQuerySchema = z.object({
  ...baseFilter,
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});

export const TopDiseasesQuerySchema = z.object({
  ...baseFilter,
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const HeatmapQuerySchema = z.object({ ...baseFilter });

export const ModelAccuracyQuerySchema = z.object({ ...baseFilter });

export const OutbreakQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  region: z.string().min(1).max(100).optional(),
  // Minimum scans of the same disease in a district to count as a hotspot.
  threshold: z.coerce.number().int().min(1).max(100000).default(10),
});

/** Persisted outbreak-alert list (Phase 14). */
export const OutbreakAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  region: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'acknowledged', 'resolved']).optional(),
});

export type AnalyticsOverviewQuery = z.infer<typeof AnalyticsOverviewQuerySchema>;
export type ScanTrendsQuery = z.infer<typeof ScanTrendsQuerySchema>;
export type TopDiseasesQuery = z.infer<typeof TopDiseasesQuerySchema>;
export type OutbreakQuery = z.infer<typeof OutbreakQuerySchema>;
export type OutbreakAlertsQuery = z.infer<typeof OutbreakAlertsQuerySchema>;
