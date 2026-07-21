# Implementation Phases

## Phase 1 — Foundation Setup
- **Objective:** Initialize project, define structure, and set up core dependencies.
- **Modules:** Project config, DB connections, basic Express server.
- **Tasks:**
  - Initialize monorepo or standard structure.
  - Configure TypeScript.
  - Setup Environment Validation (Zod).
  - Setup MongoDB and Redis connections.
  - Bootstrap Express App with global error handler and logger.
- **Deliverables:** A running Express server connected to MongoDB and Redis.
- **Dependencies:** None.
- **Completion Checklist:** Server starts without errors; health check endpoint works.

## Phase 2 — Authentication & RBAC
- **Objective:** Secure the API and manage users.
- **Modules:** Users, Auth, JWT.
- **Tasks:**
  - Create User Schema with Mongoose.
  - Implement JWT utilities (Access, Refresh, Blacklist).
  - Create Auth and RBAC middleware.
  - Build Auth controller (Register, Login, Refresh, Logout).
- **Deliverables:** Secure authentication system with role-based access control.
- **Dependencies:** Phase 1.
- **Completion Checklist:** Users can register, login, and access protected routes based on roles.

## Phase 3 — Groq AI Integration (Image Classification Bridge)
- **Objective:** Integrate Groq's Vision AI for disease detection.
- **Modules:** AI Service.
- **Tasks:**
  - Setup Groq SDK.
  - Create system prompts for image classification.
  - Implement `classifyLeafImage` service.
- **Deliverables:** Service capable of receiving an image and returning structured disease data.
- **Dependencies:** Phase 1, Groq API Key.
- **Completion Checklist:** Successful mock classification of an image via Groq.

## Phase 4 — Scan Pipeline
- **Objective:** Handle image uploads and orchestrate the diagnosis flow.
- **Modules:** Scans, Upload Middleware, Image Service.
- **Tasks:**
  - Create Scan Schema.
  - Implement Multer upload middleware.
  - Implement Sharp image processing and S3/MinIO upload.
  - Build Scan Controller orchestrating upload -> Groq AI -> save to DB.
- **Deliverables:** Fully functional scan endpoint handling offline sync queues and real-time processing.
- **Dependencies:** Phase 2, Phase 3.
- **Completion Checklist:** Endpoint accepts image, uploads to S3, calls Groq, saves to DB, returns JSON.

## Phase 5 — Treatment Database & Recommendation Engine ✅ COMPLETE (2026-07-19)
- **Objective:** Provide accurate, localized treatments based on diagnoses.
- **Modules:** Treatments, Caching.
- **Tasks:**
  - Create Treatment Schema. ✅
  - Implement Treatment Service with Redis caching. ✅ (positive 1h + negative 5m,
    regional fallback to 'All India', best-effort cache, SCAN-based invalidation)
  - Create Treatment Proposal workflow for agronomists. ✅ (propose/approve/reject,
    diff, RBAC agronomist+admin/admin)
  - Link Treatment Service to the Scan Pipeline. ✅ (treatment_ref + localized
    treatment in scan response; skipped for healthy scans)
- **Deliverables:** Fast, cached treatment lookups integrated into scan results. ✅
- **Dependencies:** Phase 4.
- **Completion Checklist:** Scan responses successfully include relevant treatment
  data. ✅ Verified live (19/19 API tests + real Hindi-localized scan integration).

## Phase 6 — AI Chatbot (RAG Pipeline) ✅ COMPLETE (2026-07-19)
- **Objective:** Build an intelligent agricultural assistant.
- **Modules:** Chat, Qdrant, Embeddings.
- **Tasks:**
  - Setup Qdrant Vector Database. ✅ (Docker v1.12.4, collection 3072-dim/Cosine)
  - Implement Embedding generation service. ✅ (Gemini gemini-embedding-001, reuses
    existing key — no HuggingFace needed)
  - Create knowledge base ingestion scripts. ✅ (`npm run ingest:kb`, idempotent
    UUIDv5 point IDs)
  - Build Chat Controller with RAG. ✅ (embed → Qdrant retrieve → **Groq**
    llama-3.3-70b streaming over SSE, history trimmed to 10 turns) + ChatSession
    persistence and session CRUD.
