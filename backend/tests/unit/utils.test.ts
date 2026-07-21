import { describe, it, expect, vi } from 'vitest';
import { apiResponse } from '../../src/utils/apiResponse';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  ServiceUnavailableError,
} from '../../src/utils/errors';
import { hashDeviceId } from '../../src/utils/hashUtils';
import { auditContext } from '../../src/utils/auditContext';
import { asyncHandler } from '../../src/utils/asyncHandler';

describe('apiResponse', () => {
  it('builds a success envelope without meta', () => {
    expect(apiResponse.success({ id: 1 })).toEqual({
      success: true,
      data: { id: 1 },
    });
  });

  it('includes meta only when provided', () => {
    expect(apiResponse.success([1, 2], { total: 2 })).toEqual({
      success: true,
      data: [1, 2],
      meta: { total: 2 },
    });
  });

  it('builds an error envelope with and without details', () => {
    expect(apiResponse.error('bad', 'Bad thing')).toEqual({
      success: false,
      error: { code: 'bad', message: 'Bad thing' },
    });
    expect(apiResponse.error('v', 'invalid', [{ path: 'x' }])).toEqual({
      success: false,
      error: { code: 'v', message: 'invalid', details: [{ path: 'x' }] },
    });
  });
});

describe('error classes', () => {
  it('AppError carries status, code, operational flag, details', () => {
    const e = new AppError('boom', 418, 'teapot', false, { a: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(418);
    expect(e.code).toBe('teapot');
    expect(e.isOperational).toBe(false);
    expect(e.details).toEqual({ a: 1 });
    expect(e.name).toBe('AppError');
  });

  it.each([
    [BadRequestError, 400, 'bad_request'],
    [UnauthorizedError, 401, 'unauthorized'],
    [ForbiddenError, 403, 'forbidden'],
    [NotFoundError, 404, 'not_found'],
    [ConflictError, 409, 'conflict'],
    [ServiceUnavailableError, 503, 'service_unavailable'],
  ])('%s maps to the right status/code defaults', (Ctor, status, code) => {
    const e = new (Ctor as new () => AppError)();
    expect(e.statusCode).toBe(status);
    expect(e.code).toBe(code);
    expect(e.isOperational).toBe(true);
  });

  it('ValidationError is 422 with details', () => {
    const e = new ValidationError('nope', [{ field: 'x' }]);
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('validation_error');
    expect(e.details).toEqual([{ field: 'x' }]);
  });

  it('custom messages/codes override defaults', () => {
    const e = new BadRequestError('custom', 'my_code');
    expect(e.message).toBe('custom');
    expect(e.code).toBe('my_code');
  });
});

describe('hashDeviceId', () => {
  it('produces a stable 64-char hex SHA-256', () => {
    const h = hashDeviceId('device-abc');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(hashDeviceId('device-abc')).toBe(h); // deterministic
  });

  it('differs for different inputs and never returns the raw id', () => {
    expect(hashDeviceId('a')).not.toBe(hashDeviceId('b'));
    expect(hashDeviceId('device-abc')).not.toContain('device-abc');
  });
});

describe('auditContext', () => {
  it('extracts ip and user-agent from the request', () => {
    const req = {
      ip: '203.0.113.5',
      get: (h: string) => (h === 'user-agent' ? 'curl/8.0' : undefined),
    };
    expect(auditContext(req as never)).toEqual({
      ipAddress: '203.0.113.5',
      userAgent: 'curl/8.0',
    });
  });

  it('returns undefined user-agent when absent', () => {
    const req = { ip: '::1', get: () => undefined };
    expect(auditContext(req as never)).toEqual({
      ipAddress: '::1',
      userAgent: undefined,
    });
  });
});

describe('asyncHandler', () => {
  it('forwards a rejected promise to next()', async () => {
    const err = new Error('async fail');
    const next = vi.fn();
    const handler = asyncHandler(async () => {
      throw err;
    });
    handler({} as never, {} as never, next);
    await new Promise((r) => setImmediate(r));
    expect(next).toHaveBeenCalledWith(err);
  });

  it('does not call next() on success', async () => {
    const next = vi.fn();
    const handler = asyncHandler(async (_req, res) => {
      (res as { sent?: boolean }).sent = true;
    });
    const res = {} as { sent?: boolean };
    handler({} as never, res as never, next);
    await new Promise((r) => setImmediate(r));
    expect(next).not.toHaveBeenCalled();
    expect(res.sent).toBe(true);
  });
});
