# Backend Architecture Guide

## High Level Architecture

The Krishi Raksha backend is designed as a robust, scalable, and modular system tailored for offline-first clients. The architecture leverages Node.js (Express) as the primary API Gateway and business logic layer, integrating with **Google Gemini** (vision classification + RAG embeddings) and **Groq** (`llama-3.3-70b`, streaming chatbot) for AI capabilities.

**Core Interaction Flow:**
1. **Client (PWA)** communicates via HTTPS/WSS with the Node.js API Gateway.
2. **API Gateway** handles authentication, rate limiting, and request validation.
3. Tasks are delegated to specialized **Services** (e.g., Image processing, AI classification via Groq, Treatment retrieval).
4. Data is persisted across a **Polyglot Persistence Layer** (MongoDB, Redis, Qdrant, S3).
5. Heavy or asynchronous tasks are pushed to a **Queue/Worker Layer**.

## Folder Structure

> **Implementation note (Phase 1):** pnpm/turbo are not available on the current
> machine, so the backend is implemented as a single **npm** package rooted at
> `backend/` instead of a pnpm monorepo. The API source therefore lives at
> `backend/src/` (not `apps/api/src/`). The internal layout below is otherwise
> followed as-is. If a second service (e.g. the Python `ml` bridge) is later
> added, this can be promoted to a monorepo.

```
backend/
├── apps/
│   ├── api/                           # Node.js + Express API Gateway
│   │   ├── src/
│   │   │   ├── config/                # DB connections, environment variables validation, constants
│   │   │   ├── routes/                # Express router definitions (v1)
│   │   │   ├── controllers/           # HTTP request handlers mapping to services
│   │   │   ├── middleware/            # Auth, RBAC, Multer, Rate Limiting, Error Handling
│   │   │   ├── services/              # Core business logic (Groq, Auth, Treatments, Chat)
│   │   │   ├── models/                # Mongoose schema definitions
│   │   │   ├── validators/            # Zod validation schemas
│   │   │   ├── jobs/                  # Background jobs and queue definitions (BullMQ)
│   │   │   ├── utils/                 # Helper functions (Tokens, Errors, API Responses)
│   │   │   ├── types/                 # TypeScript type definitions and augmented interfaces
│   │   │   ├── app.ts                 # Express app bootstrap
│   │   │   └── server.ts              # HTTP server and Socket.io initialization
│   │   ├── tests/                     # Unit and integration tests
│   │   └── package.json
│   │
│   └── ml/                            # (Optional) Python FastAPI ML Bridge
│       ├── app/
│       │   ├── api/                   # FastAPI routes
│       │   ├── services/              # Python Groq integration
│       │   └── schemas/               # Pydantic schemas
│       └── main.py
│
├── infrastructure/
│   ├── docker/                        # Docker compose files for local/prod
│   ├── k8s/                           # Kubernetes manifests
│   └── nginx/                         # Reverse proxy configurations
│
├── .env.example                       # Environment variable templates
└── package.json                       # Monorepo root config
```

## Application Flow

**Request Lifecycle Example (Scan Upload):**

Client (PWA Background Sync or Live)
↓
API Gateway (Express Route: `POST /api/v1/scans`)
↓
Authentication Middleware (Validates JWT)
↓
Validation Middleware (Zod schema checks)
↓
Upload Middleware (Multer parses multipart form)
↓
Controller (`scan.controller.ts` parses request)
↓
Image Service (Sharp strips EXIF, resizes, uploads to S3/MinIO)
↓
AI Service (Gemini API classifies image)
↓
Treatment Service (Checks Redis Cache -> MongoDB for remedies; regional fallback
to 'All India'; skipped for healthy/zero-confidence diagnoses) — Phase 5, LIVE
↓
Repository/Database (Saves Scan document with treatment_ref to MongoDB)
↓
Notification Service (fire-and-forget: persist + best-effort push/SMS/email of a
language-localized `scan_result`; skipped for healthy scans) — Phase 7, LIVE
↓
Response (JSON with prediction + language-localized treatment) & WebSocket (Phase 12)

## Internal Architecture