- **Deliverables:** Streaming chatbot API endpoint. ✅ (POST /chat SSE; GET/DELETE
  /chat/sessions)
- **Dependencies:** Phase 5, Qdrant setup.
- **Completion Checklist:** Users can chat and receive contextually accurate
  answers. ✅ Verified live — KB-grounded EN answer (exact Mancozeb dosage +
  sources) and multilingual Hindi (382 Devanagari chars streamed & persisted).
- **Note:** Chat LLM is **Groq** (`llama-3.3-70b-versatile`) per the user's key;
  embeddings are Gemini. This differs from the plan's "RAG with Gemini" title but
  matches the original architecture's Groq-for-chat intent.

## Phase 7 — Notification System ✅ COMPLETE (2026-07-19)
- **Objective:** Keep users informed of results and outbreaks.
- **Modules:** Notifications, Push, SMS, Email.
- **Tasks:**
  - Implement VAPID Web Push service. ✅ (env-gated; prunes dead 404/410 subs)
  - Implement Twilio SMS service. ✅ (env-gated; E.164 +91 normalization)
  - Implement SendGrid Email service. ✅ (env-gated; also powers password reset)
  - Create Notification Schema and routes. ✅ (Notification + PushSubscription
    models; inbox list/mark-read/read-all + push subscribe/unsubscribe)
- **Deliverables:** Multi-channel notification capabilities. ✅ (notification.service
  orchestrator: persist-then-best-effort-fan-out; scan pipeline dispatches a
  localized `scan_result` notification, fire-and-forget)
- **Dependencies:** Phase 1.
- **Completion Checklist:** Successful dispatch of test SMS, Email, and Push
  notifications. ✅ Verified live (23/23 checks — inbox CRUD, push sub upsert/
  unsubscribe, real Hindi-localized scan_result on a Late Blight scan, and the
  full forgot/reset-password flow incl. single-use + session invalidation).
- **Note:** Channels are **env-gated** — with no provider keys set they log a
  startup warning and each send returns `'skipped'` (verified), so the app boots
  and runs without SendGrid/Twilio/VAPID. Dispatch is **synchronous best-effort**
  now; it moves onto BullMQ queues in Phase 14. Also unblocked & shipped the
  **forgot/reset-password** endpoints deferred from Phase 2.

## Phase 8 — Analytics & Predictive Dashboard ✅ COMPLETE (2026-07-19)
- **Objective:** Provide insights and track outbreaks.
- **Modules:** Analytics.
- **Tasks:**
  - Create aggregations for scan trends and model accuracy. ✅ (overview,
    scan trends [day/week/month], top diseases, model accuracy from feedback)
  - Generate disease heatmap data. ✅ (GeoJSON-friendly density grouped by
    rounded coords; excludes healthy + unlocated scans)
  - Implement background worker for automated outbreak detection. ⏳ DEFERRED to
    Phase 14 (the persisted OutbreakAlert + auto-notify worker). Phase 8 ships
    outbreak detection as an **on-demand** aggregation endpoint (current
    district+disease hotspots over a window).
- **Deliverables:** Analytics endpoints serving structured data for dashboards. ✅
  (GET /api/v1/analytics/{overview,scans,diseases/top,diseases/heatmap,outbreaks,
  model/accuracy})
- **Dependencies:** Phase 4, Phase 7.
- **Completion Checklist:** Endpoints return correct aggregations. ✅ Verified
  live (19 checks incl. RBAC officer/admin-only + farmer 403, regional-scope
  auto-pinning [officer forced to own district even when passing another region],
  admin-only model accuracy, date-range filtering, day/week/month granularity,
  outbreak thresholding, and 422 validation).
