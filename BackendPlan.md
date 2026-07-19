# 🌿 Krishi Raksha — Complete Backend Implementation Plan

> **Project:** Krishi Raksha — AI-Based Early Detection System for Crop Diseases  
> **Team:** Quantum Syndicates, Swaminarayan University  
> **AI Provider:** Groq API (replacing custom PyTorch/ONNX model for now)  
> **Backend Stack:** Node.js + Express (API Gateway) + Python FastAPI (ML Bridge)  
> **Database:** MongoDB + Redis + Qdrant  
> **Version:** 1.0.0

---

## 📋 Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Phase 1 — Foundation Setup](#3-phase-1--foundation-setup)
4. [Phase 2 — Authentication & RBAC](#4-phase-2--authentication--rbac)
5. [Phase 3 — Groq AI Integration (Image Classification Bridge)](#5-phase-3--groq-ai-integration-image-classification-bridge)
6. [Phase 4 — Scan Pipeline](#6-phase-4--scan-pipeline)
7. [Phase 5 — Treatment Database & Recommendation Engine](#7-phase-5--treatment-database--recommendation-engine)
8. [Phase 6 — AI Chatbot (RAG Pipeline with Groq)](#8-phase-6--ai-chatbot-rag-pipeline-with-groq)
9. [Phase 7 — Notification System](#9-phase-7--notification-system)
10. [Phase 8 — Analytics & Predictive Dashboard](#10-phase-8--analytics--predictive-dashboard)
11. [Phase 9 — Admin Panel APIs](#11-phase-9--admin-panel-apis)
12. [Phase 10 — Report Generation](#12-phase-10--report-generation)
13. [Phase 11 — Smart Search (Semantic Search via Qdrant)](#13-phase-11--smart-search-semantic-search-via-qdrant)
14. [Phase 12 — WebSocket & Real-time Layer](#14-phase-12--websocket--real-time-layer)
15. [Phase 13 — Audit Logs](#15-phase-13--audit-logs)
16. [Phase 14 — Background Jobs (Celery/Bull)](#16-phase-14--background-jobs-celerybull)
17. [Phase 15 — Security Hardening](#17-phase-15--security-hardening)
18. [Phase 16 — Docker & Deployment](#18-phase-16--docker--deployment)
19. [Phase 17 — Testing Strategy](#19-phase-17--testing-strategy)
20. [Environment Variables Reference](#20-environment-variables-reference)
21. [Complete API Endpoint Index](#21-complete-api-endpoint-index)
22. [Database Schema Reference](#22-database-schema-reference)
23. [Groq API Usage Plan](#23-groq-api-usage-plan)

---

## 1. Architecture Overview

### High-Level System Architecture (with Groq)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (PWA)                             │
│   React + Vite + IndexedDB Queue + Service Worker + WebSocket Client    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │ HTTPS / WSS
┌──────────────────────────────▼──────────────────────────────────────────┐
│                     NODE.JS + EXPRESS API GATEWAY                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  JWT     │  │  Rate    │  │  Multer  │  │ Socket   │  │  RBAC    │  │
│  │  Auth    │  │ Limiter  │  │ Upload   │  │   .io    │  │Middleware│  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└────────┬──────────────────────────┬────────────────────────┬────────────┘
         │                          │                         │
┌────────▼────────┐      ┌──────────▼──────────┐   ┌─────────▼────────┐
│  GROQ API BRIDGE│      │    DATA LAYER        │   │  NOTIFICATION    │
│  (FastAPI or    │      │                      │   │  LAYER           │
│   Node.js svc)  │      │  ┌────────────────┐  │   │  ┌────────────┐  │
│                 │      │  │ MongoDB 7.0    │  │   │  │ Web Push   │  │
│  Groq SDK       │      │  └────────────────┘  │   │  │ SMS Twilio │  │
│  Vision API     │      │  ┌────────────────┐  │   │  │ Email SG   │  │
│  Llama-3.2      │      │  │ Redis 7.2      │  │   │  └────────────┘  │
│  Vision model   │      │  └────────────────┘  │   └──────────────────┘
│                 │      │  ┌────────────────┐  │
└─────────────────┘      │  │ Qdrant VectorDB│  │
                         │  └────────────────┘  │
                         │  ┌────────────────┐  │
                         │  │ AWS S3 / MinIO │  │
                         │  └────────────────┘  │
                         └──────────────────────┘
```

### Why Groq API Instead of Custom Model?

Groq offers the **Llama-3.2-11B-Vision-Instruct** model via their API which:
- Accepts images directly as base64 or URL input
- Provides structured JSON responses for disease classification
- Offers sub-second inference speed (Groq's LPU hardware)
- Supports multilingual output (Hindi, Gujarati, English)
- Powers the chatbot assistant via Llama-3.1-70B
- Eliminates the need to host PyTorch/ONNX infrastructure initially

### Services Overview

| Service | Technology | Port | Purpose |
|---|---|---|---|
| `api` | Node.js + Express | 4000 | Main API gateway |
| `ml` | Python FastAPI (Groq bridge) | 8000 | Groq vision calls |
| `mongo` | MongoDB 7.0 | 27017 | Primary database |
| `redis` | Redis 7.2 | 6379 | Cache + sessions + queues |
| `qdrant` | Qdrant 1.8 | 6333 | Vector search for RAG |
| `minio` | MinIO | 9000 | S3-compatible image storage |

---

## 2. Project Structure

```
apps/api/                          ← Node.js Express API
├── src/
│   ├── config/
│   │   ├── db.ts                  ← MongoDB connection
│   │   ├── redis.ts               ← Redis client
│   │   ├── s3.ts                  ← MinIO / S3 client
│   │   ├── socket.ts              ← Socket.io setup
│   │   └── env.ts                 ← Validated env vars (zod)
│   │
│   ├── models/                    ← Mongoose schemas
│   │   ├── User.ts
│   │   ├── Scan.ts
│   │   ├── Treatment.ts
│   │   ├── TreatmentProposal.ts
│   │   ├── Notification.ts
│   │   ├── PushSubscription.ts
│   │   ├── AuditLog.ts
│   │   ├── ChatSession.ts
│   │   ├── ReportJob.ts
│   │   └── OutbreakAlert.ts
│   │
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── scan.routes.ts
│   │   ├── treatment.routes.ts
│   │   ├── user.routes.ts
│   │   ├── chat.routes.ts
│   │   ├── analytics.routes.ts
│   │   ├── notification.routes.ts
│   │   ├── report.routes.ts
│   │   ├── search.routes.ts
│   │   ├── auditlog.routes.ts
│   │   ├── prediction.routes.ts
│   │   └── admin.routes.ts
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── scan.controller.ts
│   │   ├── treatment.controller.ts
│   │   ├── user.controller.ts
│   │   ├── chat.controller.ts
│   │   ├── analytics.controller.ts
│   │   ├── notification.controller.ts
│   │   ├── report.controller.ts
│   │   ├── search.controller.ts
│   │   ├── auditlog.controller.ts
│   │   ├── prediction.controller.ts
│   │   └── admin.controller.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── scan.service.ts
│   │   ├── groq.service.ts        ← Groq API calls
│   │   ├── treatment.service.ts
│   │   ├── chat.service.ts        ← RAG + Groq chatbot
│   │   ├── push.service.ts        ← Web Push (VAPID)
│   │   ├── sms.service.ts         ← Twilio
│   │   ├── email.service.ts       ← SendGrid / Nodemailer
│   │   ├── image.service.ts       ← Sharp + S3
│   │   ├── analytics.service.ts
│   │   ├── report.service.ts
│   │   ├── search.service.ts      ← Qdrant vector search
│   │   ├── qdrant.service.ts      ← Qdrant client
│   │   └── audit.service.ts
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts     ← JWT verification
│   │   ├── rbac.middleware.ts     ← Role-based access
│   │   ├── rateLimiter.ts
│   │   ├── upload.middleware.ts   ← Multer configuration
│   │   ├── errorHandler.ts
│   │   ├── requestLogger.ts
│   │   └── auditLogger.ts
│   │
│   ├── jobs/                      ← Bull queue workers
│   │   ├── queues.ts              ← Queue definitions
│   │   ├── scanSync.worker.ts
│   │   ├── report.worker.ts
│   │   ├── notification.worker.ts
│   │   ├── retraining.worker.ts
│   │   └── outbreakDetect.worker.ts
│   │
│   ├── utils/
│   │   ├── apiResponse.ts         ← Standardized response builder
│   │   ├── tokenUtils.ts
│   │   ├── hashUtils.ts
│   │   ├── exifStripper.ts
│   │   ├── langHelper.ts          ← i18n helpers for SMS/email
│   │   └── geoUtils.ts
│   │
│   ├── validators/                ← Zod schemas
│   │   ├── auth.validators.ts
│   │   ├── scan.validators.ts
│   │   ├── treatment.validators.ts
│   │   └── chat.validators.ts
│   │
│   ├── types/
│   │   ├── express.d.ts           ← req.user augmentation
│   │   └── index.ts
│   │
│   └── app.ts                     ← Express app + route mounting
│   └── server.ts                  ← HTTP server + Socket.io

apps/ml/                           ← Python FastAPI (Groq Vision Bridge)
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── classify.py            ← POST /classify → Groq Vision
│   │   └── health.py
│   ├── services/
│   │   └── groq_vision.py         ← Groq SDK image classification
│   └── schemas/
│       └── classify.py
├── requirements.txt
└── Dockerfile
```

---

## 3. Phase 1 — Foundation Setup

### Step 1.1 — Initialize Monorepo

```bash
mkdir krishi-raksha && cd krishi-raksha
pnpm init
pnpm add -w turbo

# API package
mkdir -p apps/api && cd apps/api
pnpm init
pnpm add express mongoose ioredis zod bcryptjs jsonwebtoken multer sharp \
  socket.io bull winston morgan nodemailer twilio web-push @sendgrid/mail \
  groq-sdk @qdrant/js-client-rest uuid nanoid cors helmet

pnpm add -D typescript @types/express @types/node @types/bcryptjs \
  @types/jsonwebtoken @types/multer @types/uuid ts-node-dev vitest
```

### Step 1.2 — TypeScript Configuration

```json
// apps/api/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Step 1.3 — Environment Validation (Zod)

```typescript
// src/config/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV:              z.enum(['development', 'production', 'test']),
  PORT:                  z.string().default('4000'),
  APP_URL:               z.string().url(),
  API_URL:               z.string().url(),

  MONGODB_URI:           z.string().min(1),
  REDIS_URL:             z.string().min(1),

  JWT_SECRET:            z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN:z.string().default('7d'),

  // Groq API (replaces ML model)
  GROQ_API_KEY:          z.string().min(1),
  GROQ_VISION_MODEL:     z.string().default('meta-llama/llama-4-scout-17b-16e-instruct'),
  GROQ_CHAT_MODEL:       z.string().default('llama-3.3-70b-versatile'),

  // S3 / MinIO
  S3_ENDPOINT:           z.string().optional(),   // For MinIO
  AWS_ACCESS_KEY_ID:     z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_BUCKET:         z.string().min(1),
  AWS_REGION:            z.string().default('ap-south-1'),

  // Notifications
  SENDGRID_API_KEY:      z.string().optional(),
  TWILIO_ACCOUNT_SID:    z.string().optional(),
  TWILIO_AUTH_TOKEN:     z.string().optional(),
  TWILIO_FROM_NUMBER:    z.string().optional(),
  VAPID_PUBLIC_KEY:      z.string().min(1),
  VAPID_PRIVATE_KEY:     z.string().min(1),

  // Qdrant
  QDRANT_URL:            z.string().url().default('http://localhost:6333'),
  QDRANT_COLLECTION:     z.string().default('krishi_knowledge_base'),

  // ML Bridge (Python FastAPI)
  ML_SERVICE_URL:        z.string().url().default('http://localhost:8000'),
  ML_INTERNAL_KEY:       z.string().min(16),

  CONFIDENCE_THRESHOLD:  z.string().default('0.65'),
});

export const env = EnvSchema.parse(process.env);
```

### Step 1.4 — Database Connections

```typescript
// src/config/db.ts
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export async function connectMongoDB() {
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err));
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  });
}
```

```typescript
// src/config/redis.ts
import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

export const pubClient = redis.duplicate();   // For Socket.io adapter
export const subClient = redis.duplicate();
```

### Step 1.5 — Express App Bootstrap

```typescript
// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { json } from 'body-parser';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';

// Route imports
import authRoutes        from './routes/auth.routes';
import scanRoutes        from './routes/scan.routes';
import treatmentRoutes   from './routes/treatment.routes';
import chatRoutes        from './routes/chat.routes';
import analyticsRoutes   from './routes/analytics.routes';
import notifRoutes       from './routes/notification.routes';
import reportRoutes      from './routes/report.routes';
import searchRoutes      from './routes/search.routes';
import auditRoutes       from './routes/auditlog.routes';
import predictionRoutes  from './routes/prediction.routes';
import adminRoutes       from './routes/admin.routes';
import userRoutes        from './routes/user.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.APP_URL, credentials: true }));
app.use(json({ limit: '10mb' }));
app.use(requestLogger);
app.use(rateLimiter);

// Mount routes
app.use('/api/v1/auth',        authRoutes);
app.use('/api/v1/scans',       scanRoutes);
app.use('/api/v1/treatments',  treatmentRoutes);
app.use('/api/v1/chat',        chatRoutes);
app.use('/api/v1/analytics',   analyticsRoutes);
app.use('/api/v1/notifications', notifRoutes);
app.use('/api/v1/reports',     reportRoutes);
app.use('/api/v1/search',      searchRoutes);
app.use('/api/v1/audit-logs',  auditRoutes);
app.use('/api/v1/predictions', predictionRoutes);
app.use('/api/v1/admin',       adminRoutes);
app.use('/api/v1/users',       userRoutes);
app.get('/api/v1/health',      (_, res) => res.json({ status: 'ok', ts: new Date() }));

app.use(errorHandler);

export default app;
```

---

## 4. Phase 2 — Authentication & RBAC

### Step 2.1 — User Schema

```typescript
// src/models/User.ts
import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type Role = 'farmer' | 'extension_officer' | 'agronomist' | 'admin';
export type Language = 'en' | 'hi' | 'gu';

export interface IUser extends Document {
  user_id:      string;
  name:         string;
  email?:       string;
  phone?:       string;
  password:     string;
  role:         Role;
  language:     Language;
  region?:      string;          // district/state for extension officers
  state?:       string;
  is_active:    boolean;
  last_login?:  Date;
  created_at:   Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>({
  user_id:   { type: String, required: true, unique: true },
  name:      { type: String, required: true, trim: true },
  email:     { type: String, lowercase: true, sparse: true, unique: true },
  phone:     { type: String, sparse: true, unique: true },
  password:  { type: String, required: true, select: false },
  role:      { type: String, enum: ['farmer','extension_officer','agronomist','admin'], default: 'farmer' },
  language:  { type: String, enum: ['en','hi','gu'], default: 'en' },
  region:    String,
  state:     String,
  is_active: { type: Boolean, default: true },
  last_login:Date,
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = function(candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ phone: 1 }, { sparse: true });

export const User = model<IUser>('User', UserSchema);
```

### Step 2.2 — JWT Token Utilities

```typescript
// src/utils/tokenUtils.ts
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { env } from '../config/env';
import { redis } from '../config/redis';

interface AccessPayload {
  sub: string;
  role: string;
  lang: string;
  jti: string;
}

export function signAccessToken(payload: Omit<AccessPayload, 'jti'>): string {
  return jwt.sign({ ...payload, jti: nanoid() }, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, jti: nanoid() }, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
}

export function verifyToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessPayload;
}

// Store refresh token in Redis
export async function saveRefreshToken(userId: string, token: string) {
  const decoded = jwt.decode(token) as { exp: number };
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  await redis.setex(`session:${userId}`, ttl, token);
}

// Blacklist access token on logout
export async function blacklistToken(jti: string, expiresAt: number) {
  const ttl = expiresAt - Math.floor(Date.now() / 1000);
  if (ttl > 0) await redis.setex(`blacklist:${jti}`, ttl, '1');
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const result = await redis.get(`blacklist:${jti}`);
  return result !== null;
}
```

### Step 2.3 — Auth Middleware

```typescript
// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken, isTokenBlacklisted } from '../utils/tokenUtils';
import { UnauthorizedError } from '../utils/errors';

export async function authenticateJWT(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Token required');

  const token = header.split(' ')[1];
  const payload = verifyToken(token);

  if (await isTokenBlacklisted(payload.jti)) {
    throw new UnauthorizedError('Token has been revoked');
  }

  req.user = { id: payload.sub, role: payload.role as any, lang: payload.lang };
  next();
}
```

### Step 2.4 — RBAC Middleware

```typescript
// src/middleware/rbac.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';
import type { Role } from '../models/User';

export const requireRole = (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!roles.includes(req.user.role as Role)) {
      throw new ForbiddenError('Insufficient permissions for this action');
    }
    next();
  };

// Regional scope guard — extension officers can only see their district
export const requireRegionalScope = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user.role === 'extension_officer') {
    req.query.region = req.user.region;   // Force-inject region filter
  }
  next();
};
```

### Step 2.5 — Auth Controller & Routes

```typescript
// src/controllers/auth.controller.ts

// POST /api/v1/auth/register
async function register(req: Request, res: Response) {
  const { name, email, phone, password, language, role } = req.body;
  // Validate with Zod
  // Check duplicate email/phone
  // Create user with nanoid user_id
  // Issue tokens
  // Return 201 with user + tokens
}

// POST /api/v1/auth/login
async function login(req: Request, res: Response) {
  const { email, phone, password } = req.body;
  // Find user by email or phone
  // Compare password (bcrypt)
  // Update last_login
  // Sign access + refresh tokens
  // Store refresh in Redis
  // Set refresh token in HttpOnly cookie
  // Return access token in body
}

// POST /api/v1/auth/refresh
async function refreshToken(req: Request, res: Response) {
  // Read refresh token from HttpOnly cookie
  // Verify against Redis session
  // Rotate: issue new access + refresh pair
  // Revoke old refresh token from Redis
}

// POST /api/v1/auth/logout
async function logout(req: Request, res: Response) {
  // Blacklist current access token jti
  // Delete session from Redis
  // Clear HttpOnly cookie
}

// POST /api/v1/auth/forgot-password
async function forgotPassword(req: Request, res: Response) {
  // Find user by email
  // Generate signed reset token (JWT, 1h)
  // Send via email (SendGrid)
}

// POST /api/v1/auth/reset-password
async function resetPassword(req: Request, res: Response) {
  // Verify reset token
  // Update password (triggers pre-save bcrypt hash)
  // Invalidate all existing sessions for that user in Redis
}
```

---

## 5. Phase 3 — Groq AI Integration (Image Classification Bridge)

This is the core replacement of the custom PyTorch/ONNX model. We use Groq's vision-capable Llama model for disease classification.

### Step 3.1 — Groq Vision Service (Node.js)

```typescript
// src/services/groq.service.ts
import Groq from 'groq-sdk';
import { env } from '../config/env';

const groq = new Groq({ apiKey: env.GROQ_API_KEY });

export interface ClassificationResult {
  disease_label:   string;
  scientific_name: string;
  confidence:      number;
  top_k: Array<{ label: string; confidence: number }>;
  model_version:   string;
  low_confidence:  boolean;
}

const CLASSIFICATION_SYSTEM_PROMPT = `
You are an expert agricultural plant pathologist AI. Your ONLY job is to analyze leaf images and identify plant diseases.

You MUST respond with ONLY a valid JSON object in this exact format — no markdown, no explanation:
{
  "disease_label": "string (disease common name, e.g. 'Late Blight')",
  "scientific_name": "string (scientific name, e.g. 'Phytophthora infestans')",
  "confidence": number (0.0 to 1.0),
  "is_healthy": boolean,
  "top_k": [
    { "label": "string", "confidence": number },
    { "label": "string", "confidence": number },
    { "label": "string", "confidence": number }
  ]
}

Supported crops: Tomato, Potato, Pepper, Maize, Wheat, Rice, Groundnut.
Disease classes include: Late Blight, Early Blight, Leaf Mold, Septoria Leaf Spot, 
Spider Mites, Target Spot, Mosaic Virus, Yellow Leaf Curl Virus, Bacterial Spot, 
Gray Leaf Spot, Common Rust, Northern Blight, Stripe Rust, Leaf Rust, Rice Blast, 
Bacterial Blight, Brown Spot, Early Leaf Spot, Late Leaf Spot, Rosette, Healthy.

If the image is NOT a plant leaf or is unclear, set confidence below 0.4 and disease_label to "Unidentifiable".
`;

export async function classifyLeafImage(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  cropType: string,
  language: string = 'en',
): Promise<ClassificationResult> {
  const userPrompt = `Analyze this ${cropType} leaf image for diseases. Crop type: ${cropType}.`;

  const response = await groq.chat.completions.create({
    model: env.GROQ_VISION_MODEL,
    messages: [
      { role: 'system', content: CLASSIFICATION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ],
    temperature: 0.1,    // Low temperature for deterministic classification
    max_tokens: 300,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0].message.content ?? '{}';
  let parsed: any;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Groq returned invalid JSON for classification');
  }

  const confidence = parsed.confidence ?? 0;
  const threshold = parseFloat(env.CONFIDENCE_THRESHOLD);

  return {
    disease_label:  parsed.disease_label ?? 'Unknown',
    scientific_name:parsed.scientific_name ?? '',
    confidence,
    top_k:          parsed.top_k ?? [],
    model_version:  `groq-${env.GROQ_VISION_MODEL}`,
    low_confidence: confidence < threshold,
  };
}
```

### Step 3.2 — Python FastAPI ML Bridge (Alternative/Optional)

If you prefer keeping the ML service as a Python microservice that internally calls Groq:

```python
# apps/ml/app/services/groq_vision.py
import os, base64, json
from groq import Groq
from ..schemas.classify import ClassificationResponse

client = Groq(api_key=os.environ["GROQ_API_KEY"])

SYSTEM_PROMPT = """
You are an expert plant pathologist. Analyze the leaf image and respond ONLY with JSON:
{
  "disease_label": "string",
  "scientific_name": "string", 
  "confidence": float,
  "top_k": [{"label": "string", "confidence": float}]
}
"""

async def classify_leaf(image_bytes: bytes, crop_type: str) -> ClassificationResponse:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    
    response = client.chat.completions.create(
        model=os.environ.get("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    {"type": "text", "text": f"Crop: {crop_type}. Identify any disease."}
                ]
            }
        ],
        temperature=0.1,
        max_tokens=300,
        response_format={"type": "json_object"}
    )
    
    data = json.loads(response.choices[0].message.content)
    return ClassificationResponse(**data, model_version=f"groq-vision-v1")
```

```python
# apps/ml/app/api/classify.py
from fastapi import APIRouter, UploadFile, File, Form, Header, HTTPException
from ..services.groq_vision import classify_leaf
import os

router = APIRouter()

@router.post("/classify")
async def classify_endpoint(
    file: UploadFile = File(...),
    crop_type: str = Form(...),
    x_internal_key: str = Header(...),
):
    if x_internal_key != os.environ["ML_INTERNAL_KEY"]:
        raise HTTPException(403, "Forbidden")
    
    image_bytes = await file.read()
    if len(image_bytes) > 8 * 1024 * 1024:
        raise HTTPException(413, "Image too large")
    
    result = await classify_leaf(image_bytes, crop_type)
    return result
```

> **Decision:** Use the Node.js `groq.service.ts` approach for simplicity (fewer services to run). The Python FastAPI bridge is optional — use it only if you need image pre-processing (Sharp → Python PIL pipeline) or if you later want to swap back to a real ONNX model without touching the Node.js code.

### Step 3.3 — Groq Chat Service (for AI Chatbot)

```typescript
// src/services/chat.service.ts (excerpt)

export async function streamChatResponse(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  scanContext?: string,
  language: string = 'en',
): Promise<AsyncIterable<string>> {

  const systemPrompt = buildRAGSystemPrompt(scanContext, language);
  const ragContext   = await retrieveKnowledgeContext(message);   // Qdrant semantic search

  const stream = await groq.chat.completions.stream({
    model: env.GROQ_CHAT_MODEL,          // llama-3.3-70b-versatile
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Context:\n${ragContext}\n\nQuestion: ${message}` },
      ...history.slice(-10),             // Last 10 turns only (context window management)
    ],
    temperature: 0.4,
    max_tokens: 800,
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? '';
      if (token) yield token;
    }
  })();
}
```

---

## 6. Phase 4 — Scan Pipeline

This is the most critical flow: image upload → EXIF strip → S3 upload → Groq classification → treatment lookup → MongoDB save → response.

### Step 4.1 — Scan Schema

```typescript
// src/models/Scan.ts
const ScanSchema = new Schema({
  scan_id:        { type: String, required: true, unique: true },  // scn_<nanoid>
  user_id:        { type: Schema.Types.ObjectId, ref: 'User' },
  device_id:      String,    // Hashed fingerprint for guest users
  image_url:      { type: String, required: true },
  image_s3_key:   String,
  crop_type:      { type: String, required: true, enum: SUPPORTED_CROPS },
  location: {
    type:         { type: String, enum: ['Point'], default: 'Point' },
    coordinates:  { type: [Number], default: [0, 0] },   // [lon, lat]
  },
  prediction: {
    disease_label:   String,
    scientific_name: String,
    confidence:      Number,
    top_k:           [{ label: String, confidence: Number }],
    model_version:   String,
    low_confidence:  { type: Boolean, default: false },
  },
  treatment_ref:      { type: Schema.Types.ObjectId, ref: 'Treatment' },
  feedback:           { type: String, enum: ['correct', 'incorrect', null], default: null },
  offline_queued_at:  Date,
  processed_at:       Date,
  language:           { type: String, enum: ['en','hi','gu'], default: 'en' },
  status:             { type: String, enum: ['pending','processed','failed'], default: 'processed' },
  is_deleted:         { type: Boolean, default: false },
}, { timestamps: true });

ScanSchema.index({ location: '2dsphere' });
ScanSchema.index({ user_id: 1, createdAt: -1 });
ScanSchema.index({ 'prediction.disease_label': 1, createdAt: -1 });
ScanSchema.index({ crop_type: 1, 'prediction.disease_label': 1 });
```

### Step 4.2 — Upload Middleware (Multer)

```typescript
// src/middleware/upload.middleware.ts
import multer from 'multer';
import { RequestHandler } from 'express';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;  // 8 MB

export const uploadLeafImage: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('unsupported_media_type'));
    }
  },
}).single('image');
```

### Step 4.3 — Image Service (Sharp + S3)

```typescript
// src/services/image.service.ts
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { nanoid } from 'nanoid';

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
});

export async function processAndUploadImage(
  buffer: Buffer,
  mimeType: string,
  userId: string,
): Promise<{ s3Key: string; s3Url: string; base64: string; processedMimeType: string }> {

  // 1. Strip EXIF (privacy) + resize to max 1024px + convert to JPEG
  const processed = await sharp(buffer)
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .rotate()                         // Correct EXIF orientation
    .removeAlpha()
    .jpeg({ quality: 85 })
    .withMetadata({})                 // Strip EXIF GPS data
    .toBuffer();

  // 2. Also get a 224x224 version for Groq classification (smaller = cheaper tokens)
  const classifyBuffer = await sharp(buffer)
    .resize(224, 224)
    .jpeg({ quality: 80 })
    .toBuffer();

  // 3. Upload to S3
  const s3Key = `scans/${userId}/${nanoid()}.jpg`;
  await s3.send(new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: s3Key,
    Body: processed,
    ContentType: 'image/jpeg',
    ServerSideEncryption: 'AES256',
    ACL: 'private',
  }));

  // 4. Generate pre-signed URL (15 min TTL)
  const s3Url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET, Key: s3Key,
  }), { expiresIn: 900 });

  return {
    s3Key,
    s3Url,
    base64: classifyBuffer.toString('base64'),
    processedMimeType: 'image/jpeg',
  };
}
```

### Step 4.4 — Scan Controller (Full Pipeline)

```typescript
// src/controllers/scan.controller.ts

// POST /api/v1/scans
export async function submitScan(req: Request, res: Response) {
  // 1. Validate request body (Zod)
  const { crop_type, latitude, longitude, offline_queued_at, device_id, language } = 
    ScanSubmitSchema.parse(req.body);

  if (!req.file) throw new BadRequestError('image_required');

  // 2. Process image (EXIF strip, resize, S3 upload)
  const { s3Key, s3Url, base64, processedMimeType } = 
    await imageService.processAndUploadImage(req.file.buffer, req.file.mimetype, req.user.id);

  // 3. Call Groq Vision for disease classification
  const prediction = await groqService.classifyLeafImage(base64, processedMimeType, crop_type, language);

  // 4. Fetch treatment from MongoDB (with Redis cache)
  const treatment = await treatmentService.getForDisease(
    prediction.disease_label, crop_type, req.user.region, language,
  );

  // 5. Save scan document to MongoDB
  const scan = await Scan.create({
    scan_id: `scn_${nanoid()}`,
    user_id: req.user.id,
    device_id: device_id ? hashDeviceId(device_id) : undefined,
    image_url: s3Url,
    image_s3_key: s3Key,
    crop_type,
    location: { type: 'Point', coordinates: [longitude ?? 0, latitude ?? 0] },
    prediction: { ...prediction },
    treatment_ref: treatment?._id,
    offline_queued_at: offline_queued_at ? new Date(offline_queued_at) : undefined,
    processed_at: new Date(),
    language,
    status: 'processed',
  });

  // 6. Emit real-time result via WebSocket (for PWA live update)
  socketServer.to(`user:${req.user.id}`).emit('scan:result', {
    scan_id: scan.scan_id,
    diagnosis: prediction,
    treatment,
  });

  // 7. Log audit
  await auditService.log({
    actor_id: req.user.id,
    action: 'scan.submit',
    resource: `Scan:${scan.scan_id}`,
    metadata: { crop_type, disease: prediction.disease_label },
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
  });

  // 8. Queue follow-up treatment reminder (7 days out)
  await notificationQueue.add('treatment_reminder', {
    user_id: req.user.id,
    scan_id: scan.scan_id,
    disease: prediction.disease_label,
    language,
  }, { delay: 7 * 24 * 60 * 60 * 1000 });

  return res.status(201).json(apiResponse.success({
    scan_id: scan.scan_id,
    disease: prediction,
    treatment,
    low_confidence: prediction.low_confidence,
    processed_at: scan.processed_at,
  }));
}

// PATCH /api/v1/scans/:id/feedback
export async function submitFeedback(req: Request, res: Response) {
  const { feedback } = FeedbackSchema.parse(req.body);  // 'correct' | 'incorrect'
  const scan = await Scan.findOneAndUpdate(
    { scan_id: req.params.id, user_id: req.user.id },
    { feedback },
    { new: true },
  );
  if (!scan) throw new NotFoundError('Scan not found');

  // If marked incorrect, flag for retraining pipeline
  if (feedback === 'incorrect') {
    await retrainingQueue.add('flag_for_review', {
      scan_id: scan.scan_id,
      image_s3_key: scan.image_s3_key,
      predicted_disease: scan.prediction.disease_label,
      crop_type: scan.crop_type,
    });
  }

  return res.json(apiResponse.success({ message: 'Feedback recorded. Thank you!' }));
}
```

---

## 7. Phase 5 — Treatment Database & Recommendation Engine

### Step 5.1 — Treatment Schema

```typescript
// src/models/Treatment.ts
const TreatmentSchema = new Schema({
  treatment_id:  { type: String, required: true, unique: true },
  disease_label: { type: String, required: true },
  crop:          { type: String, required: true },
  regions:       [String],       // ['Gujarat', 'Rajasthan', 'All India']
  seasons:       [String],       // ['Kharif', 'Rabi', 'Zaid', 'Year-round']
  chemical: {
    product:     String,
    dosage:      String,
    method:      String,
    interval:    String,
    pre_harvest_interval: String,
    safety_notes: String,
  },
  organic: {
    remedy:      String,
    dosage:      String,
    timing:      String,
  },
  prevention:    [String],
  source:        String,          // 'ICAR Bulletin 2023, p.14'
  verified_by:   String,          // Agronomist name
  verified_at:   Date,
  status:        { type: String, enum: ['active','archived'], default: 'active' },
  localized: {
    en: { summary: String, prevention_text: String },
    hi: { summary: String, prevention_text: String },
    gu: { summary: String, prevention_text: String },
  },
}, { timestamps: true });

TreatmentSchema.index({ disease_label: 1, crop: 1, regions: 1 });
```

### Step 5.2 — Treatment Service (with Redis Cache)

```typescript
// src/services/treatment.service.ts
import { redis } from '../config/redis';
import { Treatment } from '../models/Treatment';

const CACHE_TTL_SECONDS = 3600;  // 1 hour

export async function getForDisease(
  diseaseLabel: string,
  crop: string,
  region?: string,
  lang: string = 'en',
): Promise<any | null> {

  const cacheKey = `treatment:${diseaseLabel}:${crop}:${region ?? 'all'}:${lang}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // MongoDB query — prefer regional match, fall back to 'All India'
  const treatment = await Treatment.findOne({
    disease_label: diseaseLabel,
    crop,
    status: 'active',
    $or: [
      { regions: region },
      { regions: 'All India' },
    ],
  }).lean();

  if (!treatment) return null;

  // Extract localized content
  const localized = treatment.localized?.[lang as 'en'|'hi'|'gu'] ?? treatment.localized?.en;

  const result = {
    treatment_id: treatment.treatment_id,
    chemical:     treatment.chemical,
    organic:      treatment.organic,
    prevention:   treatment.prevention,
    source:       treatment.source,
    verified_by:  treatment.verified_by,
    summary:      localized?.summary,
  };

  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
  return result;
}
```

### Step 5.3 — Treatment Proposal Workflow

```typescript
// src/models/TreatmentProposal.ts
const TreatmentProposalSchema = new Schema({
  proposal_id:    { type: String, required: true, unique: true },
  base_treatment: { type: Schema.Types.ObjectId, ref: 'Treatment' },   // null if new
  proposed_by:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  proposed_data:  Schema.Types.Mixed,    // Full treatment object being proposed
  diff:           Schema.Types.Mixed,    // {field: {old, new}} — computed at approval
  status:         { type: String, enum: ['pending_review','approved','rejected'], default: 'pending_review' },
  reviewed_by:    { type: Schema.Types.ObjectId, ref: 'User' },
  reviewed_at:    Date,
  rejection_reason: String,
  source_citation: String,
}, { timestamps: true });
```

---

## 8. Phase 6 — AI Chatbot (RAG Pipeline with Groq)

### Step 6.1 — Qdrant Vector Database Setup

```typescript
// src/services/qdrant.service.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../config/env';

export const qdrant = new QdrantClient({ url: env.QDRANT_URL });

export async function initializeQdrantCollection() {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some(c => c.name === env.QDRANT_COLLECTION);

  if (!exists) {
    await qdrant.createCollection(env.QDRANT_COLLECTION, {
      vectors: { size: 1536, distance: 'Cosine' },
    });
    console.log(`Created Qdrant collection: ${env.QDRANT_COLLECTION}`);
  }
}

// Semantic search
export async function semanticSearch(
  queryVector: number[],
  limit: number = 5,
  filter?: object,
): Promise<any[]> {
  const results = await qdrant.search(env.QDRANT_COLLECTION, {
    vector: queryVector,
    limit,
    filter,
    with_payload: true,
  });
  return results;
}

// Upsert document embeddings
export async function upsertDocuments(
  points: Array<{ id: string; vector: number[]; payload: object }>
) {
  await qdrant.upsert(env.QDRANT_COLLECTION, {
    wait: true,
    points: points.map(p => ({ id: p.id, vector: p.vector, payload: p.payload })),
  });
}
```

### Step 6.2 — Embedding Generation (via Groq / External)

Since Groq doesn't provide a dedicated embedding endpoint, use one of:
- **Option A:** Groq's text model with a custom embedding prompt (simple, no extra cost)
- **Option B:** OpenAI's `text-embedding-ada-002` as a side call (more accurate)
- **Option C:** HuggingFace Inference API for `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` (multilingual, free tier)

```typescript
// src/services/embedding.service.ts
// Recommended: Option C — multilingual free embeddings

export async function generateEmbedding(text: string): Promise<number[]> {
  // Using HuggingFace Inference API for embeddings
  const response = await fetch(
    'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/paraphrase-multilingual-mpnet-base-v2',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: text }),
    }
  );
  const embedding = await response.json();
  return Array.isArray(embedding[0]) ? embedding[0] : embedding;
}
```

### Step 6.3 — Knowledge Base Ingestion Script

```typescript
// src/scripts/ingestKnowledgeBase.ts
// Run once: npx ts-node src/scripts/ingestKnowledgeBase.ts

import { Treatment } from '../models/Treatment';
import { generateEmbedding } from '../services/embedding.service';
import { upsertDocuments } from '../services/qdrant.service';

async function ingest() {
  const treatments = await Treatment.find({ status: 'active' }).lean();

  const points = await Promise.all(treatments.map(async (t) => {
    const text = `Disease: ${t.disease_label}. Crop: ${t.crop}. 
      Chemical: ${t.chemical?.product} at ${t.chemical?.dosage}. 
      Organic: ${t.organic?.remedy}. 
      Prevention: ${t.prevention?.join('. ')}.
      Source: ${t.source}`;

    const vector = await generateEmbedding(text);

    return {
      id: t.treatment_id,
      vector,
      payload: {
        type: 'treatment',
        disease_label: t.disease_label,
        crop: t.crop,
        title: `${t.disease_label} — ${t.crop}`,
        source: t.source,
        snippet: text.substring(0, 300),
      },
    };
  }));

  await upsertDocuments(points);
  console.log(`Ingested ${points.length} treatment documents into Qdrant`);
}

ingest().catch(console.error);
```

### Step 6.4 — Chat Controller

```typescript
// src/controllers/chat.controller.ts

// POST /api/v1/chat
export async function chat(req: Request, res: Response) {
  const { message, history, scan_context_id } = ChatSchema.parse(req.body);

  // Set SSE headers (Server-Sent Events for streaming)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Optionally resolve scan context (grounds the chat to a specific scan)
  let scanContext: string | undefined;
  if (scan_context_id) {
    const scan = await Scan.findOne({ scan_id: scan_context_id, user_id: req.user.id })
      .populate('treatment_ref').lean();
    if (scan) {
      scanContext = `The farmer's scan showed: ${scan.prediction.disease_label} on ${scan.crop_type} with ${Math.round((scan.prediction.confidence ?? 0) * 100)}% confidence.`;
    }
  }

  // Retrieve relevant context from Qdrant (RAG)
  const queryVector = await generateEmbedding(message);
  const ragDocs     = await semanticSearch(queryVector, 5);
  const ragContext  = ragDocs.map(d => d.payload.snippet).join('\n\n');

  // Save chat message to DB
  const session = await ChatSession.findOneAndUpdate(
    { user_id: req.user.id, session_id: req.body.session_id ?? `chat_${nanoid()}` },
    { $push: { messages: { role: 'user', content: message, timestamp: new Date() } } },
    { upsert: true, new: true },
  );

  // Stream Groq response
  const tokenStream = await chatService.streamChatResponse(
    message, history, scanContext ?? ragContext, req.user.lang,
  );

  let fullResponse = '';
  for await (const token of tokenStream) {
    fullResponse += token;
    res.write(`data: ${JSON.stringify({ token })}\n\n`);
  }

  // Save assistant response
  await ChatSession.findByIdAndUpdate(session._id, {
    $push: { messages: { role: 'assistant', content: fullResponse, timestamp: new Date() } },
  });

  // Send sources
  res.write(`data: ${JSON.stringify({ done: true, sources: ragDocs.map(d => d.payload.source) })}\n\n`);
  res.end();
}
```

### Step 6.5 — Chat Session Schema

```typescript
const ChatSessionSchema = new Schema({
  session_id: { type: String, required: true, unique: true },
  user_id:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  messages:   [{
    role:      { type: String, enum: ['user','assistant'] },
    content:   String,
    timestamp: Date,
  }],
  context_scan_id: String,
}, { timestamps: true });