- **Controller Layer:** Extremely thin. Responsible only for receiving requests, invoking services, and returning standard HTTP responses.
- **Service Layer:** Contains all business logic. Orchestrates calls between databases, external APIs (Groq), and background queues.
- **Repository Layer:** Abstracted through Mongoose models. Handles all database queries, aggregations, and data formatting.
- **AI Layer:** Interacts with Gemini for Vision (classification) and embeddings,
  and with Groq for the RAG chatbot (streamed text generation).
- **Memory/Context Layer:** Uses Qdrant vector database to store and retrieve semantic embeddings of the treatment knowledge base.
- **Queue & Worker Layer:** BullMQ handles background tasks like sending SMS/Emails, generating reports, and detecting outbreaks to keep APIs fast.
- **Cache Layer:** Redis stores session blacklists, rate limits, and caches frequent treatment queries.
- **Storage Layer:** AWS S3 or MinIO handles raw and processed image assets.
- **Database Layer:** MongoDB serves as the primary document store for users, scans, treatments, and chat histories.

## Database Architecture

- **Primary Database (MongoDB 7.0):** 
  - Stores unstructured and highly relational documents (Users, Scans, Treatments). 
  - Uses geospatial indexes for outbreak tracking.
- **Vector Database (Qdrant 1.8):** 
  - Stores high-dimensional embeddings of agricultural knowledge. 
  - Enables semantic search for the chatbot.
- **Cache (Redis 7.2):** 
  - Caches treatment lookups (TTL based).
  - Manages JWT refresh tokens and blacklists.
- **File Storage (S3/MinIO):** 
  - Stores user uploaded leaf photos.

## Cache Layer (Redis)

- **Treatment cache (Phase 5):** `getForDisease` caches resolved treatments under
  `treatment:{disease}:{crop}:{region}:{lang}`. Positive results live for 1 hour;
  cache MISSES are stored briefly (5 min) with a `__none__` sentinel (negative
  caching) so diagnoses with no curated remedy (Healthy, Unidentifiable) don't
  repeatedly hit MongoDB. Cache access is best-effort — a Redis read/write failure
  is logged and the request proceeds against Mongo. When an approved proposal
  mutates a treatment, `invalidateTreatmentCache` uses a non-blocking `SCAN` to
  DELETE every region×language variant of that disease+crop.
- **Auth/session (Phase 2):** refresh-token sessions (`session:{userId}`) and the
  access-token blacklist (`blacklist:{jti}`).
- **Password reset (Phase 7):** single-use reset-token jti (`pwdreset:{userId}`,
  TTL 1h) — the token is only valid while its jti matches this key, so consuming
  it (or issuing a newer one) invalidates it.

## Notification Architecture (Phase 7)

Multi-channel, resilient, and privacy-conscious. `notification.service.dispatch()`
**persists a Notification document first** (the in-app inbox is the reliable
channel) and then fans out best-effort to the requested channels; per-channel
outcomes are recorded on the document's `delivery` map.

- **Channels (all env-gated):** `push.service` (Web Push / VAPID),
  `sms.service` (Twilio), `email.service` (SendGrid). Each checks its keys at
  module load, logs once, and returns a `DeliveryState`
  (`sent` | `failed` | `skipped`) instead of throwing — so the API boots and runs
  with **no** provider keys configured (every send simply reports `skipped`).
- **Templates:** en/hi/gu copy lives in
  `services/templates/notification.templates.ts` and is reused across in-app,
  push, SMS, and email so a farmer is messaged in their own language.
- **Dispatch discipline:** hot paths call dispatch **fire-and-forget**
  (`void notificationService.dispatch(...).catch(...)`). The scan pipeline emits
  a localized `scan_result` after persisting a scan (skipped for
  healthy/zero-confidence), never delaying the scan response. Dispatch is
  synchronous best-effort today; it moves onto a BullMQ queue in Phase 14.
- **Push subscriptions:** stored per device/browser (`PushSubscription`, unique
  `endpoint`); the push service prunes subscriptions the push provider reports as
  gone (HTTP 404/410).
- **Password reset** rides the same email service: a purpose-scoped 1h JWT
  (jti tracked in Redis) is emailed as a link; `forgot-password` returns a generic
  response either way to avoid account enumeration, and `reset-password` consumes
  the token and revokes the user's refresh session.

## Analytics Architecture (Phase 8)

Read-only aggregation over the Scans collection, exposed at `/api/v1/analytics`
for extension-officer and admin dashboards. `analytics.service` holds a set of
MongoDB aggregation pipelines; the controller is thin and stateless.

