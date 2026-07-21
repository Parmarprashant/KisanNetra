/**
 * Search service — semantic search over the knowledge base (Phase 11).
 *
 * Reuses the RAG building blocks: embed the query with Gemini
 * (RETRIEVAL_QUERY), then run a Qdrant vector search over the ingested
 * knowledge-base collection. Optional payload filters (type/crop/disease) are
 * translated into a Qdrant `must` filter so results can be narrowed without a
 * second query. HTTP-agnostic per rules.md — accepts plain options, returns
 * plain data.
 *
 * Unlike the chatbot's retrieveContext (which degrades to [] so an answer can
 * still be produced), search surfaces embedding failures to the caller: an
 * empty result set here would be indistinguishable from "no matches", so the
 * embedding.service error propagates as a 503.
 */
import { generateEmbedding } from './embedding.service';
import { semanticSearch } from './qdrant.service';
import type { SupportedCrop } from '../models/Scan';

export interface SearchOptions {
  query: string;
  limit: number;
  type?: string;
  crop?: SupportedCrop;
  disease?: string;
  minScore?: number;
}

export interface SearchResult {
  type: string;
  title: string;
  snippet: string;
  score: number;
  crop?: string;
  disease_label?: string;
  source?: string;
}

/**
 * Build a Qdrant filter from the optional exact-match fields. Returns undefined
 * when no filters are set so Qdrant runs an unfiltered nearest-neighbour search.
 */
function buildFilter(
  opts: SearchOptions,
): Record<string, unknown> | undefined {
  const must: Array<Record<string, unknown>> = [];
  if (opts.type) must.push({ key: 'type', match: { value: opts.type } });
  if (opts.crop) must.push({ key: 'crop', match: { value: opts.crop } });
  if (opts.disease) {
    must.push({ key: 'disease_label', match: { value: opts.disease } });
  }
  return must.length > 0 ? { must } : undefined;
}

/**
 * Run a semantic search over the knowledge base and return ranked results.
 */
export async function smartSearch(
  opts: SearchOptions,
): Promise<SearchResult[]> {
  const queryVector = await generateEmbedding(opts.query, 'RETRIEVAL_QUERY');
  const hits = await semanticSearch(queryVector, opts.limit, buildFilter(opts));

  return hits
    .filter((h) => opts.minScore === undefined || h.score >= opts.minScore)
    .map((h) => ({
      type: h.payload.type,
      title: h.payload.title,
      snippet: h.payload.snippet,
      score: h.score,
      crop: h.payload.crop,
      disease_label: h.payload.disease_label,
      source: h.payload.source,
    }));
}
