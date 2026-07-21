/**
 * Scan validation schemas (Zod).
 *
 * Note: scan submission is multipart/form-data, so numeric fields arrive as
 * strings — we coerce them. The image file itself is validated by the upload
 * middleware, not here.
 */
import { z } from 'zod';
import { SUPPORTED_CROPS } from '../models/Scan';
import { LANGUAGES } from '../models/User';

export const ScanSubmitSchema = z.object({
  crop_type: z.enum(SUPPORTED_CROPS),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  offline_queued_at: z.string().datetime().optional(),
  device_id: z.string().max(200).optional(),
  language: z.enum(LANGUAGES).default('en'),
});

export const ScanListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  crop_type: z.enum(SUPPORTED_CROPS).optional(),
});

export const ScanIdParamSchema = z.object({
  id: z.string().min(1),
});

export const FeedbackSchema = z.object({
  feedback: z.enum(['correct', 'incorrect']),
});

export type ScanSubmitInput = z.infer<typeof ScanSubmitSchema>;
export type ScanListQuery = z.infer<typeof ScanListQuerySchema>;