ChatSessionSchema.index({ user_id: 1, updatedAt: -1 });
```

---

## 9. Phase 7 — Notification System

### Step 7.1 — Push Notification Service (VAPID)

```typescript
// src/services/push.service.ts
import webpush from 'web-push';
import { env } from '../config/env';

webpush.setVapidDetails(
  'mailto:support@krishiraksha.in',
  env.VAPID_PUBLIC_KEY,
  env.VAPID_PRIVATE_KEY,
);

export interface PushPayload {
  title: string;
  body:  string;
  icon:  string;
  badge?: string;
  data?: object;
}

export async function sendPush(subscription: webpush.PushSubscription, payload: PushPayload) {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err: any) {
    if (err.statusCode === 410) {
      // Subscription expired — remove from DB
      await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
    }
    throw err;
  }
}
```

### Step 7.2 — SMS Service (Twilio)

```typescript
// src/services/sms.service.ts
import twilio from 'twilio';
import { env } from '../config/env';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

const SMS_TEMPLATES = {
  scan_result: {
    en: (disease: string) => `Krishi Raksha: Your crop scan result is ready. Detected: ${disease}. Open the app to view treatment details.`,
    hi: (disease: string) => `कृषि रक्षा: आपके फसल स्कैन का परिणाम तैयार है। रोग: ${disease}। उपचार देखने के लिए ऐप खोलें।`,
    gu: (disease: string) => `કૃષિ રક્ષા: તમારા પાક સ્કેનનું પરિણામ તૈયાર છે. રોગ: ${disease}. સારવાર જોવા એપ ખોલો.`,
  },
  outbreak_alert: {
    en: (district: string, disease: string) => `ALERT: High ${disease} incidence in ${district}. Take preventive measures now.`,
    hi: (district: string, disease: string) => `चेतावनी: ${district} में ${disease} का प्रकोप बढ़ रहा है। अभी उपाय करें।`,
    gu: (district: string, disease: string) => `ચેતવણી: ${district} માં ${disease}નો ફેલાવો વધ્યો છે. હવે પગલાં ભરો.`,
  },
};