- **Endpoints:** `overview` (headline counts), `scans` (volume time series,
  day/week/month), `diseases/top`, `diseases/heatmap` (coordinate-binned density
  for maps), `outbreaks` (on-demand district+disease hotspots over a window), and
  `model/accuracy` (correct/incorrect from farmer feedback, **admin-only**).
- **Region scoping:** `region` is a property of the User, not the Scan, so any
  pipeline that filters or groups by region `$lookup`s into `users` and matches
  on the joined `_user.region`; pipelines that don't need region skip the join.
  All routes run `requireRole('extension_officer','admin')` + `requireRegionalScope`
  — an extension officer's `region` is force-pinned to their own district, so
  cross-district reads are impossible; admins may pass any region or none.
- **Windowing:** every endpoint accepts an optional `from`/`to` ISO range,
  defaulting to the last 30 days; the resolved window + region are echoed in each
  response's `meta`. Soft-deleted scans are always excluded, and healthy /
  unlocated scans are excluded from disease/heatmap/outbreak views.
- **Outbreak detection is on-demand here** (a live aggregation). Persisting
  `OutbreakAlert` documents and auto-notifying officers via the Phase-7
  `outbreak_alert` channels is a scheduled BullMQ worker, deferred to Phase 14.

## Admin Architecture (Phase 9)

Platform-management APIs under `/api/v1/admin`, gated to the `admin` role once at
the router level (`authenticateJWT` + `requireRole('admin')`).

- **User management:** list/search (case-insensitive across name/email/phone,
  regex metacharacters escaped), detail with a scan summary, role change,
  suspend/activate, and soft-delete. `admin.service` holds the logic; the
  controller passes the acting admin's id through for the self-action guard.
- **Safety invariants:** an admin cannot role-change, suspend, or delete their
  own account (guards against locking out the last administrator). Any of those
  mutations revokes the target's refresh session so the change takes effect
  immediately — existing short-lived access tokens simply expire (no per-jti
  blacklist sweep). Soft-delete sets `is_deleted=true` + `is_active=false`; the
  new `is_deleted` flag hides the user from listings, and `is_active=false` means
  login already rejects them.
- **Role assignment:** `admin` IS assignable here (an administrator can promote a
  trusted user) — only public self-registration forbids the admin role.
- **Treatment approval is reused, not rebuilt:** the propose/approve/reject
  workflow lives under `/api/v1/treatments/proposals*` (Phase 5, admin-gated).
  Phase 9 wires a fire-and-forget `proposal_reviewed` notification to the
  proposer on approve/reject.
- **System health (`/system/health`):** live MongoDB `db.stats()` (collections,
  objects, data size) and parsed Redis `INFO` (memory, clients, uptime), each
  guarded so a stats failure degrades rather than throws. BullMQ queue metrics
  report `not_configured` until the queue layer lands in Phase 14.

## Report Architecture (Phase 10)

Exportable PDF/CSV reports under `/api/v1/reports`, an officer/admin capability.
A report request names a `type` + `format`; the service gathers the matching
data, renders it, and stores it in S3/MinIO for pre-signed download.

- **Types → data source:** `district_weekly` (Phase-8 overview + top diseases +
  daily trends), `farmer_history` (a target user's scans — requires
  `params.user_id`), `model_performance` (feedback accuracy), `outbreak_incident`
  (district×disease hotspots). Data comes from `analytics.service`, so no
  aggregation logic is duplicated.
- **Rendering:** a normalized `ReportDocument` (title + meta + titled tables) is
  consumed by two renderers — `renderPDF` (pdfkit) and `renderCSV` (RFC-4180 with
  a UTF-8 BOM so Excel reads Devanagari disease names). Presentation is split from
  data-gathering; adding a format or a type never touches the other side.
- **Job lifecycle:** a `ReportJob` is persisted (`queued`) before work starts, so
  a generation failure still leaves a queryable `failed` record. Generation +
  upload run inline in Phase 10 (`processing` → `complete`); Phase 14 moves that
  body onto a BullMQ worker and fires a `report:ready` notification without
  changing the API.
