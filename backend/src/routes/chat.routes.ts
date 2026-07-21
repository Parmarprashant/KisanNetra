/**
 * Chat routes (/api/v1/chat).
 *
 * All routes require authentication. POST / streams the RAG assistant reply via
 * SSE; the /sessions endpoints manage stored conversation history.
 */
import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
import { authenticateJWT } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import {
  ChatMessageSchema,
  SessionListQuerySchema,
  SessionIdParamSchema,
} from '../validators/chat.validators';

const router = Router();

router.use(authenticateJWT);

// Streaming chat (SSE)
router.post('/', validate({ body: ChatMessageSchema }), chatController.chat);

// Session history
router.get(
  '/sessions',
  validate({ query: SessionListQuerySchema }),
  chatController.listSessions,
);

router.get(
  '/sessions/:id',
  validate({ params: SessionIdParamSchema }),
  chatController.getSession,
);

router.delete(
  '/sessions/:id',
  validate({ params: SessionIdParamSchema }),
  chatController.deleteSession,
);

export default router;
