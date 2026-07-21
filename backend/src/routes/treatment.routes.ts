/**
 * Treatment routes (/api/v1/treatments).
 *
 * All routes require authentication. Browsing (list/get) is open to any role;
 * proposing edits is limited to agronomists and admins; the review workflow
 * (list/approve/reject proposals) is admin-only.
 *
 * Route ordering matters: the static `/proposals*` paths are declared BEFORE
 * the dynamic `/:id` route so Express does not capture "proposals" as an :id.
 */
import { Router } from 'express';
import * as treatmentController from '../controllers/treatment.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate';
import {
  TreatmentListQuerySchema,
  TreatmentIdParamSchema,
  ProposeTreatmentSchema,
  ProposalIdParamSchema,
  ProposalListQuerySchema,
  RejectProposalSchema,
} from '../validators/treatment.validators';

const router = Router();

router.use(authenticateJWT);

// ─── Proposal workflow (declared first — static paths before /:id) ──

// Admin: review queue
router.get(
  '/proposals',
  requireRole('admin'),
  validate({ query: ProposalListQuerySchema }),
  treatmentController.listProposals,
);

router.get(
  '/proposals/:id',
  requireRole('admin'),
  validate({ params: ProposalIdParamSchema }),
  treatmentController.getProposal,
);

router.post(
  '/proposals/:id/approve',
  requireRole('admin'),
  validate({ params: ProposalIdParamSchema }),
  treatmentController.approveProposal,
);

router.post(
  '/proposals/:id/reject',
  requireRole('admin'),
  validate({ params: ProposalIdParamSchema, body: RejectProposalSchema }),
  treatmentController.rejectProposal,
);

// Agronomist / admin: submit a proposal (new treatment or an edit)
router.post(
  '/',
  requireRole('agronomist', 'admin'),
  validate({ body: ProposeTreatmentSchema }),
  treatmentController.proposeTreatment,
);

// ─── Public browsing (any authenticated role) ──────────────────────

router.get(
  '/',
  validate({ query: TreatmentListQuerySchema }),
  treatmentController.listTreatments,
);

router.get(
  '/:id',
  validate({ params: TreatmentIdParamSchema }),
  treatmentController.getTreatment,
);

export default router;
