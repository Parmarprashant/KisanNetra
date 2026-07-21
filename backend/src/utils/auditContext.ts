/**
 * Audit request-context helper (Phase 13).
 *
 * Extracts the HTTP-level bits an audit entry needs (client IP, user-agent) from
 * an Express request, keeping that concern in the controller layer — the audit
 * service itself stays HTTP-agnostic (per rules.md). Returns plain fields to
 * spread into an `auditService.log()` call.
 */
import type { Request } from 'express';

export interface AuditRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export function auditContext(req: Request): AuditRequestContext {
  return {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}