export async function sendScanResultSMS(phone: string, disease: string, lang: 'en'|'hi'|'gu') {
  const body = SMS_TEMPLATES.scan_result[lang](disease);
  await client.messages.create({
    to: `+91${phone}`,
    from: env.TWILIO_FROM_NUMBER!,
    body,
  });
}

export async function sendOutbreakAlertSMS(phone: string, district: string, disease: string, lang: 'en'|'hi'|'gu') {
  const body = SMS_TEMPLATES.outbreak_alert[lang](district, disease);
  await client.messages.create({ to: `+91${phone}`, from: env.TWILIO_FROM_NUMBER!, body });
}
```

### Step 7.3 — Email Service (SendGrid)

```typescript
// src/services/email.service.ts
import sgMail from '@sendgrid/mail';
import { env } from '../config/env';

sgMail.setApiKey(env.SENDGRID_API_KEY!);

export async function sendScanResultEmail(to: string, disease: string, treatmentUrl: string) {
  await sgMail.send({
    to,
    from: 'noreply@krishiraksha.in',
    subject: `Your Crop Disease Scan Result — ${disease}`,
    html: `
      <h2>Krishi Raksha — Scan Result</h2>
      <p>Your crop has been identified with: <strong>${disease}</strong></p>
      <a href="${treatmentUrl}">View Full Treatment Plan →</a>
    `,
  });
}

