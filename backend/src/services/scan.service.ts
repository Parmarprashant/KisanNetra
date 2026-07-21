/**
 * Scan service.
 *
 * Orchestrates the diagnosis pipeline and owns all scan business logic
 * (HTTP-agnostic per rules.md):
 *   process image → classify (Gemini) → persist → return.
 * Treatment linking (Phase 5), WebSocket emit (Phase 12), audit (Phase 13) and
 * follow-up notifications (Phase 7) are integrated in their phases.
 */
import { nanoid } from 'nanoid';
import { Types } from 'mongoose';
import { Scan, IScan, SupportedCrop } from '../models/Scan';
import { User } from '../models/User';
import { Treatment } from '../models/Treatment';
import { processAndUploadImage, getPresignedUrl } from './image.service';
import { classifyLeafImage } from './gemini.service';
import * as treatmentService from './treatment.service';
import * as notificationService from './notification.service';
import { notificationTemplates } from './templates/notification.templates';
import { emitToUser } from '../config/socket';
import { enqueueTreatmentReminder } from '../jobs/queues';
import { env } from '../config/env';
import { hashDeviceId } from '../utils/hashUtils';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import type { Language } from '../models/User';
import type { TreatmentResult } from './treatment.service';

export interface SubmitScanParams {
  userId: string; // user_id (string) from the auth token
  imageBuffer: Buffer;
  cropType: SupportedCrop;
  latitude?: number;
  longitude?: number;
  offlineQueuedAt?: string;
  deviceId?: string;
  language: Language;
  region?: string; // farmer's/officer's region — narrows treatment lookup
}

/** Resolve the Mongo ObjectId for a user_id string (scans reference it). */
async function resolveUserObjectId(userId: string): Promise<Types.ObjectId> {
  const user = await User.findOne({ user_id: userId }).select('_id').lean();
  if (!user) throw new NotFoundError('User not found');
  return user._id as Types.ObjectId;
}

export interface SubmitScanResult {
  scan: IScan;
  treatment: TreatmentResult | null;
}

