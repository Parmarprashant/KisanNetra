/**
 * User validators (Zod).
 */
import { z } from 'zod';
import { ROLES } from '../models/User';

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  role: z.enum(ROLES).optional(),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