export async function sendTreatmentProposalEmail(adminEmail: string, proposerName: string, disease: string) {
  await sgMail.send({
    to: adminEmail,
    from: 'admin@krishiraksha.in',
    subject: `New Treatment Proposal: ${disease}`,
    html: `<p>${proposerName} has submitted a new treatment proposal for ${disease}. Please review it in the admin panel.</p>`,
  });
}
```

### Step 7.4 — Notification Schema & Routes

```typescript
// src/models/Notification.ts
const NotificationSchema = new Schema({
  notification_id: { type: String, required: true, unique: true },
  user_id:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type:            { type: String, enum: ['scan_result','outbreak_alert','treatment_reminder','model_updated','feedback_thanks'] },
  title:           String,
  body:            String,
  data:            Schema.Types.Mixed,
  channels:        [{ type: String, enum: ['push','sms','email'] }],
  is_read:         { type: Boolean, default: false },
  sent_at:         Date,
}, { timestamps: true });

NotificationSchema.index({ user_id: 1, createdAt: -1 });
```

```typescript
// Routes
// GET /api/v1/notifications          → List user's notifications (paginated)
// PATCH /api/v1/notifications/:id/read → Mark as read
// POST /api/v1/notifications/subscribe → Save VAPID push subscription
// DELETE /api/v1/notifications/subscribe → Remove push subscription
```

---

## 10. Phase 8 — Analytics & Predictive Dashboard

### Step 8.1 — Analytics Service

```typescript
// src/services/analytics.service.ts