export async function submitScan(
  params: SubmitScanParams,
): Promise<SubmitScanResult> {
  const userObjectId = await resolveUserObjectId(params.userId);

  // 1. Process + store the image (EXIF strip, resize, upload).
  const image = await processAndUploadImage(params.imageBuffer, params.userId);

  // 2. Classify with Gemini (never throws — degrades gracefully).
  const prediction = await classifyLeafImage(
    image.classifyBase64,
    image.mimeType,
    params.cropType,
  );

  // 3. Look up a curated treatment for the diagnosis (Redis-cached, regional
  //    fallback to All India). Skip when the leaf is healthy or unreadable —
  //    there is no treatment to recommend, and this avoids a wasted lookup.
  const treatment =
    prediction.is_healthy || prediction.confidence === 0
      ? null
      : await treatmentService.getForDisease(
          prediction.disease_label,
          params.cropType,
          params.region,
          params.language,
        );

  // 4. Resolve the treatment's ObjectId to store as a reference on the scan.
  let treatmentRef: Types.ObjectId | undefined;
  if (treatment) {
    const ref = await Treatment.findOne({
      treatment_id: treatment.treatment_id,
    })
      .select('_id')
      .lean();
    treatmentRef = ref?._id as Types.ObjectId | undefined;
  }

  // 5. Persist the scan.
  const scan = await Scan.create({
    scan_id: `scn_${nanoid()}`,
    user_id: userObjectId,
    device_id: params.deviceId ? hashDeviceId(params.deviceId) : undefined,
    image_url: image.s3Url,
    image_s3_key: image.s3Key,
    crop_type: params.cropType,
    location: {
      type: 'Point',
      coordinates: [params.longitude ?? 0, params.latitude ?? 0],
    },
    prediction,
    treatment_ref: treatmentRef,
    offline_queued_at: params.offlineQueuedAt
      ? new Date(params.offlineQueuedAt)
      : undefined,
    processed_at: new Date(),
    language: params.language,
    status: 'processed',
  });

  // 6. Push the result to the farmer's connected clients in real time
  //    (Phase 12) — fire-and-forget; a no-op if the socket layer is down or the
  //    user has no open connection. Lets a live PWA update instantly instead of
  //    polling, and delivers results for scans replayed from an offline queue.
  emitToUser(params.userId, 'scan:result', {
    scan_id: scan.scan_id,
    crop_type: scan.crop_type,
    prediction,
    treatment,
  });

  // 7. Notify the farmer their result is ready (Phase 7) — fire-and-forget so
  //    a slow/failed channel never delays the scan response. Skipped for
  //    healthy/unreadable scans (no actionable diagnosis to announce).
  if (!prediction.is_healthy && prediction.confidence > 0) {
    const { title, body } = notificationTemplates.scan_result(
      params.language,
      prediction.disease_label,
    );
    void notificationService
      .dispatch({
        userObjectId,
        type: 'scan_result',
        title,
        body,
        data: { scan_id: scan.scan_id, disease: prediction.disease_label },
      })
      .catch((err) => {
        logger.warn('scan_result notification dispatch failed', {
          scan_id: scan.scan_id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    // 8. Schedule a treatment-reminder follow-up (Phase 14) — a delayed job that
    //    fires a reminder notification N days out. No-op when queues are
    //    disabled (returns false); we simply skip the reminder in that mode
    //    rather than block the request.
    void enqueueTreatmentReminder({
      userId: params.userId,
      disease: prediction.disease_label,
      language: params.language,
      scanId: scan.scan_id,
      delayMs: env.TREATMENT_REMINDER_DAYS * 24 * 60 * 60 * 1000,
    }).catch(() => undefined);
  }

  return { scan, treatment };
}

export interface ListScansOptions {
  userId: string;
  page: number;
  limit: number;
  cropType?: SupportedCrop;
}

export async function listScans(opts: ListScansOptions): Promise<{
  scans: IScan[];
  total: number;
  page: number;
  limit: number;
}> {
  const userObjectId = await resolveUserObjectId(opts.userId);
  const filter: Record<string, unknown> = {
    user_id: userObjectId,
    is_deleted: false,
  };
  if (opts.cropType) filter.crop_type = opts.cropType;

  const skip = (opts.page - 1) * opts.limit;
  const [scans, total] = await Promise.all([
    Scan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(opts.limit),
    Scan.countDocuments(filter),
  ]);

  // Stored URLs expire (15-min presigned) — regenerate fresh ones so history
  // screens rendered from this list always have viewable images.
  await Promise.all(
    scans.map(async (scan) => {
      scan.image_url = await getPresignedUrl(scan.image_s3_key);
    }),
  );

  return { scans, total, page: opts.page, limit: opts.limit };
}

/**
 * Fetch a single scan owned by the user. Refreshes the image URL (pre-signed
 * URLs expire) so the returned document always has a viewable link.
 */
export async function getScanById(
  userId: string,
  scanId: string,
): Promise<IScan> {
  const userObjectId = await resolveUserObjectId(userId);
  const scan = await Scan.findOne({
    scan_id: scanId,
    user_id: userObjectId,
    is_deleted: false,
  }).populate('treatment_ref');
  if (!scan) throw new NotFoundError('Scan not found');

  // Regenerate a fresh pre-signed URL from the stored key.
  scan.image_url = await getPresignedUrl(scan.image_s3_key);
  return scan;
}

export async function submitFeedback(
  userId: string,
  scanId: string,
  feedback: 'correct' | 'incorrect',
): Promise<IScan> {
  const userObjectId = await resolveUserObjectId(userId);
  const scan = await Scan.findOneAndUpdate(
    { scan_id: scanId, user_id: userObjectId, is_deleted: false },
    { feedback },
    { new: true },
  );
  if (!scan) throw new NotFoundError('Scan not found');

  // Phase 4/14: an 'incorrect' scan would be queued for the retraining pipeline.
  return scan;
}

export async function softDeleteScan(
  userId: string,
  scanId: string,
): Promise<void> {
  const userObjectId = await resolveUserObjectId(userId);
  const scan = await Scan.findOneAndUpdate(
    { scan_id: scanId, user_id: userObjectId, is_deleted: false },
    { is_deleted: true },
    { new: true },
  );
  if (!scan) throw new NotFoundError('Scan not found');
}
