# Backend Project Memory

## Current Status
Phase 17 — Testing Strategy: **COMPLETE** — 🎉 **ALL 17 PHASES DONE**
(Phase 16 Docker artifacts built but NOT deployed, per user.)

---

## Completed Modules
- **Phase 1 — Foundation Setup** (2026-07-19)
  - Project scaffolded under `backend/` (npm, TypeScript strict mode).
  - Env validation, DB/Redis connections, logger, error classes, API response
    builder, global middleware, Express app, HTTP server with graceful shutdown.
  - Health check verified: `GET /api/v1/health` → 200 with mongodb+redis status.
- **Phase 2 — Authentication & RBAC** (2026-07-19)
  - User Mongoose model (roles, languages, bcrypt hashing, password never
    serialized).
  - JWT utilities: access + refresh tokens, Redis-backed refresh sessions
    (rotation) and access-token blacklist.
  - Middleware: authenticateJWT, requireRole/requireRegionalScope (RBAC),
    validate (Zod), asyncHandler, Express req.user type augmentation.
  - Auth service + thin controller + routes: register, login, refresh, logout.
    Refresh token delivered as HttpOnly cookie; access token in body.
  - Minimal users module: `GET /users/me` (any role), `GET /users` (admin only).
  - Verified end-to-end via curl: register→me, 401 no-token, 403 RBAC,
    wrong-password 401, refresh rotation (old token invalidated → 401),
    logout→blacklist (revoked token 401), 422 validation, 409 duplicate.
- **Phase 3 — Gemini AI Integration** (2026-07-19)
  - **Provider swapped from Groq → Google Gemini** (per user request + provided
    key). SDK `@google/genai` v2.12, model `gemini-2.5-flash`.
  - Versioned classification prompt (`PROMPT_VERSION = v1`) + supported crops.
  - `gemini.service.ts` `classifyLeafImage(base64, mime, crop)` → structured
    `ClassificationResult` (disease_label, scientific_name, confidence, is_healthy,
    top_k, model_version, low_confidence). Enforced JSON via responseSchema;
    temp 0.1; confidence threshold from env; graceful fallback (no throw) on
    API/parse failure.
  - Verified LIVE against real dataset images:
    - Tomato Late Blight → "Late Blight" / Phytophthora infestans, 0.95 ✓
    - Healthy Apple → "Healthy", is_healthy true, 0.98 ✓
    - Non-leaf 1×1 px → "Unidentifiable", 0.1, low_confidence ✓
    - Invalid key → degraded fallback result, did NOT throw ✓
    - Missing GEMINI_API_KEY → fail-fast env error on startup ✓
- **Phase 4 — Scan Pipeline** (2026-07-19)
  - MinIO (Docker `krishi-minio` :9000/:9001) as S3-compatible storage; S3 env
    vars now required; `config/s3.ts` client + `ensureBucket` bootstrap on start.
  - Scan Mongoose model (prediction subdoc, GeoJSON 2dsphere location, indexes,
    SUPPORTED_CROPS incl. apple). image_s3_key hidden from JSON output.
  - Multer memory-storage upload middleware (8MB, jpeg/png/webp, typed errors).
  - image.service: Sharp EXIF-strip + orientation + resize (1024 store / 512
    classify), S3 upload (private), 15-min presigned GET URLs. Invalid image →
    typed 400.
  - scan.service orchestrates: process image → Gemini classify → persist → return.
    Plus list (paginated), get (fresh presigned URL), feedback, soft-delete.
  - Endpoints: POST /scans, GET /scans, GET /scans/:id, PATCH /scans/:id/feedback,
    DELETE /scans/:id — all JWT-protected, Zod-validated.
  - **Fixed Gemini truncation bug:** gemini-2.5-flash "thinking" tokens counted
    against maxOutputTokens and cut off the JSON (→ fallback). Set
    thinkingConfig.thinkingBudget=0 and maxOutputTokens=800. Now reliable.
  - Verified LIVE end-to-end: real tomato Late Blight leaf → 201, stored in
    MinIO, Gemini → "Late Blight"/Phytophthora infestans 0.95 + top_k; presigned
    URL fetch → HTTP 200 valid JPEG, EXIF stripped (hasEXIF:false), 256px.
    List/get/feedback/delete all pass; edge cases 400 (no image / invalid image),
    422 (bad crop / bad feedback), 401 (no auth), 404 (deleted). ✓

- **Phase 5 — Treatment Database & Recommendation Engine** (2026-07-19)
  - Treatment model (disease_label, crop enum, regions[], seasons[], chemical +
    organic subdocs, prevention[], source, verified_by/at, status active/archived,
    localized {en,hi,gu} nested object, indexes on disease+crop+regions and
    crop+status; __v hidden in JSON).
  - TreatmentProposal model (proposal_id, base_treatment ref [null=new], proposed_by,
    proposed_data Mixed, diff Mixed, status pending_review/approved/rejected,
    reviewed_by/at, rejection_reason, source_citation; indexes on status+date,
    proposed_by+date).
  - treatment.service:
    - `getForDisease(disease, crop, region?, lang)` — Redis-cached
      (`treatment:{disease}:{crop}:{region}:{lang}`), positive TTL 1h, NEGATIVE
      cache 5m (sentinel `__none__`) to shield Mongo from repeated misses (Healthy/
      Unidentifiable). Single `$in:[region, 'All India']` query + client-side rank
      (exact region beats All-India fallback). Cache read/write failures never fail
      the request (logged warn). Returns language-localized summary/prevention_text
      (falls back to en).
    - `invalidateTreatmentCache(disease, crop)` — SCAN-based (non-blocking) DEL of
      all region×lang variants; called after an approval mutates a treatment.
    - listTreatments (paginated, filters crop/disease/region/status), getTreatmentById.
    - Proposal workflow: proposeTreatment (new requires disease_label+crop → 400
      otherwise; edit requires existing base treatment → 404 otherwise),
      listProposals (admin, populates proposer), getProposalById (populates
      proposer+reviewer), approveProposal (apply proposed_data to Treatment
      [create trt_<nanoid> or patch existing, never touching id/timestamps],
      compute shallow diff, mark reviewed, invalidate cache), rejectProposal
      (reason required). Double-approve/reject → 409 proposal_not_pending.
  - treatment.validators (Zod, `.strict()` on proposed_data blocks field injection),
    thin treatment.controller, treatment.routes. **Route ordering:** static
    `/proposals*` declared BEFORE dynamic `/:id` so Express doesn't capture
    "proposals" as an id. RBAC: browse=any auth role, propose=agronomist+admin,
    proposal queue/approve/reject=admin only. Mounted at /api/v1/treatments.
  - **Scan pipeline linked to treatments:** scan.service.submitScan now looks up
    getForDisease (skips when is_healthy or confidence 0 → treatment:null), sets
    treatment_ref on the scan, and returns `{scan, treatment}`. scan.controller
    passes `req.user.region` (thanks to the Phase-4-fix region-in-token) and
    includes `treatment` in the 201 response. getScanById populates treatment_ref.
  - Seed: `src/scripts/seedTreatments.ts` + `npm run seed:treatments` — 5 verified
    treatments (Tomato Late/Early Blight, Potato Late Blight, Apple Scab, Rice
    Blast) with en/hi/gu localization; disease_labels match Gemini output. Idempotent
    upsert by treatment_id.
  - Verified LIVE end-to-end (19/19 API tests + scan integration): browse/filter/get,
    404 unknown id, RBAC 403s (farmer can't propose, agronomist can't see queue),
    propose→approve (new treatment created + browsable), propose→reject (with reason),
    double-approve/reject 409, field-injection 422, missing-field 400. Real tomato
    Late Blight scan (farmer lang=hi, region=Gujarat) → 201 with Hindi-localized
    treatment; GET populated treatment_ref=trt_tomato_late_blight; Redis key
    `treatment:Late Blight:tomato:Gujarat:hi` set; healthy apple leaf → treatment:null;
    approving an edit invalidated the cache key. ✓

