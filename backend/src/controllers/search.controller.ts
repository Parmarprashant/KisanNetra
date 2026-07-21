/**
 * Search controller (thin) — Phase 11.
 *
 * Parses the validated query, delegates to search.service, and returns the
 * standard envelope with the resolved query echoed in meta. No search logic
 * lives here (per rules.md).
 */
import { Request, Response } from 'express';
import * as searchService from '../services/search.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import type { SmartSearchQuery } from '../validators/search.validators';

// GET /api/v1/search
export const smartSearch = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as unknown as SmartSearchQuery;

  const results = await searchService.smartSearch({
    query: q.q,
    limit: q.limit,
    type: q.type,
    crop: q.crop,
    disease: q.disease,
    minScore: q.min_score,
  });

  res.json(
    apiResponse.success(
      { results },
      { query: q.q, count: results.length, limit: q.limit },
    ),
  );
});