// Scan volume aggregation (time series)
export async function getScanTrends(from: Date, to: Date, region?: string, granularity: 'day'|'week'|'month' = 'day') {
  const matchStage: any = { createdAt: { $gte: from, $lte: to }, is_deleted: false };
  if (region) matchStage['user.region'] = region;

  return Scan.aggregate([
    { $match: matchStage },
    { $group: {
      _id: {
        $dateToString: { format: granularity === 'day' ? '%Y-%m-%d' : granularity === 'week' ? '%Y-W%V' : '%Y-%m', date: '$createdAt' }
      },
      count: { $sum: 1 },
      diseases: { $push: '$prediction.disease_label' },
    }},
    { $sort: { _id: 1 } },
  ]);
}

// Disease heatmap data (GeoJSON)
export async function getDiseaseHeatmap(diseaseLabel?: string, region?: string) {
  const match: any = { 'location.coordinates': { $ne: [0, 0] }, is_deleted: false };
  if (diseaseLabel) match['prediction.disease_label'] = diseaseLabel;

  return Scan.aggregate([
    { $match: match },
    { $group: {
      _id: { disease: '$prediction.disease_label', lat: { $round: ['$location.coordinates.1', 2] }, lon: { $round: ['$location.coordinates.0', 2] } },
      count: { $sum: 1 },
    }},
    { $project: { lat: '$_id.lat', lon: '$_id.lon', disease: '$_id.disease', count: 1 } },
  ]);
}

// Model accuracy (from feedback)
export async function getModelAccuracy(from: Date, to: Date) {
  const result = await Scan.aggregate([
    { $match: { feedback: { $ne: null }, createdAt: { $gte: from, $lte: to } } },
    { $group: {
      _id: null,
      total: { $sum: 1 },
      correct: { $sum: { $cond: [{ $eq: ['$feedback', 'correct'] }, 1, 0] } },
    }},
    { $project: { accuracy: { $divide: ['$correct', '$total'] }, total: 1, correct: 1 } },
  ]);
  return result[0] ?? { accuracy: null, total: 0, correct: 0 };
}

// Outbreak detection (auto-threshold alerts)
export async function detectOutbreaks(thresholdPerDistrict: number = 50) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  return Scan.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $group: {
      _id: { district: '$user.region', disease: '$prediction.disease_label' },
      count: { $sum: 1 },
    }},
    { $match: { count: { $gte: thresholdPerDistrict } } },
    { $sort: { count: -1 } },
  ]);
}
```

### Step 8.2 — Outbreak Alert Auto-Generation

```typescript
// src/jobs/outbreakDetect.worker.ts
// Runs every 6 hours via Bull queue

async function detectAndAlertOutbreaks() {
  const outbreaks = await analyticsService.detectOutbreaks(50);

  for (const outbreak of outbreaks) {
    const { district, disease } = outbreak._id;

    // Check if alert already exists for this district+disease in last 48h
    const recent = await OutbreakAlert.findOne({
      district,
      disease,
      created_at: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    });
    if (recent) continue;

    // Create alert
    await OutbreakAlert.create({
      alert_id: `alert_${nanoid()}`,
      district,
      disease,
      scan_count_last_7d: outbreak.count,
      alert_level: outbreak.count > 200 ? 'critical' : 'high',
      status: 'active',
    });

    // Notify extension officers in that district
    const officers = await User.find({ role: 'extension_officer', region: district });
    for (const officer of officers) {
      await notifQueue.add('outbreak_alert', { user_id: officer._id, district, disease });
    }
  }
}
```

---

## 11. Phase 9 — Admin Panel APIs

### Step 9.1 — Admin Routes

```typescript
// All under /api/v1/admin — requires authenticateJWT + requireRole('admin')

