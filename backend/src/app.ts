/**
 * Express application bootstrap.
 *
 * Wires global middleware (security headers, CORS, body parsing, request
 * logging, rate limiting), mounts versioned routes under /api/v1, and attaches
 * the 404 + global error handlers last.
 *
 * Feature routes (auth, scans, treatments, ...) are added in their respective
 * phases. Phase 1 mounts only the health route.
 */
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env, isProduction } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { generalLimiter } from './middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { ForbiddenError } from './utils/errors';

import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import scanRoutes from './routes/scan.routes';
import treatmentRoutes from './routes/treatment.routes';
import chatRoutes from './routes/chat.routes';
import notificationRoutes from './routes/notification.routes';
import analyticsRoutes from './routes/analytics.routes';
import adminRoutes from './routes/admin.routes';
import reportRoutes from './routes/report.routes';
import searchRoutes from './routes/search.routes';
import auditRoutes from './routes/auditlog.routes';

const app: Application = express();

// Origins allowed to make credentialed cross-origin requests. Falls back to the
// single APP_URL when CORS_ORIGINS is not configured.
const allowedOrigins = (env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(',')
  : [env.APP_URL]
).map((o) => o.trim()).filter(Boolean);

// ─── Global middleware ───────────────────────────────────────────
app.set('trust proxy', 1); // correct client IPs behind a reverse proxy
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Presigned S3/MinIO image URLs are cross-origin (https / data:).
        imgSrc: ["'self'", 'data:', 'https:'],
        objectSrc: ["'none'"],
        // Helmet's defaults include upgrade-insecure-requests; keep it in
        // production but disable it in dev (null) so localhost http isn't forced
        // to https.
        upgradeInsecureRequests: isProduction ? [] : null,
      },
    },
    // HSTS is only meaningful over HTTPS — enable in production only.
    hsts: isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    // Allow a PWA on another origin to consume API/image responses.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      // Requests with no Origin (curl, server-to-server, health checks) are allowed.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new ForbiddenError('Origin not allowed by CORS', 'cors_forbidden'));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(requestLogger);
app.use(generalLimiter);

// ─── Routes (v1) ─────────────────────────────────────────────────
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/scans', scanRoutes);
app.use('/api/v1/treatments', treatmentRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/audit-logs', auditRoutes);

// ─── Fallbacks ───────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
