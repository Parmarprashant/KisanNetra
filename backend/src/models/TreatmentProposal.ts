/**
 * TreatmentProposal model.
 *
 * The curation workflow: agronomists propose new treatments or edits to
 * existing ones, and admins review them (Phase 9). Approving a proposal applies
 * `proposed_data` to the Treatment collection; `diff` records what changed for
 * the audit trail. `base_treatment` is null for a brand-new treatment.
 */
import { Schema, model, Document, Types } from 'mongoose';

export type ProposalStatus = 'pending_review' | 'approved' | 'rejected';

export interface ITreatmentProposal extends Document {
  _id: Types.ObjectId;
  proposal_id: string;
  base_treatment?: Types.ObjectId; // null when proposing a new treatment
  proposed_by: Types.ObjectId;
  proposed_data: Record<string, unknown>; // full treatment payload being proposed
  diff?: Record<string, unknown>; // { field: { old, new } } — computed at approval
  status: ProposalStatus;
  reviewed_by?: Types.ObjectId;
  reviewed_at?: Date;
  rejection_reason?: string;
  source_citation?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TreatmentProposalSchema = new Schema<ITreatmentProposal>(
  {
    proposal_id: { type: String, required: true, unique: true },
    base_treatment: { type: Schema.Types.ObjectId, ref: 'Treatment' },
    proposed_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    proposed_data: { type: Schema.Types.Mixed, required: true },
    diff: Schema.Types.Mixed,
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review',
    },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: Date,
    rejection_reason: String,
    source_citation: String,
  },
  { timestamps: true },
);

// Serialization: drop internal Mongoose field.
TreatmentProposalSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const obj = ret as unknown as Record<string, unknown>;
    delete obj.__v;
    return obj;
  },
});

TreatmentProposalSchema.index({ status: 1, createdAt: -1 });
TreatmentProposalSchema.index({ proposed_by: 1, createdAt: -1 });

export const TreatmentProposal = model<ITreatmentProposal>(
  'TreatmentProposal',
  TreatmentProposalSchema,
);