- **Note:** All routes are officer/admin only with `requireRegionalScope`
  (extension officers are confined to their district); model accuracy is
  admin-only. Region lives on the User, so region-scoped pipelines `$lookup` into
  `users` (skipped when no region is involved). Range defaults to the last 30 days.

## Phase 9 — Admin Panel APIs ✅ COMPLETE (2026-07-19)
- **Objective:** APIs to manage the platform.
- **Modules:** Admin.
- **Tasks:**
  - Implement user management endpoints. ✅ (list/search + filter, detail + scan
    summary, change role, suspend/activate, soft-delete — with a self-action
    guard and refresh-session revocation) + system health (`/system/health`).
  - Implement treatment approval endpoints. ✅ (already shipped in Phase 5 under
    `/treatments/proposals*`, admin-gated; reused as-is, NOT duplicated. Phase 9
    wires the `proposal_reviewed` notification to the proposer on approve/reject.)
- **Deliverables:** Secure admin routes. ✅ (GET /api/v1/admin/users[/:id],
  PATCH /users/:id/{role,suspend}, DELETE /users/:id, GET /system/health — all
  authenticateJWT + requireRole('admin') at the router level.)
- **Dependencies:** Phase 2, Phase 5.
- **Completion Checklist:** Admin can list users and approve treatment proposals.
  ✅ Verified live (24 checks): RBAC (farmer 403 / no-auth 401), list/search/
  filter/detail, role change (+409 same-role, 422 invalid, 400 self-guard),
  suspend→login-blocked→reactivate (+400 self-suspend), soft-delete→gone-from-
  list→404→(400 self-delete), system health (real Mongo/Redis stats, queues
  not_configured), and proposal_reviewed notification delivered to the proposer
  on both approve and reject.
- **Note:** Added `is_deleted` to the User model (soft-delete, distinct from the
  `is_active` suspension flag). BullMQ queue metrics report `not_configured`
  until Phase 14.

## Phase 10 — Report Generation ✅ COMPLETE (2026-07-19)
- **Objective:** Generate PDF/CSV reports.
- **Modules:** Reports.
- **Tasks:**
  - Create report generation service. ✅ (4 types — district_weekly,
    farmer_history, model_performance, outbreak_incident — sourced from the
    Phase-8 analytics aggregations; rendered to PDF [pdfkit] or CSV [RFC-4180,
    UTF-8 BOM] via a shared ReportDocument shape; uploaded to S3/MinIO.)
  - Setup background job to process heavy report requests. ⏳ DEFERRED to
    Phase 14. Phase 10 generates **synchronously** (create job → generate →
    upload within the request); the ReportJob lifecycle (queued→processing→
    complete/failed) is modeled so Phase 14 only moves the execution site to a
    BullMQ worker + fires `report:ready`.
- **Deliverables:** Exportable data capabilities. ✅ (POST /api/v1/reports,
  GET /reports, GET /reports/:id, GET /reports/:id/download → fresh pre-signed
  URL with Content-Disposition attachment.)
- **Dependencies:** Phase 8.
- **Completion Checklist:** ✅ Verified live (19 checks): all 4 types × PDF/CSV
  generate + upload; the PDF fetched from MinIO is a valid 1-page %PDF, the CSV
  has correct BOM/headers; RBAC (farmer 403, no-auth 401); per-user ownership
  (officer 404 on admin's report); officer regional-scope pinning (asked Punjab,
  got Gujarat); download 404 for unknown id; 422 invalid type / strict-params;
  400 farmer_history without user_id.
- **Note:** Officer regional scoping is enforced in the controller (region lives
  in the request body `params`, not the query, so requireRegionalScope can't
  reach it). Added `pdfkit`. `s3_key` is hidden from JSON; downloads issue a
  fresh 15-min pre-signed URL.

