/**
 * Treatment controller (thin).
 *
 * Extracts validated input, delegates to treatment.service, and shapes the HTTP
 * response. No business logic here (per rules.md).
 */
import { Request, Response } from 'express';
import * as treatmentService from '../services/treatment.service';
import * as auditService from '../services/audit.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { auditContext } from '../utils/auditContext';
import type { SupportedCrop } from '../models/Scan';
import type { TreatmentStatus } from '../models/Treatment';
import type { ProposalStatus } from '../models/TreatmentProposal';

// GET /api/v1/treatments
export const listTreatments = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, limit, crop, disease, region, status } =
      req.query as unknown as {
        page: number;
        limit: number;
        crop?: SupportedCrop;
        disease?: string;
        region?: string;
        status?: TreatmentStatus;
      };

    const result = await treatmentService.listTreatments({
      page,
      limit,
      crop,
      disease,
      region,
      status,
    });

    res.json(
      apiResponse.success(
        { treatments: result.treatments },
        { total: result.total, page: result.page, limit: result.limit },
      ),
    );
  },
);

// GET /api/v1/treatments/:id
export const getTreatment = asyncHandler(
  async (req: Request, res: Response) => {
    const treatment = await treatmentService.getTreatmentById(req.params.id);
    res.json(apiResponse.success({ treatment }));
  },
);

// POST /api/v1/treatments  (agronomist, admin) — submit a proposal
export const proposeTreatment = asyncHandler(
  async (req: Request, res: Response) => {
    const { base_treatment_id, proposed_data, source_citation } = req.body as {
      base_treatment_id?: string;
      proposed_data: Record<string, unknown>;
      source_citation?: string;
    };

    const proposal = await treatmentService.proposeTreatment({
      proposedByUserId: req.user!.id,
      baseTreatmentId: base_treatment_id,
      proposedData: proposed_data,
      sourceCitation: source_citation,
    });

    void auditService.log({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'treatment.propose',
      resource: `TreatmentProposal:${proposal.proposal_id}`,
      metadata: { base_treatment_id: base_treatment_id ?? null },
      ...auditContext(req),
    });

    res.status(201).json(
      apiResponse.success({
        proposal_id: proposal.proposal_id,
        status: proposal.status,
        message: 'Proposal submitted for review',
      }),
    );
  },
);

// GET /api/v1/treatments/proposals  (admin) — list proposals
export const listProposals = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, limit, status } = req.query as unknown as {
      page: number;
      limit: number;
      status?: ProposalStatus;
    };

    const result = await treatmentService.listProposals({ page, limit, status });

    res.json(
      apiResponse.success(
        { proposals: result.proposals },
        { total: result.total, page: result.page, limit: result.limit },
      ),
    );
  },
);

// GET /api/v1/treatments/proposals/:id  (admin) — single proposal with diff
export const getProposal = asyncHandler(
  async (req: Request, res: Response) => {
    const proposal = await treatmentService.getProposalById(req.params.id);
    res.json(apiResponse.success({ proposal }));
  },
);

// POST /api/v1/treatments/proposals/:id/approve  (admin)
export const approveProposal = asyncHandler(
  async (req: Request, res: Response) => {
    const { proposal, treatment } = await treatmentService.approveProposal(
      req.params.id,
      req.user!.id,
    );

    void auditService.log({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'treatment.approve',
      resource: `TreatmentProposal:${proposal.proposal_id}`,
      metadata: { treatment_id: treatment.treatment_id },
      ...auditContext(req),
    });

    res.json(
      apiResponse.success({
        proposal_id: proposal.proposal_id,
        status: proposal.status,
        treatment_id: treatment.treatment_id,
        diff: proposal.diff,
      }),
    );
  },
);

// POST /api/v1/treatments/proposals/:id/reject  (admin)
export const rejectProposal = asyncHandler(
  async (req: Request, res: Response) => {
    const { reason } = req.body as { reason: string };
    const proposal = await treatmentService.rejectProposal(
      req.params.id,
      req.user!.id,
      reason,
    );

    void auditService.log({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'treatment.reject',
      resource: `TreatmentProposal:${proposal.proposal_id}`,
      metadata: { reason },
      ...auditContext(req),
    });

    res.json(
      apiResponse.success({
        proposal_id: proposal.proposal_id,
        status: proposal.status,
        rejection_reason: proposal.rejection_reason,
      }),
    );
  },
);