- **Storage & download:** the rendered buffer is uploaded via the generic
  `image.service.uploadBuffer` to `reports/{user_id}/{job_id}.{fmt}` (private).
  `s3_key` is hidden from JSON; `GET /reports/:id/download` issues a fresh 15-min
  pre-signed URL with `Content-Disposition: attachment`.
- **Scoping:** every job is owner-scoped (a user only sees their own → 404
  otherwise). Extension officers are pinned to their own region in the
  controller, because the region filter lives in the request body `params` where
  the `requireRegionalScope` query guard can't reach it.

## AI Architecture

> **Provider note (Phase 3):** The project uses **Google Gemini** as the AI
> provider instead of the originally-planned Groq. The Gemini API supports
> multimodal (vision) input and native JSON structured output, and the provided
> project key targets it. The service layer keeps AI access provider-agnostic
> (`classifyLeafImage` in `gemini.service.ts`), so a future swap back to Groq or
> to a self-hosted model touches only that one file.

- **Vision Integration:** Uses Gemini `gemini-2.5-flash` (`@google/genai` SDK).
  Images are sent as inline base64 data; a `responseSchema` + `responseMimeType:
  application/json` enforce a strict, parseable classification object. Low
  temperature (0.1) keeps results deterministic. On API/parse failure the service
  returns a graceful degraded result (confidence 0, `low_confidence: true`)
  rather than throwing.
- **Chatbot (RAG) — Phase 6, LIVE:** Conversational assistant powered by **Groq**
  (`llama-3.3-70b-versatile`, streamed via SSE). User questions are embedded with
  **Gemini** (`gemini-embedding-001`, 3072-dim), matched against Qdrant, and the
  retrieved treatment snippets are injected into the prompt as grounding context.
  Chat history is trimmed to the last 10 turns before each call. Embeddings and
  generation deliberately use different providers (each is the better tool for its
  job); the Gemini key is reused for embeddings, so no extra embedding provider is
  needed. Retrieval failures degrade gracefully to an ungrounded answer.
- **Prompt Pipeline:** System prompts are versioned in the codebase
  (`services/prompts/classification.prompt.ts`, `PROMPT_VERSION`) and the version
  is recorded on every scan via `model_version` (e.g. `gemini:gemini-2.5-flash:v1`).
- **Memory Retrieval:** Vector search on Qdrant retrieves the top-K relevant
  treatment snippets to ground the LLM responses. (Phase 6, LIVE — collection
  `krishi_knowledge_base`, 3072-dim/Cosine, seeded via `npm run ingest:kb`.)

## API Architecture

- **REST Conventions:** Nouns for resources (e.g., `/api/v1/scans`), standard HTTP verbs (GET, POST, PATCH, DELETE).
- **Versioning:** URL-based versioning (`/api/v1/...`).
- **Status Codes:** Strict adherence to HTTP standards (200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Error).
- **Pagination:** Cursor or offset-based pagination for lists (Scans, Notifications).
- **Validation:** Enforced at the route level using Zod.
- **Authentication:** Bearer tokens (JWT) passed in the `Authorization` header.
- **Authorization:** Custom RBAC middleware checking user roles against route requirements.

## Search Architecture (Phase 11)

Natural-language semantic search over the knowledge base at `/api/v1/search`,
available to every authenticated role. It is a thin feature layer over the
Phase-6 RAG plumbing — no new datastore, model, or ingestion path.

- **Flow:** embed the query with Gemini (`generateEmbedding`, RETRIEVAL_QUERY) →
  `qdrant.service.semanticSearch` (nearest-neighbour over the ingested
  `krishi_knowledge_base` collection) → map hits to ranked result DTOs
  (`type`, `title`, `snippet`, `score`, `crop`, `disease_label`, `source`).
- **Filtering:** optional exact-match query params (`type`, `crop`, `disease`)
  are compiled into a Qdrant `must` filter so results narrow without a second
  query; `min_score` post-filters hits below a cosine-similarity floor. `limit`
  defaults to 5 (max 50).
- **Failure posture:** unlike the chatbot's `retrieveContext` (which degrades to
  `[]` so an ungrounded answer still forms), search lets an embedding-provider
  failure propagate as a 503 — an empty result set would otherwise be
  indistinguishable from a genuine "no matches". The Qdrant search call itself
  still degrades to `[]` (its own try/catch), so a vector-store hiccup returns an
  empty list rather than erroring.
