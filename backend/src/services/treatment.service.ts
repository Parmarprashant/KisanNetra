/**
 * Treatment service.
 *
 * Owns all treatment business logic (HTTP-agnostic per rules.md):
 *  - Fast, cached lookup used by the scan pipeline (`getForDisease`).
 *  - Public browsing (`listTreatments`, `getTreatmentById`).
 *  - The agronomist → admin curation workflow (propose / approve / reject).
 *
 * Caching (Redis):
 *   Key:  treatment:{disease}:{crop}:{region}:{lang}
 *   TTL:  1 hour (positive) / 5 min (negative — "no treatment found")
 * Negative caching prevents repeatedly hitting Mongo for diseases that have no
 * curated treatment yet (e.g. "Healthy", "Unidentifiable"). The cache is
 * invalidated for a disease+crop whenever a proposal touching it is approved.
 */
import { nanoid } from 'nanoid';
import { Types } from 'mongoose';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import {
  Treatment,
  ITreatment,
  REGION_ALL_INDIA,
  type TreatmentStatus,
} from '../models/Treatment';
import { TreatmentProposal, ITreatmentProposal } from '../models/TreatmentProposal';
import type { ProposalStatus } from '../models/TreatmentProposal';
import { User } from '../models/User';
import * as notificationService from './notification.service';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import type { Language } from '../models/User';
import type { SupportedCrop } from '../models/Scan';

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour (positive result)
const NEGATIVE_CACHE_TTL_SECONDS = 5 * 60; // 5 min ("no treatment" sentinel)
const NEGATIVE_SENTINEL = '__none__';

/** Shape returned to scan responses and treatment GET endpoints. */
export interface TreatmentResult {
  treatment_id: string;
  disease_label: string;
  crop: string;
  regions: string[];
  seasons: string[];
  chemical: ITreatment['chemical'];
  organic: ITreatment['organic'];
  prevention: string[];
  source?: string;
  verified_by?: string;
  summary?: string;
  prevention_text?: string;
}

function cacheKey(
  disease: string,
  crop: string,
  region: string,
  lang: string,
): string {
  return `treatment:${disease}:${crop}:${region}:${lang}`;
}

/** Pick localized content for a language, falling back to English. */
function localize(
  treatment: Pick<ITreatment, 'localized'>,
  lang: Language,
): { summary?: string; prevention_text?: string } {
  const content = treatment.localized?.[lang] ?? treatment.localized?.en;
  return {
    summary: content?.summary,
    prevention_text: content?.prevention_text,
  };
}

/** Map a treatment document to the public result shape for a language. */
function toResult(treatment: ITreatment, lang: Language): TreatmentResult {
  const localized = localize(treatment, lang);
  return {
    treatment_id: treatment.treatment_id,
    disease_label: treatment.disease_label,
    crop: treatment.crop,
    regions: treatment.regions,
    seasons: treatment.seasons,
    chemical: treatment.chemical,
    organic: treatment.organic,
    prevention: treatment.prevention,
    source: treatment.source,
    verified_by: treatment.verified_by,
    summary: localized.summary,
    prevention_text: localized.prevention_text,
  };
}

/**
 * Resolve the best treatment for a diagnosis, preferring a region-specific
 * match and falling back to an "All India" treatment. Cached in Redis.
 *
 * Returns null when no active treatment exists (also cached, briefly).
 */
