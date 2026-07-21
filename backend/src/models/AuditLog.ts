/**
 * AuditLog model (Phase 13).
 *
 * An immutable, append-only trail of sensitive system actions (logins, role
 * changes, treatment edits, scan lifecycle, report generation). Used for
 * security forensics and accountability — who did what, when, from where.
 *
 * Immutability is structural: the collection is **capped** (a fixed-size ring
 * buffer), so documents can be inserted and read but never updated to grow or
 * individually deleted — the oldest entries roll off once the cap is reached.
 * This bounds disk use and makes tampering via in-place edits impossible.
 *
 * The actor is stored as the `user_id` STRING (not an ObjectId ref) so writing
 * a log entry never needs an extra lookup on the hot path — the acting user's
 * user_id is always already on `req.user.id`.
 */
import { Schema, model, Document } from 'mongoose';

/** Cap the collection at 100 MB (oldest entries roll off beyond this). */
const AUDIT_CAP_BYTES = 100 * 1024 * 1024;

export interface IAuditLog extends Document {
  actor_id: string; // user_id of the acting user ('system'/'anonymous' when none)
  actor_role?: string; // role at action time (denormalized for fast reads)
  action: string; // e.g. 'auth.login', 'treatment.approve', 'user.suspend'
  resource?: string; // affected resource, e.g. 'Scan:scn_abc', 'User:usr_xyz'
  metadata?: Record<string, unknown>; // action-specific context (no secrets/PII)
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actor_id: { type: String, required: true },
    actor_role: String,
    action: { type: String, required: true },
    resource: String,
    metadata: Schema.Types.Mixed,
    ip_address: String,
    user_agent: String,
    // Explicit timestamp — capped collections keep natural insertion order, and
    // we don't use Mongoose `timestamps` (updatedAt would imply mutability).
    created_at: { type: Date, default: Date.now },
  },
  {
    capped: { size: AUDIT_CAP_BYTES },
    timestamps: false,
  },
);

// Serialization: drop the internal Mongoose version field.
AuditLogSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

// Read paths for the admin audit browser: by actor, and by action — each newest
// first. (Capped collections still support secondary indexes.)
AuditLogSchema.index({ actor_id: 1, created_at: -1 });
AuditLogSchema.index({ action: 1, created_at: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
