/**
 * Scan controller (thin).
 *
 * Extracts validated input + uploaded file, delegates to scan.service, and
 * shapes the HTTP response. No business logic here.
 */
import { Request, Response } from 'express';
import * as scanService from '../services/scan.service';
import * as auditService from '../services/audit.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { auditContext } from '../utils/auditContext';
import { BadRequestError } from '../utils/errors';
import type { SupportedCrop } from '../models/Scan';
import type { Language } from '../models/User';

// POST /api/v1/scans
export const submitScan = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new BadRequestError('Image file is required', 'image_required');

  const { crop_type, latitude, longitude, offline_queued_at, device_id, language } =
    req.body as {
      crop_type: SupportedCrop;
      latitude?: number;
      longitude?: number;
      offline_queued_at?: string;
      device_id?: string;
      language: Language;
    };

  const { scan, treatment } = await scanService.submitScan({
    userId: req.user!.id,
    imageBuffer: req.file.buffer,
    cropType: crop_type,
    latitude,
    longitude,
    offlineQueuedAt: offline_queued_at,
    deviceId: device_id,
    language,
    region: req.user!.region,
  });

  void auditService.log({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'scan.submit',
    resource: `Scan:${scan.scan_id}`,
    metadata: {
      crop_type: scan.crop_type,
      disease: scan.prediction.disease_label,
    },
    ...auditContext(req),
  });

  res.status(201).json(
    apiResponse.success({
      scan_id: scan.scan_id,
      crop_type: scan.crop_type,
      image_url: scan.image_url,
      prediction: scan.prediction,
      treatment,
      low_confidence: scan.prediction.low_confidence,
      processed_at: scan.processed_at,
    }),
  );
});

// GET /api/v1/scans
export const listScans = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, crop_type } = req.query as unknown as {
    page: number;
    limit: number;
    crop_type?: SupportedCrop;
  };

  const result = await scanService.listScans({
    userId: req.user!.id,
    page,
    limit,
    cropType: crop_type,
  });

  res.json(
    apiResponse.success(
      { scans: result.scans },
      { total: result.total, page: result.page, limit: result.limit },
    ),
  );
});

// GET /api/v1/scans/:id
export const getScan = asyncHandler(async (req: Request, res: Response) => {
  const scan = await scanService.getScanById(req.user!.id, req.params.id);
  res.json(apiResponse.success({ scan }));
});

// PATCH /api/v1/scans/:id/feedback
export const submitFeedback = asyncHandler(async (req: Request, res: Response) => {
  const { feedback } = req.body as { feedback: 'correct' | 'incorrect' };
  await scanService.submitFeedback(req.user!.id, req.params.id, feedback);

  void auditService.log({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'scan.feedback',
    resource: `Scan:${req.params.id}`,
    metadata: { feedback },
    ...auditContext(req),
  });

  res.json(apiResponse.success({ message: 'Feedback recorded. Thank you!' }));
});

// DELETE /api/v1/scans/:id
export const deleteScan = asyncHandler(async (req: Request, res: Response) => {
  await scanService.softDeleteScan(req.user!.id, req.params.id);

  void auditService.log({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'scan.delete',
    resource: `Scan:${req.params.id}`,
    ...auditContext(req),
  });

  res.json(apiResponse.success({ message: 'Scan deleted' }));
});
