/**
 * Test env bootstrap.
 *
 * config/env.ts validates process.env at import and calls process.exit(1) on any
 * missing required var. This setup file runs BEFORE any src module is imported
 * (registered via vitest `setupFiles`), so it seeds safe dummy values for every
 * required variable. Real datastores are never dialed in unit tests; integration
 * tests override MONGODB_URI / REDIS at runtime with in-memory equivalents.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '4000';
process.env.APP_URL = 'http://localhost:3000';
process.env.API_URL = 'http://localhost:4000';

// Datastores — placeholder URIs (unit tests mock; integration tests override).
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/krishi_test';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';

// JWT — a fixed 32+ char secret so token sign/verify is deterministic in tests.
process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// AI / external providers — dummy keys (SDKs are mocked, never called live).
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.GROQ_API_KEY = 'test-groq-key';

// S3 / MinIO — dummy credentials (image service is mocked in tests).
process.env.AWS_ACCESS_KEY_ID = 'test-access-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
process.env.AWS_S3_BUCKET = 'test-bucket';

// Keep background queues off in tests unless a test opts in.
process.env.QUEUE_ENABLED = 'false';
