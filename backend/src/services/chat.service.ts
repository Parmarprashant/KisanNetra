/**
 * Chat service — RAG assistant (Phase 6).
 *
 * Orchestrates the retrieval-augmented chat flow (HTTP-agnostic per rules.md):
 *   embed question → Qdrant semantic search → build grounded prompt →
 *   stream answer from Groq (llama-3.3-70b) → caller relays tokens (SSE).
 *
 * Design notes:
 *  - Embeddings come from Gemini, generation from Groq (best tool for each).
 *  - History is trimmed to the last N turns before hitting the LLM
 *    (rules.md "Context size limits").
 *  - Retrieval failures degrade gracefully: search returns [] and the assistant
 *    answers from general knowledge instead of erroring.
 */
import Groq from 'groq-sdk';
import { nanoid } from 'nanoid';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { generateEmbedding } from './embedding.service';
import { semanticSearch, type SearchHit } from './qdrant.service';
import { ChatSession, IChatSession } from '../models/ChatSession';
import { Scan } from '../models/Scan';
import { User } from '../models/User';
import { NotFoundError } from '../utils/errors';
import {
  buildChatSystemPrompt,
  buildRAGUserPrompt,
  CHAT_PROMPT_VERSION,
} from './prompts/chat.prompt';
import type { Language } from '../models/User';
import type { ChatRole } from '../models/ChatSession';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

/** How many prior turns to replay to the LLM (context-window management). */
export const MAX_HISTORY_TURNS = 10;
const RAG_TOP_K = 5;

export interface ChatHistoryTurn {
  role: ChatRole;
  content: string;
}

export interface RetrievedContext {
  contextText: string;
  sources: string[];
  hits: SearchHit[];
}

export const chatPromptVersion = CHAT_PROMPT_VERSION;

/**
 * Retrieve knowledge-base context for a question via Qdrant semantic search.
 * Never throws — on embedding/search failure it returns empty context so the
 * assistant can still answer (ungrounded).
 */
export async function retrieveContext(
  question: string,
): Promise<RetrievedContext> {
  try {
    const queryVector = await generateEmbedding(question, 'RETRIEVAL_QUERY');
    const hits = await semanticSearch(queryVector, RAG_TOP_K);
    const contextText = hits
      .map((h, i) => `[${i + 1}] ${h.payload.title}: ${h.payload.snippet}`)
      .join('\n');
    const sources = [
      ...new Set(
        hits
          .map((h) => h.payload.source)
          .filter((s): s is string => Boolean(s)),
      ),
    ];
    return { contextText, sources, hits };
  } catch (err) {
    logger.warn('RAG retrieval failed — proceeding without context', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { contextText: '', sources: [], hits: [] };
  }
}

export interface StreamChatParams {
  message: string;
  history: ChatHistoryTurn[];
  ragContext: string;
  scanContext?: string;
  language: Language;
}

/**
 * Stream a chat completion from Groq as an async iterable of token strings.
 * The caller (controller) forwards these over SSE and accumulates the full
 * reply for persistence.
 */
export async function* streamChatResponse(
  params: StreamChatParams,
): AsyncGenerator<string> {
  const trimmedHistory = params.history.slice(-MAX_HISTORY_TURNS);

  const messages = [
    { role: 'system' as const, content: buildChatSystemPrompt(params.language) },
    ...trimmedHistory.map((t) => ({ role: t.role, content: t.content })),
    {
      role: 'user' as const,
      content: buildRAGUserPrompt(
        params.message,
        params.ragContext,
        params.scanContext,
      ),
    },
  ];

  const stream = await groq.chat.completions.create({
    model: env.GROQ_CHAT_MODEL,
    messages,
    temperature: 0.4,
    max_tokens: 800,
    stream: true,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? '';
    if (token) yield token;
  }
}

// ─── Session persistence & scan grounding ────────────────────────────

/** Resolve a user_id string to its Mongo ObjectId. */
async function resolveUserObjectId(userId: string): Promise<Types.ObjectId> {
  const user = await User.findOne({ user_id: userId }).select('_id').lean();
  if (!user) throw new NotFoundError('User not found');
  return user._id as Types.ObjectId;
}

/**
 * Load the recent history for a session (last N turns), or an empty history for
 * a new session. Ensures the session belongs to the requesting user.
 */
export async function getSessionHistory(
  userId: string,
  sessionId?: string,
): Promise<{ session: IChatSession | null; history: ChatHistoryTurn[] }> {
  if (!sessionId) return { session: null, history: [] };

  const userObjectId = await resolveUserObjectId(userId);
  const session = await ChatSession.findOne({
    session_id: sessionId,
    user_id: userObjectId,
  });
  if (!session) return { session: null, history: [] };

  const history = session.messages
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));
  return { session, history };
}

