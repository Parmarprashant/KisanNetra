import { describe, it, expect, vi } from 'vitest';
import { z, ZodError } from 'zod';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import { validate } from '../../src/middleware/validate';
import { requireRole, requireRegionalScope } from '../../src/middleware/rbac.middleware';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from '../../src/utils/errors';

function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn().mockImplementation((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn().mockImplementation((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

describe('validate middleware', () => {
  it('replaces req.body with parsed/coerced values and calls next', () => {
    const next = vi.fn();
    const req = { body: { n: '5' } } as unknown as Request;
    validate({ body: z.object({ n: z.coerce.number() }) })(req, {} as Response, next);
    expect(req.body).toEqual({ n: 5 });
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards a ZodError to next on invalid input', () => {
    const next = vi.fn();
    const req = { body: {} } as Request;
    validate({ body: z.object({ n: z.number() }) })(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(ZodError);
  });

  it('merges parsed query fields without reassigning the getter', () => {
    const next = vi.fn();
    const query: Record<string, unknown> = { page: '2' };
    const req = { query } as unknown as Request;
    validate({ query: z.object({ page: z.coerce.number() }) })(
      req,
      {} as Response,
      next,
    );
    expect(req.query.page).toBe(2);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('requireRole', () => {
  it('allows a listed role', () => {
    const next = vi.fn();
    const req = { user: { role: 'admin' } } as unknown as Request;
    requireRole('admin')(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('throws ForbiddenError for a disallowed role', () => {
    const req = { user: { role: 'farmer' } } as unknown as Request;
    expect(() => requireRole('admin')(req, {} as Response, vi.fn())).toThrow(
      ForbiddenError,
    );
  });

  it('throws UnauthorizedError when unauthenticated', () => {
    const req = {} as Request;
    expect(() =>
      requireRole('admin')(req, {} as Response, vi.fn()),
    ).toThrow(UnauthorizedError);
  });
});

describe('requireRegionalScope', () => {
  it('pins an extension officer to their own region', () => {
    const next = vi.fn();
    const req = {
      user: { role: 'extension_officer', region: 'Gujarat' },
      query: { region: 'Punjab' },
    } as unknown as Request;
    requireRegionalScope(req, {} as Response, next);
    expect(req.query.region).toBe('Gujarat'); // overwritten
    expect(next).toHaveBeenCalledWith();
  });

  it('leaves other roles untouched', () => {
    const next = vi.fn();
    const req = {
      user: { role: 'admin' },
      query: { region: 'Punjab' },
    } as unknown as Request;
    requireRegionalScope(req, {} as Response, next);
    expect(req.query.region).toBe('Punjab');
    expect(next).toHaveBeenCalledWith();
  });
});

describe('errorHandler', () => {
  const req = { originalUrl: '/x', method: 'GET' } as Request;

  it('maps ZodError → 422 validation_error with details', () => {
    const res = mockRes();
    const zerr = new ZodError([
      { code: 'custom', path: ['name'], message: 'Required' } as never,
    ]);
    errorHandler(zerr, req, res, vi.fn());
    expect(res.statusCode).toBe(422);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'validation_error',
    );
  });

  it('maps a typed AppError to its status/code', () => {
    const res = mockRes();
    errorHandler(new BadRequestError('nope', 'my_code'), req, res, vi.fn());
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('my_code');
  });

  it('maps a mongoose CastError → 400 invalid_id', () => {
    const res = mockRes();
    const cast = new mongoose.Error.CastError('ObjectId', 'bad', 'id');
    errorHandler(cast, req, res, vi.fn());
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'invalid_id',
    );
  });

  it('maps an unknown error → 500 and hides the message in prod', () => {
    const res = mockRes();
    errorHandler(new Error('secret internals'), req, res, vi.fn());
    expect(res.statusCode).toBe(500);
    // NODE_ENV=test (not production) → message is surfaced; code is generic.
    expect((res.body as { error: { code: string } }).error.code).toBe(
      'internal_server_error',
    );
  });
});

describe('notFoundHandler', () => {
  it('returns 404 with the method + url', () => {
    const res = mockRes();
    notFoundHandler(
      { method: 'POST', originalUrl: '/nope' } as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('not_found');
  });
});