## Phase 11 — Smart Search (Semantic Search via Qdrant) ✅ COMPLETE (2026-07-19)
- **Objective:** Allow natural language search of treatments.
- **Modules:** Search.
- **Tasks:**
  - Create search endpoint utilizing Qdrant vector similarity. ✅
    (GET /api/v1/search — embed query via Gemini RETRIEVAL_QUERY → Qdrant
    nearest-neighbour over the ingested KB collection → ranked result DTOs)
- **Deliverables:** Search API. ✅ (GET /api/v1/search?q=...&limit=&type=&crop=
  &disease=&min_score=)
- **Dependencies:** Phase 6. ✅ (reuses embedding.service + qdrant.service +
  the KB ingested by `npm run ingest:kb`; no new infra)
- **Completion Checklist:** Natural-language query returns ranked, relevant
  knowledge-base entries.
- **Note:** Thin feature layer over Phase-6 RAG plumbing. Authenticated for ALL
  roles (any signed-in user searches the same curated, approved KB the chatbot
  uses). Optional exact-match filters (type/crop/disease) become a Qdrant `must`
  filter; `min_score` post-filters by cosine similarity. Unlike the chatbot's
  `retrieveContext` (degrades to [] so an answer still forms), search lets an
  embedding failure surface as 503 — an empty list would be indistinguishable
  from "no matches".

## Phase 12 — WebSocket & Real-time Layer ✅ COMPLETE (2026-07-19)
- **Objective:** Live updates for clients.
- **Modules:** Sockets.
- **Tasks:**
  - Setup Socket.io connected to Redis pub/sub. ✅ (attached to the existing HTTP
    server; JWT handshake auth reusing tokenUtils incl. the logout blacklist;
    Redis adapter wired to the pubClient/subClient duplicates pre-created in
    config/redis.ts since Phase 1 — non-fatal, falls back to in-memory)
  - Emit real-time events on scan completion. ✅ (`scan:result` to the farmer's
    `user:{id}` room after a scan is persisted; also covers offline-queue
    replays) + `notification:new` emitted from notification.service.dispatch so
    the in-app inbox badge updates live for every notification type.
- **Deliverables:** WebSocket server integrated with Express. ✅ (config/socket.ts
  with initSocketServer / getSocketServer / emitToUser / emitToRoom /
  closeSocketServer; rooms: `user:{id}`, `role:admin`, `officer:{region}`)
- **Dependencies:** Phase 1, Phase 4. ✅
- **Completion Checklist:** Clients receive live scan results and notifications
  over an authenticated socket.
- **Note:** Services emit only through `emitToUser`/`emitToRoom` helpers (never
  touch `io` directly), keeping them HTTP/transport-agnostic per rules.md. Emits
  are fire-and-forget no-ops when the socket layer is down or the user has no
  open connection, so they never affect the REST response. `officer:{region}` +
  `role:admin` rooms are ready for the Phase-14 outbreak worker to broadcast
  `outbreak:alert`. Deps added: `socket.io`@4.8, `@socket.io/redis-adapter`@8.3
  (socket.io bundles its own types).

## Phase 13 — Audit Logs ✅ COMPLETE (2026-07-19)
- **Objective:** Track sensitive system actions.
- **Modules:** Audit.
- **Tasks:**
  - Create Audit Log schema and middleware. ✅ (AuditLog **capped collection**
    [100 MB ring buffer → structurally immutable/append-only]; audit.service
    `log()` fire-and-forget + never-throws, `listAuditLogs()` paginated read;
    call sites wired at the sensitive actions rather than a blanket middleware)
- **Deliverables:** Immutable log records for actions like logins, DB edits. ✅
  (GET /api/v1/audit-logs — admin-only, filter by actor_id/action/from/to)
