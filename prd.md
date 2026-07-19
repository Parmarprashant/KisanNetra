# Product Requirement Document (PRD)

## Project Overview
Krishi Raksha (Sanskrit: *कृषि रक्षा* — "Protection of Agriculture") is an open-source, AI-powered crop disease early detection system designed from the ground up for rural Indian farmers. This PRD focuses exclusively on the **backend implementation**, providing the robust API, AI integration, and data management layers needed to support a highly resilient, offline-first client architecture.

## Vision
A world where every farmer — regardless of connectivity, literacy, or geography — has immediate access to expert-level crop disease diagnosis and safe, locally appropriate treatment guidance.

## Problem Statement
- **20–40%** of global crop yield is lost annually to pest and disease.
- Low expert-to-farmer ratio limits timely intervention.
- The typical delay between symptom onset and expert diagnosis is days to weeks.
- Lack of reliable internet connectivity makes traditional web-based agricultural advisory tools ineffective when farmers are in the field.

## Goals
- Build a robust, scalable Node.js + Express backend.
- Provide fast, accurate crop disease classification using Groq's Vision AI model.
- Serve agronomist-curated, safety-verified treatment recommendations.
- Enable offline-first functionality by supporting background sync and queuing on the backend.
- Establish a scalable RAG (Retrieval-Augmented Generation) pipeline for intelligent chatbot capabilities.
- Create secure, role-based APIs for farmers, extension officers, agronomists, and administrators.

## Non Goals
- No frontend UI development or component building (this is strictly a backend project).
- No custom deep learning model training (using Groq API for inference).
- No direct end-user interaction handling outside of standard API responses.

## Target Users
- **Farmers:** Primary consumers of the API for disease diagnosis and treatment.
- **Extension Officers:** Users querying regional outbreak analytics and managing farmer groups.
- **Agronomists:** Experts managing the treatment database, proposing updates, and verifying remedies.
- **System Administrators:** Operators monitoring system health, managing roles, and configuring system parameters.

## User Personas
1. **Ramesh (Farmer):** Operates with low connectivity. Needs the backend to instantly process his sync queues when he gets online.
2. **Priya (Extension Officer):** Needs fast, aggregated data on disease outbreaks in her district via analytics APIs.
3. **Dr. Sharma (Agronomist):** Needs secure endpoints to review and approve treatment proposals.

## User Stories
- As a client app, I want to submit leaf images to an endpoint so that the backend can identify the disease.
- As a client app, I want to sync a queue of offline scans when connectivity returns.
- As an agronomist, I want to submit treatment proposals via the API so that the knowledge base remains up-to-date.
- As an admin, I want to pull analytics on scan volumes and model accuracy.
- As a user, I want to query a chatbot API to ask agricultural questions in my native language.

## Functional Requirements
- RESTful API endpoints for user authentication, scans, treatments, chat, and analytics.
- Image upload processing (EXIF stripping, resizing, S3 storage).
- Integration with Groq API for vision classification.
- Real-time result delivery via WebSockets.
- Background jobs for processing sync queues, generating reports, and sending notifications.

## Backend Features
- **Auth Engine:** JWT-based stateless authentication with RBAC.
- **Scan Pipeline:** Multi-step image processing and classification pipeline.
- **Treatment Engine:** Caching layer for fast retrieval of verified crop treatments.
- **RAG Chatbot:** Conversational AI powered by Groq and Qdrant vector database.
- **Notification System:** Web Push, SMS, and Email integrations.
- **Analytics Engine:** Aggregation pipelines for heatmaps and outbreak detection.

## API Objectives
- Sub-second response times for cached treatment lookups.
- High availability and robust error handling.
- Comprehensive input validation.
- Secure, rate-limited, and documented endpoints.

## Core Modules
- Auth Module
- User Management
- Scan & Classification Module
- Treatment Knowledge Base
- RAG & Chat Module
- Notifications Engine
- Analytics & Reports
- Audit Logging

## Authentication Requirements
- JWT for stateless session management.
- Redis-backed token blacklist for secure revocation.
- Secure password hashing using bcrypt.
- Refresh token rotation.

## Authorization Requirements
- Strict Role-Based Access Control (RBAC).
- Regional scope guards (e.g., Extension officers can only access data from their assigned district).
- Middleware to enforce role requirements at the route level.

## Data Management
- **MongoDB:** Primary store for Users, Scans, Treatments, and Audit logs.
- **Redis:** High-speed caching for treatments and session management.
- **Qdrant:** Vector database for semantic search and RAG embeddings.
- **MinIO/S3:** Object storage for uploaded leaf images.

## AI Features
- **Disease Classification:** Groq's Llama-3.2-11B-Vision-Instruct model for classifying leaf images via API.
- **Chatbot Assistant:** Groq's Llama-3.1-70B model with RAG context for answering farmer queries.
- **Semantic Search:** Converting treatment knowledge base into vector embeddings for accurate retrieval.

## Background Processing
- BullMQ (or Celery if Python bridge is heavily used) for async tasks.
- Queue processing for: Offline scan syncs, background report generation, retraining data aggregation, and outbreak detection.

## Integrations
- **Groq API:** For Vision and Chat models.
- **Twilio:** For SMS notifications.
- **SendGrid:** For transactional emails.
- **AWS S3 / MinIO:** For image storage.

## Performance Goals
- API response time < 200ms for standard CRUD and cached lookups.
- Support high throughput for background sync bursts when rural networks reconnect.
- Efficient memory usage by keeping controllers thin and leveraging Redis.

## Security Requirements
- Input sanitization via Zod.
- Rate limiting to prevent API abuse.
- EXIF data stripping from uploaded images to protect farmer privacy.
- Environment variable validation on startup.
- Secure headers via Helmet.
- No sensitive data exposed in error logs.

## Scalability Goals
- Stateless API architecture ready for horizontal scaling (Docker/Kubernetes).
- Database indexing on highly queried fields (e.g., location, timestamps).
- Offloading heavy tasks (image processing, notifications) to background workers.

## Logging Requirements
- Request logging using Winston and Morgan.
- Structured JSON logs for easy aggregation.
- Dedicated audit logs for sensitive actions (e.g., treatment modifications, role changes).

## Monitoring Requirements
- Health check endpoints (`/api/v1/health`).
- Prometheus metrics for endpoint performance.
- Sentry integration for error tracking.

## Success Metrics
- 99.9% API uptime.
- Processing 100% of background sync queues successfully.
- Cache hit ratio > 85% for treatment lookups.
- AI classification response time well within Groq API SLAs.

## Assumptions
- Groq API remains available and maintains its performance/pricing tiers.
- Client applications handle local offline storage and retry logic correctly.
- Agronomists actively curate the treatment database.

## Risks
- Groq API rate limits or latency spikes.
- Massive concurrent sync requests overwhelming the API gateway.
- Vector database (Qdrant) sizing issues as knowledge base grows.

## Future Enhancements
- Fine-tuned custom models deployed natively if Groq becomes unviable.
- Predictive analytics integrating weather APIs.
- Voice-first API endpoints parsing audio queries.
