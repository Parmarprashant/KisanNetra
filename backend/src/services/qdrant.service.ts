/**
 * Qdrant service — vector store for RAG (Phase 6).
 *
 * Wraps the Qdrant REST client with the few operations the chatbot needs:
 * collection bootstrap, document upsert (ingestion), and semantic search
 * (retrieval). The collection vector size is driven by EMBED_DIMENSION so it
 * always matches the embedding model (gemini-embedding-001 → 3072, Cosine).
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// checkCompatibility:false — the client (1.18) is a couple of minors ahead of
// the pinned server (1.12); the REST surface we use is stable, so skip the warn.
export const qdrant = new QdrantClient({
  url: env.QDRANT_URL,
  ...(env.QDRANT_API_KEY ? { apiKey: env.QDRANT_API_KEY } : {}),
  checkCompatibility: false,
});

export interface KnowledgePayload {
  type: string; // 'treatment' | 'faq' | ...
  disease_label?: string;
  crop?: string;
  title: string;
  snippet: string;
  source?: string;
  [key: string]: unknown;
}

export interface SearchHit {
  id: string | number;
  score: number;
  payload: KnowledgePayload;
}

/** Create the knowledge-base collection if it does not already exist. */
export async function initializeQdrantCollection(): Promise<void> {
  const name = env.QDRANT_COLLECTION;
  try {
    const exists = await qdrant.collectionExists(name);
    if (exists.exists) {
      logger.info(`Qdrant collection ready: ${name}`);
      return;
    }
    await qdrant.createCollection(name, {
      vectors: { size: env.EMBED_DIMENSION, distance: 'Cosine' },
    });
    logger.info(`Qdrant collection created: ${name}`, {
      size: env.EMBED_DIMENSION,
    });
  } catch (err) {
    // Non-fatal at startup — chat retrieval will degrade, but the rest of the
    // API stays up (mirrors the S3 ensureBucket policy).
    logger.warn('Could not ensure Qdrant collection', {
      collection: name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface UpsertPoint {
  id: string | number;
  vector: number[];
  payload: KnowledgePayload;
}

/** Upsert document embeddings into the knowledge-base collection. */
export async function upsertDocuments(points: UpsertPoint[]): Promise<void> {
  if (points.length === 0) return;
  await qdrant.upsert(env.QDRANT_COLLECTION, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });
}

/**
 * Semantic search: return the top-K knowledge entries nearest to a query
 * vector. Returns [] on failure so the caller can answer without RAG grounding
 * rather than error out.
 */
export async function semanticSearch(
  queryVector: number[],
  limit = 5,
  filter?: Record<string, unknown>,
): Promise<SearchHit[]> {
  try {
    const results = await qdrant.search(env.QDRANT_COLLECTION, {
      vector: queryVector,
      limit,
      filter,
      with_payload: true,
    });
    return results.map((r) => ({
      id: r.id,
      score: r.score,
      payload: (r.payload ?? {}) as unknown as KnowledgePayload,
    }));
  } catch (err) {
    logger.warn('Qdrant semantic search failed — answering without context', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