export async function getForDisease(
  diseaseLabel: string,
  crop: string,
  region?: string,
  lang: Language = 'en',
): Promise<TreatmentResult | null> {
  const regionKey = region ?? 'all';
  const key = cacheKey(diseaseLabel, crop, regionKey, lang);

  // 1. Cache read (positive or negative).
  try {
    const cached = await redis.get(key);
    if (cached === NEGATIVE_SENTINEL) return null;
    if (cached) return JSON.parse(cached) as TreatmentResult;
  } catch (err) {
    // Cache is a performance optimization — never fail the request on it.
    logger.warn('Treatment cache read failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Mongo lookup. Prefer a regional match, else fall back to All India.
  //    A single query with $in + client-side ranking avoids two round-trips.
  const regionCandidates = region
    ? [region, REGION_ALL_INDIA]
    : [REGION_ALL_INDIA];

  const matches = await Treatment.find({
    disease_label: diseaseLabel,
    crop,
    status: 'active',
    regions: { $in: regionCandidates },
  });

  // Rank: an exact region match beats an All-India fallback.
  let best: ITreatment | undefined;
  if (region) {
    best = matches.find((t) => t.regions.includes(region));
  }
  best = best ?? matches.find((t) => t.regions.includes(REGION_ALL_INDIA));
  best = best ?? matches[0];

  if (!best) {
    // 3a. Negative cache — brief, to shield Mongo from repeated misses.
    await redis
      .setex(key, NEGATIVE_CACHE_TTL_SECONDS, NEGATIVE_SENTINEL)
      .catch(() => undefined);
    return null;
  }

  const result = toResult(best, lang);

  // 3b. Positive cache.
  await redis
    .setex(key, CACHE_TTL_SECONDS, JSON.stringify(result))
    .catch(() => undefined);

  return result;
}

/**
 * Invalidate every cached variant (region × language) of a disease+crop.
 * Called after an approval mutates the underlying treatment. Uses SCAN (not
 * KEYS) so it stays non-blocking on larger datasets.
 */
export async function invalidateTreatmentCache(
  diseaseLabel: string,
  crop: string,
): Promise<void> {
  const pattern = `treatment:${diseaseLabel}:${crop}:*`;
  try {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const pipeline = redis.pipeline();
    let found = 0;
    for await (const keys of stream as AsyncIterable<string[]>) {
      for (const k of keys) {
        pipeline.del(k);
        found += 1;
      }
    }
    if (found > 0) await pipeline.exec();
    logger.info('Invalidated treatment cache', {
      disease: diseaseLabel,
      crop,
      keys: found,
    });
  } catch (err) {
    logger.warn('Treatment cache invalidation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface ListTreatmentsOptions {
  page: number;
  limit: number;
  crop?: SupportedCrop;
  disease?: string;
  region?: string;
  status?: TreatmentStatus;
}

export async function listTreatments(opts: ListTreatmentsOptions): Promise<{
  treatments: ITreatment[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: Record<string, unknown> = {};
  if (opts.crop) filter.crop = opts.crop;
  if (opts.disease) filter.disease_label = opts.disease;
  if (opts.region) filter.regions = opts.region;
  filter.status = opts.status ?? 'active';

  const skip = (opts.page - 1) * opts.limit;
  const [treatments, total] = await Promise.all([
    Treatment.find(filter)
      .sort({ disease_label: 1, crop: 1 })
      .skip(skip)
      .limit(opts.limit),
    Treatment.countDocuments(filter),
  ]);

  return { treatments, total, page: opts.page, limit: opts.limit };
}

export async function getTreatmentById(
  treatmentId: string,
): Promise<ITreatment> {
  const treatment = await Treatment.findOne({ treatment_id: treatmentId });
  if (!treatment) throw new NotFoundError('Treatment not found');
  return treatment;
}

// ─── Proposal workflow (agronomist → admin) ──────────────────────────

export interface ProposeTreatmentParams {
  proposedByUserId: string; // user_id string from token
  baseTreatmentId?: string; // treatment_id when proposing an edit
  proposedData: Record<string, unknown>;
  sourceCitation?: string;
}

/** Resolve a user_id string to its Mongo ObjectId. */
async function resolveUserObjectId(userId: string): Promise<Types.ObjectId> {
  const user = await User.findOne({ user_id: userId }).select('_id').lean();
  if (!user) throw new NotFoundError('User not found');
  return user._id as Types.ObjectId;
}

/**
 * Notify a proposal's author of the review outcome. Fire-and-forget: a
 * notification failure must never fail the approve/reject request. The proposer
 * is referenced by ObjectId (proposed_by), so dispatch takes userObjectId
 * directly — no extra user lookup.
 */
function notifyProposer(
  proposerId: Types.ObjectId,
  outcome: 'approved' | 'rejected',
  label: string,
  data: Record<string, unknown>,
): void {
  const title =
    outcome === 'approved' ? 'Treatment proposal approved' : 'Treatment proposal rejected';
  const body =
    outcome === 'approved'
      ? `Your treatment proposal for ${label} was approved and is now live.`
      : `Your treatment proposal for ${label} was not approved. See the review notes for details.`;

  void notificationService
    .dispatch({
      userObjectId: proposerId,
      type: 'proposal_reviewed',
      title,
      body,
      data: { outcome, ...data },
    })
    .catch((err) => {
      logger.warn('proposal_reviewed notification dispatch failed', {
        outcome,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/**
 * Submit a treatment proposal (new treatment or an edit to an existing one).
 * The proposal is queued for admin review — nothing touches the live Treatment
 * collection until it is approved.
 */
export async function proposeTreatment(
  params: ProposeTreatmentParams,
): Promise<ITreatmentProposal> {
  const proposerObjectId = await resolveUserObjectId(params.proposedByUserId);

  let baseTreatment: Types.ObjectId | undefined;
  if (params.baseTreatmentId) {
    const existing = await Treatment.findOne({
      treatment_id: params.baseTreatmentId,
    })
      .select('_id')
      .lean();
    if (!existing) {
      throw new NotFoundError('Base treatment to edit was not found');
    }
    baseTreatment = existing._id as Types.ObjectId;
  } else {
    // A new treatment must at least identify its disease + crop.
    if (!params.proposedData.disease_label || !params.proposedData.crop) {
      throw new BadRequestError(
        'A new treatment proposal must include disease_label and crop',
        'incomplete_proposal',
      );
    }
  }

  const proposal = await TreatmentProposal.create({
    proposal_id: `prop_${nanoid()}`,
    base_treatment: baseTreatment,
    proposed_by: proposerObjectId,
    proposed_data: params.proposedData,
    source_citation: params.sourceCitation,
    status: 'pending_review',
  });

  return proposal;
}

export interface ListProposalsOptions {
  page: number;
  limit: number;
  status?: ProposalStatus;
}

export async function listProposals(opts: ListProposalsOptions): Promise<{
  proposals: ITreatmentProposal[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = opts.status;

  const skip = (opts.page - 1) * opts.limit;
  const [proposals, total] = await Promise.all([
    TreatmentProposal.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(opts.limit)
      .populate('proposed_by', 'user_id name role'),
    TreatmentProposal.countDocuments(filter),
  ]);

  return { proposals, total, page: opts.page, limit: opts.limit };
}

export async function getProposalById(
  proposalId: string,
): Promise<ITreatmentProposal> {
  const proposal = await TreatmentProposal.findOne({ proposal_id: proposalId })
    .populate('proposed_by', 'user_id name role')
    .populate('reviewed_by', 'user_id name role');
  if (!proposal) throw new NotFoundError('Proposal not found');
  return proposal;
}

/** Compute a shallow {field: {old, new}} diff between two plain objects. */
function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      diff[key] = { old: before[key], new: after[key] };
    }
  }
  return diff;
}

/**
 * Approve a proposal: apply `proposed_data` to the Treatment collection
 * (create or update), record the diff, mark the proposal reviewed, and
 * invalidate the affected treatment's cache.
 */
export async function approveProposal(
  proposalId: string,
  reviewerUserId: string,
): Promise<{ proposal: ITreatmentProposal; treatment: ITreatment }> {
  const reviewerObjectId = await resolveUserObjectId(reviewerUserId);

  const proposal = await TreatmentProposal.findOne({ proposal_id: proposalId });
  if (!proposal) throw new NotFoundError('Proposal not found');
  if (proposal.status !== 'pending_review') {
    throw new ConflictError(
      `Proposal is already ${proposal.status}`,
      'proposal_not_pending',
    );
  }

  const data = proposal.proposed_data as Record<string, unknown>;
  let treatment: ITreatment;
  let diff: Record<string, unknown>;

  if (proposal.base_treatment) {
    // Edit an existing treatment.
    const existing = await Treatment.findById(proposal.base_treatment);
    if (!existing) {
      throw new NotFoundError('Base treatment no longer exists');
    }
    const before = existing.toObject() as unknown as Record<string, unknown>;
    // Apply only the proposed fields (never touch identity/timestamps).
    for (const [field, value] of Object.entries(data)) {
      if (['treatment_id', '_id', 'createdAt', 'updatedAt'].includes(field)) {
        continue;
      }
      (existing as unknown as Record<string, unknown>)[field] = value;
    }
    existing.verified_at = new Date();
    treatment = await existing.save();
    diff = computeDiff(
      before,
      treatment.toObject() as unknown as Record<string, unknown>,
    );
  } else {
    // Create a new treatment from the proposal.
    treatment = await Treatment.create({
      treatment_id: `trt_${nanoid()}`,
      ...data,
      verified_at: new Date(),
      status: 'active',
    });
    diff = { created: { old: null, new: treatment.treatment_id } };
  }

  proposal.status = 'approved';
  proposal.reviewed_by = reviewerObjectId;
  proposal.reviewed_at = new Date();
  proposal.diff = diff;
  await proposal.save();

  // Fresh treatment data → drop any stale cached variants.
  await invalidateTreatmentCache(treatment.disease_label, treatment.crop);

  // Notify the proposer their submission was approved (fire-and-forget).
  notifyProposer(proposal.proposed_by, 'approved', treatment.disease_label, {
    proposal_id: proposal.proposal_id,
    treatment_id: treatment.treatment_id,
  });

  return { proposal, treatment };
}

/** Reject a proposal with a reason. Does not touch the Treatment collection. */
export async function rejectProposal(
  proposalId: string,
  reviewerUserId: string,
  reason: string,
): Promise<ITreatmentProposal> {
  const reviewerObjectId = await resolveUserObjectId(reviewerUserId);

  const proposal = await TreatmentProposal.findOne({ proposal_id: proposalId });
  if (!proposal) throw new NotFoundError('Proposal not found');
  if (proposal.status !== 'pending_review') {
    throw new ConflictError(
      `Proposal is already ${proposal.status}`,
      'proposal_not_pending',
    );
  }

  proposal.status = 'rejected';
  proposal.reviewed_by = reviewerObjectId;
  proposal.reviewed_at = new Date();
  proposal.rejection_reason = reason;
  await proposal.save();

  // Best-effort disease label for the message (edits may omit it).
  const label =
    (proposal.proposed_data as Record<string, unknown>)?.disease_label ??
    'your submission';

  // Notify the proposer their submission was rejected (fire-and-forget).
  notifyProposer(proposal.proposed_by, 'rejected', String(label), {
    proposal_id: proposal.proposal_id,
    rejection_reason: reason,
  });

  return proposal;
}
