/**
 * Outbreak service (Phase 14).
 *
 * The scheduled worker's business logic (HTTP-agnostic per rules.md): detect
 * district×disease hotspots, deduplicate against recent alerts, persist an
 * OutbreakAlert, and fan out — a localized `outbreak_alert` notification to every
 * extension officer in the affected district, plus a real-time `outbreak:alert`
 * broadcast to that district's socket room (Phase 12).
 *
 * Reuses the Phase-8 `detectOutbreaks` aggregation (no duplicated query logic).
 */
import { nanoid } from 'nanoid';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { User } from '../models/User';
import {
  OutbreakAlert,
  type IOutbreakAlert,
  type AlertLevel,
} from '../models/OutbreakAlert';
import * as analyticsService from './analytics.service';
import * as notificationService from './notification.service';
import { notificationTemplates } from './templates/notification.templates';
import { emitToRoom, officerRoom } from '../config/socket';

/** Window over which a hotspot is measured. */
const WINDOW_DAYS = 7;
/** scan_count at/above this is a 'critical' alert (else 'high'). */
const CRITICAL_MULTIPLIER = 4;
/** Don't raise a new alert if one for the same district+disease is newer than this. */
const DEDUP_COOLDOWN_MS = 48 * 60 * 60 * 1000; // 48 hours

export interface DetectAndAlertResult {
  hotspots: number;
  alertsCreated: number;
}

/**
 * Run outbreak detection and alerting for the current window. Idempotent within
 * the cooldown: a persistent hotspot yields one alert per 48h, not one per run.
 * Never throws to the worker — errors per-hotspot are logged and skipped.
 */
export async function detectAndAlert(): Promise<DetectAndAlertResult> {
  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const threshold = env.OUTBREAK_THRESHOLD;

  const hotspots = await analyticsService.detectOutbreaks({ from, to, threshold });
  let alertsCreated = 0;

  for (const hotspot of hotspots) {
    try {
      const created = await raiseAlert(hotspot.district, hotspot.disease_label, hotspot.count, threshold);
      if (created) alertsCreated += 1;
    } catch (err) {
      logger.warn('Failed to raise outbreak alert', {
        district: hotspot.district,
        disease: hotspot.disease_label,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Outbreak detection run complete', {
    hotspots: hotspots.length,
    alertsCreated,
    threshold,
  });
  return { hotspots: hotspots.length, alertsCreated };
}

/**
 * Persist an alert for one hotspot (if not deduped) and fan out notifications.
 * Returns true when a new alert was created, false when deduped.
 */
async function raiseAlert(
  district: string,
  disease: string,
  count: number,
  threshold: number,
): Promise<boolean> {
  // Dedup: skip if a recent alert already covers this district+disease.
  const recent = await OutbreakAlert.findOne({
    district,
    disease_label: disease,
    createdAt: { $gte: new Date(Date.now() - DEDUP_COOLDOWN_MS) },
  }).lean();
  if (recent) return false;

  const level: AlertLevel = count >= threshold * CRITICAL_MULTIPLIER ? 'critical' : 'high';

  const alert = await OutbreakAlert.create({
    alert_id: `alr_${nanoid()}`,
    district,
    disease_label: disease,
    scan_count: count,
    level,
    status: 'active',
    window_days: WINDOW_DAYS,
  });

  await notifyOfficers(alert);
  broadcast(alert);
  return true;
}

/** Dispatch a localized outbreak_alert notification to each officer in the district. */
async function notifyOfficers(alert: IOutbreakAlert): Promise<void> {
  const officers = await User.find({
    role: 'extension_officer',
    region: alert.district,
    is_active: true,
    is_deleted: false,
  }).select('_id language');

  await Promise.all(
    officers.map((officer) => {
      const { title, body } = notificationTemplates.outbreak_alert(
        officer.language,
        alert.district,
        alert.disease_label,
      );
      return notificationService
        .dispatch({
          userObjectId: officer._id,
          type: 'outbreak_alert',
          title,
          body,
          data: {
            alert_id: alert.alert_id,
            district: alert.district,
            disease: alert.disease_label,
            level: alert.level,
          },
        })
        .catch((err: unknown) => {
          logger.warn('Outbreak notification dispatch failed', {
            officer: String(officer._id),
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }),
  );
}

/** Broadcast a real-time alert to the district's officer socket room (Phase 12). */
function broadcast(alert: IOutbreakAlert): void {
  emitToRoom(officerRoom(alert.district), 'outbreak:alert', {
    alert_id: alert.alert_id,
    district: alert.district,
    disease: alert.disease_label,
    level: alert.level,
    scan_count: alert.scan_count,
  });
}

// ─── Read (persisted alerts) ─────────────────────────────────────────

export interface ListAlertsOptions {
  page: number;
  limit: number;
  region?: string;
  status?: string;
}

/** List persisted outbreak alerts newest-first (officer/admin dashboard). */
export async function listAlerts(opts: ListAlertsOptions): Promise<{
  alerts: IOutbreakAlert[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: Record<string, unknown> = {};
  if (opts.region) filter.district = opts.region;
  if (opts.status) filter.status = opts.status;

  const skip = (opts.page - 1) * opts.limit;
  const [alerts, total] = await Promise.all([
    OutbreakAlert.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(opts.limit),
    OutbreakAlert.countDocuments(filter),
  ]);

  return { alerts, total, page: opts.page, limit: opts.limit };
}
