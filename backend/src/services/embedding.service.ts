/**
 * Embedding service — Gemini text embeddings for RAG (Phase 6).
 *
 * Groq has no embedding endpoint, so embeddings are generated with Gemini
 * (`gemini-embedding-001`, 3072-dim) using the SAME API key as vision — no extra
 * provider needed. Task types matter for retrieval quality:
 *   - RETRIEVAL_DOCUMENT when embedding knowledge-base entries (ingestion).
 *   - RETRIEVAL_QUERY    when embedding a user's question (search time).
 *
 * On failure the service throws (unlike classification's graceful fallback):
 * a query with no embedding cannot retrieve context, so the chat layer decides
 * how to degrade (answer without RAG grounding).
 */
import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ServiceUnavailableError } from '../utils/errors';

const genai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Embed a single text. Used at query time (RETRIEVAL_QUERY by default). */
export async function generateEmbedding(
  text: string,
  taskType: EmbedTaskType = 'RETRIEVAL_QUERY',
): Promise<number[]> {
  try {
    const response = await genai.models.embedContent({
      model: env.GEMINI_EMBED_MODEL,
      contents: text,
      config: { taskType },
    });
    const vector = response.embeddings?.[0]?.values;
    if (!vector || vector.length === 0) {
      throw new Error('embedding provider returned no vector');
    }
    return vector;
  } catch (err) {
    logger.error('Embedding generation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new ServiceUnavailableError(
      'Embedding service is temporarily unavailable',
      'embedding_failed',
    );
  }
}

/**
 * Embed many texts (ingestion). Sequential to stay within provider rate limits
 * on the free tier; the knowledge base is small, so throughput is not a concern.
 */
export async function generateEmbeddings(
  texts: string[],
  taskType: EmbedTaskType = 'RETRIEVAL_DOCUMENT',
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await generateEmbedding(text, taskType));
  }
  return vectors;
}
