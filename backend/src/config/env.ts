/**
 * Environment variable validation.
 *
 * The application fails fast on startup if required variables are missing or
 * malformed (per rules.md — "Validate environment variables").
 *
 * Only Phase 1 (Foundation) variables are required here. Variables for later
 * phases (Groq, S3, notifications, Qdrant) are declared as optional and will
 * be promoted to required as their phase is implemented.
 */
import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  // ─── App ───────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url(),
  API_URL: z.string().url(),
  // Comma-separated CORS allowlist (Phase 15). When unset, falls back to APP_URL.
  // e.g. "https://app.krishiraksha.in,https://admin.krishiraksha.in"
  CORS_ORIGINS: z.string().optional(),

  // ─── Datastores (required for Phase 1) ─────────────────────────
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // ─── JWT (used from Phase 2; validated now so config is stable) ─
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // ─── Gemini API (Phase 3 — vision + Phase 6 embeddings) ────────
  // Required from Phase 3 onward. Powers vision classification (Phase 3/4) and
  // RAG embeddings (Phase 6). Replaces the originally-planned Groq for vision.
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_VISION_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_CHAT_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_EMBED_MODEL: z.string().default('gemini-embedding-001'),

  // ─── Groq API (Phase 6 — RAG chatbot LLM) ──────────────────────
  // Required from Phase 6. Groq's LPU streaming powers the conversational
  // assistant; embeddings still come from Gemini.
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  GROQ_CHAT_MODEL: z.string().default('llama-3.3-70b-versatile'),

  // ─── S3 / MinIO (Phase 4 — required for scan storage) ──────────
  // S3_ENDPOINT is set for MinIO / self-hosted; omit for real AWS S3.
  S3_ENDPOINT: z.string().url().optional(),
  AWS_ACCESS_KEY_ID: z.string().min(1, 'AWS_ACCESS_KEY_ID is required'),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, 'AWS_SECRET_ACCESS_KEY is required'),
  AWS_S3_BUCKET: z.string().min(1, 'AWS_S3_BUCKET is required'),
  AWS_REGION: z.string().default('ap-south-1'),

  // ─── Qdrant (Phase 6 — RAG vector store) ───────────────────────
  QDRANT_URL: z.string().url().default('http://localhost:6333'),
  QDRANT_COLLECTION: z.string().default('krishi_knowledge_base'),
  QDRANT_API_KEY: z.string().optional(), // set for Qdrant Cloud; omit for local
  // gemini-embedding-001 outputs 3072-dim vectors (verified). Kept in env so the
  // collection size and any future embed-model swap stay in one place.
  EMBED_DIMENSION: z.coerce.number().int().positive().default(3072),
  HUGGINGFACE_API_KEY: z.string().optional(),

  // ─── Notifications (Phase 7) ───────────────────────────────────
  // All optional: each channel service is env-gated and no-ops (with a warning)
  // when its keys are absent, so the app boots and runs without any provider
  // configured. Provider keys are promoted to required only per-deployment.
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@krishiraksha.in'),

  // ─── ML Bridge (optional) ──────────────────────────────────────
  ML_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  ML_INTERNAL_KEY: z.string().optional(),

  // ─── Background Jobs / BullMQ (Phase 14) ───────────────────────
  // Queues run on the same Redis instance. When disabled, the app degrades
  // gracefully to inline execution (notifications fan out synchronously, reports
  // generate within the request) so a single-process/dev setup still works with
  // no worker running. Scheduled jobs (outbreak detection, cleanup) only run
  // when queues are enabled.
  QUEUE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Days after which completed/failed report jobs are pruned by the cleanup job.
  REPORT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  // Delay (days) before a post-scan treatment-reminder notification fires.
  TREATMENT_REMINDER_DAYS: z.coerce.number().int().positive().default(7),
  // Minimum same-disease scans in a district (over 7d) to raise an outbreak alert.
  OUTBREAK_THRESHOLD: z.coerce.number().int().positive().default(20),

  // ─── Monitoring ────────────────────────────────────────────────
  SENTRY_DSN: z.string().optional(),

  // ─── AI Classification Config (Phase 3) ────────────────────────
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.65),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Logger may not be initialized yet at this point, so use console directly.
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env: Env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
