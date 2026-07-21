import { describe, it, expect, beforeEach, vi } from 'vitest';

// Replace the real ioredis client with an in-memory mock BEFORE tokenUtils
// (which imports ../config/redis) is loaded. vi.mock is hoisted, so the mock
// instance is created inside vi.hoisted to be available in the factory.
const { redisMock } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RedisMock = require('ioredis-mock');
  return { redisMock: new RedisMock() };
});
vi.mock('../../src/config/redis', () => ({
  redis: redisMock,
}));

import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  saveRefreshSession,
  isRefreshSessionValid,
  revokeRefreshSession,
  blacklistAccessToken,
  isAccessTokenBlacklisted,
  signPasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken,
} from '../../src/utils/tokenUtils';

const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(async () => {
  await redisMock.flushall();
});

describe('access/refresh token sign + verify (no Redis)', () => {
  it('signs and verifies an access token carrying claims + a jti', () => {
    const token = signAccessToken({
      sub: 'usr_1',
      role: 'farmer',
      lang: 'hi',
      region: 'Gujarat',
    });
    const p = verifyAccessToken(token);
    expect(p.sub).toBe('usr_1');
    expect(p.role).toBe('farmer');
    expect(p.lang).toBe('hi');
    expect(p.region).toBe('Gujarat');
    expect(p.jti).toBeTruthy();
  });

  it('gives each access token a unique jti', () => {
    const a = verifyAccessToken(signAccessToken({ sub: 'u', role: 'farmer', lang: 'en' }));
    const b = verifyAccessToken(signAccessToken({ sub: 'u', role: 'farmer', lang: 'en' }));
    expect(a.jti).not.toBe(b.jti);
  });

  it('signs a refresh token returning token + jti that verify', () => {
    const { token, jti } = signRefreshToken('usr_2');
    const p = verifyRefreshToken(token);
    expect(p.sub).toBe('usr_2');
    expect(p.jti).toBe(jti);
  });

  it('rejects a tampered/invalid token', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow();
  });
});

describe('refresh session (Redis-backed)', () => {
  it('is valid only for the stored jti; rotation invalidates the old one', async () => {
    await saveRefreshSession('usr_3', 'jti-A', nowSec() + 3600);
    expect(await isRefreshSessionValid('usr_3', 'jti-A')).toBe(true);
    expect(await isRefreshSessionValid('usr_3', 'jti-OLD')).toBe(false);

    // Rotate: store a new jti — the previous one is no longer valid.
    await saveRefreshSession('usr_3', 'jti-B', nowSec() + 3600);
    expect(await isRefreshSessionValid('usr_3', 'jti-A')).toBe(false);
    expect(await isRefreshSessionValid('usr_3', 'jti-B')).toBe(true);
  });

  it('does not store a session when the expiry is already in the past', async () => {
    await saveRefreshSession('usr_4', 'jti-X', nowSec() - 10);
    expect(await isRefreshSessionValid('usr_4', 'jti-X')).toBe(false);
  });

  it('revoke removes the session', async () => {
    await saveRefreshSession('usr_5', 'jti-Y', nowSec() + 3600);
    await revokeRefreshSession('usr_5');
    expect(await isRefreshSessionValid('usr_5', 'jti-Y')).toBe(false);
  });
});

describe('access-token blacklist (Redis-backed)', () => {
  it('marks a jti blacklisted until expiry', async () => {
    expect(await isAccessTokenBlacklisted('jti-Z')).toBe(false);
    await blacklistAccessToken('jti-Z', nowSec() + 60);
    expect(await isAccessTokenBlacklisted('jti-Z')).toBe(true);
  });

  it('is a no-op when the token would already be expired', async () => {
    await blacklistAccessToken('jti-EXP', nowSec() - 5);
    expect(await isAccessTokenBlacklisted('jti-EXP')).toBe(false);
  });
});

describe('password-reset tokens (single-use, Redis-backed)', () => {
  it('signs a token that verifies while its jti is stored', async () => {
    const { token } = await signPasswordResetToken('usr_6');
    const p = await verifyPasswordResetToken(token);
    expect(p?.sub).toBe('usr_6');
    expect(p?.purpose).toBe('pwd_reset');
  });

  it('returns null after the token is consumed (single-use)', async () => {
    const { token } = await signPasswordResetToken('usr_7');
    await consumePasswordResetToken('usr_7');
    expect(await verifyPasswordResetToken(token)).toBeNull();
  });

  it('invalidates an older token when a newer one is issued (latest wins)', async () => {
    const { token: older } = await signPasswordResetToken('usr_8');
    await signPasswordResetToken('usr_8'); // supersedes
    expect(await verifyPasswordResetToken(older)).toBeNull();
  });
});
