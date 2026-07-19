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

## Phase 5 — Treatment Database & Recommendation Engine
- **Objective:** Provide accurate, localized treatments based on diagnoses.
- **Modules:** Treatments, Caching.
- **Tasks:**
  - Create Treatment Schema.
  - Implement Treatment Service with Redis caching.
  - Create Treatment Proposal workflow for agronomists.
  - Link Treatment Service to the Scan Pipeline.
- **Deliverables:** Fast, cached treatment lookups integrated into scan results.
- **Dependencies:** Phase 4.
- **Completion Checklist:** Scan responses successfully include relevant treatment data.

## Phase 6 — AI Chatbot (RAG Pipeline with Groq)
- **Objective:** Build an intelligent agricultural assistant.
- **Modules:** Chat, Qdrant, Embeddings.
- **Tasks:**
  - Setup Qdrant Vector Database.
  - Implement Embedding generation service.
  - Create knowledge base ingestion scripts.
  - Build Chat Controller with RAG (Retrieving context + Groq chat stream).
- **Deliverables:** Streaming chatbot API endpoint.
- **Dependencies:** Phase 5, Qdrant setup.
- **Completion Checklist:** Users can chat and receive contextually accurate answers.

## Phase 7 — Notification System
- **Objective:** Keep users informed of results and outbreaks.
- **Modules:** Notifications, Push, SMS, Email.
- **Tasks:**
  - Implement VAPID Web Push service.
  - Implement Twilio SMS service.
  - Implement SendGrid Email service.
  - Create Notification Schema and routes.
- **Deliverables:** Multi-channel notification capabilities.
- **Dependencies:** Phase 1.
- **Completion Checklist:** Successful dispatch of test SMS, Email, and Push notifications.

## Phase 8 — Analytics & Predictive Dashboard
- **Objective:** Provide insights and track outbreaks.
- **Modules:** Analytics.
- **Tasks:**
  - Create aggregations for scan trends and model accuracy.
  - Generate disease heatmap data.
  - Implement background worker for automated outbreak detection.
- **Deliverables:** Analytics endpoints serving structured data for dashboards.
- **Dependencies:** Phase 4, Phase 7.
- **Completion Checklist:** Endpoints return correct aggregations.

## Phase 9 — Admin Panel APIs
- **Objective:** APIs to manage the platform.
- **Modules:** Admin.
- **Tasks:**
  - Implement user management endpoints.
  - Implement treatment approval endpoints.
- **Deliverables:** Secure admin routes.
- **Dependencies:** Phase 2, Phase 5.
- **Completion Checklist:** Admin can list users and approve treatment proposals.

## Phase 10 — Report Generation
- **Objective:** Generate PDF/CSV reports.
- **Modules:** Reports.
- **Tasks:**
  - Create report generation service.
  - Setup background job to process heavy report requests.
- **Deliverables:** Exportable data capabilities.
- **Dependencies:** Phase 8.

## Phase 11 — Smart Search (Semantic Search via Qdrant)
- **Objective:** Allow natural language search of treatments.
- **Modules:** Search.
- **Tasks:**
  - Create search endpoint utilizing Qdrant vector similarity.
- **Deliverables:** Search API.
- **Dependencies:** Phase 6.

## Phase 12 — WebSocket & Real-time Layer
- **Objective:** Live updates for clients.
- **Modules:** Sockets.
- **Tasks:**
  - Setup Socket.io connected to Redis pub/sub.
  - Emit real-time events on scan completion.
- **Deliverables:** WebSocket server integrated with Express.
- **Dependencies:** Phase 1, Phase 4.

## Phase 13 — Audit Logs
- **Objective:** Track sensitive system actions.
- **Modules:** Audit.
- **Tasks:**
  - Create Audit Log schema and middleware.
- **Deliverables:** Immutable log records for actions like logins, DB edits.
- **Dependencies:** Phase 2.

## Phase 14 — Background Jobs (Celery/Bull)
- **Objective:** Handle async tasks efficiently.
- **Modules:** Workers.
- **Tasks:**
  - Define BullMQ queues for notifications, sync processing, and cleanup.
- **Deliverables:** Robust queue processing system.
- **Dependencies:** Phase 1, Redis.

## Phase 15 — Security Hardening
- **Objective:** Prepare for production.
- **Modules:** Security.
- **Tasks:**
  - Review rate limits, implement Helmet, validate CORS.
  - Ensure secrets are managed correctly.
- **Deliverables:** Hardened API.

## Phase 16 — Docker & Deployment
- **Objective:** Containerize the application.
- **Modules:** DevOps.
- **Tasks:**
  - Write Dockerfiles and docker-compose.
  - Setup Nginx config.
- **Deliverables:** Deployable containers.

## Phase 17 — Testing Strategy
- **Objective:** Ensure reliability.
- **Modules:** Testing.
- **Tasks:**
  - Write unit and integration tests using Vitest/Jest.
- **Deliverables:** Passing test suite with >80% coverage.
