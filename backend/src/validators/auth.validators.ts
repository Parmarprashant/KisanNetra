/**
 * Auth validation schemas (Zod).
 */
import { z } from 'zod';
import { LANGUAGES } from '../models/User';

// Registration is open to self-service roles only; admin is provisioned
// separately (seed / admin panel), never via public registration.
const SELF_REGISTER_ROLES = ['farmer', 'extension_officer', 'agronomist'] as const;

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

// Indian mobile number (10 digits, starting 6–9).
const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number');

export const RegisterSchema = z
  .object({
    name: z.string().min(2).max(100).trim(),
    email: z.string().email().toLowerCase().optional(),
    phone: phoneSchema.optional(),
    password: passwordSchema,
    language: z.enum(LANGUAGES).default('en'),
    role: z.enum(SELF_REGISTER_ROLES).default('farmer'),
    region: z.string().max(100).trim().optional(),
    state: z.string().max(100).trim().optional(),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
    path: ['email'],
  });

export const LoginSchema = z
  .object({
    email: z.string().email().toLowerCase().optional(),
    phone: phoneSchema.optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => data.email || data.phone, {
    message: 'Either email or phone is required',
    path: ['email'],
  });

// Password reset flows (Phase 7 — unblocked by the email service).
export const ForgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
