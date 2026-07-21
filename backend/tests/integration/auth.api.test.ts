import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from 'vitest';

// Mock Redis with an in-memory implementation. This backs tokenUtils (sessions /
// blacklist) AND the rate-limit store the app builds at import. If the rate-limit
// store can't drive the mock it degrades to an in-memory limiter, so either way
// the app boots.
const { redisMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RedisMock = require('ioredis-mock');
  return { redisMock: new RedisMock() };
});
vi.mock('../../src/config/redis', () => ({
  redis: redisMock,
  pubClient: redisMock,
  subClient: redisMock,
  connectRedis: vi.fn().mockResolvedValue(undefined),
  disconnectRedis: vi.fn().mockResolvedValue(undefined),
}));

// The Redis-backed rate limiters use Lua scripts (redis.call), which ioredis-mock
// doesn't implement. Rate limiting is verified live in Phase 15; here we stub the
// limiters as pass-through so the auth flow is what's under test.
vi.mock('../../src/middleware/rateLimiter', () => {
  const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    generalLimiter: passthrough,
    authLimiter: passthrough,
    scanLimiter: passthrough,
  };
});

import request from 'supertest';
import { connectTestDB, clearTestDB, disconnectTestDB } from '../setup/db';
import app from '../../src/app';

beforeAll(async () => {
  await connectTestDB();
});
afterAll(async () => {
  await disconnectTestDB();
});
afterEach(async () => {
  await clearTestDB();
  await redisMock.flushall();
});

const validUser = {
  name: 'Ramesh Kumar',
  email: 'ramesh@example.com',
  password: 'password123',
  role: 'farmer',
  language: 'en',
};

async function registerUser(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/auth/register')
    .send({ ...validUser, ...overrides });
}

describe('auth flow (register → me → refresh → logout)', () => {
  it('registers a user, returns an access token, sets a refresh cookie', async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.user_id).toMatch(/^usr_/);
    // Password never leaks.
    expect(res.body.data.user.password).toBeUndefined();
    // Refresh token delivered as an HttpOnly cookie.
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    expect(cookies.some((c) => /HttpOnly/i.test(c))).toBe(true);
  });

  it('accesses a protected route with the access token', async () => {
    const reg = await registerUser();
    const token = reg.body.data.accessToken as string;
    const me = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.user?.email ?? me.body.data.email).toBe(validUser.email);
  });

  it('logs in with correct credentials', async () => {
    await registerUser();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('rotates tokens on refresh using the cookie', async () => {
    const reg = await registerUser();
    const cookie = (reg.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refresh_token='),
    ) as string;
    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('logout blacklists the access token → subsequent use is 401', async () => {
    const reg = await registerUser();
    const token = reg.body.data.accessToken as string;
    const out = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(out.status).toBe(200);

    const me = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });
});

describe('auth edge cases', () => {
  it('401 without a token on a protected route', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('403 when a farmer hits an admin-only route', async () => {
    const reg = await registerUser();
    const token = reg.body.data.accessToken as string;
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('422 on invalid registration input', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'X', password: 'short' });
    expect(res.status).toBe(422);
  });

  it('409 on duplicate email registration', async () => {
    await registerUser();
    const res = await registerUser();
    expect(res.status).toBe(409);
  });

  it('constant-time login: unknown email and wrong password both 401 invalid_credentials', async () => {
    await registerUser();
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever12' });
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.code).toBe('invalid_credentials');
    expect(wrong.body.error.code).toBe('invalid_credentials');
  });
});
