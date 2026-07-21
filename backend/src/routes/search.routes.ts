/**
 * Search routes (/api/v1/search) — Phase 11.
 *
 * Semantic search over the knowledge base. Authenticated for all roles (any
 * signed-in user can look up treatments in natural language); the underlying
 * data is the same curated, approved knowledge base the chatbot draws on.
 */
import { Router } from 'express';
import * as searchController from '../controllers/search.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { SmartSearchQuerySchema } from '../validators/search.validators';

const router = Router();

router.use(authenticateJWT);

router.get(
  '/',
  validate({ query: SmartSearchQuerySchema }),
  searchController.smartSearch,
);

export default router;
