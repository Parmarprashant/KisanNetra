/**
 * Search validators (Zod) — Phase 11.
 *
 * The smart-search endpoint takes a free-text query plus optional filters that
 * narrow the Qdrant vector search by payload fields (type/crop/disease). `q` is
 * required and bounded; `limit` and `min_score` are coerced from query strings.
 */
import { z } from 'zod';
import { SUPPORTED_CROPS } from '../models/Scan';

export const SmartSearchQuerySchema = z.object({
  // The natural-language query. Embedded and matched against the KB vectors.
  q: z.string().trim().min(2).max(500),
  // Number of hits to return.
  limit: z.coerce.number().int().min(1).max(50).default(5),
  // Restrict to a knowledge entry type (currently only 'treatment' is ingested).
  type: z.string().min(1).max(40).optional(),
  // Optional payload filters — exact match on the ingested crop/disease fields.
  crop: z.enum(SUPPORTED_CROPS).optional(),
  disease: z.string().min(1).max(120).optional(),
  // Drop hits below this cosine similarity (0–1). Off by default.
  min_score: z.coerce.number().min(0).max(1).optional(),
});

export type SmartSearchQuery = z.infer<typeof SmartSearchQuerySchema>;