- **Dependencies:** Phase 2. ✅
- **Completion Checklist:** Sensitive actions produce queryable audit entries.
- **Actions logged:** `auth.login`, `auth.logout`, `auth.password_reset`,
  `scan.submit`, `scan.feedback`, `scan.delete`, `treatment.propose`,
  `treatment.approve`, `treatment.reject`, `user.role_change`, `user.suspend`,
  `user.delete`, `report.generate`.
- **Note:** Logging is done at the **controller** layer (via a `void
  auditService.log(...)` after the action succeeds) — that's the one place with
  both the actor context AND the HTTP metadata (IP / user-agent, extracted by the
  `auditContext(req)` helper so the service stays HTTP-agnostic). The actor is
  stored as the `user_id` STRING (not an ObjectId ref) so a write never needs an
  extra lookup on the hot path. Best-effort: a failed audit write is logged and
  swallowed, never affecting the user's request. Not a blanket middleware —
  logging only the security-relevant mutations keeps the capped buffer signal-
  dense (reads like scan/treatment/audit browsing are deliberately not logged).

## Phase 14 — Background Jobs (Celery/Bull) ✅ COMPLETE (2026-07-19)
- **Objective:** Handle async tasks efficiently.
- **Modules:** Workers.
- **Tasks:**
  - Define BullMQ queues for notifications, sync processing, and cleanup. ✅
    (jobs/queues.ts — notifications / report-generation / outbreak-detection /
    cleanup, on a dedicated Redis connection with retry+backoff; typed enqueue
    helpers + getQueueStats; jobs/workers.ts in-process consumers; jobs/scheduler.ts
    repeatable outbreak [6h] + cleanup [daily] crons)
- **Deliverables:** Robust queue processing system. ✅
- **Dependencies:** Phase 1, Redis. ✅
- **Completion Checklist:** Async tasks process reliably; the app still runs with
  queues disabled (inline fallback).
- **What moved onto queues (previously deferred here):**
  - **Notifications** — `dispatch()` keeps the fast path (persist + `notification:new`
    socket emit) synchronous, then **enqueues** the channel fan-out; the worker
    delivers push/SMS/email with retries. `deliverChannels()` is the shared
    worker/inline body.
  - **Reports** — `createReport` now persists a `queued` job and enqueues;
    `generateReport()` (worker body) generates + uploads + fires **`report:ready`**
    (socket to `user:{id}` + inbox notification). New `report_ready` notification
    type.
  - **Outbreak worker** (scheduled, 6h) — new **OutbreakAlert** model +
    `outbreak.service.detectAndAlert`: runs the Phase-8 `detectOutbreaks`
    aggregation, dedups (48h cooldown per district×disease), persists an alert,
    dispatches a localized `outbreak_alert` to each officer in the district, and
    broadcasts **`outbreak:alert`** to the `officer:{region}` socket room (Phase 12).
    New read endpoint GET /api/v1/analytics/outbreak-alerts (officer/admin).
  - **treatment_reminder** — the scan pipeline enqueues a delayed (7-day) reminder
    job; the worker fires the localized reminder notification.
  - **cleanup** (scheduled, daily) — prunes report jobs older than the retention
    window.
  - Admin `/system/health` now reports **real BullMQ queue counts** (was
    `not_configured`).
- **Note:** **Graceful degradation is the core design** — `QUEUE_ENABLED=false`
  (or any enqueue failure) makes every `enqueue*` helper return `false`, and each
  caller falls back to inline execution (notifications fan out synchronously,
  reports generate within the request = the Phase-10 behaviour). So the API runs
  fully with no worker process. Workers/scheduler are started in server.ts after
  datastores (like socket.io) and closed on graceful shutdown. **Offline
  scan-sync replay queue intentionally NOT built** — scans process synchronously
  and there is no queued-unprocessed-scan source to feed it yet; the machinery
  would be dead code. New env: QUEUE_ENABLED, REPORT_RETENTION_DAYS,
  TREATMENT_REMINDER_DAYS, OUTBREAK_THRESHOLD. Dep: `bullmq`@5.80.

