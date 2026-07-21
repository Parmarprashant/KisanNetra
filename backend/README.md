# 🌿 Krishi Raksha — Backend API

AI-powered crop disease early detection backend for rural Indian farmers.
Node.js + Express + TypeScript, MongoDB + Redis (Qdrant, S3/MinIO, Groq added in later phases).

## Prerequisites

- Node.js >= 20
- MongoDB (local or remote)
- Redis (local, or via Docker: `docker run -d -p 6379:6379 redis:7.2-alpine`)

## Setup

```bash
cd backend
npm install
cp .env.example .env   # then edit values as needed
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server (`dist/server.js`) |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run tests (Vitest) |

## Health Check

```bash
curl http://localhost:4000/api/v1/health
```

Returns `200` with `{ success: true, data: { status, uptime_seconds, dependencies } }`
when MongoDB and Redis are connected, or `503` if a dependency is down.

## Project Structure

```
backend/src/
├── config/       # env validation, MongoDB, Redis
├── routes/       # Express routers (v1)
├── controllers/  # thin HTTP handlers (added per phase)
├── middleware/   # error handler, request logger, rate limiter
├── services/     # business logic (added per phase)
├── models/       # Mongoose schemas (added per phase)
├── validators/   # Zod schemas (added per phase)
├── jobs/         # BullMQ workers (Phase 14)
├── utils/        # logger, errors, apiResponse
├── types/        # shared TS types
├── app.ts        # Express app + middleware + routes
└── server.ts     # HTTP server + graceful shutdown
```

See `../phases.md` for the full 17-phase roadmap and `../memory.md` for current status.
