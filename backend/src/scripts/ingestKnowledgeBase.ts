/**
 * Knowledge-base ingestion (Phase 6).
 *
 * Embeds each active Treatment and upserts it into Qdrant so the RAG chatbot can
 * retrieve grounded context. Re-runnable: point IDs are derived deterministically
 * from treatment_id (UUIDv5), so re-ingesting updates rather than duplicates.
 *
 *   npx ts-node src/scripts/ingestKnowledgeBase.ts
 *   npm run ingest:kb
 *
 * Qdrant requires point IDs to be an unsigned int or a UUID — a raw
 * `trt_<nanoid>` string is rejected — hence the UUIDv5 mapping.
 */
import { createHash } from 'crypto';
import { connectMongoDB, disconnectMongoDB } from '../config/db';
import { Treatment } from '../models/Treatment';
import { generateEmbedding } from '../services/embedding.service';
import {
  initializeQdrantCollection,
  upsertDocuments,
  type UpsertPoint,
} from '../services/qdrant.service';
import { logger } from '../utils/logger';

/**
 * Deterministic UUID (v5-style, DNS namespace) from a stable string. Enough for
 * idempotent Qdrant point IDs without pulling in a uuid dependency.
 */
function stableUuid(input: string): string {
  const hash = createHash('sha1')
    .update('krishi-kb:' + input)
    .digest('hex');
  // Shape the first 32 hex chars into a UUID; set version (5) and variant bits.
  const h = hash.slice(0, 32).split('');
  h[12] = '5';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Build the text that gets embedded + a short snippet for retrieval display. */
function buildDocText(t: {
  disease_label: string;
  crop: string;
  chemical?: { product?: string; dosage?: string };
  organic?: { remedy?: string };
  prevention?: string[];
  source?: string;
}): { text: string; snippet: string } {
  const text = [
    `Disease: ${t.disease_label}. Crop: ${t.crop}.`,
    t.chemical?.product
      ? `Chemical treatment: ${t.chemical.product} at ${t.chemical.dosage ?? 'label dose'}.`
      : '',
    t.organic?.remedy ? `Organic option: ${t.organic.remedy}.` : '',
    t.prevention?.length ? `Prevention: ${t.prevention.join('. ')}.` : '',
    t.source ? `Source: ${t.source}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const snippet = text.length > 320 ? text.slice(0, 317) + '...' : text;
  return { text, snippet };
}

async function ingest(): Promise<void> {
  await connectMongoDB();
  await initializeQdrantCollection();

  const treatments = await Treatment.find({ status: 'active' }).lean();
  logger.info(`Ingesting ${treatments.length} treatments into Qdrant...`);

  const points: UpsertPoint[] = [];
  for (const t of treatments) {
    const { text, snippet } = buildDocText(t);
    const vector = await generateEmbedding(text, 'RETRIEVAL_DOCUMENT');
    points.push({
      id: stableUuid(t.treatment_id),
      vector,
      payload: {
        type: 'treatment',
        treatment_id: t.treatment_id,
        disease_label: t.disease_label,
        crop: t.crop,
        title: `${t.disease_label} — ${t.crop}`,
        snippet,
        source: t.source,
      },
    });
    logger.info(`  embedded ${t.treatment_id}`);
  }

  await upsertDocuments(points);
  logger.info(`Knowledge-base ingestion complete — ${points.length} documents`);

  await disconnectMongoDB();
}

ingest()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Knowledge-base ingestion failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
