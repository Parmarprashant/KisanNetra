/**
 * Analytics controller (thin).
 *
 * Parses the validated query, resolves the date window (defaults to the last 30
 * days when unset), delegates to analytics.service, and returns the standard
 * envelope. No aggregation logic here (per rules.md).
 *
 * Region handling: for extension officers, requireRegionalScope has already
 * overwritten req.query.region with their own district, so these handlers can
 * trust whatever region arrives.
 */
import { Request, Response } from 'express';
import * as analyticsService from '../services/analytics.service';
import * as outbreakService from '../services/outbreak.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type { AnalyticsFilter, Granularity } from '../services/analytics.service';
import type { SupportedCrop } from '../models/Scan';

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface RangeQuery {
  from?: string;
  to?: string;
  region?: string;
  crop?: SupportedCrop;
  disease?: string;
}

/** Resolve the {from,to} window, defaulting to the last 30 days. */
function resolveFilter(q: RangeQuery): AnalyticsFilter {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - DEFAULT_WINDOW_MS);
  return { from, to, region: q.region, crop: q.crop, disease: q.disease };
}

// GET /api/v1/analytics/overview
export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const filter = resolveFilter(req.query as RangeQuery);
  const overview = await analyticsService.getOverview(filter);
  res.json(
    apiResponse.success(
      { overview },
      { from: filter.from, to: filter.to, region: filter.region ?? null },
    ),
  );
});

// GET /api/v1/analytics/scans
export const getScanTrends = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as RangeQuery & { granularity: Granularity };
  const filter = resolveFilter(q);
  const trends = await analyticsService.getScanTrends(filter, q.granularity);
  res.json(
    apiResponse.success(
      { granularity: q.granularity, trends },
      { from: filter.from, to: filter.to, region: filter.region ?? null },
    ),
  );
});

// GET /api/v1/analytics/diseases/top
export const getTopDiseases = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as RangeQuery & { limit: number };
  const filter = resolveFilter(q);
  const diseases = await analyticsService.getTopDiseases(filter, q.limit);
  res.json(
    apiResponse.success(
      { diseases },
      { from: filter.from, to: filter.to, region: filter.region ?? null },
    ),
  );
});

// GET /api/v1/analytics/diseases/heatmap
export const getHeatmap = asyncHandler(async (req: Request, res: Response) => {
  const filter = resolveFilter(req.query as RangeQuery);
  const points = await analyticsService.getDiseaseHeatmap(filter);
  res.json(
    apiResponse.success(
      { points },
      { from: filter.from, to: filter.to, region: filter.region ?? null },
    ),
  );
});

// GET /api/v1/analytics/model/accuracy  (admin only)
export const getModelAccuracy = asyncHandler(
  async (req: Request, res: Response) => {
    const filter = resolveFilter(req.query as RangeQuery);
    const accuracy = await analyticsService.getModelAccuracy(filter);
    res.json(
      apiResponse.success(
        { accuracy },
        { from: filter.from, to: filter.to, region: filter.region ?? null },
      ),
    );
  },
);

// GET /api/v1/analytics/outbreaks
export const getOutbreaks = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as RangeQuery & { threshold: number };
  const { from, to } = resolveFilter(q);
  const outbreaks = await analyticsService.detectOutbreaks({
    from,
    to,
    threshold: q.threshold,
    region: q.region,
  });
  res.json(
    apiResponse.success(
      { outbreaks, threshold: q.threshold },
      { from, to, region: q.region ?? null },
    ),
  );
});

// GET /api/v1/analytics/outbreak-alerts  (persisted alerts from the worker)
export const getOutbreakAlerts = asyncHandler(
  async (req: Request, res: Response) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      region?: string;
      status?: string;
    };
    const result = await outbreakService.listAlerts({
      page: q.page,
      limit: q.limit,
      region: q.region,
      status: q.status,
    });
    res.json(
      apiResponse.success(
        { alerts: result.alerts },
        { total: result.total, page: result.page, limit: result.limit },
      ),
    );
  },
);
