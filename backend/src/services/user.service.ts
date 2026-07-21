/**
 * User service.
 *
 * Read/query logic for user profiles. Expanded in Phase 9 (Admin Panel).
 */
import { User } from '../models/User';
import { NotFoundError } from '../utils/errors';
import type { PublicUser } from './auth.service';

export async function getByUserId(userId: string): Promise<PublicUser> {
  const user = await User.findOne({ user_id: userId }).lean();
  if (!user) throw new NotFoundError('User not found');
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    language: user.language,
    region: user.region,
    state: user.state,
  };
}

export interface ListUsersOptions {
  page: number;
  limit: number;
  role?: string;
}

export async function listUsers(opts: ListUsersOptions): Promise<{
  users: PublicUser[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: Record<string, unknown> = {};
  if (opts.role) filter.role = opts.role;

  const skip = (opts.page - 1) * opts.limit;
  const [docs, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(opts.limit).lean(),
    User.countDocuments(filter),
  ]);

  const users = docs.map((u) => ({
    user_id: u.user_id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    language: u.language,
    region: u.region,
    state: u.state,
  }));

  return { users, total, page: opts.page, limit: opts.limit };
}
