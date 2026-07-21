/**
 * Audit service (Phase 13).
 *
 * Owns the audit-trail business logic (HTTP-agnostic per rules.md):
 *  - log(): record a sensitive action. **Fire-and-forget and never throws** —
 *    audit logging must never break or delay the action it records. Callers
 *    invoke it as `void auditService.log(...)` after the action succeeds.
 *  - listAuditLogs(): paginated, filterable read for the admin audit browser.
 *
 * Entries are written to a capped (immutable, append-only) collection; see
 * models/AuditLog.ts.
 */
import { AuditLog, type IAuditLog } from '../models/AuditLog';
import { logger } from '../utils/logger';

export interface AuditEntry {
  actorId: string;
  actorRole?: string;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Record an audit entry. Best-effort: a failure here is logged and swallowed so
 * it can never affect the request that triggered it. Returns nothing.
 */
export async function log(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      action: entry.action,
      resource: entry.resource,
      metadata: entry.metadata,
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
      created_at: new Date(),
    });
  } catch (err) {
    logger.warn('Audit log write failed', {
      action: entry.action,
      actor: entry.actorId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ListAuditLogsOptions {
  page: number;
  limit: number;
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

/**
 * List audit entries newest-first with optional actor/action/date filters.
 * Admin-only read (enforced at the route level).
 */
export async function listAuditLogs(opts: ListAuditLogsOptions): Promise<{
  logs: IAuditLog[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: Record<string, unknown> = {};
  if (opts.actorId) filter.actor_id = opts.actorId;
  if (opts.action) filter.action = opts.action;
  if (opts.from || opts.to) {
    const range: Record<string, Date> = {};
    if (opts.from) range.$gte = opts.from;
    if (opts.to) range.$lte = opts.to;
    filter.created_at = range;
  }

  const skip = (opts.page - 1) * opts.limit;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(opts.limit),
    AuditLog.countDocuments(filter),
  ]);

  return { logs, total, page: opts.page, limit: opts.limit };
}