- **Data source:** the same curated, agronomist-approved treatments the RAG
  chatbot draws on (seeded via `npm run ingest:kb`), so search and chat stay
  consistent. As new knowledge types are ingested (faq/article), the `type`
  filter already supports narrowing to them.

## Real-time Architecture (Phase 12)

A Socket.io layer attached to the same HTTP server gives clients live push
events instead of polling. Lives in `config/socket.ts`; services emit through
thin helpers and never touch the `io` instance directly (transport-agnostic per
rules.md).

- **Handshake auth:** the client sends its access token in
  `socket.handshake.auth.token`; an `io.use` middleware verifies it with the
  SAME `tokenUtils.verifyAccessToken` + logout-blacklist check the REST
  `authenticateJWT` uses, so a revoked token can't open a socket. Rejected
  sockets never reach `connection`.
- **Rooms:** on connect each socket joins its private `user:{userId}` room
  (targeted delivery), plus role rooms — `role:admin` and, for extension
  officers, `officer:{region}` (district broadcasts). Room names come from
  `userRoom()`/`officerRoom()`/`ADMIN_ROOM` helpers (one source of truth).
- **Redis adapter:** wired to the `pubClient`/`subClient` duplicates pre-created
  in `config/redis.ts` back in Phase 1, so events fan out across horizontally
  scaled instances. **Non-fatal:** if pub/sub can't connect, the server logs a
  warning and falls back to the in-memory adapter (single-instance still works)
  — same "degrade, don't crash" startup posture as S3 `ensureBucket` and Qdrant
  init. Initialized in `server.ts` after datastores connect; closed on graceful
  shutdown.
- **Emit points (current):**
  - `scan:result` → `user:{id}` after a scan is persisted (`scan.service`),
    carrying `{scan_id, crop_type, prediction, treatment}`. Covers both live
    scans and scans replayed from an offline sync queue.
  - `notification:new` → `user:{id}` from `notification.service.dispatch()` for
    every notification type, so the in-app inbox badge updates instantly.
  All emits are fire-and-forget and no-op when the socket layer is down or the
  user has no open connection — they never delay or fail the REST response.
- **Ready for Phase 14:** the `officer:{region}` + `role:admin` rooms exist so
  the scheduled outbreak worker can broadcast `outbreak:alert` to a district,
  and `report:ready` can be pushed to a user, without further socket plumbing.

## Audit Architecture (Phase 13)

An immutable, append-only trail of security-sensitive actions for forensics and
accountability — who did what, when, from where. Lives in `audit.service` +
the `AuditLog` model, exposed read-only to admins at `/api/v1/audit-logs`.

- **Immutability by construction:** `AuditLog` is a **capped collection**
  (100 MB ring buffer). Capped collections accept inserts and reads but forbid
  document-growing updates and individual deletes; the oldest entries roll off
  once the cap is reached. This bounds disk use and makes in-place tampering
  impossible — no application-level "please don't edit" convention required.
- **Write path — `audit.service.log()`:** fire-and-forget and **never throws**.
  Callers invoke it as `void auditService.log(...)` AFTER the action succeeds; a
  failed audit write is logged and swallowed so it can never break or delay the
  request it records (same best-effort posture as notification dispatch).
- **Where logging happens — the controller layer.** Chosen over a blanket
  middleware or the service layer because the controller is the single place with
  BOTH the actor context (`req.user`) and the HTTP metadata (client IP,
  user-agent). The `auditContext(req)` helper extracts just those HTTP bits, so
  `audit.service` itself stays HTTP-agnostic per rules.md. Each log call is one
  line, keeping controllers thin.
- **Actor identity:** stored as the `user_id` STRING (+ denormalized
  `actor_role`), not an ObjectId ref — the acting user's user_id is always
  already on `req.user.id`, so a write needs no extra DB lookup, and reads don't
  need a `$lookup`/`populate`.