// User management
GET  /api/v1/admin/users                  → List all users (paginated, searchable)
GET  /api/v1/admin/users/:id              → Get user details + scan history summary
PATCH /api/v1/admin/users/:id/role        → Promote/demote user role
PATCH /api/v1/admin/users/:id/suspend     → Suspend/activate user
DELETE /api/v1/admin/users/:id            → Soft delete user

// Treatment proposals
GET  /api/v1/admin/treatment-proposals    → List pending proposals
GET  /api/v1/admin/treatment-proposals/:id → Get proposal with diff
POST /api/v1/admin/treatment-proposals/:id/approve → Approve + apply to Treatment
POST /api/v1/admin/treatment-proposals/:id/reject  → Reject with reason

// System health
GET  /api/v1/admin/system/health          → MongoDB stats, Redis info, queue depths
GET  /api/v1/admin/system/queues          → Bull queue metrics

// Outbreak management
GET  /api/v1/admin/outbreak-alerts        → All active alerts
PATCH /api/v1/admin/outbreak-alerts/:id/acknowledge → Admin ack
```

### Step 9.2 — Admin System Health Endpoint

```typescript
export async function getSystemHealth(_req: Request, res: Response) {
  const [mongoStats, redisInfo, queueStats] = await Promise.all([
    mongoose.connection.db.stats(),
    redis.info(),
    getQueueStats(),
  ]);

  return res.json(apiResponse.success({
    mongo: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      collections: mongoStats.collections,
      dataSize: mongoStats.dataSize,
    },
    redis: {
      status: 'connected',
      used_memory: parseRedisInfo(redisInfo, 'used_memory_human'),
      connected_clients: parseRedisInfo(redisInfo, 'connected_clients'),
    },
    queues: queueStats,
    uptime_seconds: process.uptime(),
  }));
}
```

---

## 12. Phase 10 — Report Generation

### Step 10.1 — Report Job Queue & Schema

```typescript
// src/models/ReportJob.ts
const ReportJobSchema = new Schema({
  job_id:     { type: String, required: true, unique: true },
  requested_by: { type: Schema.Types.ObjectId, ref: 'User' },
  type:       { type: String, enum: ['district_weekly','farmer_history','model_performance','outbreak_incident'] },
  params:     Schema.Types.Mixed,   // { region, from, to, format }
  format:     { type: String, enum: ['pdf','csv'] },
  status:     { type: String, enum: ['queued','processing','complete','failed'], default: 'queued' },
  s3_url:     String,
  error:      String,
  completed_at: Date,
}, { timestamps: true });
```

### Step 10.2 — Report Worker

```typescript
// src/jobs/report.worker.ts
import PDFDocument from 'pdfkit';
import { createObjectCsvWriter } from 'csv-writer';
import { uploadToS3 } from '../services/image.service';

reportQueue.process('generate_report', async (job) => {
  const { job_id, type, params } = job.data;
  await ReportJob.findOneAndUpdate({ job_id }, { status: 'processing' });

  try {
    let s3Url: string;

    if (params.format === 'pdf') {
      const pdfBuffer = await generatePDFReport(type, params);
      s3Url = await uploadToS3(pdfBuffer, `reports/${job_id}.pdf`, 'application/pdf');
    } else {
      const csvContent = await generateCSVReport(type, params);
      s3Url = await uploadToS3(Buffer.from(csvContent), `reports/${job_id}.csv`, 'text/csv');
    }

    await ReportJob.findOneAndUpdate({ job_id }, {
      status: 'complete',
      s3_url: s3Url,
      completed_at: new Date(),
    });

    // Notify requesting user
    await pushService.notifyUser(job.data.user_id, {
      title: 'Report Ready',
      body:  'Your report has been generated and is ready to download.',
      data:  { download_url: s3Url },
    });

  } catch (err: any) {
    await ReportJob.findOneAndUpdate({ job_id }, { status: 'failed', error: err.message });
  }
});
```

---

## 13. Phase 11 — Smart Search (Semantic Search via Qdrant)

### Step 13.1 — Search Controller

```typescript
// src/controllers/search.controller.ts

// GET /api/v1/search?q=...&limit=5&type=treatment
export async function smartSearch(req: Request, res: Response) {
  const { q, limit = '5', type } = req.query as Record<string, string>;

  if (!q || q.trim().length < 2) {
    throw new BadRequestError('Query must be at least 2 characters');
  }

  // Generate embedding for query (multilingual)
  const queryVector = await generateEmbedding(q);

  // Optional filter by type (treatment, article, faq)
  const filter = type ? { must: [{ key: 'type', match: { value: type } }] } : undefined;

  const results = await semanticSearch(queryVector, parseInt(limit), filter);

  return res.json(apiResponse.success({
    query: q,
    results: results.map(r => ({
      type:    r.payload.type,
      title:   r.payload.title,
      snippet: r.payload.snippet,
      score:   r.score,
      source:  r.payload.source,
    })),
  }));
}
```

---

## 14. Phase 12 — WebSocket & Real-time Layer

### Step 14.1 — Socket.io Setup

```typescript
// src/config/socket.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from './redis';
import { verifyToken } from '../utils/tokenUtils';
import http from 'http';

let io: Server;

export function initSocketServer(httpServer: http.Server) {
  io = new Server(httpServer, {
    cors: { origin: process.env.APP_URL, credentials: true },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter for horizontal scaling
  io.adapter(createAdapter(pubClient, subClient));

  // JWT authentication for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.sub;
      socket.data.role   = payload.role;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);        // User's private room

    if (socket.data.role === 'admin') {
      socket.join('room:admin');          // Admin broadcast room
    }
    if (socket.data.role === 'extension_officer') {
      socket.join(`room:officer:${socket.data.region}`);
    }

    socket.on('disconnect', () => {
      socket.leave(`user:${userId}`);
    });
  });

  return io;
}

export function getSocketServer() { return io; }
```

### Step 14.2 — Real-time Events Reference

| Event Name | Direction | Payload | Purpose |
|---|---|---|---|
| `scan:result` | Server → Client | `{ scan_id, diagnosis, treatment }` | Push result after offline sync |
| `scan:processing` | Server → Client | `{ scan_id }` | Show processing spinner |
| `outbreak:alert` | Server → Client | `{ district, disease, level }` | Alert extension officers |
| `notification:new` | Server → Client | `{ notification_id, title, body }` | Real-time notification badge |
| `report:ready` | Server → Client | `{ job_id, download_url }` | Notify when report is done |

---

## 15. Phase 13 — Audit Logs

### Step 15.1 — Audit Service

```typescript
// src/services/audit.service.ts
import { AuditLog } from '../models/AuditLog';

interface AuditEntry {
  actor_id:   string;
  actor_role?: string;
  action:     string;      // 'scan.submit' | 'treatment.update' | 'user.suspend' | ...
  resource?:  string;      // 'Scan:scn_01' | 'Treatment:trt_01'
  metadata?:  object;
  ip_address?:string;
  user_agent?:string;
}

export async function log(entry: AuditEntry) {
  // Fire-and-forget — don't await in critical paths
  AuditLog.create({
    ...entry,
    created_at: new Date(),
  }).catch(console.error);
}
```

### Step 15.2 — Audit Log Schema

```typescript
// src/models/AuditLog.ts
const AuditLogSchema = new Schema({
  actor_id:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actor_role: String,
  action:     { type: String, required: true },
  resource:   String,
  metadata:   Schema.Types.Mixed,
  ip_address: String,
  user_agent: String,
  created_at: { type: Date, default: Date.now },
}, {
  capped: { size: 100 * 1024 * 1024 },   // 100 MB capped collection
  timestamps: false,
});

AuditLogSchema.index({ actor_id: 1, created_at: -1 });
AuditLogSchema.index({ action: 1, created_at: -1 });
```

**Audit events to log:**

| Event | When |
|---|---|
| `auth.login` | User login |
| `auth.logout` | User logout |
| `auth.password_reset` | Password reset |
| `scan.submit` | Scan submitted |
| `scan.feedback` | Feedback submitted |
| `scan.delete` | Scan deleted |
| `treatment.propose` | Treatment proposal submitted |
| `treatment.approve` | Treatment approved by admin |
| `treatment.reject` | Treatment rejected by admin |
| `user.role_change` | User role changed by admin |
| `user.suspend` | User suspended |
| `report.generate` | Report requested |
| `system.retrain_trigger` | Admin triggers model retraining |

---

## 16. Phase 14 — Background Jobs (Bull)

### Step 16.1 — Queue Definitions

```typescript
// src/jobs/queues.ts
import Bull from 'bull';
import { env } from '../config/env';

const redisConfig = { redis: env.REDIS_URL };

export const scanSyncQueue       = new Bull('scan-sync',          redisConfig);
export const notificationQueue   = new Bull('notifications',       redisConfig);
export const reportQueue         = new Bull('report-generation',   redisConfig);
export const retrainingQueue     = new Bull('model-retraining',    redisConfig);
export const outbreakQueue       = new Bull('outbreak-detection',  redisConfig);
export const embeddingQueue      = new Bull('embedding-ingestion', redisConfig);
```

### Step 16.2 — Recurring Jobs Schedule

```typescript
// src/jobs/scheduler.ts

