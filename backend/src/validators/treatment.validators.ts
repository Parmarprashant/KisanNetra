/**
 * Treatment validators (Zod).
 *
 * Covers public browsing (list/get) and the curation workflow (propose /
 * approve / reject). The proposed treatment payload is validated so a proposal
 * cannot inject arbitrary fields into the Treatment collection on approval.
 */
import { z } from 'zod';
import { SUPPORTED_CROPS } from '../models/Scan';
import { SEASONS } from '../models/Treatment';

// ─── Browsing ────────────────────────────────────────────────────────

export const TreatmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  crop: z.enum(SUPPORTED_CROPS).optional(),
  disease: z.string().min(1).max(120).optional(),
  region: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export const TreatmentIdParamSchema = z.object({
  id: z.string().min(1),
});

// ─── Proposal payload ────────────────────────────────────────────────

const ChemicalSchema = z
  .object({
    product: z.string().max(200).optional(),
    dosage: z.string().max(200).optional(),
    method: z.string().max(300).optional(),
    interval: z.string().max(200).optional(),
    pre_harvest_interval: z.string().max(200).optional(),
    safety_notes: z.string().max(1000).optional(),
  })
  .strict();

const OrganicSchema = z
  .object({
    remedy: z.string().max(300).optional(),
    dosage: z.string().max(200).optional(),
    timing: z.string().max(200).optional(),
  })
  .strict();

const LocalizedContentSchema = z
  .object({
    summary: z.string().max(2000).optional(),
    prevention_text: z.string().max(2000).optional(),
  })
  .strict();

/**
 * The treatment fields a proposal may set. All optional so an edit can touch a
 * single field, but `.strict()` blocks unknown keys. disease_label + crop are
 * required for a NEW treatment — enforced in the service, not here, because an
 * edit proposal legitimately omits them.
 */
const ProposedTreatmentDataSchema = z
  .object({
    disease_label: z.string().min(1).max(120).optional(),
    crop: z.enum(SUPPORTED_CROPS).optional(),
    regions: z.array(z.string().min(1).max(100)).min(1).optional(),
    seasons: z.array(z.enum(SEASONS)).optional(),
    chemical: ChemicalSchema.optional(),
    organic: OrganicSchema.optional(),
    prevention: z.array(z.string().min(1).max(500)).optional(),
    source: z.string().max(300).optional(),
    verified_by: z.string().max(120).optional(),
    localized: z
      .object({
        en: LocalizedContentSchema.optional(),
        hi: LocalizedContentSchema.optional(),
        gu: LocalizedContentSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ProposeTreatmentSchema = z.object({
  base_treatment_id: z.string().min(1).optional(),
  proposed_data: ProposedTreatmentDataSchema,
  source_citation: z.string().max(300).optional(),
});

export const ProposalIdParamSchema = z.object({
  id: z.string().min(1),
});

export const ProposalListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending_review', 'approved', 'rejected']).optional(),
});

export const RejectProposalSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export type TreatmentListQuery = z.infer<typeof TreatmentListQuerySchema>;
export type ProposeTreatmentInput = z.infer<typeof ProposeTreatmentSchema>;
export type ProposalListQuery = z.infer<typeof ProposalListQuerySchema>;