- **What's logged (security-relevant mutations only):** `auth.login/logout/
  password_reset`, `scan.submit/feedback/delete`, `treatment.propose/approve/
  reject`, `user.role_change/suspend/delete`, `report.generate`. Read-only
  browsing (listing scans, treatments, or the audit log itself) is deliberately
  NOT logged, so the bounded buffer stays signal-dense. Metadata carries
  action-specific context (crop/disease, new role, suspend flag, reject reason)
  — never secrets, tokens, or passwords.
- **Read path:** `GET /api/v1/audit-logs` (admin-only, `requireRole('admin')`),
  newest-first, paginated, filterable by `actor_id`, `action`, and a
  `from`/`to` created-at range. Indexes on `{actor_id, created_at}` and
  `{action, created_at}` back those filters.

## Background Jobs Architecture (Phase 14)

BullMQ moves best-effort and heavy work off the request path onto in-process
workers, with a strict **degrade-to-inline** contract so the API runs fully
without a worker. Lives in `jobs/queues.ts` (registry + typed enqueue helpers),
`jobs/workers.ts` (consumers), `jobs/scheduler.ts` (recurring crons).

- **Queues (one Redis instance, dedicated connection):** `notifications`,
  `report-generation`, `outbreak-detection`, `cleanup`. BullMQ needs
  `maxRetriesPerRequest: null`, which differs from the app's ioredis client, so
  the queue layer owns a separate connection (not `config/redis`). Default job
  options: 3 attempts, exponential backoff, bounded `removeOnComplete/Fail`.
- **Degradation contract (the core design):** when `QUEUE_ENABLED=false` — or any
  `enqueue*` call fails — the helper returns `false`, and the caller runs the
  work inline instead. So: notifications fan out synchronously, reports generate
  within the request (the Phase-10 behaviour), and the app needs no worker
  process. `getQueueStats()` reports `disabled` in that mode. Mirrors the
  env-gated notification channels and non-fatal S3/Qdrant bootstrap.
- **Lifecycle:** `startWorkers()` + `registerSchedules()` run in `server.ts`
  after datastores connect (like socket.io); `stopWorkers()` + `closeQueues()`
  run on graceful shutdown. Workers are thin glue that delegate to the owning
  service (per rules.md) — no business logic in `jobs/`.
- **Notifications queue:** `notification.service.dispatch()` keeps the fast path
  synchronous (persist the doc + emit `notification:new`), then enqueues the
  channel fan-out. The worker calls `deliverChannels()` (the shared worker/inline
  body) which delivers push/SMS/email with retries and records per-channel
  `delivery`. A delayed `reminder` job (7 days) fires `treatment_reminder`.
- **Reports queue:** `createReport` persists a `queued` job and enqueues;
  `generateReport()` (worker body) gathers → renders → uploads → marks complete,
  then fires `report:ready` (socket to `user:{id}` + an inbox notification). The
  API surface is unchanged; only where generation runs moved.
- **Outbreak worker (scheduled, every 6h):** `outbreak.service.detectAndAlert()`
  runs the Phase-8 `detectOutbreaks` aggregation, then for each hotspot: dedups
  against recent alerts (48h cooldown per district×disease), persists an
  `OutbreakAlert` (level high/critical by count), dispatches a localized
  `outbreak_alert` notification to every active officer in the district, and
  broadcasts `outbreak:alert` to that district's `officer:{region}` socket room.
  Persisted alerts are read via GET /api/v1/analytics/outbreak-alerts.
- **Cleanup worker (scheduled, daily 02:30):** prunes completed/failed report
  jobs older than `REPORT_RETENTION_DAYS`.
- **Not built — offline scan-sync replay queue:** scans process synchronously and
  there is no queued-unprocessed-scan source to feed a replay worker, so that
  machinery would be dead code. Deferred until an offline-submission path exists.

## Security Architecture (Phase 15)

Production hardening layered onto the existing middleware chain, keeping the same
"degrade, don't crash" posture used elsewhere.

- **Rate limiting — Redis-backed, per-route.** `middleware/rateLimiter.ts` exports
  three limiters sharing a `rate-limit-redis` store over the existing ioredis
  client, so counters are consistent across horizontally-scaled instances and
  survive restarts (the Phase-1 in-memory limiter did neither). Each limiter uses
  a distinct key prefix (`rl:general:` / `rl:auth:` / `rl:scan:`), matching the
  Redis key-patterns table in BackendPlan §22:
  - `generalLimiter` — 100/min per IP, applied globally in `app.ts`.
  - `authLimiter` — 10 / 15 min per IP, on `/auth/login`, `/refresh`,
    `/forgot-password`, `/reset-password` (brute-force protection).
  - `scanLimiter` — 20 / hour keyed by `req.user.id` (runs after
    `authenticateJWT`), throttling the expensive scan pipeline.
  If the Redis store can't be constructed each limiter falls back to
  express-rate-limit's in-memory store rather than failing startup (mirrors the
  queue/socket/S3 bootstrap posture). NOTE: the rate-limit store issues a command
  at import, auto-connecting the lazy ioredis client; `connectRedis()` was made
  idempotent (waits on an in-flight connect) to accommodate this ordering.
- **Security headers (Helmet).** Explicit CSP (`default-src 'self'`; `img-src
  'self' data: https:` so cross-origin presigned S3/MinIO image URLs load;
  `object-src 'none'`) with HSTS (1y, includeSubDomains, preload) and
  `upgrade-insecure-requests` enabled in **production only** (local dev stays
  http). `crossOriginResourcePolicy: cross-origin` lets a PWA on another origin
  consume API/image responses.
- **CORS allowlist.** `CORS_ORIGINS` (comma-separated env, falls back to
  `APP_URL`) drives a CORS `origin` function: requests with no Origin
  (curl/server-to-server/health checks) and any allowlisted origin pass; anything
  else is rejected with a 403 `cors_forbidden`. `credentials: true` is retained so
  the HttpOnly refresh cookie flows.
- **Constant-time login.** `auth.service.login` always performs exactly one bcrypt
  compare — against the real hash when the account exists, else against a
  module-level `DUMMY_PASSWORD_HASH` — so a non-existent account and a wrong
  password take the same time and return the same 401 `invalid_credentials`. This
  closes the user-enumeration timing side channel flagged (and deferred) since
  Phase 2. `account_inactive` is still returned for a *correct* password on a
  suspended account (a real compare still runs, so timing stays uniform).
- **Secrets & logging.** `.env` is gitignored; the Winston logger and the global
  error handler never serialize request bodies or tokens, so credentials can't
  leak into logs. No sensitive data is exposed in client-facing errors (500s are
  generic in production).
- **Dependency posture.** `npm audit` reports 5 vulnerabilities, all confined to
  the `vitest → vite → esbuild` **dev-only** toolchain (absent from the runtime
  bundle). Remediation requires a breaking vitest@4 bump, deferred to Phase 17
  where the test suite is built.

## Deployment Architecture

> **Phase 16 status:** the containerization artifacts below exist and are
> build-validated, but the stack is **not currently deployed** (deferred by the
> user). Files: `backend/Dockerfile`, `backend/.dockerignore`,
> `docker-compose.yml` (repo root), `nginx/nginx.conf`.

- **API image (`backend/Dockerfile`):** 4-stage build on `node:20-bookworm-slim`
  — (1) `deps` installs all deps via `npm ci`, (2) `build` runs `tsc` → `dist/`,
  (3) `prod-deps` does a clean `npm ci --omit=dev`, (4) `runner` copies `dist` +
  production `node_modules` and runs as the non-root `node` user. `bookworm-slim`
  is chosen so sharp uses its prebuilt binaries (no native build toolchain in the
  image). A `HEALTHCHECK` polls `GET /api/v1/health`.
- **Compose stack (`docker-compose.yml`):** `api` + `redis` + `qdrant` + `minio`
  + optional `nginx`, on a private bridge network. **MongoDB is external** (Atlas)
  — there is no mongo service; `MONGODB_URI` comes from `backend/.env`. The `api`
  service loads secrets via `env_file` but its datastore URLs are overridden to the
  in-network service hostnames (`redis://redis:6379`, `http://qdrant:6333`,
  `http://minio:9000`). BullMQ workers run **in-process** in the api container (the
  Phase-14 design), so no dedicated worker service is required; scaling workers out
  later would mean adding a second service off the same image with a worker-only
  entrypoint.
