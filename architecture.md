# Backend Architecture Guide

## High Level Architecture

The Krishi Raksha backend is designed as a robust, scalable, and modular system tailored for offline-first clients. The architecture leverages Node.js (Express) as the primary API Gateway and business logic layer, integrating with Groq's API for AI vision and chat capabilities.

**Core Interaction Flow:**
1. **Client (PWA)** communicates via HTTPS/WSS with the Node.js API Gateway.
2. **API Gateway** handles authentication, rate limiting, and request validation.
3. Tasks are delegated to specialized **Services** (e.g., Image processing, AI classification via Groq, Treatment retrieval).
4. Data is persisted across a **Polyglot Persistence Layer** (MongoDB, Redis, Qdrant, S3).
5. Heavy or asynchronous tasks are pushed to a **Queue/Worker Layer**.

## Folder Structure

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
AI Service (Groq API classifies image)
↓
Treatment Service (Checks Redis Cache -> MongoDB for remedies)
↓
Repository/Database (Saves Scan document to MongoDB)
↓
Response (JSON returned to Client) & WebSocket (Emit real-time event)

## Internal Architecture

- **Controller Layer:** Extremely thin. Responsible only for receiving requests, invoking services, and returning standard HTTP responses.
- **Service Layer:** Contains all business logic. Orchestrates calls between databases, external APIs (Groq), and background queues.
- **Repository Layer:** Abstracted through Mongoose models. Handles all database queries, aggregations, and data formatting.
- **AI Layer:** Interacts with Groq API for Vision (classification) and Text (RAG chatbot).
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

## AI Architecture

- **Vision Integration:** Uses Groq's `Llama-3.2-11B-Vision-Instruct` model. Images are converted to base64, sent via API, and strict JSON is enforced via prompt engineering for predictable classification.
- **Chatbot (RAG):** Uses Groq's `Llama-3.1-70B`. User queries are embedded, matched against Qdrant, and the resulting context is injected into the prompt.
- **Prompt Pipeline:** Managed in `groq.service.ts` and `chat.service.ts`. Includes system instructions, context windows, and language localization instructions.
- **Memory Retrieval:** Vector search on Qdrant retrieves the top-K relevant treatment snippets to ground the LLM responses.

## API Architecture

- **REST Conventions:** Nouns for resources (e.g., `/api/v1/scans`), standard HTTP verbs (GET, POST, PATCH, DELETE).
- **Versioning:** URL-based versioning (`/api/v1/...`).
- **Status Codes:** Strict adherence to HTTP standards (200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 500 Internal Error).
- **Pagination:** Cursor or offset-based pagination for lists (Scans, Notifications).
- **Validation:** Enforced at the route level using Zod.
- **Authentication:** Bearer tokens (JWT) passed in the `Authorization` header.
- **Authorization:** Custom RBAC middleware checking user roles against route requirements.

## Deployment Architecture

- **Development:** Docker Compose running Node.js, MongoDB, Redis, Qdrant, and MinIO locally.
- **Production:** Containerized applications deployed via Kubernetes (k8s) or managed container services.
- **CI/CD:** GitHub Actions for testing, linting, and automated deployments to staging/production.
- **Secrets Management:** Environment variables injected via secure vaults (e.g., AWS Secrets Manager). Never committed to source control.

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