// Outbreak detection — every 6 hours
outbreakQueue.add('detect', {}, {
  repeat: { cron: '0 */6 * * *' },
  removeOnComplete: 10,
  removeOnFail: 50,
});

// Treatment reminder follow-ups — checked every hour
notificationQueue.add('check_treatment_reminders', {}, {
  repeat: { cron: '0 * * * *' },
});

// Embedding re-ingestion after treatment updates — every day at 2 AM
embeddingQueue.add('reingest_treatments', {}, {
  repeat: { cron: '0 2 * * *' },
});

// Analytics pre-aggregation for dashboard — every day at midnight
analyticsQueue.add('preaggreagate', {}, {
  repeat: { cron: '0 0 * * *' },
});
```

### Step 16.3 — Scan Sync Worker

```typescript
// src/jobs/scanSync.worker.ts
// Handles scans replayed from offline queue (already validated, just need ML + treatment)

scanSyncQueue.process('replay_scan', 5, async (job) => {
  const { scan_id, user_id, image_s3_key, crop_type, language } = job.data;

  // Fetch image from S3
  const imageBuffer = await downloadFromS3(image_s3_key);
  const base64      = imageBuffer.toString('base64');

  // Groq classification
  const prediction = await groqService.classifyLeafImage(base64, 'image/jpeg', crop_type, language);

  // Treatment lookup
  const treatment = await treatmentService.getForDisease(prediction.disease_label, crop_type);

  // Update scan document
  await Scan.findOneAndUpdate({ scan_id }, {
    prediction,
    treatment_ref: treatment?._id,
    processed_at: new Date(),
    status: 'processed',
  });

  // Push result via WebSocket
  socketServer.to(`user:${user_id}`).emit('scan:result', { scan_id, prediction, treatment });

  // SMS if user has phone
  const user = await User.findById(user_id).select('phone language');
  if (user?.phone) {
    await smsService.sendScanResultSMS(user.phone, prediction.disease_label, user.language);
  }
});
```

---

## 17. Phase 15 — Security Hardening

### Step 17.1 — Rate Limiting

```typescript
// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis';

// General API rate limit
export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 minute
  max: 100,
  standardHeaders: true,
  store: new RedisStore({ sendCommand: (...args) => (redis as any).call(...args) }),
});

// Scan-specific rate limit (20/hour)
export const scanRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: { error: 'scan_rate_limit_exceeded', message: 'Maximum 20 scans per hour' },
});

// Auth rate limit (brute force protection)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip,
  message: { error: 'too_many_attempts', message: 'Too many login attempts. Try again in 15 minutes.' },
});

// Guest scan limit (3/day without account)
export const guestScanLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.body.device_id ?? req.ip,
});
```

### Step 17.2 — Input Sanitization

```typescript
// Zod validation schemas
// src/validators/scan.validators.ts
import { z } from 'zod';

export const ScanSubmitSchema = z.object({
  crop_type:         z.enum(['tomato','potato','pepper','maize','wheat','rice','groundnut']),
  latitude:          z.number().min(-90).max(90).optional(),
  longitude:         z.number().min(-180).max(180).optional(),
  offline_queued_at: z.string().datetime().optional(),
  device_id:         z.string().max(200).optional(),
  language:          z.enum(['en','hi','gu']).default('en'),
});

export const FeedbackSchema = z.object({
  feedback: z.enum(['correct','incorrect']),
});

// Auth validators
export const RegisterSchema = z.object({
  name:     z.string().min(2).max(100).trim(),
  email:    z.string().email().optional(),
  phone:    z.string().regex(/^[6-9]\d{9}$/).optional(),    // Indian mobile
  password: z.string().min(8).max(128),
  language: z.enum(['en','hi','gu']).default('en'),
  role:     z.enum(['farmer','extension_officer','agronomist']).default('farmer'),
  region:   z.string().max(100).optional(),
  state:    z.string().max(100).optional(),
}).refine(data => data.email || data.phone, {
  message: 'Either email or phone is required',
});
```

### Step 17.3 — Security Headers & Misc

```typescript
// Additional security middleware in app.ts

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:', '*.amazonaws.com', '*.minio.io'],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
}));

// EXIF stripping is done in image.service.ts via Sharp
// Device ID is hashed with SHA-256 before storage
// All S3 objects are private ACL + pre-signed URL for serving
// MongoDB injection is prevented via Mongoose schema type enforcement + Zod
// Secrets never logged (Winston transports configured to mask env vars)
```

---

## 18. Phase 16 — Docker & Deployment

### Step 18.1 — Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.9'

services:
  api:
    build: ./apps/api
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: development
      MONGODB_URI: mongodb://mongo:27017/krishi_raksha
      REDIS_URL: redis://redis:6379
      GROQ_API_KEY: ${GROQ_API_KEY}
      GROQ_VISION_MODEL: meta-llama/llama-4-scout-17b-16e-instruct
      GROQ_CHAT_MODEL: llama-3.3-70b-versatile
      AWS_ACCESS_KEY_ID: minio
      AWS_SECRET_ACCESS_KEY: minio123
      AWS_S3_BUCKET: krishi-raksha
      S3_ENDPOINT: http://minio:9000
      QDRANT_URL: http://qdrant:6333
      ML_INTERNAL_KEY: ${ML_INTERNAL_KEY}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}
    depends_on:
      - mongo
      - redis
      - qdrant
      - minio
    volumes:
      - ./apps/api:/app
      - /app/node_modules
    command: pnpm dev

  ml:
    build: ./apps/ml
    ports:
      - "8000:8000"
    environment:
      GROQ_API_KEY: ${GROQ_API_KEY}
      ML_INTERNAL_KEY: ${ML_INTERNAL_KEY}
    depends_on:
      - api

  mongo:
    image: mongo:7.0
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    command: mongod --replSet rs0     # Replica set for change streams

  redis:
    image: redis:7.2-alpine
    ports:
      - "6379:6379"
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data

  qdrant:
    image: qdrant/qdrant:v1.8.4
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"

  mongo-init:
    image: mongo:7.0
    depends_on:
      - mongo
    restart: "no"
    command: >
      bash -c "sleep 5 && mongosh --host mongo:27017 --eval 'rs.initiate()'"

volumes:
  mongo_data:
  redis_data:
  qdrant_data:
  minio_data:
```

### Step 18.2 — API Dockerfile

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

### Step 18.3 — ML Service Dockerfile

```dockerfile
# apps/ml/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

---

## 19. Phase 17 — Testing Strategy

### Step 19.1 — Unit Tests (Vitest)

```typescript
// src/__tests__/groq.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { classifyLeafImage } from '../services/groq.service';

vi.mock('groq-sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({
            disease_label: 'Late Blight',
            scientific_name: 'Phytophthora infestans',
            confidence: 0.92,
            top_k: [{ label: 'Late Blight', confidence: 0.92 }],
          }) } }],
        }),
      },
    },
  })),
}));

describe('Groq Classification Service', () => {
  it('should return structured classification result', async () => {
    const result = await classifyLeafImage('base64...', 'image/jpeg', 'tomato', 'en');
    expect(result.disease_label).toBe('Late Blight');
    expect(result.confidence).toBe(0.92);
    expect(result.low_confidence).toBe(false);
  });

  it('should flag low confidence results', async () => {
    // Mock low confidence response
    // ...
    expect(result.low_confidence).toBe(true);
  });
});
```

### Step 19.2 — Integration Tests

```typescript
// src/__tests__/scan.integration.test.ts
import supertest from 'supertest';
import app from '../app';

describe('POST /api/v1/scans', () => {
  it('should reject missing image', async () => {
    const res = await supertest(app)
      .post('/api/v1/scans')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ crop_type: 'tomato' });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('image_required');
  });

  it('should reject oversized image', async () => {
    // ...
    expect(res.status).toBe(413);
  });

  it('should return diagnosis for valid image', async () => {
    const res = await supertest(app)
      .post('/api/v1/scans')
      .set('Authorization', `Bearer ${farmerToken}`)
      .attach('image', Buffer.from('fake-image'), { filename: 'leaf.jpg', contentType: 'image/jpeg' })
      .field('crop_type', 'tomato')
      .field('language', 'en');
    
    expect(res.status).toBe(201);
    expect(res.body.data.disease.label).toBeDefined();
  });
});
```

### Step 19.3 — Load Testing (k6)

```javascript
// tests/load/scan_endpoint.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },    // Ramp to 50 users
    { duration: '5m', target: 50 },    // Stay at 50 for 5 min
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],  // 95% of requests under 3s
    http_req_failed: ['rate<0.01'],     // Less than 1% error rate
  },
};