- **Reverse proxy (`nginx/nginx.conf`):** single entrypoint forwarding to
  `api:4000`, with three special cases — WebSocket upgrade headers for
  `/socket.io/` (Phase 12), `proxy_buffering off` on `/api/v1/chat` so SSE tokens
  stream (Phase 6), and `client_max_body_size 10m` for leaf-image uploads
  (Phase 4). `app.ts` already sets `trust proxy: 1`, so client IPs (and thus the
  Phase-15 rate limiters) are correct behind the proxy. TLS/HSTS is added at the
  proxy in a real deployment; the app already emits HSTS when `NODE_ENV=production`.
- **Production target:** the same image runs under Kubernetes or a managed
  container service; secrets are injected via the platform's secret store (never
  baked into the image — `.env` is in `.dockerignore`).
- **CI/CD:** GitHub Actions for testing, linting, and automated deployments to
  staging/production (future).
- **Secrets Management:** Environment variables injected via secure vaults (e.g.,
  AWS Secrets Manager) in production; `.env` for local. Never committed to source
  control (gitignored + dockerignored).

## Error Handling Architecture

- **Global Error Handler:** Express middleware catches all unhandled exceptions, formats them, and prevents application crashes.
- **Validation Errors:** Zod errors are caught and transformed into standard `400 Bad Request` responses detailing invalid fields.
- **Database/Network Failures:** Standardized `500 Internal Server Error` logged internally but sanitized for the client.
- **Custom Error Classes:** `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`.