- **Phase 6 — AI Chatbot (RAG Pipeline)** (2026-07-19)
  - **AI split: Groq for chat, Gemini for embeddings.** User supplied a Groq key;
    the original plan earmarked Groq for chat. Chat LLM = Groq
    `llama-3.3-70b-versatile` (streaming). Embeddings = Gemini
    `gemini-embedding-001` (3072-dim) — reuses the existing Gemini key, so NO
    HuggingFace provider needed (plan's Option C avoided). Both verified live.
  - Infra: Qdrant in Docker (`krishi-qdrant` :6333/:6334, image v1.12.4, volume
    `krishi_qdrant_data`). Deps added: `groq-sdk`@1.3.0,
    `@qdrant/js-client-rest`@1.18.0.
  - env: GROQ_API_KEY (**required from Phase 6**), GROQ_CHAT_MODEL,
    GEMINI_EMBED_MODEL, QDRANT_API_KEY (optional/cloud), EMBED_DIMENSION=3072.
  - embedding.service: Gemini embeddings with taskType RETRIEVAL_DOCUMENT
    (ingest) / RETRIEVAL_QUERY (search); throws ServiceUnavailable on failure
    (chat layer degrades to ungrounded).
  - qdrant.service: client (checkCompatibility:false — client 1.18 vs server
    1.12 skew is harmless for the REST surface used), initializeQdrantCollection
    (3072/Cosine, non-fatal on failure like ensureBucket), upsertDocuments,
    semanticSearch (returns [] on failure → answer without RAG).
  - chat.prompt (versioned CHAT_PROMPT_VERSION=v1): multilingual, grounded,
    safety posture for agrochemicals; buildRAGUserPrompt injects scan + KB context.
  - ChatSession model (session_id, user_id, messages[{role,content,timestamp}],
    context_scan_id; index user_id+updatedAt).
  - chat.service: retrieveContext (embed→search→context+sources, never throws),
    streamChatResponse (async generator; history trimmed to last 10 turns per
    rules.md; Groq stream), plus session ops: getSessionHistory, getScanContext
    (grounds chat to an owned scan), persistExchange (upsert session, push
    user+assistant), listSessions, getSession, deleteSession.
  - chat.validators, chat.controller (**SSE streaming** — headers flushed then
    `data:` token events, final `{done,session_id,sources}`; mid-stream errors
    become an SSE error event since JSON handler can't set status post-flush),
    chat.routes. Mounted /api/v1/chat. Endpoints: POST /chat (SSE),
    GET /sessions, GET /sessions/:id, DELETE /sessions/:id.
  - Ingestion: `scripts/ingestKnowledgeBase.ts` + `npm run ingest:kb` — embeds
    active treatments → Qdrant. Idempotent: point IDs are deterministic UUIDv5
    from treatment_id (Qdrant rejects raw `trt_` string IDs — must be UUID/uint);
    re-ingest updates, doesn't duplicate (verified 6→6). Qdrant init also runs on
    server startup.
  - Verified LIVE end-to-end (17 checks): EN chat streamed a fully KB-grounded
    answer ("Mancozeb 75% WP at 2.5 g/L", organic + prevention pulled verbatim
    from the seeded treatment, incl. the Phase-5 approved-edit citation "ICAR 2026
    revised") with sources[]; session continuation replays history; Hindi query →
    382 Devanagari chars streamed AND persisted to Mongo (the console `????` is
    Windows cp1252, not the API); session list/get/delete + 404s; 422 empty
    message; 401 no auth. ✓  (6 treatments ingested = 5 seeds + 1 from the Phase-5
    approval test.)

- **Phase 7 — Notification System** (2026-07-19)
  - Models: `Notification` (notification_id, user_id ref, type enum, title, body,
    data, channels[], per-channel `delivery` Mixed {sent|failed|skipped}, is_read,
    sent_at; indexes user_id+createdAt and user_id+is_read) and `PushSubscription`
    (user_id ref, unique endpoint, keys{p256dh,auth}, user_agent; index user_id).
    Both hide __v in JSON.
  - **Channel services are ENV-GATED** — each checks its keys at module load,
    logs an info/warn once, and every send returns a `DeliveryState`
    ('skipped' when unconfigured, else 'sent'/'failed'). None throw, so the app
    boots and runs with NO provider keys (verified: 3 startup "not configured"
    warnings).
    - `push.service` (web-push/VAPID): sends to all of a user's subscriptions;
      prunes dead subs on 404/410; `getVapidPublicKey()` for clients.
    - `sms.service` (Twilio): E.164 +91 normalization for bare 10-digit numbers.
    - `email.service` (SendGrid): `sendEmail` (notification channel) +
      `sendPasswordResetEmail` (auth path); `isEmailConfigured()`.
  - `templates/notification.templates.ts`: multilingual en/hi/gu copy
    (scan_result, outbreak_alert, treatment_reminder) → `{title, body}`, reused
    across in-app/push/SMS/email; falls back to en.
  - `notification.service` orchestrator: `dispatch()` **persists first** (in-app
    inbox is the reliable channel) then best-effort fans out to channels per
    `DEFAULT_CHANNELS[type]`, recording `delivery`. Plus listNotifications
    (paginated + unread count), markRead, markAllRead, subscribePush (idempotent
    upsert by endpoint → created/updated), unsubscribePush (owner-scoped).
  - API: `notification.validators`, thin `notification.controller`,
    `notification.routes` mounted /api/v1/notifications. Endpoints:
    GET / (list, ?unread=true), PATCH /:id/read, PATCH /read-all,
    GET /vapid-public-key, POST /subscribe (201 new / 200 update),
    DELETE /subscribe. Static paths before dynamic /:id/read.
  - **Scan pipeline integration:** scan.service.submitScan dispatches a
    localized `scan_result` notification **fire-and-forget** (`void …catch`)
    after persisting — skipped for healthy/zero-confidence scans. Never delays
    or fails the scan response.
  - **Password reset (unblocked from Phase 2):** tokenUtils gains
    signPasswordResetToken / verifyPasswordResetToken / consumePasswordResetToken
    — a purpose-scoped ('pwd_reset') 1h JWT whose jti is tracked in Redis
    (`pwdreset:{userId}`) for single-use + latest-wins. auth.service
    forgotPassword (generic response — NO account enumeration; emails a
    `${APP_URL}/reset-password?token=…` link) + resetPassword (verify → set
    password [pre-save re-hash] → consume token → revoke refresh session).
    Endpoints POST /auth/forgot-password, POST /auth/reset-password.
  - env: added SENDGRID_FROM_EMAIL, VAPID_SUBJECT (default
    mailto:support@krishiraksha.in); all Phase-7 notification vars remain
    OPTIONAL. Deps: `web-push`@3.6, `twilio`@6.0, `@sendgrid/mail`@8.1,
    `@types/web-push`@3.6 (dev).
  - Verified LIVE end-to-end (23/23): inbox empty→list; vapid-public-key null
    (unconfigured); subscribe 201 then same-endpoint 200 update; missing-keys
    422; unsubscribe 200 then 404; no-auth 401; real tomato Late Blight scan
    (lang=hi) → 201 AND a persisted Hindi `scan_result` notification
    (channels:[push], delivery:{push:skipped}, data.scan_id); mark-read 200 +
    unknown-id 404; read-all; ?unread=true empty; forgot-password identical
    response for known vs unknown email; reset-password valid→200, new-pw
    login 200, old-pw 401, token reuse 400 (single-use), garbage token 400,
    weak password 422. ✓

- **Phase 8 — Analytics & Predictive Dashboard** (2026-07-19)
  - `analytics.service`: read-only MongoDB aggregation pipelines over Scans —
    getOverview (totals: scans/healthy/diseased/low_confidence/distinct
    diseases+crops), getScanTrends (time series, day/week/month via
    $dateToString), getTopDiseases (excludes healthy), getDiseaseHeatmap
    (grouped by coords rounded to 2dp ≈1km; excludes healthy + unlocated [0,0]),
    getModelAccuracy (correct/incorrect ratio from feedback; null when no
    feedback), detectOutbreaks (on-demand district+disease hotspots ≥ threshold).
  - **Region lives on User, not Scan** → region-filtered/grouped pipelines
    `$lookup` into `users` + $unwind + match on `_user.region`. Helper
    `regionStages(region)` returns [] when no region (skips the join to stay
    cheap). `baseMatch` always excludes is_deleted and applies the createdAt
    window + optional crop/disease. Pipeline stages typed as mongoose
    `PipelineStage` (the typed `Scan.aggregate` rejects `Record<string,unknown>`).
  - `analytics.validators` (shared date-range filter: from/to ISO optional,
    region/crop/disease, plus granularity / limit / threshold per endpoint),
    thin `analytics.controller` (resolves the window — **defaults to last 30
    days** when unset — and echoes {from,to,region} in `meta`),
    `analytics.routes` mounted /api/v1/analytics.
  - **RBAC:** router-level `requireRole('extension_officer','admin')` +
    `requireRegionalScope` on ALL routes (officers auto-pinned to their own
    district — a client-supplied region is overwritten). `model/accuracy` is
    additionally `requireRole('admin')`.
  - Endpoints: GET /overview, /scans (?granularity), /diseases/top (?limit),
    /diseases/heatmap, /outbreaks (?threshold), /model/accuracy.
  - **Outbreak worker DEFERRED to Phase 14** — Phase 8 detects hotspots
    on-demand; persisting OutbreakAlert docs + auto-notifying officers (the
    `outbreak_alert` template/channels already exist from Phase 7) is the
    scheduled worker in Phase 14.
  - Verified LIVE (19 checks, using 28 synthetic scans across Gujarat/Punjab +
    the seeded admin/officer users, all cleaned up after): farmer 403, no-auth
    401, admin sees all regions (33 scans/5 diseases), officer auto-scoped to
    Gujarat (23 scans), officer passing region=Punjab still forced to Gujarat;
    trends day/week/month; top diseases (Healthy excluded, officer regionally
    filtered); heatmap (located non-healthy, coord-grouped); outbreaks
    threshold=8 found both clusters (Gujarat/Late Blight 14, Punjab/Rice Blast
    8), officer saw only Gujarat; model accuracy 8/9=0.889 admin-only (officer
    403); date-range narrowing; empty future window → zeros; 422 on bad
    granularity/date/limit. ✓

- **Phase 9 — Admin Panel APIs** (2026-07-19)
  - **User model gained `is_deleted`** (default false) — admin soft-delete,
    distinct from `is_active` (suspension). Login already rejects inactive users,
    so both suspended and deleted users can't authenticate.
  - `admin.service`: listUsers (filter role/region/active + case-insensitive
    `search` across name/email/phone with regex metachars escaped; excludes
    is_deleted), getUserDetail (+ scan_summary aggregation: total/healthy/
    diseased/last_scan_at), changeUserRole, setUserSuspended, softDeleteUser,
    getSystemHealth (mongo db.stats + parsed Redis INFO + queue placeholder).
  - **Safety rules in the service:** an admin can NEVER role-change/suspend/delete
    their OWN account (`assertNotSelf` → 400 self_action_forbidden). Suspending
    or deleting a user (and changing a role) revokes their refresh session
    (`revokeRefreshSession`) so it takes effect immediately. Delete sets
    is_deleted=true AND is_active=false.
  - `admin.validators` (Zod; **admin IS assignable via role-change**, unlike
    public registration — an admin can promote a trusted user), thin
    `admin.controller` (passes req.user.id through for the self-guard),
    `admin.routes` mounted /api/v1/admin with authenticateJWT + requireRole
    ('admin') at the ROUTER level; static `/system/*` before dynamic `/users/:id`.
  - Endpoints: GET /admin/users (list/search), GET /admin/users/:id (detail),
    PATCH /admin/users/:id/role, PATCH /admin/users/:id/suspend, DELETE
    /admin/users/:id, GET /admin/system/health.
  - **Treatment approval NOT duplicated** — the propose/approve/reject workflow
    already lives under /treatments/proposals* (Phase 5, admin-gated) and is
    reused as-is. Phase 9 only ADDED: treatment.service.approveProposal/
    rejectProposal now dispatch a **fire-and-forget `proposal_reviewed`
    notification** to the proposer (`notifyProposer` helper; dispatch by
    userObjectId=proposed_by; approved msg names the disease, rejected falls back
    to "your submission" for edits + carries rejection_reason in data).
  - **System health `/system/health`:** real Mongo db.stats (collections/objects/
    dataSize) + parsed Redis INFO (used_memory_human/connected_clients/uptime) +
    `queues:{status:'not_configured'}` (BullMQ is Phase 14) + process uptime.
    Both DB reads are guarded (degrade, don't throw).
  - Verified LIVE (24 checks): farmer 403 / no-auth 401; list/search/role-filter/
    detail+scan_summary/404; role change + 409 same-role + 422 invalid + 400
    self-guard; suspend → suspended user login 401 account_inactive → reactivate
    → 400 self-suspend; soft-delete → gone from list → 404 on fetch → 400
    self-delete; system health (8 collections, Redis 1.04M, queues
    not_configured); proposal_reviewed delivered on BOTH approve (names disease,
    treatment_id in data) and reject (rejection_reason in data). All test data
    cleaned up afterward. ✓

- **Phase 10 — Report Generation** (2026-07-19)
  - `ReportJob` model: job_id, requested_by ref, type
    (district_weekly/farmer_history/model_performance/outbreak_incident), params
    Mixed, format (pdf|csv), status (queued/processing/complete/failed), s3_key
    (HIDDEN from JSON), error, completed_at; indexes requested_by+createdAt and
    status+createdAt.
  - `reports/report.renderers.ts`: a normalized `ReportDocument`
    ({title, meta[], tables[{heading,columns,rows}]}) rendered by BOTH renderPDF
    (pdfkit — header, meta lines, per-table column layout w/ page-break guard;
    returns a Promise<Buffer> resolved on stream 'end') and renderCSV (RFC-4180
    quoting, CRLF, **UTF-8 BOM** so Excel reads Devanagari). Presentation split
    from data-gathering so adding a format/type never touches the other side.
  - `report.service`: createReport (persist job FIRST → processing → gather →
    render → uploadBuffer → complete; on error marks 'failed' and rethrows),
    getReport (owner-scoped status), listReports (paginated, owner's jobs),
    getDownloadUrl (fresh pre-signed download URL; 400 report_not_ready if not
    complete). Per-type gatherers pull from analytics.service (getOverview/
    getTopDiseases/getScanTrends for district_weekly, getModelAccuracy for
    model_performance, detectOutbreaks for outbreak_incident) or Scan.find for
    farmer_history (**requires params.user_id → 400 missing_user_id otherwise**).
    Default window = last 7 days.
  - image.service gained generic **`uploadBuffer(key,body,contentType)`** and
    **`getPresignedDownloadUrl(key,filename)`** (sets ResponseContentDisposition:
    attachment). Reports stored at `reports/{user_id}/{job_id}.{fmt}`, private.
  - `report.validators` (type/format enums; `params` `.strict()` blocks unknown
    keys), thin `report.controller`, `report.routes` mounted /api/v1/reports.
    RBAC: requireRole('extension_officer','admin') at router level.
  - **Officer regional scoping enforced in the CONTROLLER**, not middleware:
    report filters live in the BODY `params` (not query), so requireRegionalScope
    can't reach them. The controller overwrites `params.region` with the
    officer's own region before the service runs. (Verified: officer asking
    region=Punjab got a Gujarat report.)
  - Endpoints: POST /reports (create+generate, 201), GET /reports (list),
    GET /reports/:id (status), GET /reports/:id/download (fresh pre-signed URL +
    filename). All owner-scoped (a user only sees their own jobs → 404 otherwise).
  - **Generation is SYNCHRONOUS** (create→generate→upload in one request). The
    job lifecycle is modeled so Phase 14 moves the body to a BullMQ worker +
    fires `report:ready` without changing the API. Deps: `pdfkit` + @types.
  - Verified LIVE (19 checks): all 4 types × PDF/CSV → status complete; PDF
    fetched from MinIO = valid 1-page %PDF (2067 bytes), CSV = BOM + correct
    headers/rows + 7-day window; farmer 403, no-auth 401; officer 404 on admin's
    report + admin 200 on own (ownership isolation); unknown id 404; 422 invalid
    type / strict-params; 400 farmer_history w/o user_id. Test data cleaned up
    (MinIO report objects for deleted test users left as harmless orphans). ✓

- **Phase 11 — Smart Search (Semantic Search via Qdrant)** (2026-07-19)
  - Thin feature layer over the Phase-6 RAG plumbing — **no new datastore, model,
    or ingestion path**. Reuses embedding.service (Gemini RETRIEVAL_QUERY) +
    qdrant.service.semanticSearch + the KB collection seeded by `npm run
    ingest:kb`.
  - `search.service.smartSearch(opts)`: embed query → build optional Qdrant
    `must` filter from exact-match fields (type/crop/disease) → semanticSearch →
    post-filter by `min_score` → map hits to result DTOs
    ({type, title, snippet, score, crop, disease_label, source}). HTTP-agnostic.
  - `search.validators` (SmartSearchQuerySchema: `q` required trim 2–500, `limit`
    coerced 1–50 default 5, optional `type`/`crop`[enum]/`disease`, `min_score`
    coerced 0–1), thin `search.controller` (echoes {query,count,limit} in meta),
    `search.routes` mounted /api/v1/search.
  - **RBAC: authenticated, ALL roles** — any signed-in user searches the same
    curated, approved KB the chatbot uses (`router.use(authenticateJWT)` only).
  - **Failure posture differs from chat:** an embedding-provider failure
    propagates as 503 (an empty list would be indistinguishable from a genuine
    "no matches"). The Qdrant search call still degrades to [] via its own
    try/catch, so a vector-store hiccup returns an empty result set, not an error.
  - Endpoint: GET /api/v1/search?q=&limit=&type=&crop=&disease=&min_score=.
  - typecheck passes clean.

- **Phase 12 — WebSocket & Real-time Layer** (2026-07-19)
  - `config/socket.ts`: Socket.io attached to the existing HTTP server.
    initSocketServer (JWT handshake auth + Redis adapter + rooms),
    getSocketServer, **emitToUser / emitToRoom** helpers (services emit through
    these — never touch `io` directly, staying transport-agnostic per rules.md),
    closeSocketServer. Room-name helpers userRoom/officerRoom/ADMIN_ROOM.
  - **Handshake auth reuses tokenUtils:** `io.use` verifies
    `socket.handshake.auth.token` with verifyAccessToken + isAccessTokenBlacklisted
    (same as REST authenticateJWT) — a revoked/expired token can't open a socket.
    Auth context stashed on `socket.data.auth`.
  - **Rooms:** on connect each socket joins `user:{userId}` (targeted) + role
    rooms — `role:admin`, and `officer:{region}` for extension officers
    (district broadcasts, ready for the Phase-14 outbreak worker).
  - **Redis adapter:** wired to the pubClient/subClient duplicates pre-created in
    config/redis.ts back in Phase 1 (they were reserved for exactly this).
    **Non-fatal** — if pub/sub can't connect, logs a warn and falls back to the
    in-memory adapter (single-instance still works); same degrade-don't-crash
    posture as ensureBucket / Qdrant init.
  - **server.ts:** initSocketServer runs after datastores connect;
    closeSocketServer added to graceful shutdown (before Mongo/Redis disconnect).
  - **Emit points wired:**
    - `scan.service.submitScan` → `emitToUser(userId, 'scan:result', {scan_id,
      crop_type, prediction, treatment})` after persisting (covers offline-queue
      replays too).
    - `notification.service.dispatch` → `emitToUser(user.user_id,
      'notification:new', {notification_id, type, title, body, data, created_at})`
      right after persisting the Notification — live inbox badge for ALL
      notification types. Uses the `user` doc already loaded in dispatch (both
      the userId and userObjectId paths load it), so no extra query.
  - All emits are **fire-and-forget no-ops** when the socket layer is down or the
    user has no open connection — never delay/fail the REST response.
  - Deps: `socket.io`@4.8, `@socket.io/redis-adapter`@8.3 (socket.io bundles its
    own types — no @types needed). typecheck passes clean; no circular deps
    (config/socket imports only redis/tokenUtils/User/env/logger).

- **Phase 13 — Audit Logs** (2026-07-19)
  - `models/AuditLog.ts`: **capped collection** (100 MB ring buffer →
    structurally immutable/append-only; inserts+reads only, oldest roll off).
    Fields: actor_id (user_id STRING), actor_role, action, resource, metadata
    (Mixed), ip_address, user_agent, created_at (explicit — no Mongoose
    `timestamps`, since updatedAt would imply mutability). Indexes
    {actor_id,created_at} + {action,created_at}; __v hidden.
  - `services/audit.service.ts`: `log()` — **fire-and-forget, never throws**
    (failed write logged+swallowed, mirrors notification best-effort);
    `listAuditLogs()` — paginated, filters actor_id/action/from-to, newest-first.
  - `utils/auditContext.ts`: extracts {ipAddress, userAgent} from the Express
    req so controllers pass HTTP metadata while audit.service stays
    HTTP-agnostic (rules.md).
  - Read API: `validators/audit.validators.ts` (AuditLogQuerySchema),
    `controllers/auditlog.controller.ts`, `routes/auditlog.routes.ts` mounted
    /api/v1/audit-logs. **Admin-only** (authenticateJWT + requireRole('admin')).
    GET /audit-logs?page=&limit=&actor_id=&action=&from=&to=.
  - **Logging done at the CONTROLLER layer** (`void auditService.log(...)` after
    the action succeeds) — the one place with BOTH actor context (req.user) AND
    HTTP metadata (ip/user-agent). Not a blanket middleware: only
    security-relevant MUTATIONS are logged (reads/browsing excluded) to keep the
    bounded buffer signal-dense.
  - **Actions wired (13):** auth.login (auth.ctrl, actor=returned user),
    auth.logout, auth.password_reset (**auth.service.resetPassword now returns
    {userId,role}** so the unauthenticated reset can still be attributed),
    scan.submit/feedback/delete, treatment.propose/approve/reject,
    user.role_change/suspend/delete (admin.ctrl), report.generate. metadata
    carries context (crop/disease, new_role, suspended, reason, treatment_id,
    report type/format) — never secrets/tokens.
  - Actor stored as user_id STRING (not ObjectId ref) → no extra lookup on the
    write hot path, no $lookup on reads. typecheck passes clean.

- **Phase 14 — Background Jobs (BullMQ)** (2026-07-19)
  - `jobs/queues.ts`: queue registry (notifications / report-generation /
    outbreak-detection / cleanup) on a **dedicated ioredis connection**
    (maxRetriesPerRequest:null — required by BullMQ, differs from config/redis so
    NOT reused). Typed job payloads (single source of truth for enqueue↔worker),
    enqueue helpers (enqueueNotification/enqueueReport/enqueueTreatmentReminder),
    getQueueStats, closeQueues, isQueuesEnabled. Default job opts: 3 attempts,
    exponential backoff, bounded removeOnComplete/Fail.
  - **Degradation contract (core design):** QUEUE_ENABLED=false (or any enqueue
    failure) → helper returns `false` → caller runs inline. Verified at runtime:
    disabled → enqueue* return false, getQueueStats → {status:'disabled'}. App
    boots + all modules load with queues off (smoke-tested, no circular-init
    crash).
  - `jobs/workers.ts`: in-process Worker per queue, thin glue → services
    (rules.md). notifications worker multiplexes 'deliver'
    (deliverChannels) + 'reminder' (dispatchTreatmentReminder); report worker →
    generateReport; outbreak worker → detectAndAlert; cleanup worker →
    prune old ReportJobs. startWorkers()/stopWorkers(). No-op when disabled.
  - `jobs/scheduler.ts`: repeatable crons — outbreak-detect every 6h
    (pattern '0 */6 * * *', stable jobId), cleanup daily 02:30. registerSchedules().
  - **Notifications moved to queue:** notification.service.dispatch keeps fast
    path sync (persist + `notification:new` socket emit) then **enqueues** the
    channel fan-out. Extracted `deliverChannels(notificationId, channels)` =
    shared worker body + inline fallback (re-reads doc, records `delivery`). Added
    `dispatchTreatmentReminder()` for the delayed reminder job.
  - **Reports moved to queue:** createReport persists `queued` + enqueues (inline
    fallback when disabled); new `generateReport(jobId)` = worker body (gather →
    render → upload → complete → announceReady). **announceReady** fires
    `report:ready` socket event to user:{id} + (async only) an inbox notification.
    New **`report_ready`** NotificationType + default channel ['push']. Fixed the
    S3 key owner resolution (requested_by is ObjectId → look up user_id string).
  - **Outbreak worker:** new `models/OutbreakAlert.ts` (alert_id, district,
    disease_label, scan_count, level high/critical, status active/ack/resolved,
    window_days; dedup index district+disease+createdAt). `services/outbreak.service.ts`
    detectAndAlert(): Phase-8 detectOutbreaks → per hotspot raiseAlert (dedup 48h
    cooldown → persist → notifyOfficers [localized outbreak_alert to each active
    officer in region] → broadcast `outbreak:alert` to officerRoom(region)).
    Threshold from env; critical = ≥4× threshold. + listAlerts() read.
  - **treatment_reminder:** scan.service enqueues a delayed
    (TREATMENT_REMINDER_DAYS=7) 'reminder' job after a diseased scan (no-op if
    queues off). Worker → dispatchTreatmentReminder resolves farmer, renders
    localized template, dispatches.
  - **Read API:** GET /api/v1/analytics/outbreak-alerts (officer/admin,
    region-scoped like the rest of analytics; page/limit/region/status filters).
    OutbreakAlertsQuerySchema + getOutbreakAlerts controller + route.
  - **admin /system/health:** queues now report **real BullMQ counts** via
    getQueueStats (was `not_configured`).
  - server.ts: startWorkers()+registerSchedules() after datastores;
    stopWorkers()+closeQueues() first in graceful shutdown.
  - **NOT built — offline scan-sync replay queue:** scans process synchronously,
    no queued-unprocessed-scan source exists to feed it → would be dead code.
    Deferred until an offline-submission path exists.
  - env added: QUEUE_ENABLED (default true), REPORT_RETENTION_DAYS (30),
    TREATMENT_REMINDER_DAYS (7), OUTBREAK_THRESHOLD (20). Dep: `bullmq`@5.80.
    typecheck clean.

- **Phase 15 — Security Hardening (BullMQ)** (2026-07-19)
  - **Redis-backed per-route rate limiting** — `middleware/rateLimiter.ts`
    rewritten to export three limiters over a shared `rate-limit-redis`@4 store
    (uses the existing ioredis `redis` client, so counters survive restarts and
    span horizontally-scaled instances): `generalLimiter` (100/min per IP, global
    in app.ts), `authLimiter` (10/15min per IP, on login/refresh/forgot/reset),
    `scanLimiter` (20/hr keyed by req.user.id, on POST /scans). Distinct key
    prefixes `rl:general:`/`rl:auth:`/`rl:scan:`. Store construction failure →
    fallback to express-rate-limit in-memory store (degrade-don't-crash).
  - **`connectRedis()` made idempotent** — the rate-limit store issues a command
    at module import, auto-connecting the lazy ioredis client BEFORE bootstrap;
    connectRedis now returns if ready and awaits an in-flight connect instead of
    throwing "already connecting/connected".
  - **Helmet CSP/HSTS** (app.ts) — explicit CSP (default-src 'self', img-src
    'self' data: https:, object-src 'none'); HSTS + upgrade-insecure-requests
    PRODUCTION-ONLY (dev stays http, verified header absent in dev);
    crossOriginResourcePolicy cross-origin.
  - **CORS allowlist** — `CORS_ORIGINS` env (comma-separated, falls back to
    APP_URL) → origin function; no-Origin requests allowed, disallowed → 403
    `cors_forbidden`, credentials:true kept for refresh cookie.
  - **Constant-time login** — auth.service.login always runs one bcrypt.compare
    (real hash or module-level DUMMY_PASSWORD_HASH when user missing), closing
    the Phase-2 user-enumeration timing leak. Both unknown-email and
    wrong-password → 401 invalid_credentials in ~0.57s (verified). account_inactive
    still returned for correct-password-on-suspended.
  - **Secrets review** — .env gitignored; logger/error-handler never serialize
    bodies/tokens. No code change.
  - **`npm audit`** — 5 vulns (3 moderate/1 high/1 critical) ALL in the
    vitest→vite→esbuild dev-only chain; fix needs breaking vitest@4 → deferred to
    Phase 17. Report-only.
  - Dep added: `rate-limit-redis`@^4.2.0 (v6 needs express-rate-limit@8; pinned v4
    for the installed express-rate-limit@7).
  - Verified LIVE: clean boot; general 429 at req#100; auth 429 at req#11
    (independent bucket); CSP present w/o upgrade-insecure-requests in dev; CORS
    allow/deny/no-origin; constant-time timing; happy-path login issues tokens;
    **scan pipeline regression** (real potato Late Blight → 201 + MinIO upload +
    per-user rl:scan bucket). typecheck clean. Test user/scan cleaned from Atlas.

- **Phase 16 — Docker & Deployment (artifacts only; NOT deployed)** (2026-07-19)
  - User explicitly said not to deploy — this phase produced the containerization
    artifacts and build-validated them, nothing was brought up/deployed.
  - **`backend/Dockerfile`** — 4-stage (deps → build [tsc] → prod-deps → runner)
    on `node:20-bookworm-slim` (sharp prebuilt binaries → no python/make/g++).
    Non-root `node` user; HEALTHCHECK → GET /api/v1/health; CMD node dist/server.js.
  - **`backend/.dockerignore`** — node_modules/dist/.env/logs/tests/docs excluded.
  - **`docker-compose.yml`** (repo root) — api + redis@7.2 + qdrant@v1.12.4 +
    minio + optional nginx on a bridge net. **No mongo** (Atlas is external). api
    uses env_file=backend/.env but OVERRIDES REDIS_URL/QDRANT_URL/S3_ENDPOINT to
    in-network hostnames. Named volumes + healthchecks + depends_on service_healthy.
    Workers stay in-process in the api container (Phase-14 design) → no worker svc.
  - **`nginx/nginx.conf`** — reverse proxy → api:4000; WebSocket upgrade for
    /socket.io/, `proxy_buffering off` on /api/v1/chat (SSE), client_max_body_size
    10m (8MB uploads). TLS omitted (not deploying).
  - Verified: `docker build` → krishi-raksha-api:latest (575MB) OK;
    `docker compose config` parses; `nginx -t` syntax OK. Stack NOT started.

- **Phase 17 — Testing Strategy** (2026-07-19)
  - **88 tests across 8 files, all green.** Harness: bumped vitest 2→4 + added
    @vitest/coverage-v8, supertest, ioredis-mock, mongodb-memory-server.
    `vitest.config.ts` (node env, v8 coverage) + `tests/setup/env.setup.ts`
    (seeds dummy required env BEFORE src imports — env.ts fail-fasts otherwise).
    Scripts: test / test:watch / test:coverage.
  - **Unit (no infra):** utils (apiResponse/errors/hashDeviceId/auditContext/
    asyncHandler), validators (auth+scan), middleware (validate/rbac/errorHandler).
  - **Mocked deps:** tokenUtils over ioredis-mock (session rotation, blacklist,
    single-use reset); gemini.service with @google/genai mocked (happy + clamp +
    degraded fallback on throw/empty/bad-json).
  - **Integration (mongodb-memory-server):** treatment.service (region ranking,
    negative cache, SCAN invalidation, propose/approve/reject + 409/400) and
    outbreak.service (48h dedup, high/critical level, cooldown expiry, officer
    notify, listAlerts filters); auth.api via supertest through the real Express
    app (register→me→refresh→logout, 401/403/422/409, constant-time login).
  - **Key gotchas:** vi.mock is hoisted → shared mocks built with `vi.hoisted`;
    vitest 4 rejects arrow `mockImplementation` constructors → mock GoogleGenAI as
    a real `class`; ioredis-mock has no `.call()` (Lua) → the auth API test stubs
    the rate-limit middleware (rate limiting itself was verified live in Phase 15).
  - Coverage concentrated on logic: utils ~95%, tokenUtils ~97%, gemini 100%,
    validators ~96%, outbreak ~94%, treatment 59%, auth.service 56%. SDK-wrapper
    services left to their live-phase verification (whole-repo stmt ~38%).
  - **`npm audit` now clean (0 vulns)** — the vitest@4 bump cleared the Phase-15
    dev-only vitest/vite/esbuild chain. typecheck clean.
  - Deps added (dev): vitest@4, @vitest/coverage-v8, supertest, @types/supertest,
    ioredis-mock, mongodb-memory-server.

## Current Task
Not Started

---

## Files Completed
### Phase 1
- `backend/package.json`, `backend/tsconfig.json`, `backend/.gitignore`
- `backend/.env.example`, `backend/.env` (local, gitignored), `backend/README.md`
- `backend/src/config/env.ts`, `db.ts`, `redis.ts`
- `backend/src/utils/logger.ts`, `errors.ts`, `apiResponse.ts`
- `backend/src/middleware/requestLogger.ts`, `rateLimiter.ts`, `errorHandler.ts`
- `backend/src/routes/health.routes.ts`
- `backend/src/app.ts`, `server.ts`
### Phase 2
- `backend/src/models/User.ts`
- `backend/src/utils/tokenUtils.ts`, `asyncHandler.ts`
- `backend/src/types/express.d.ts`
- `backend/src/middleware/auth.middleware.ts`, `rbac.middleware.ts`, `validate.ts`
- `backend/src/validators/auth.validators.ts`, `user.validators.ts`
- `backend/src/services/auth.service.ts`, `user.service.ts`
- `backend/src/controllers/auth.controller.ts`, `user.controller.ts`
- `backend/src/routes/auth.routes.ts`, `user.routes.ts`
- Modified: `backend/src/app.ts` (cookie-parser + auth/users routes)
### Phase 3
- `backend/src/services/prompts/classification.prompt.ts`
- `backend/src/services/gemini.service.ts`
- Modified: `backend/src/config/env.ts` (Groq block → Gemini; GEMINI_API_KEY
  required, GEMINI_VISION_MODEL/GEMINI_CHAT_MODEL, CONFIDENCE_THRESHOLD)
- Modified: `backend/.env`, `backend/.env.example` (Gemini vars)
- Added dep: `@google/genai`
### Phase 4
- `backend/src/config/s3.ts`
- `backend/src/models/Scan.ts`
- `backend/src/middleware/upload.middleware.ts`
- `backend/src/services/image.service.ts`, `scan.service.ts`
- `backend/src/validators/scan.validators.ts`
- `backend/src/controllers/scan.controller.ts`
- `backend/src/routes/scan.routes.ts`
- `backend/src/utils/hashUtils.ts`
- Modified: `backend/src/config/env.ts` (S3 vars required)
- Modified: `backend/src/server.ts` (ensureBucket on startup)
- Modified: `backend/src/app.ts` (scan routes)
- Modified: `backend/src/services/gemini.service.ts` (thinkingBudget=0,
  maxOutputTokens=800)
- Modified: `backend/.env`, `backend/.env.example` (S3/MinIO vars)
- Added deps: `multer`, `sharp`, `@aws-sdk/client-s3`,
  `@aws-sdk/s3-request-presigner`
### Phase 5
- `backend/src/models/Treatment.ts`, `TreatmentProposal.ts`
- `backend/src/services/treatment.service.ts`
- `backend/src/validators/treatment.validators.ts`
- `backend/src/controllers/treatment.controller.ts`
- `backend/src/routes/treatment.routes.ts`
- `backend/src/scripts/seedTreatments.ts`
- Modified: `backend/src/services/scan.service.ts` (treatment lookup + link,
  returns {scan, treatment}, getScanById populates treatment_ref)
- Modified: `backend/src/controllers/scan.controller.ts` (pass region, include
  treatment in response)
- Modified: `backend/src/app.ts` (treatment routes)
- Modified: `backend/package.json` (seed:treatments script)
### Phase 6
- `backend/src/models/ChatSession.ts`
- `backend/src/services/embedding.service.ts` (Gemini embeddings)
- `backend/src/services/qdrant.service.ts`
- `backend/src/services/chat.service.ts` (RAG + Groq stream + session ops)
- `backend/src/services/prompts/chat.prompt.ts`
- `backend/src/validators/chat.validators.ts`
- `backend/src/controllers/chat.controller.ts` (SSE)
- `backend/src/routes/chat.routes.ts`
- `backend/src/scripts/ingestKnowledgeBase.ts`
- Modified: `backend/src/config/env.ts` (GROQ_API_KEY required, GROQ_CHAT_MODEL,
  GEMINI_EMBED_MODEL, QDRANT_API_KEY, EMBED_DIMENSION)
- Modified: `backend/src/server.ts` (initializeQdrantCollection on startup)
- Modified: `backend/src/app.ts` (chat routes)
- Modified: `backend/package.json` (ingest:kb script)
- Modified: `backend/.env`, `backend/.env.example` (Groq/Qdrant/embed vars)
- Added deps: `groq-sdk`, `@qdrant/js-client-rest`
### Phase 7
- `backend/src/models/Notification.ts`, `PushSubscription.ts`
- `backend/src/services/push.service.ts`, `sms.service.ts`, `email.service.ts`
- `backend/src/services/notification.service.ts` (orchestrator)
- `backend/src/services/templates/notification.templates.ts` (en/hi/gu)
- `backend/src/validators/notification.validators.ts`
- `backend/src/controllers/notification.controller.ts`
- `backend/src/routes/notification.routes.ts`
- Modified: `backend/src/utils/tokenUtils.ts` (password-reset token utils)
- Modified: `backend/src/services/auth.service.ts` (forgot/reset password)
- Modified: `backend/src/controllers/auth.controller.ts` (forgot/reset handlers)
- Modified: `backend/src/validators/auth.validators.ts` (Forgot/Reset schemas)
- Modified: `backend/src/routes/auth.routes.ts` (forgot/reset routes)
- Modified: `backend/src/services/scan.service.ts` (fire-and-forget scan_result
  dispatch)
- Modified: `backend/src/config/env.ts` (SENDGRID_FROM_EMAIL, VAPID_SUBJECT)
- Modified: `backend/src/app.ts` (notification routes)
- Modified: `backend/.env.example` (Phase 7 notification vars documented)
- Added deps: `web-push`, `twilio`, `@sendgrid/mail`, `@types/web-push` (dev)
### Phase 8
- `backend/src/services/analytics.service.ts`
- `backend/src/validators/analytics.validators.ts`
- `backend/src/controllers/analytics.controller.ts`
- `backend/src/routes/analytics.routes.ts`
- Modified: `backend/src/app.ts` (analytics routes)
### Phase 9
- `backend/src/services/admin.service.ts`
- `backend/src/validators/admin.validators.ts`
- `backend/src/controllers/admin.controller.ts`
- `backend/src/routes/admin.routes.ts`
- Modified: `backend/src/models/User.ts` (is_deleted field)
- Modified: `backend/src/services/treatment.service.ts` (proposal_reviewed
  notification on approve/reject via notifyProposer helper)
- Modified: `backend/src/app.ts` (admin routes)
### Phase 10
- `backend/src/models/ReportJob.ts`
- `backend/src/services/report.service.ts`
- `backend/src/services/reports/report.renderers.ts` (PDF/CSV)
- `backend/src/validators/report.validators.ts`
- `backend/src/controllers/report.controller.ts`
- `backend/src/routes/report.routes.ts`
- Modified: `backend/src/services/image.service.ts` (uploadBuffer +
  getPresignedDownloadUrl)
- Modified: `backend/src/app.ts` (report routes)
- Added deps: `pdfkit` + `@types/pdfkit` (dev)
### Phase 11
- `backend/src/validators/search.validators.ts`
- `backend/src/services/search.service.ts`
- `backend/src/controllers/search.controller.ts`
- `backend/src/routes/search.routes.ts`
- Modified: `backend/src/app.ts` (search routes)
### Phase 12
- `backend/src/config/socket.ts` (Socket.io setup + emit helpers)
- Modified: `backend/src/server.ts` (initSocketServer on start, closeSocketServer
  on shutdown)
- Modified: `backend/src/services/scan.service.ts` (emit `scan:result`)
- Modified: `backend/src/services/notification.service.ts` (emit `notification:new`)
- Added deps: `socket.io`, `@socket.io/redis-adapter`
### Phase 13
- `backend/src/models/AuditLog.ts` (capped, immutable)
- `backend/src/services/audit.service.ts` (log + listAuditLogs)
- `backend/src/utils/auditContext.ts` (req → ip/user-agent)
- `backend/src/validators/audit.validators.ts`
- `backend/src/controllers/auditlog.controller.ts`
- `backend/src/routes/auditlog.routes.ts`
- Modified: `backend/src/app.ts` (audit-logs routes)
- Modified: `backend/src/services/auth.service.ts` (resetPassword returns
  {userId, role} for audit attribution)
- Modified controllers (added `void auditService.log(...)` call sites):
  `auth.controller.ts` (login/logout/password_reset),
  `scan.controller.ts` (submit/feedback/delete),
  `treatment.controller.ts` (propose/approve/reject),
  `admin.controller.ts` (role_change/suspend/delete),
  `report.controller.ts` (generate)
### Phase 14
- `backend/src/jobs/queues.ts` (queue registry + enqueue helpers + stats)
- `backend/src/jobs/workers.ts` (in-process consumers)
- `backend/src/jobs/scheduler.ts` (repeatable outbreak + cleanup crons)
- `backend/src/models/OutbreakAlert.ts`
- `backend/src/services/outbreak.service.ts` (detectAndAlert + listAlerts)
- Modified: `backend/src/config/env.ts` (QUEUE_ENABLED, REPORT_RETENTION_DAYS,
  TREATMENT_REMINDER_DAYS, OUTBREAK_THRESHOLD)
- Modified: `backend/src/services/notification.service.ts` (enqueue fan-out +
  deliverChannels + dispatchTreatmentReminder)
- Modified: `backend/src/services/report.service.ts` (createReport enqueues +
  generateReport worker body + announceReady report:ready)
- Modified: `backend/src/models/Notification.ts` (report_ready type)
- Modified: `backend/src/services/scan.service.ts` (enqueue delayed treatment_reminder)
- Modified: `backend/src/services/admin.service.ts` (real queue stats in health)
- Modified: `backend/src/controllers/analytics.controller.ts` + `routes/analytics.routes.ts`
  + `validators/analytics.validators.ts` (GET /outbreak-alerts)
- Modified: `backend/src/server.ts` (startWorkers/registerSchedules on start,
  stopWorkers/closeQueues on shutdown)
- Added dep: `bullmq`
### Phase 15
- Modified: `backend/src/middleware/rateLimiter.ts` (rewrite → 3 Redis-backed
  limiters: general/auth/scan)
- Modified: `backend/src/app.ts` (helmet CSP/HSTS, CORS allowlist origin fn,
  generalLimiter)
- Modified: `backend/src/routes/auth.routes.ts` (authLimiter on
  login/refresh/forgot/reset)
- Modified: `backend/src/routes/scan.routes.ts` (scanLimiter on POST /)
- Modified: `backend/src/config/env.ts` (CORS_ORIGINS)
- Modified: `backend/src/config/redis.ts` (idempotent connectRedis)
- Modified: `backend/src/services/auth.service.ts` (constant-time login +
  DUMMY_PASSWORD_HASH)
- Modified: `backend/.env.example` (CORS_ORIGINS documented)
- Added dep: `rate-limit-redis`@^4.2.0
### Phase 16
- `backend/Dockerfile` (4-stage multi-stage build, non-root, healthcheck)
- `backend/.dockerignore`
- `docker-compose.yml` (repo root — api/redis/qdrant/minio/nginx; no mongo=Atlas)
- `nginx/nginx.conf` (reverse proxy: WS upgrade + SSE no-buffer + 10m body)
### Phase 17
- `backend/vitest.config.ts`
- `backend/tests/setup/env.setup.ts` (dummy env before src import)
- `backend/tests/setup/db.ts` (mongodb-memory-server helper)
- `backend/tests/unit/{utils,validators,middleware,tokenUtils,gemini.service}.test.ts`
- `backend/tests/integration/{treatment.service,outbreak.service,auth.api}.test.ts`
- Modified: `backend/package.json` (test:watch/test:coverage scripts; dev deps:
  vitest@4, @vitest/coverage-v8, supertest, @types/supertest, ioredis-mock,
  mongodb-memory-server)

---

## Files In Progress
(None)

---

## Pending Modules
(None — all 17 phases complete.)

---

## Decisions Made
- **Package manager: npm (not pnpm/turbo).** pnpm not installed. Single npm
  package at `backend/`; source at `backend/src/` (not `apps/api/src/`).
- **Env strategy:** Only Phase-1 vars required in Zod; later-phase vars optional
  until their phase, so the app boots cleanly now.
- **Rate limiting:** Phase 1 in-memory limiter; **Phase 15 replaced it** with a
  Redis-backed store + per-route limiters (general/auth/scan).
- **Redis:** ioredis with `lazyConnect`; pub/sub duplicates pre-created for
  Socket.io (Phase 12).
- **nanoid pinned to v3** (v4+ is ESM-only; project is CommonJS).
- **Auth token model:** short-lived access token (jti, blacklistable) in JSON
  body; long-lived refresh token as HttpOnly cookie (path `/api/v1/auth`,
  sameSite strict, secure in prod). One active refresh session per user in Redis
  (`session:{userId}` → jti); refresh **rotates** and invalidates the prior token.
- **Registration** is restricted to farmer/extension_officer/agronomist. `admin`
  is provisioned out-of-band (seed/admin panel), never via public register.
- **forgot-password / reset-password DEFERRED:** these depend on the email
  service (Phase 7). Endpoints not yet implemented. Will add in/after Phase 7.
- **User uniqueness:** email/phone use field-level `unique + sparse` indexes
  (removed redundant explicit `schema.index()` calls to silence Mongoose dup
  warning).
- **AI provider: Google Gemini (NOT Groq).** User requested Gemini and supplied a
  key. Uses `@google/genai` SDK, model `gemini-2.5-flash` (vision + JSON schema
  output). `GEMINI_API_KEY` is a REQUIRED env var from Phase 3 on. Service layer
  (`gemini.service.ts`) is provider-agnostic so a swap later is one-file.
  `GEMINI_VISION_MODEL`/`GEMINI_CHAT_MODEL` both default to `gemini-2.5-flash`.
- **Prompts versioned** in `services/prompts/`; `model_version` on results is
  `gemini:<model>:<PROMPT_VERSION>` for traceability.
- **AI fallback:** classification never throws to the caller — on failure it
  returns a degraded result (confidence 0, low_confidence true, `:fallback` tag)
  so the scan pipeline stays resilient.
- **Gemini thinking disabled for classification:** `thinkingConfig.thinkingBudget
  = 0`. gemini-2.5-flash's thinking tokens count against maxOutputTokens and were
  truncating the JSON output → false fallbacks. Disabled it (also faster/cheaper);
  maxOutputTokens raised to 800.
- **Storage: MinIO (S3-compatible) for dev**, `forcePathStyle: true` +
  `S3_ENDPOINT`. `ensureBucket` auto-creates the bucket on startup (dev
  convenience; on real AWS the bucket is expected to pre-exist). Objects are
  private; clients get 15-min presigned GET URLs. `image_s3_key` never returned.
- **Privacy:** Sharp strips EXIF (incl. GPS) from stored images; device_id is
  SHA-256 hashed before storage.
- **Scan location** stored as GeoJSON Point `[lon, lat]` with a 2dsphere index
  for Phase 8 heatmaps/outbreak queries.
- **Treatment localization: nested object `{en,hi,gu}` (not a Mongoose Map).**
  The language set is fixed and small; a nested object keeps `.lean()` reads and
  `localized[lang]` access simple across the service. `getForDisease` returns the
  requested language's summary/prevention_text, falling back to `en`.
- **Treatment caching:** positive results cached 1h; MISSES cached 5m with a
  `__none__` sentinel (negative caching) so healthy/unidentifiable diagnoses
  don't hammer Mongo. Cache is best-effort — read/write errors are logged and the
  request proceeds. On approval, `invalidateTreatmentCache` SCAN-deletes every
  region×lang variant of the affected disease+crop (SCAN not KEYS → non-blocking).
- **Treatment lookup skipped for healthy/zero-confidence scans** (no remedy to
  give) → scan response `treatment: null`, no wasted query.
- **Proposal safety:** `proposed_data` Zod schema is `.strict()` so a proposal
  cannot inject arbitrary fields into the Treatment collection on approval; the
  apply step also skips id/timestamps. New treatments get a fresh `trt_<nanoid>`;
  edits patch the base doc and record a shallow `{field:{old,new}}` diff. Approving
  or rejecting an already-reviewed proposal → 409.
- **Treatment route ordering:** static `/proposals*` routes MUST be registered
  before `/:id` (Express matches top-down, else "proposals" is captured as an id).
- **tsconfig (post-Phase-4):** removed deprecated `moduleResolution:"node"` +
  `baseUrl`/`@*` alias (unused) — the IDE's TS-7-preview compiler errored on them
  while the build (TS 5.9.3) rejected `ignoreDeprecations:"6.0"`. `commonjs`
  already implies node resolution. Both compilers clean now.
- **Phase 6 AI split:** chat = Groq `llama-3.3-70b-versatile` (streaming, user's
  key); embeddings = Gemini `gemini-embedding-001` (3072-dim, existing key). No
  HuggingFace needed. embedding.service uses taskType RETRIEVAL_DOCUMENT vs
  RETRIEVAL_QUERY for better retrieval. GROQ_API_KEY required from Phase 6 on.
- **RAG degradation:** embedding failure → chat.service.retrieveContext returns
  empty context (assistant answers ungrounded, not an error); Qdrant search
  failure → []. Collection init is non-fatal at startup (like S3 ensureBucket).
- **SSE streaming (chat):** POST /chat flushes SSE headers, streams `data:{token}`
  events, ends with `data:{done,session_id,sources}`. Pre-stream work (history
  load, scan context, retrieval) can still throw a normal JSON 4xx/5xx; once
  bytes are flushed, errors are emitted as an SSE error event (global JSON error
  handler can't set a status post-flush). Session auto-created on first message
  if no session_id; history trimmed to last 10 turns before the LLM.
- **Qdrant point IDs must be UUID or uint** — raw `trt_<nanoid>` is rejected. The
  ingestion script maps treatment_id → deterministic UUIDv5, so re-ingest updates
  (idempotent) and the real treatment_id lives in the payload.
- **Notification channels are env-gated & never throw.** Each of push/sms/email
  checks its keys at module load and returns a `DeliveryState`
  ('skipped'|'sent'|'failed') instead of throwing, so the app runs with zero
  provider keys. Choice of providers: **SendGrid** email, **Twilio** SMS,
  **web-push/VAPID** — matches BackendPlan.
- **Notification dispatch = persist-then-fan-out, synchronous best-effort.**
  `dispatch()` saves the Notification doc FIRST (the in-app inbox is the reliable
  channel), then fans out best-effort and records per-channel `delivery`. The
  scan pipeline calls it **fire-and-forget** (`void …catch`) so a slow channel
  never delays the scan response. Moves onto BullMQ in Phase 14 (deferred like
  the Redis rate-limiter was to Phase 15).
- **Password reset token:** purpose-scoped ('pwd_reset') 1h JWT with its jti in
  Redis (`pwdreset:{userId}`) → single-use + latest-request-wins. reset consumes
  the token AND revokes the refresh session. forgot-password returns a generic
  response regardless of whether the email exists (no account enumeration). The
  reset email is best-effort (logged if undelivered); with SendGrid unconfigured
  the token is still minted server-side — only the email delivery is skipped.
- **Analytics region scoping via $lookup, not denormalization.** `region` stays
  on the User (single source of truth); analytics pipelines join into `users`
  only when a region is involved (`regionStages()` returns [] otherwise). All
  analytics routes are officer/admin only and run `requireRegionalScope`, which
  overwrites any client `region` for extension officers so they can never read
  another district. `model/accuracy` is admin-only (system-wide metric).
- **Outbreak detection split across phases:** Phase 8 = on-demand hotspot
  aggregation endpoint (read). Phase 14 = the scheduled worker that persists
  OutbreakAlert docs and fires `outbreak_alert` notifications (dedup via
  `outbreak:{district}:{disease}` per the plan). Keeps Phase 8 stateless/read-only.
- **Analytics window default = last 30 days** when from/to are omitted; the
  resolved {from,to,region} are echoed in each response's `meta`.
- **Admin panel reuses, doesn't duplicate.** Treatment approve/reject stays under
  /treatments/proposals* (Phase 5); the admin module only adds user management +
  system health under /admin. User soft-delete uses a new `is_deleted` flag
  (list/detail exclude it; login blocked via is_active=false). Destructive admin
  actions are self-guarded (no self role-change/suspend/delete) and revoke the
  target's refresh session so role/suspension takes effect immediately (existing
  short-lived access tokens simply expire — no per-jti blacklist sweep). Admin IS
  an assignable role via PATCH /admin/users/:id/role (only public registration
  forbids it). `/system/health` reports queues as `not_configured` until Phase 14.
- **proposal_reviewed notification (Phase 9):** approveProposal/rejectProposal
  dispatch fire-and-forget to `proposed_by` (by ObjectId — no user lookup). This
  is the last of the Phase-7 notification types to be wired except outbreak_alert
  (Phase 14 worker), report:ready (Phase 10), treatment_reminder (Phase 14).
- **Reports: synchronous generation, PDF + CSV, S3-stored (Phase 10).** Chosen
  over pulling BullMQ forward (kept consistent with deferring heavy infra to
  Phase 14). A normalized `ReportDocument` feeds both a pdfkit renderer and a
  hand-rolled RFC-4180 CSV (UTF-8 BOM for Excel/Devanagari). Data comes from the
  Phase-8 analytics service (no duplicated aggregation). Reports upload via a new
  generic `image.service.uploadBuffer` and download via a fresh pre-signed URL
  with Content-Disposition. Officer regional scoping is enforced in the report
  CONTROLLER (region is a body param, out of requireRegionalScope's reach). Jobs
  are owner-scoped (404 across users). Lifecycle (queued→processing→complete/
  failed) is modeled now so Phase 14 only swaps inline generation for a worker +
  `report:ready` notification.
- **Smart Search reuses RAG infra, doesn't rebuild (Phase 11).** GET /search is a
  thin layer over embedding.service + qdrant.service.semanticSearch + the KB
  ingested for the chatbot — no new collection or ingestion. Open to ALL
  authenticated roles (the KB is already curated/approved). Optional exact-match
  filters (type/crop/disease) compile to a Qdrant `must` filter; `min_score`
  post-filters by cosine similarity. **Deliberately does NOT swallow embedding
  failures** (unlike chat's retrieveContext): search surfaces them as 503 because
  an empty result set can't be distinguished from a real "no matches"; the Qdrant
  call itself still degrades to [].
- **Real-time layer = Socket.io on the existing HTTP server (Phase 12).** Not a
  separate WS server — attached to the same `http.Server` so one port/process
  serves REST + sockets. Handshake auth REUSES tokenUtils (verifyAccessToken +
  blacklist) so socket auth == REST auth (revoked tokens rejected). Redis adapter
  uses the pubClient/subClient duplicates reserved in config/redis.ts since
  Phase 1; **non-fatal** (falls back to in-memory adapter like ensureBucket/
  Qdrant degrade). Services emit ONLY via emitToUser/emitToRoom helpers (never
  import `io`), keeping them transport-agnostic; emits are fire-and-forget
  no-ops when no socket is connected, so REST responses are never affected.
  Rooms: `user:{id}` (targeted), `role:admin` + `officer:{region}` (broadcasts,
  ready for the Phase-14 outbreak worker). Events live now: `scan:result`
  (scan.service), `notification:new` (notification.service.dispatch — every
  type). socket.io 4.8 bundles its own types (no @types).
- **Audit trail = capped collection + controller-layer logging (Phase 13).**
  AuditLog is a **capped** (100 MB) collection so immutability is structural
  (inserts+reads only, oldest roll off) — no app-level "don't edit" convention.
  `audit.service.log()` is fire-and-forget & never-throws (best-effort like
  notifications). Logging lives in CONTROLLERS (not middleware/service) — the
  only layer with both req.user AND the HTTP metadata; `auditContext(req)`
  extracts ip/user-agent so audit.service stays HTTP-agnostic. Actor stored as
  user_id STRING (no ObjectId ref → no write/read lookup). Only security-relevant
  MUTATIONS are logged (13 actions), reads excluded, to keep the bounded buffer
  signal-dense. resetPassword had to start returning {userId,role} so the
  unauthenticated reset action could still be attributed. Read API is admin-only
  GET /audit-logs with actor/action/date filters.
- **Background jobs = BullMQ with degrade-to-inline (Phase 14).** Queues
  (notifications/reports/outbreak/cleanup) on a DEDICATED ioredis connection
  (maxRetriesPerRequest:null — BullMQ requirement; NOT the shared config/redis
  client). Core design: **every `enqueue*` returns false when QUEUE_ENABLED=false
  or on failure, and the caller runs inline** — so the API works with zero worker
  process (notifications fan out sync, reports generate in-request = Phase-10
  behaviour). Workers/scheduler start in server.ts after datastores (like
  socket.io), close on shutdown; workers are thin glue → services (no logic in
  jobs/). Notifications: dispatch keeps persist+socket sync, enqueues fan-out;
  deliverChannels = shared worker/inline body. Reports: createReport enqueues,
  generateReport worker fires report:ready (socket + inbox). Outbreak worker (6h
  cron) reuses Phase-8 detectOutbreaks → dedup 48h → persist OutbreakAlert →
  notify officers + broadcast outbreak:alert to officer:{region} room. Cleanup
  cron prunes old ReportJobs. Offline scan-sync replay queue deliberately NOT
  built (no queued-scan source → would be dead code). Job payloads typed in
  queues.ts as the single enqueue↔worker contract.
- **Security hardening = Redis rate limiting + Helmet + CORS allowlist +
  constant-time login (Phase 15).** Rate limiting moved from the Phase-1 global
  in-memory limiter to three `rate-limit-redis` limiters over the shared ioredis
  client (survive restarts + span instances): general 100/min (per-IP, global),
  auth 10/15min (per-IP, on login/refresh/forgot/reset), scan 20/hr (per-user, on
  POST /scans), with prefixes rl:general/rl:auth/rl:scan; degrades to in-memory if
  the store can't build. The store auto-connects the lazy redis client at import,
  so `connectRedis()` became idempotent. Helmet gets an explicit CSP (img-src
  allows https:/data: for presigned S3 URLs) with HSTS + upgrade-insecure-requests
  PROD-ONLY (dev stays http). CORS uses a `CORS_ORIGINS` allowlist (falls back to
  APP_URL) via an origin function; no-Origin allowed, disallowed → 403; credentials
  kept. Login now always runs one bcrypt.compare (dummy hash when user missing) to
  kill the user-enumeration timing leak. npm audit = report-only (5 vulns, all
  dev-only vitest/vite/esbuild → Phase 17).
- **Containerization = multi-stage image + compose, Atlas stays external, workers
  in-process (Phase 16, NOT deployed).** `backend/Dockerfile` is a 4-stage build
  (deps → tsc → prod-deps → runner) on node:20-bookworm-slim (chosen for sharp's
  prebuilt binaries), non-root `node` user, healthcheck on /api/v1/health.
  `docker-compose.yml` (repo root) bundles api + redis + qdrant + minio + optional
  nginx but deliberately has **no mongo service** (the app uses MongoDB Atlas via
  MONGODB_URI); the api service overrides its datastore URLs to in-network
  hostnames while reading secrets from env_file=backend/.env. BullMQ workers run
  in-process in the api container (Phase-14 design) so there is no separate worker
  service — scaling out later = a second service off the same image with a
  worker-only entrypoint. `nginx/nginx.conf` handles Socket.io WS upgrades, SSE
  (buffering off on /chat), and 8MB uploads; TLS is left to the proxy in a real
  deploy (app emits HSTS in prod, trust proxy already set). Build-validated only
  (image builds, compose config parses, nginx -t OK) — the user deferred actual
  deployment.
- **Testing = Vitest 3-tier, no live externals (Phase 17).** 88 tests. Unit (pure
  utils/validators/middleware), mocked-dep (tokenUtils→ioredis-mock, gemini→SDK
  mock incl. degraded fallback), integration (mongodb-memory-server for treatment
  cache/ranking + outbreak dedup; supertest through the real Express app for the
  auth flow). env seeded before imports via a setupFile (env.ts fail-fasts). The
  original >80% target is met for core business logic; whole-repo coverage (~38%)
  is lower only because thin external-SDK wrapper services are left to their
  live-phase verification. The vitest@4 bump also cleared the Phase-15 dev-only
  audit vulns (npm audit now 0).

---

## Technical Notes
- Node v24.10, npm v11.6. TypeScript strict, CommonJS, target ES2022.
- **DB is MongoDB Atlas (cloud), database `KrishiRaksha`** — the live `.env`
  `MONGODB_URI` is an `mongodb+srv://...` Atlas cluster, NOT local :27017.
  (A local native Mongo also exists on the machine but the app does not use it;
  when verifying data, connect mongosh with the Atlas URI from `.env`.)
  Redis 7.2 (Docker `krishi-redis` :6379) + MinIO (Docker `krishi-minio`
  :9000/:9001) + Qdrant v1.12.4 (Docker `krishi-qdrant` :6333/:6334, volume
  `krishi_qdrant_data`). Resume all with
  `docker start krishi-redis krishi-minio krishi-qdrant`.
- Path alias `@/*` → `src/*` in tsconfig (not yet used in imports).
- Scripts: `npm run dev`, `npm run build`, `npm start`, `npm run typecheck`,
  `npm test` (vitest).
- Redis key patterns in use: `session:{userId}` (refresh jti),
  `blacklist:{jti}` (revoked access tokens), `pwdreset:{userId}` (reset jti),
  `rl:general:*` / `rl:auth:*` / `rl:scan:*` (Phase-15 rate-limit counters).
- Gemini SDK call shape (v2.12): `genai.models.generateContent({ model,
  contents:[{role:'user',parts:[{text},{inlineData:{mimeType,data}}]}],
  config:{ systemInstruction, temperature, responseMimeType:'application/json',
  responseSchema } })`; read `response.text`.
- Test dataset for images: `New Plant Diseases Dataset(Augmented)/.../train/<Class>/`.
- Local dev infra now includes MinIO: Docker container `krishi-minio`
  (`minioadmin`/`minioadmin123`), API :9000, console :9001. Resume with
  `docker start krishi-minio`. Bucket `krishi-raksha-images` auto-created.
- MinIO stores objects in an internal volume layout (not a simple file at
  `/data/bucket/key`) — verify storage by fetching the presigned URL, not by
  `find` in the container.

---

## Known Issues
- `npm audit`: **0 vulnerabilities** as of Phase 17 (the vitest 2→4 bump cleared
  the previously-flagged dev-only vitest/vite/esbuild chain).
- Windows Git Bash: `curl -F "image=@/tmp/..."` fails (path translation); use a
  path inside the repo dir for multipart uploads when testing.
- Windows: `pkill -f ts-node-dev` doesn't always free port 4000; find the PID via
  `netstat -ano | grep :4000` and `taskkill //PID <pid> //F`.
- Test infra: ioredis-mock has no `.call()` (Lua), so the Redis-backed rate
  limiters can't run under it — the auth API test stubs the limiter middleware.
  Rate limiting is covered by live verification in Phase 15, not the vitest suite.

---

## Post-Phase-4 Fixes (2026-07-19)
- **tsconfig deprecation errors:** IDE bundles a TS 7.0-preview compiler that
  errored on `moduleResolution: "node"` + `baseUrl` (deprecated, removed in 7.0),
  while the build pins TS 5.9.3 (which rejects `ignoreDeprecations: "6.0"`). No
  single suppression satisfies both. Fixed by REMOVING the deprecated options:
  dropped explicit `moduleResolution` (commonjs already implies node resolution)
  and removed `baseUrl` + `paths` `@/*` alias (was never used in imports). Both
  compilers now clean; `npm run typecheck` passes.
- **BUG FIX — Regional scope guard was a silent no-op:** access token carried
  only sub/role/lang, so `requireRegionalScope` read an always-undefined
  `req.user.region` and never filtered. Would have leaked all districts to
  extension officers in Phase 8. Fixed by threading `region` through the token:
  `AccessPayload.region` added, `signAccessToken` accepts it, `issueTokens`
  (auth.service) passes `user.region`, and auth.middleware sets `req.user.region`
  from the payload. (`AuthUser.region` already existed in express.d.ts.)
- **BUG FIX — Stale image URLs in scan list:** `listScans` returned the presigned
  URL stored at creation (15-min TTL) → broken images on history screens.
  `getScanById` already refreshed; now `listScans` regenerates a fresh presigned
  URL per scan via `getPresignedUrl(scan.image_s3_key)` too.
- **Reviewed, intentionally deferred (not bugs):** npm audit dev-only vulns +
  vitest@4 bump (Phase 15/17); single-session refresh model (deliberate per plan);
  login user-enumeration timing → dummy bcrypt compare (Phase 15); no tests yet
  (Phase 17); ensureBucket warn-not-fail (correct for AWS).

---

## Next Tasks
- **All 17 planned phases are complete.** The backend is feature-complete, hardened
  (Phase 15), containerized (Phase 16, artifacts only — not deployed), and tested
  (Phase 17, 88 tests). Remaining optional work if the project continues:
  - Deploy the Docker stack (`docker compose up --build`) when ready.
  - Broaden test coverage into the SDK-wrapper services (report renderers,
    notification fan-out, scan pipeline) with deeper mocking if desired.
  - Wire CI (GitHub Actions) to run `npm run typecheck` + `npm test` on push.

---

## Update Policy
This file must be updated automatically whenever:
* a new backend feature is completed
* a file is created
* a file is modified
* a phase is completed
* a bug is fixed
* an architecture decision is made
* a dependency is added or removed
* an API is added, changed, or deleted

Always keep this file synchronized with the current backend implementation.
