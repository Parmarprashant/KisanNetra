/**
 * Admin validators (Zod).
 *
 * Covers admin user management. All admin routes are already gated to the admin
 * role at the router level; these schemas validate the inputs themselves.
 */
import { z } from 'zod';
import { ROLES } from '../models/User';

export const AdminListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(ROLES).optional(),
  region: z.string().min(1).max(100).optional(),
  // 'true' / 'false' query flag → boolean (undefined = both).
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z.string().min(1).max(120).optional(),
});

export const UserIdParamSchema = z.object({
  id: z.string().min(1),
});

/**
 * Role change. `admin` IS assignable here (unlike public registration) — an
 * administrator can legitimately promote a trusted user. The self-action guard
 * in the service prevents an admin from changing their own role.
 */
export const ChangeRoleSchema = z.object({
  role: z.enum(ROLES),
});

export const SuspendSchema = z.object({
  suspended: z.boolean(),
});

export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuerySchema>;
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;
export type SuspendInput = z.infer<typeof SuspendSchema>;
