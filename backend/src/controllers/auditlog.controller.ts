/**
 * Audit-log controller (thin) — Phase 13.
 *
 * Parses the validated query, resolves the optional date range, delegates to
 * audit.service, and returns the standard paginated envelope. Read-only; the
 * write path is the fire-and-forget audit.service.log() invoked at action sites.
 */
import { Request, Response } from 'express';
import * as auditService from '../services/audit.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type { AuditLogQuery } from '../validators/audit.validators';

// GET /api/v1/audit-logs  (admin)
export const listAuditLogs = asyncHandler(
  async (req: Request, res: Response) => {
    const q = req.query as unknown as AuditLogQuery;

    const result = await auditService.listAuditLogs({
      page: q.page,
      limit: q.limit,
      actorId: q.actor_id,
      action: q.action,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    });

    res.json(
      apiResponse.success(
        { logs: result.logs },
        { total: result.total, page: result.page, limit: result.limit },
      ),
    );
  },
);
