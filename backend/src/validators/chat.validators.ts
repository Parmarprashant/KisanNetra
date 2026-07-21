/**
 * Chat validators (Zod).
 *
 * The chat body accepts a message plus optional session continuation and scan
 * grounding. `history` is optional — the server also reconstructs history from
 * the stored session, but a client may send it for a brand-new session.
 */
import { z } from 'zod';
import { LANGUAGES } from '../models/User';

export const ChatMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  session_id: z.string().min(1).max(100).optional(),
  scan_context_id: z.string().min(1).max(100).optional(),
  language: z.enum(LANGUAGES).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .max(20)
    .optional(),
});

export const SessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const SessionIdParamSchema = z.object({
  id: z.string().min(1),
});

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>;
export type SessionListQuery = z.infer<typeof SessionListQuerySchema>;