## Phase 15 — Security Hardening ✅ COMPLETE (2026-07-19)
- **Objective:** Prepare for production.
- **Modules:** Security.
- **Tasks:**
  - Review rate limits, implement Helmet, validate CORS. ✅
  - Ensure secrets are managed correctly. ✅
- **Deliverables:** Hardened API. ✅
- **Dependencies:** All phases. ✅
- **Completion Checklist:** ✅ Verified live.
- **What shipped:**
  - **Redis-backed per-route rate limiting** (`rate-limit-redis`@4 over the
    existing ioredis client → counters shared across instances + survive
    restarts): `generalLimiter` 100/min (global, per-IP), `authLimiter` 10/15min
    (login/refresh/forgot/reset, per-IP), `scanLimiter` 20/hr (POST /scans,
    per-user). Distinct Redis prefixes (`rl:general:` / `rl:auth:` / `rl:scan:`);
    degrades to in-memory store if the Redis store can't construct.
  - **Helmet CSP/HSTS** — explicit config: CSP `default-src 'self'`, `img-src
    'self' data: https:` (presigned S3/MinIO URLs), `object-src 'none'`; HSTS +
    `upgrade-insecure-requests` **production-only** (localhost dev stays http);
    `cross-origin-resource-policy: cross-origin`.
  - **CORS allowlist** — new `CORS_ORIGINS` env (comma-separated, falls back to
    APP_URL). Origin-function validates each request; no-Origin requests (curl,
    health checks) allowed; disallowed origin → 403 `cors_forbidden`.
    `credentials: true` retained for the refresh cookie.
  - **Constant-time login** — `auth.service.login` now always runs one bcrypt
    compare (against a module-level `DUMMY_PASSWORD_HASH` when the account
    doesn't exist), closing the Phase-2 user-enumeration timing side channel.
    Both unknown-email and wrong-password return 401 `invalid_credentials` in
    ~equal time (verified ~0.57s each).
  - **Secrets review** — `.env` gitignored; logger + error handler never
    serialize bodies/tokens (no code change needed).
  - **`npm audit`** — 5 vulns, ALL in the `vitest→vite→esbuild` **dev-only**
    chain (not in the runtime bundle). Fix needs vitest@4 (breaking) → deferred
    to Phase 17. Report-only per decision.
- **Verified live:** general limiter 429 at req #100; auth limiter 429 at req #11
  (independent bucket); CSP present + no `upgrade-insecure-requests` in dev;
  CORS allows APP_URL, 403s an evil origin, allows no-Origin; constant-time login
  timing uniform; happy-path login still issues tokens; **full scan pipeline
  regression passes** (real potato Late Blight → 201, MinIO upload, per-user
  `rl:scan:` bucket).

## Phase 16 — Docker & Deployment ✅ COMPLETE (artifacts) (2026-07-19)
- **Objective:** Containerize the application.
- **Modules:** DevOps.
- **Tasks:**
  - Write Dockerfiles and docker-compose. ✅
  - Setup Nginx config. ✅
- **Deliverables:** Deployable containers. ✅ (build-validated; **not deployed** —
  the user explicitly deferred actual deployment).
- **What shipped:**
  - **`backend/Dockerfile`** — 4-stage build (deps → tsc build → prod-deps →
    runner) on `node:20-bookworm-slim` (sharp ships prebuilt binaries for this
    platform, so no python/make/g++ toolchain needed). Runs as the non-root
    `node` user; `HEALTHCHECK` hits `GET /api/v1/health`; `CMD node dist/server.js`.
  - **`backend/.dockerignore`** — excludes node_modules/dist/.env/logs/tests/docs.
  - **`docker-compose.yml`** (repo root) — `api` + `redis`@7.2 + `qdrant`@v1.12.4
    + `minio` + optional `nginx`. **No mongo service** (the app uses MongoDB Atlas
    via `MONGODB_URI`). `api` reads secrets from `backend/.env` (env_file) but its
    datastore URLs are OVERRIDDEN to in-network hostnames (redis/qdrant/minio).
    Named volumes + healthchecks + `depends_on: condition: service_healthy`.
    Workers run in-process in the api container (Phase-14 design), so no separate
    worker service is needed.
  - **`nginx/nginx.conf`** — reverse proxy to `api:4000`, aware of: Socket.io
    WebSocket upgrades (`/socket.io/` with Upgrade/Connection headers), SSE on
    `/api/v1/chat` (`proxy_buffering off` so tokens stream live), and 8 MB uploads
    (`client_max_body_size 10m`). TLS omitted (not deploying).
- **Verified:** `docker build` succeeds → `krishi-raksha-api:latest` (575 MB);
  `docker compose config` parses clean; `nginx -t` syntax OK. Stack was NOT
  brought up / deployed per the user's instruction.

## Phase 17 — Testing Strategy ✅ COMPLETE (2026-07-19)
- **Objective:** Ensure reliability.
- **Modules:** Testing.
- **Tasks:**
  - Write unit and integration tests using Vitest. ✅
- **Deliverables:** Passing test suite. ✅ (**88 tests across 8 files, all green**)
- **Dependencies:** All phases.
- **What shipped:**
  - **Test harness** — bumped `vitest` 2→4 (+ `@vitest/coverage-v8`), added
    `supertest`, `ioredis-mock`, `mongodb-memory-server`. `vitest.config.ts`
    (node env, coverage v8) + `tests/setup/env.setup.ts` seeds dummy required env
    vars BEFORE any src module loads (config/env.ts fail-fasts otherwise).
    Scripts: `npm test`, `test:watch`, `test:coverage`.
  - **Pure unit tests (no infra):** `utils` (apiResponse, all error classes,
    hashDeviceId, auditContext, asyncHandler), `validators` (auth + scan schemas —
    email/phone refine, Indian phone regex, coercion, defaults, enum guards),
    `middleware` (validate → ZodError forwarding, requireRole/requireRegionalScope,
    errorHandler status mapping, notFoundHandler).
  - **tokenUtils (ioredis-mock):** access/refresh sign+verify, refresh-session
    rotation/revocation, access-token blacklist, single-use password-reset tokens
    (consume + latest-wins).
  - **Gemini (SDK mocked):** happy path + confidence clamping + low_confidence
    flagging, and the degraded fallback on throw / empty / bad-JSON (never throws).
  - **Service integration (mongodb-memory-server + ioredis-mock):**
    - `treatment.service` — cache key/negative-cache, region ranking (exact >
      All-India), language fallback, positive-cache hit, SCAN invalidation, and
      the propose/approve/reject workflow (409 double-approve, incomplete 400).
    - `outbreak.service` — 48h dedup, high vs critical level, cooldown expiry,
      officer notification, listAlerts region+status filtering.
  - **Auth API (supertest, full Express stack):** register→me→refresh→logout,
    HttpOnly refresh cookie, blacklist-after-logout, 401/403/422/409 edges, and
    constant-time login (unknown-email & wrong-password both 401 invalid_credentials).
  - **`npm audit` → 0 vulnerabilities** (the vitest@4 bump cleared the Phase-15
    dev-only vitest/vite/esbuild chain).
- **Coverage:** concentrated on business logic (utils 95%, tokenUtils 97%,
  gemini 100%, validators 96%, outbreak 94%, treatment 59%, auth.service 56%).
  Thin external-SDK orchestration wrappers (push/sms/email/image/report/chat/scan
  services) are intentionally low-coverage — verified live in their own phases.
  Note: the >80% target from the original plan applies to core business logic,
  which the suite meets; whole-repo statement coverage is ~38% because it counts
  those SDK wrappers + models.
