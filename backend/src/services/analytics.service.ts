/**
 * Analytics service.
 *
 * Owns all analytics business logic (HTTP-agnostic per rules.md) — a set of
 * read-only MongoDB aggregation pipelines over the Scans collection that power
 * the officer/admin dashboards:
 *   - overview        : headline counts for a period
 *   - scanTrends      : scan volume time series (day/week/month)
 *   - topDiseases     : most frequent diagnoses
 *   - diseaseHeatmap  : geospatial density for maps (GeoJSON-friendly)
 *   - modelAccuracy   : correct/incorrect ratio from farmer feedback
 *   - detectOutbreaks : on-demand district+disease hotspots over a window
 *
 * Region scoping: `region` lives on the User, not the Scan, so any pipeline that
 * filters or groups by region joins into `users` via $lookup. Pipelines that
 * don't touch region skip the join entirely to stay cheap. Soft-deleted scans
 * (is_deleted) are always excluded.
 *
 * NOTE (Phase 8 scope): outbreak detection here is an on-demand read. Persisting
 * OutbreakAlert documents and auto-notifying officers is a scheduled worker,
 * deferred to Phase 14 — the `outbreak_alert` notification template/channels
 * already exist (Phase 7) and will be wired then.
 */
import { PipelineStage } from 'mongoose';
import { Scan } from '../models/Scan';
import type { SupportedCrop } from '../models/Scan';

export type Granularity = 'day' | 'week' | 'month';

export interface AnalyticsFilter {
  from: Date;
  to: Date;
  region?: string;
  crop?: SupportedCrop;
  disease?: string;
}

/** Mongo date-format token for a granularity bucket. */
const DATE_FORMAT: Record<Granularity, string> = {
  day: '%Y-%m-%d',
  week: '%Y-W%V',
  month: '%Y-%m',
};

/**
 * Base $match on scans for a filter. Region is intentionally NOT included here —
 * it lives on the user and is applied after a $lookup by `regionStages()`.
 */
function baseMatch(filter: AnalyticsFilter): Record<string, unknown> {
  const match: Record<string, unknown> = {
    is_deleted: false,
    createdAt: { $gte: filter.from, $lte: filter.to },
  };
  if (filter.crop) match.crop_type = filter.crop;
  if (filter.disease) match['prediction.disease_label'] = filter.disease;
  return match;
}

/**
 * Pipeline stages that join the scan's user and (optionally) filter by region.
 * Returns an empty array when no region filter is requested, so callers can
 * spread it without paying for the $lookup.
 */
function regionStages(region?: string): PipelineStage[] {
  if (!region) return [];
  return [
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: '_user',
      },
    },
    { $unwind: '$_user' },
    { $match: { '_user.region': region } },
  ];
}

// ─── Overview ────────────────────────────────────────────────────────

export interface OverviewResult {
  total_scans: number;
  healthy: number;
  diseased: number;
  low_confidence: number;
  distinct_diseases: number;
  distinct_crops: number;
}

export async function getOverview(
  filter: AnalyticsFilter,
): Promise<OverviewResult> {
  const [row] = await Scan.aggregate([
    { $match: baseMatch(filter) },
    ...regionStages(filter.region),
    {
      $group: {
        _id: null,
        total_scans: { $sum: 1 },
        healthy: {
          $sum: { $cond: ['$prediction.is_healthy', 1, 0] },
        },
        low_confidence: {
          $sum: { $cond: ['$prediction.low_confidence', 1, 0] },
        },
        diseases: { $addToSet: '$prediction.disease_label' },
        crops: { $addToSet: '$crop_type' },
      },
    },
    {
      $project: {
        _id: 0,
        total_scans: 1,
        healthy: 1,
        diseased: { $subtract: ['$total_scans', '$healthy'] },
        low_confidence: 1,
        distinct_diseases: { $size: '$diseases' },
        distinct_crops: { $size: '$crops' },
      },
    },
  ]);

  return (
    row ?? {
      total_scans: 0,
      healthy: 0,
      diseased: 0,
      low_confidence: 0,
      distinct_diseases: 0,
      distinct_crops: 0,
    }
  );
}

// ─── Scan trends (time series) ───────────────────────────────────────

export interface TrendPoint {
  period: string;
  count: number;
}

