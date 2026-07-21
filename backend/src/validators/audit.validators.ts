/**
 * Audit-log validators (Zod) — Phase 13.
 *
 * The audit browser is a read-only admin endpoint with optional filters:
 * by actor (user_id), by action string, and by a created-at date range. All
 * bounded + coerced from query strings.
 */
import { z } from 'zod';

const isoDate = z.string().datetime({ offset: true });

export const AuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  actor_id: z.string().min(1).max(100).optional(),
  action: z.string().min(1).max(60).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
