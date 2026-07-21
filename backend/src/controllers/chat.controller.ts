/**
 * Chat controller.
 *
 * The POST /chat handler streams the assistant reply over Server-Sent Events
 * (SSE). Because headers are flushed as soon as streaming begins, errors that
 * occur mid-stream are reported as an SSE `error` event (the global JSON error
 * handler can no longer set a status code). Validation / retrieval that happens
 * BEFORE the first byte still throws normally → clean 4xx/5xx.
 *
 * Session CRUD endpoints use the standard JSON envelope.
 */
import { Request, Response } from 'express';
import * as chatService from '../services/chat.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import type { Language } from '../models/User';

interface ChatBody {
  message: string;
  session_id?: string;
  scan_context_id?: string;
  language?: Language;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// POST /api/v1/chat  — SSE streaming RAG response
export const chat = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as ChatBody;
  const userId = req.user!.id;
  const language: Language = body.language ?? req.user!.lang;

  // ── Pre-stream work (may still throw → normal JSON error) ──────────
  const { history } = await chatService.getSessionHistory(
    userId,
    body.session_id,
  );
  // Prefer server-side history; fall back to any client-sent turns.
  const effectiveHistory =
    history.length > 0 ? history : (body.history ?? []);

  const scanContext = await chatService.getScanContext(
    userId,
    body.scan_context_id,
  );
  const { contextText, sources } = await chatService.retrieveContext(
    body.message,
  );

  // ── Open the SSE stream ────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering (nginx)
  res.flushHeaders?.();

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let fullResponse = '';
  try {
    const tokenStream = chatService.streamChatResponse({
      message: body.message,
      history: effectiveHistory,
      ragContext: contextText,
      scanContext,
      language,
    });

    for await (const token of tokenStream) {
      fullResponse += token;
      send({ token });
    }

    // Persist the completed exchange and return session id + sources.
    const sessionId = await chatService.persistExchange({
      userId,
      sessionId: body.session_id,
      scanContextId: body.scan_context_id,
      userMessage: body.message,
      assistantMessage: fullResponse,
    });

    send({ done: true, session_id: sessionId, sources });
    res.end();
  } catch (err) {
    logger.error('Chat streaming failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Headers already sent — signal the failure over the stream, then close.
    send({
      error: {
        code: 'chat_stream_failed',
        message: 'The assistant could not complete the response.',
      },
    });
    res.end();
  }
});

// GET /api/v1/chat/sessions
export const listSessions = asyncHandler(
  async (req: Request, res: Response) => {
    const { page, limit } = req.query as unknown as {
      page: number;
      limit: number;
    };
    const result = await chatService.listSessions({
      userId: req.user!.id,
      page,
      limit,
    });
    res.json(
      apiResponse.success(
        { sessions: result.sessions },
        { total: result.total, page: result.page, limit: result.limit },
      ),
    );
  },
);

// GET /api/v1/chat/sessions/:id
export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await chatService.getSession(req.user!.id, req.params.id);
  res.json(apiResponse.success({ session }));
});

// DELETE /api/v1/chat/sessions/:id
export const deleteSession = asyncHandler(
  async (req: Request, res: Response) => {
    await chatService.deleteSession(req.user!.id, req.params.id);
    res.json(apiResponse.success({ message: 'Chat session deleted' }));
  },
);
