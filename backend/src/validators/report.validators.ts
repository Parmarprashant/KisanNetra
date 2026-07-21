/**
 * Report validators (Zod).
 *
 * A report request names a `type` + `format` and carries a `params` object with
 * the slice to export. `params` is validated with a single permissive-but-typed
 * schema (`.strict()` blocks unknown keys); per-type required fields
 * (e.g. farmer_history needs user_id) are enforced in the service so the error
 * carries a specific code.
 */
import { z } from 'zod';
import { REPORT_TYPES, REPORT_FORMATS } from '../models/ReportJob';

const isoDate = z.string().datetime({ offset: true });

const ReportParamsSchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    region: z.string().min(1).max(100).optional(),
    user_id: z.string().min(1).max(100).optional(), // farmer_history target
    disease: z.string().min(1).max(120).optional(),
    threshold: z.coerce.number().int().min(1).max(100000).optional(),
  })
  .strict();

export const CreateReportSchema = z.object({
  type: z.enum(REPORT_TYPES),
  format: z.enum(REPORT_FORMATS),
  params: ReportParamsSchema.default({}),
});

export const ReportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ReportIdParamSchema = z.object({
  id: z.string().min(1),
});

export type CreateReportInput = z.infer<typeof CreateReportSchema>;
export type ReportListQuery = z.infer<typeof ReportListQuerySchema>;