## Logging Architecture

- **Request Logging:** Handled by Morgan/Winston. Logs method, URL, status, and response time.
- **Error Logging:** Stack traces captured by Winston, optionally sent to Sentry.
- **Audit Logging:** Dedicated MongoDB collection tracking sensitive actions (e.g., user role changes, treatment modifications) with IP and User-Agent.

## Scalability Strategy

- **Stateless APIs:** JWT authentication allows scaling Node.js instances horizontally behind a load balancer without session stickiness.
- **Queues/Workers:** Heavy operations (report generation, mass notifications, outbreak detection) are offloaded to BullMQ workers.
- **Caching:** Redis significantly reduces MongoDB load for static data like treatments.
- **Background Sync Handling:** Architecture is specifically designed to handle sudden bursts of traffic when offline farmers reconnect by rapidly queuing requests.

## Testing Architecture (Phase 17)

Vitest suite under `backend/tests/` — 88 tests, three tiers, no live external
services. Run with `npm test` (or `test:watch` / `test:coverage`).

- **Env bootstrap:** `tests/setup/env.setup.ts` (a vitest `setupFiles`) seeds
  dummy values for every required env var BEFORE any src module imports, because
  `config/env.ts` calls `process.exit(1)` on missing vars. `NODE_ENV=test` also
  silences the Winston logger and keeps `QUEUE_ENABLED=false`.
- **Unit tier (no infra):** pure functions and middleware — `utils` (apiResponse,
  error classes, hashDeviceId, auditContext, asyncHandler), all Zod `validators`,
  and `middleware` (validate, rbac, errorHandler). Fast and deterministic.
- **Mocked-dependency tier:** `tokenUtils` runs against **ioredis-mock** (sessions,
  blacklist, single-use reset tokens); `gemini.service` mocks the `@google/genai`
  SDK to exercise the happy path AND the degraded fallback (throw / empty /
  bad-JSON → never throws). Module mocks use `vi.hoisted` (vitest hoists
  `vi.mock`), and SDK constructor mocks use a real `class` (vitest 4 rejects arrow
  `mockImplementation` constructors).
- **Integration tier:** `mongodb-memory-server` gives each run a real in-memory
  MongoDB. `treatment.service` (cache ranking + negative cache + SCAN
  invalidation + proposal workflow) and `outbreak.service` (48h dedup, level
  thresholds, cooldown expiry) are tested against it with Redis mocked and the
  notification/socket side effects stubbed. `auth.api.test.ts` drives the **full
  Express app via supertest** (register→me→refresh→logout, RBAC, constant-time
  login), stubbing the rate-limit middleware (its Lua `redis.call` isn't in
  ioredis-mock; rate limiting itself is verified live in Phase 15).
- **Coverage posture:** the suite targets business logic — utils ~95%, tokenUtils
  ~97%, gemini 100%, validators ~96%, outbreak ~94%, treatment/auth services
  ~56–59%. Thin wrappers over external SDKs (push/sms/email/image/report/chat/scan
  services) are deliberately left to their live phase verification, so whole-repo
  statement coverage (~38%) understates the tested-logic coverage.
- **Dependency hygiene:** the `vitest` 2→4 bump done here cleared the dev-only
  `vitest → vite → esbuild` advisories flagged in Phase 15 — `npm audit` is now
  clean (0 vulnerabilities).