export default function() {
  const res = http.post(
    'http://localhost:4000/api/v1/scans',
    { image: http.file(open('./test_leaf.jpg', 'b'), 'leaf.jpg'), crop_type: 'tomato' },
    { headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` } }
  );
  check(res, { 'status is 201': (r) => r.status === 201 });
  sleep(1);
}
```

---

## 20. Environment Variables Reference

```env
# ─── App ─────────────────────────────────────────────────────────
NODE_ENV=development
PORT=4000
APP_URL=http://localhost:3000
API_URL=http://localhost:4000

# ─── MongoDB ─────────────────────────────────────────────────────
MONGODB_URI=mongodb://localhost:27017/krishi_raksha

# ─── Redis ───────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── JWT ─────────────────────────────────────────────────────────
JWT_SECRET=your-256-bit-secret-here-minimum-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ─── GROQ API (Core AI) ──────────────────────────────────────────
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
GROQ_CHAT_MODEL=llama-3.3-70b-versatile

# ─── ML Service Internal Auth ────────────────────────────────────
ML_SERVICE_URL=http://localhost:8000
ML_INTERNAL_KEY=your-16-char-internal-secret

# ─── AWS S3 / MinIO ──────────────────────────────────────────────
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_S3_BUCKET=krishi-raksha-images
AWS_REGION=ap-south-1
S3_ENDPOINT=http://localhost:9000    # Set for MinIO; remove for real AWS

# ─── Notifications ───────────────────────────────────────────────
SENDGRID_API_KEY=SG.xxxxxxxxxx
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
VAPID_PUBLIC_KEY=Bxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VAPID_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─── Qdrant Vector DB ────────────────────────────────────────────
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=krishi_knowledge_base

# ─── Embeddings (for RAG) ────────────────────────────────────────
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ─── Monitoring ──────────────────────────────────────────────────
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx

# ─── AI Classification Config ────────────────────────────────────
CONFIDENCE_THRESHOLD=0.65
```

---

## 21. Complete API Endpoint Index

### Auth (`/api/v1/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | None | Register new user |
| POST | `/login` | None | Login (rate limited) |
| POST | `/refresh` | Cookie | Refresh access token |
| POST | `/logout` | JWT | Logout + blacklist token |
| POST | `/forgot-password` | None | Send reset email |
| POST | `/reset-password` | None | Reset with token |

### Scans (`/api/v1/scans`)
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/` | JWT | All | Submit leaf scan (multipart/form-data) |
| GET | `/` | JWT | All | My scan history (paginated) |
| GET | `/:id` | JWT | All | Single scan detail |
| PATCH | `/:id/feedback` | JWT | All | Submit correct/incorrect feedback |
| DELETE | `/:id` | JWT | All | Soft-delete own scan |

### Treatments (`/api/v1/treatments`)
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/` | JWT | All | List treatments (filter by crop, disease, region) |
| GET | `/:id` | JWT | All | Single treatment detail |
| POST | `/` | JWT | Agronomist, Admin | Propose new treatment |
| PATCH | `/:id` | JWT | Agronomist, Admin | Propose update |
| GET | `/proposals` | JWT | Admin | List pending proposals |
| POST | `/proposals/:id/approve` | JWT | Admin | Approve proposal |
| POST | `/proposals/:id/reject` | JWT | Admin | Reject proposal |

### Chat (`/api/v1/chat`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | JWT | Send message (SSE streaming response) |
| GET | `/sessions` | JWT | List user's chat sessions |
| GET | `/sessions/:id` | JWT | Full session history |
| DELETE | `/sessions/:id` | JWT | Delete session |

### Analytics (`/api/v1/analytics`)
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/scans` | JWT | Officer, Admin | Scan volume trends |
| GET | `/diseases/heatmap` | JWT | Officer, Admin | Disease heatmap data |
| GET | `/model/accuracy` | JWT | Admin | Model accuracy from feedback |
| GET | `/outbreak-alerts` | JWT | Officer, Admin | Active outbreak alerts |
| PATCH | `/outbreak-alerts/:id/acknowledge` | JWT | Admin | Acknowledge alert |

### Predictions (`/api/v1/predictions`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/outbreak` | JWT | Outbreak probability forecast |

### Notifications (`/api/v1/notifications`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | List user notifications (paginated) |
| PATCH | `/:id/read` | JWT | Mark as read |
| PATCH | `/read-all` | JWT | Mark all as read |
| POST | `/subscribe` | JWT | Save push subscription |
| DELETE | `/subscribe` | JWT | Remove push subscription |

### Reports (`/api/v1/reports`)
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/` | JWT | Officer, Admin | Request report generation |
| GET | `/:job_id/status` | JWT | Officer, Admin | Check report status |
| GET | `/:job_id/download` | JWT | Officer, Admin | Redirect to S3 download URL |

### Search (`/api/v1/search`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/?q=...&limit=5` | JWT | Semantic search over knowledge base |

### Audit Logs (`/api/v1/audit-logs`)
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/` | JWT | Admin | Search + filter audit logs |

### Users (`/api/v1/users`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | JWT | Get own profile |
| PATCH | `/me` | JWT | Update own profile |
| PATCH | `/me/language` | JWT | Change preferred language |
| DELETE | `/me` | JWT | Deactivate own account |

### Admin (`/api/v1/admin`)
| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/users` | JWT | Admin | List all users |
| PATCH | `/users/:id/role` | JWT | Admin | Change role |
| PATCH | `/users/:id/suspend` | JWT | Admin | Suspend/activate |
| GET | `/system/health` | JWT | Admin | System health metrics |
| GET | `/system/queues` | JWT | Admin | Bull queue stats |

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/health` | None | API health check |

---

## 22. Database Schema Reference

### Collections Summary

| Collection | Purpose | Key Indexes |
|---|---|---|
| `users` | Farmer, officer, agronomist, admin accounts | email, phone, role |
| `scans` | Crop disease scan records | user_id+date, disease+date, location 2dsphere |
| `treatments` | Curated treatment database | disease+crop+region |
| `treatment_proposals` | Pending treatment edits | status, proposed_by |
| `notifications` | User notifications | user_id+date |
| `push_subscriptions` | VAPID push endpoints | user_id, endpoint |
| `audit_logs` | Immutable action log (capped) | actor_id, action |
| `chat_sessions` | Chatbot conversation history | user_id+date |
| `report_jobs` | Async report generation jobs | status, requested_by |
| `outbreak_alerts` | District-level disease alerts | district+disease+date |

### Redis Key Patterns

| Key | TTL | Purpose |
|---|---|---|
| `session:{user_id}` | 7 days | Refresh token store |
| `blacklist:{jti}` | Access token lifetime | Revoked token blacklist |
| `treatment:{disease}:{crop}:{region}:{lang}` | 1 hour | Treatment cache |
| `ratelimit:{ip}:{route}` | 1 min / 15 min / 1 hour | Rate limiting counters |
| `scan_queue_depth` | No TTL | Monitoring metric |
| `outbreak:{district}:{disease}` | 48 hours | Dedup outbreak alerts |

---

## 23. Groq API Usage Plan

### Models Used

| Purpose | Groq Model | Approx Tokens/Call |
|---|---|---|
| Leaf disease classification | `meta-llama/llama-4-scout-17b-16e-instruct` | ~800 (image + prompt + JSON output) |
| AI chatbot responses | `llama-3.3-70b-versatile` | ~1500 (RAG context + response) |

### Cost Optimization Strategies

1. **Resize images before Groq call:** Sharp resizes to 224×224 JPEG (reduces base64 payload significantly)
2. **Cache classification results:** For identical disease+crop+region combinations, serve from Redis (TTL: 1 hour) before calling Groq
3. **Rate gate guest users:** Non-authenticated users limited to 3 scans/day
4. **Chatbot history trimming:** Only last 10 turns sent to Groq (saves context tokens)
5. **Low-confidence re-routing:** If confidence < 0.65, return result + flag; do NOT auto-retry (let farmer provide feedback)
6. **Image deduplication:** Hash image buffer with SHA-256; skip Groq call if identical hash found within 24h from same user
7. **Batch offline sync:** Process offline scan queues in batches of 5 with 200ms delay between calls

### Groq API Error Handling

```typescript
// src/services/groq.service.ts — error handling
try {
  const result = await groq.chat.completions.create({ ... });
  return parseResult(result);
} catch (err: any) {
  if (err.status === 429) {
    // Rate limit — add to retry queue with exponential backoff
    throw new ServiceUnavailableError('ml_service_busy');
  }
  if (err.status === 413) {
    throw new BadRequestError('image_too_large_for_ai');
  }
  // Network error — return degraded response (confidence = 0, low_confidence = true)
  logger.error('Groq API error', { error: err.message });
  return { disease_label: 'Unknown', confidence: 0, low_confidence: true, top_k: [], model_version: 'groq-error' };
}
```

### Future Migration Path (Groq → Own Model)

When ready to replace Groq with your own trained PyTorch/ONNX model:

1. Deploy `apps/ml/` Python FastAPI service with the ONNX model
2. Change `GROQ_VISION_MODEL` env var to trigger the internal path in `groq.service.ts`
3. The `classifyLeafImage` function signature remains identical — frontend/scan pipeline does not change
4. Swap the Groq SDK call with: `axios.post(env.ML_SERVICE_URL + '/classify', formData, { headers: { 'X-Internal-Key': env.ML_INTERNAL_KEY } })`

The architecture is designed so Groq is just a **pluggable inference provider** behind the `groq.service.ts` abstraction layer.

---

## 🗂️ Implementation Order Summary

| Phase | Priority | Estimated Time | Depends On |
|---|---|---|---|
| 1. Foundation Setup | Critical | 1 day | Nothing |
| 2. Auth & RBAC | Critical | 2 days | Phase 1 |
| 3. Groq Integration | Critical | 1 day | Phase 1 |
| 4. Scan Pipeline | Critical | 3 days | Phase 2, 3 |
| 5. Treatment DB | Critical | 2 days | Phase 4 |
| 6. AI Chatbot (RAG) | High | 3 days | Phase 3, 5 |
| 7. Notifications | High | 2 days | Phase 4 |
| 8. Analytics | High | 3 days | Phase 4, 5 |
| 9. Admin Panel APIs | Medium | 2 days | Phase 2, 4, 5 |
| 10. Report Generation | Medium | 2 days | Phase 8 |
| 11. Smart Search | Medium | 1 day | Phase 6 |
| 12. WebSocket Layer | High | 1 day | Phase 4 |
| 13. Audit Logs | Medium | 1 day | Phase 2 |
| 14. Background Jobs | High | 2 days | Phase 4, 7 |
| 15. Security Hardening | Critical | 2 days | All phases |
| 16. Docker & Deployment | Critical | 2 days | All phases |
| 17. Testing | High | 3 days | All phases |

**Total estimated: ~33 development days** for a production-ready backend.

---

*Built with ❤️ for India's farmers by Team Quantum Syndicates*  
*Institution: Swaminarayan University, Kalol, Gujarat*  
*Problem Statement: ALPHA407*