/**
 * If a scan_context_id is supplied, build a short grounding string describing
 * the farmer's recent diagnosis. Only the owner's scans are used.
 */
export async function getScanContext(
  userId: string,
  scanContextId?: string,
): Promise<string | undefined> {
  if (!scanContextId) return undefined;

  const userObjectId = await resolveUserObjectId(userId);
  const scan = await Scan.findOne({
    scan_id: scanContextId,
    user_id: userObjectId,
    is_deleted: false,
  }).lean();
  if (!scan) return undefined;

  const pct = Math.round((scan.prediction?.confidence ?? 0) * 100);
  return `${scan.prediction?.disease_label} on ${scan.crop_type} (${pct}% confidence).`;
}

/**
 * Persist a completed exchange. Appends the user message and assistant reply to
 * the session, creating it (with a new session_id) if one was not supplied.
 * Returns the session_id so the controller can echo it to the client.
 */
export async function persistExchange(params: {
  userId: string;
  sessionId?: string;
  scanContextId?: string;
  userMessage: string;
  assistantMessage: string;
}): Promise<string> {
  const userObjectId = await resolveUserObjectId(params.userId);
  const sessionId = params.sessionId ?? `chat_${nanoid()}`;
  const now = new Date();

  await ChatSession.findOneAndUpdate(
    { session_id: sessionId, user_id: userObjectId },
    {
      $setOnInsert: {
        session_id: sessionId,
        user_id: userObjectId,
        context_scan_id: params.scanContextId,
      },
      $push: {
        messages: {
          $each: [
            { role: 'user', content: params.userMessage, timestamp: now },
            {
              role: 'assistant',
              content: params.assistantMessage,
              timestamp: now,
            },
          ],
        },
      },
    },
    { upsert: true, new: true },
  );

  return sessionId;
}

export interface ListSessionsOptions {
  userId: string;
  page: number;
  limit: number;
}

export async function listSessions(opts: ListSessionsOptions): Promise<{
  sessions: Array<{
    session_id: string;
    last_message?: string;
    message_count: number;
    updatedAt: Date;
  }>;
  total: number;
  page: number;
  limit: number;
}> {
  const userObjectId = await resolveUserObjectId(opts.userId);
  const skip = (opts.page - 1) * opts.limit;

  const [docs, total] = await Promise.all([
    ChatSession.find({ user_id: userObjectId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(opts.limit)
      .lean(),
    ChatSession.countDocuments({ user_id: userObjectId }),
  ]);

  const sessions = docs.map((s) => ({
    session_id: s.session_id,
    last_message: s.messages[s.messages.length - 1]?.content,
    message_count: s.messages.length,
    updatedAt: s.updatedAt,
  }));

  return { sessions, total, page: opts.page, limit: opts.limit };
}

export async function getSession(
  userId: string,
  sessionId: string,
): Promise<IChatSession> {
  const userObjectId = await resolveUserObjectId(userId);
  const session = await ChatSession.findOne({
    session_id: sessionId,
    user_id: userObjectId,
  });
  if (!session) throw new NotFoundError('Chat session not found');
  return session;
}

export async function deleteSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const userObjectId = await resolveUserObjectId(userId);
  const result = await ChatSession.deleteOne({
    session_id: sessionId,
    user_id: userObjectId,
  });
  if (result.deletedCount === 0) {
    throw new NotFoundError('Chat session not found');
  }
}
