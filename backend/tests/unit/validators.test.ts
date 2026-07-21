import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from '../../src/validators/auth.validators';
import {
  ScanSubmitSchema,
  ScanListQuerySchema,
  FeedbackSchema,
} from '../../src/validators/scan.validators';

describe('RegisterSchema', () => {
  it('accepts a valid email registration and defaults role/language', () => {
    const r = RegisterSchema.parse({
      name: 'Ramesh',
      email: 'Ramesh@Example.COM',
      password: 'password123',
    });
    expect(r.role).toBe('farmer');
    expect(r.language).toBe('en');
    expect(r.email).toBe('ramesh@example.com'); // lowercased
  });

  it('accepts a valid Indian phone', () => {
    const r = RegisterSchema.parse({
      name: 'Ab',
      phone: '9876543210',
      password: 'password123',
    });
    expect(r.phone).toBe('9876543210');
  });

  it('rejects when neither email nor phone provided', () => {
    const res = RegisterSchema.safeParse({ name: 'Ab', password: 'password123' });
    expect(res.success).toBe(false);
  });

  it('rejects a non-Indian phone format', () => {
    const res = RegisterSchema.safeParse({
      name: 'Ab',
      phone: '1234567890', // must start 6-9
      password: 'password123',
    });
    expect(res.success).toBe(false);
  });

  it('rejects short passwords and the admin role', () => {
    expect(
      RegisterSchema.safeParse({ name: 'Ab', email: 'a@b.co', password: 'short' })
        .success,
    ).toBe(false);
    expect(
      RegisterSchema.safeParse({
        name: 'Ab',
        email: 'a@b.co',
        password: 'password123',
        role: 'admin',
      }).success,
    ).toBe(false);
  });
});

describe('LoginSchema', () => {
  it('requires a non-empty password and an identifier', () => {
    expect(
      LoginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success,
    ).toBe(true);
    expect(LoginSchema.safeParse({ password: 'x' }).success).toBe(false);
    expect(
      LoginSchema.safeParse({ email: 'a@b.co', password: '' }).success,
    ).toBe(false);
  });
});

describe('ForgotPasswordSchema / ResetPasswordSchema', () => {
  it('forgot requires a valid email', () => {
    expect(ForgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
    expect(ForgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });

  it('reset requires token + valid password', () => {
    expect(
      ResetPasswordSchema.safeParse({ token: 't', password: 'password123' })
        .success,
    ).toBe(true);
    expect(
      ResetPasswordSchema.safeParse({ token: '', password: 'password123' })
        .success,
    ).toBe(false);
    expect(
      ResetPasswordSchema.safeParse({ token: 't', password: 'short' }).success,
    ).toBe(false);
  });
});

describe('ScanSubmitSchema', () => {
  it('coerces multipart string coords to numbers and defaults language', () => {
    const r = ScanSubmitSchema.parse({
      crop_type: 'tomato',
      latitude: '23.02',
      longitude: '72.57',
    });
    expect(r.latitude).toBeCloseTo(23.02);
    expect(r.longitude).toBeCloseTo(72.57);
    expect(r.language).toBe('en');
  });

  it('rejects an unsupported crop and out-of-range coords', () => {
    expect(
      ScanSubmitSchema.safeParse({ crop_type: 'banana' }).success,
    ).toBe(false);
    expect(
      ScanSubmitSchema.safeParse({ crop_type: 'tomato', latitude: '200' })
        .success,
    ).toBe(false);
  });
});

describe('ScanListQuerySchema', () => {
  it('defaults page/limit and coerces strings', () => {
    expect(ScanListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 });
    expect(ScanListQuerySchema.parse({ page: '3', limit: '50' })).toMatchObject({
      page: 3,
      limit: 50,
    });
  });

  it('enforces the limit ceiling of 100', () => {
    expect(ScanListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('FeedbackSchema', () => {
  it('accepts only correct/incorrect', () => {
    expect(FeedbackSchema.safeParse({ feedback: 'correct' }).success).toBe(true);
    expect(FeedbackSchema.safeParse({ feedback: 'maybe' }).success).toBe(false);
  });
});