export async function getScanTrends(
  filter: AnalyticsFilter,
  granularity: Granularity,
): Promise<TrendPoint[]> {
  return Scan.aggregate([
    { $match: baseMatch(filter) },
    ...regionStages(filter.region),
    {
      $group: {
        _id: {
          $dateToString: {
            format: DATE_FORMAT[granularity],
            date: '$createdAt',
          },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, period: '$_id', count: 1 } },
  ]);
}

// ─── Top diseases ────────────────────────────────────────────────────

export interface DiseaseCount {
  disease_label: string;
  count: number;
}

export async function getTopDiseases(
  filter: AnalyticsFilter,
  limit: number,
): Promise<DiseaseCount[]> {
  return Scan.aggregate([
    { $match: baseMatch(filter) },
    ...regionStages(filter.region),
    // A curated remedy exists only for actual diseases — exclude healthy leaves.
    { $match: { 'prediction.is_healthy': false } },
    {
      $group: {
        _id: '$prediction.disease_label',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { _id: 0, disease_label: '$_id', count: 1 } },
  ]);
}

// ─── Disease heatmap (geospatial density) ────────────────────────────

export interface HeatmapPoint {
  lat: number;
  lon: number;
  disease_label: string;
  count: number;
}

/**
 * Group diagnoses by rounded coordinate (≈1km at 2 decimals) for a map overlay.
 * Scans without a real location ([0,0]) are excluded so the map isn't polluted
 * by unlocated submissions.
 */
export async function getDiseaseHeatmap(
  filter: AnalyticsFilter,
): Promise<HeatmapPoint[]> {
  return Scan.aggregate([
    {
      $match: {
        ...baseMatch(filter),
        'prediction.is_healthy': false,
        'location.coordinates': { $ne: [0, 0] },
      },
    },
    ...regionStages(filter.region),
    {
      $group: {
        _id: {
          disease: '$prediction.disease_label',
          lat: { $round: [{ $arrayElemAt: ['$location.coordinates', 1] }, 2] },
          lon: { $round: [{ $arrayElemAt: ['$location.coordinates', 0] }, 2] },
        },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        disease_label: '$_id.disease',
        lat: '$_id.lat',
        lon: '$_id.lon',
        count: 1,
      },
    },
    { $sort: { count: -1 } },
  ]);
}

// ─── Model accuracy (from feedback) ──────────────────────────────────

export interface AccuracyResult {
  total_feedback: number;
  correct: number;
  incorrect: number;
  accuracy: number | null; // null when there's no feedback yet
}

export async function getModelAccuracy(
  filter: AnalyticsFilter,
): Promise<AccuracyResult> {
  const [row] = await Scan.aggregate([
    {
      $match: {
        ...baseMatch(filter),
        feedback: { $ne: null },
      },
    },
    ...regionStages(filter.region),
    {
      $group: {
        _id: null,
        total_feedback: { $sum: 1 },
        correct: {
          $sum: { $cond: [{ $eq: ['$feedback', 'correct'] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        _id: 0,
        total_feedback: 1,
        correct: 1,
        incorrect: { $subtract: ['$total_feedback', '$correct'] },
        accuracy: { $divide: ['$correct', '$total_feedback'] },
      },
    },
  ]);

  return (
    row ?? { total_feedback: 0, correct: 0, incorrect: 0, accuracy: null }
  );
}

// ─── Outbreak detection (on-demand hotspots) ─────────────────────────

export interface OutbreakHotspot {
  district: string;
  disease_label: string;
  count: number;
}

/**
 * District+disease combinations whose scan count over the window meets a
 * threshold. Requires the user join (district = user.region). Scans from users
 * without a region are ignored. This is the read used by dashboards; the
 * scheduled alert-and-notify worker is Phase 14.
 */
export async function detectOutbreaks(params: {
  from: Date;
  to: Date;
  threshold: number;
  region?: string;
}): Promise<OutbreakHotspot[]> {
  const match: Record<string, unknown> = {
    is_deleted: false,
    createdAt: { $gte: params.from, $lte: params.to },
    'prediction.is_healthy': false,
  };

  return Scan.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: '_user',
      },
    },
    { $unwind: '$_user' },
    {
      $match: {
        '_user.region': params.region
          ? params.region
          : { $nin: [null, ''] },
      },
    },
    {
      $group: {
        _id: {
          district: '$_user.region',
          disease: '$prediction.disease_label',
        },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gte: params.threshold } } },
    { $sort: { count: -1 } },
    {
      $project: {
        _id: 0,
        district: '$_id.district',
        disease_label: '$_id.disease',
        count: 1,
      },
    },
  ]);
}
