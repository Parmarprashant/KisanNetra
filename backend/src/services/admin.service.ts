/**
 * Admin service.
 *
 * Platform-management business logic for administrators (HTTP-agnostic per
 * rules.md): user management (list/search, detail + scan summary, role change,
 * suspend/activate, soft-delete) and a system-health snapshot.
 *
 * Safety rules enforced here:
 *  - An admin can never suspend, delete, or demote their OWN account (prevents
 *    an accidental lockout of the last administrator).
 *  - Suspending or deleting a user revokes their refresh session immediately so
 *    they cannot mint new access tokens (existing short-lived access tokens
 *    expire on their own; blacklisting every jti is out of scope here).
 *  - Soft-deleted users are excluded from listings and cannot authenticate
 *    (delete sets is_active=false, which login already rejects).
 */
import mongoose, { Types } from 'mongoose';
import { User, type IUser, type Role } from '../models/User';
import { Scan } from '../models/Scan';
import { redis } from '../config/redis';
import { revokeRefreshSession } from '../utils/tokenUtils';
import { getQueueStats } from '../jobs/queues';
import { logger } from '../utils/logger';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '../utils/errors';

export interface AdminUserView {
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  role: Role;
  language: string;
  region?: string;
  state?: string;
  is_active: boolean;
  last_login?: Date;
  createdAt: Date;
}

function toAdminView(user: IUser): AdminUserView {
  return {
    user_id: user.user_id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    language: user.language,
    region: user.region,
    state: user.state,
    is_active: user.is_active,
    last_login: user.last_login,
    createdAt: user.createdAt,
  };
}

/** Load a non-deleted user by user_id or throw 404. */
async function findActiveUser(userId: string): Promise<IUser> {
  const user = await User.findOne({ user_id: userId, is_deleted: false });
  if (!user) throw new NotFoundError('User not found');
  return user;
}

// ─── User listing / search ───────────────────────────────────────────

export interface ListUsersOptions {
  page: number;
  limit: number;
  role?: Role;
  region?: string;
  active?: boolean;
  search?: string; // matches name / email / phone (case-insensitive)
}

export async function listUsers(opts: ListUsersOptions): Promise<{
  users: AdminUserView[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: Record<string, unknown> = { is_deleted: false };
  if (opts.role) filter.role = opts.role;
  if (opts.region) filter.region = opts.region;
  if (typeof opts.active === 'boolean') filter.is_active = opts.active;
  if (opts.search) {
    // Escape regex metacharacters so user input can't craft a costly pattern.
    const safe = opts.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const skip = (opts.page - 1) * opts.limit;
  const [docs, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(opts.limit),
    User.countDocuments(filter),
  ]);

  return {
    users: docs.map(toAdminView),
    total,
    page: opts.page,
    limit: opts.limit,
  };
}

// ─── User detail (+ scan summary) ────────────────────────────────────

export interface UserDetail extends AdminUserView {
  scan_summary: {
    total: number;
    healthy: number;
    diseased: number;
    last_scan_at: Date | null;
  };
}

export async function getUserDetail(userId: string): Promise<UserDetail> {
  const user = await findActiveUser(userId);

  const [summary] = await Scan.aggregate([
    { $match: { user_id: user._id, is_deleted: false } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        healthy: { $sum: { $cond: ['$prediction.is_healthy', 1, 0] } },
        last_scan_at: { $max: '$createdAt' },
      },
    },
  ]);

  const scan_summary = summary
    ? {
        total: summary.total as number,
        healthy: summary.healthy as number,
        diseased: (summary.total as number) - (summary.healthy as number),
        last_scan_at: (summary.last_scan_at as Date) ?? null,
      }
    : { total: 0, healthy: 0, diseased: 0, last_scan_at: null };

  return { ...toAdminView(user), scan_summary };
}

// ─── Mutations (role / suspend / delete) ─────────────────────────────

/** Guard: an admin may not perform a destructive action on their own account. */
function assertNotSelf(actingUserId: string, targetUserId: string): void {
  if (actingUserId === targetUserId) {
    throw new BadRequestError(
      'Admins cannot perform this action on their own account',
      'self_action_forbidden',
    );
  }
}

export async function changeUserRole(
  actingUserId: string,
  targetUserId: string,
  role: Role,
): Promise<AdminUserView> {
  assertNotSelf(actingUserId, targetUserId);
  const user = await findActiveUser(targetUserId);

  if (user.role === role) {
    throw new ConflictError(`User already has role '${role}'`, 'role_unchanged');
  }

  user.role = role;
  await user.save();

  // Role is embedded in the access token; drop the refresh session so the new
  // role takes effect on the next login rather than lingering until expiry.
  await revokeRefreshSession(user.user_id);

  logger.info('Admin changed user role', {
    actor: actingUserId,
    target: targetUserId,
    role,
  });
  return toAdminView(user);
}

export async function setUserSuspended(
  actingUserId: string,
  targetUserId: string,
  suspended: boolean,
): Promise<AdminUserView> {
  assertNotSelf(actingUserId, targetUserId);
  const user = await findActiveUser(targetUserId);

  user.is_active = !suspended;
  await user.save();

  if (suspended) {
    // Cut off token refresh immediately on suspension.
    await revokeRefreshSession(user.user_id);
  }

  logger.info('Admin set user suspension', {
    actor: actingUserId,
    target: targetUserId,
    suspended,
  });
  return toAdminView(user);
}

export async function softDeleteUser(
  actingUserId: string,
  targetUserId: string,
): Promise<void> {
  assertNotSelf(actingUserId, targetUserId);
  const user = await findActiveUser(targetUserId);

  user.is_deleted = true;
  user.is_active = false; // login rejects inactive users → deleted can't sign in
  await user.save();

  await revokeRefreshSession(user.user_id);

  logger.info('Admin soft-deleted user', {
    actor: actingUserId,
    target: targetUserId,
  });
}

// ─── System health ───────────────────────────────────────────────────

/** Parse a single field out of Redis INFO output (key:value lines). */
function parseRedisInfo(info: string, field: string): string | null {
  const line = info.split('\n').find((l) => l.startsWith(`${field}:`));
  return line ? line.split(':')[1].trim() : null;
}

export interface SystemHealth {
  mongo: {
    status: string;
    collections?: number;
    objects?: number;
    data_size_bytes?: number;
  };
  redis: {
    status: string;
    used_memory_human?: string | null;
    connected_clients?: string | null;
    uptime_seconds?: string | null;
  };
  queues: Awaited<ReturnType<typeof getQueueStats>>;
  uptime_seconds: number;
  node_env: string;
}

export async function getSystemHealth(): Promise<SystemHealth> {
  // Mongo stats — guard so a stats failure degrades gracefully.
  const mongo: SystemHealth['mongo'] = {
    status:
      mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  };
  try {
    if (mongoose.connection.db) {
      const stats = await mongoose.connection.db.stats();
      mongo.collections = stats.collections;
      mongo.objects = stats.objects;
      mongo.data_size_bytes = stats.dataSize;
    }
  } catch (err) {
    logger.warn('Failed to read Mongo stats for system health', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Redis info — guard likewise.
  const redisHealth: SystemHealth['redis'] = { status: 'unknown' };
  try {
    const info = await redis.info();
    redisHealth.status = 'connected';
    redisHealth.used_memory_human = parseRedisInfo(info, 'used_memory_human');
    redisHealth.connected_clients = parseRedisInfo(info, 'connected_clients');
    redisHealth.uptime_seconds = parseRedisInfo(info, 'uptime_in_seconds');
  } catch (err) {
    redisHealth.status = 'error';
    logger.warn('Failed to read Redis info for system health', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    mongo,
    redis: redisHealth,
    // Real BullMQ queue job counts (Phase 14); reports 'disabled' when
    // QUEUE_ENABLED is false.
    queues: await getQueueStats(),
    uptime_seconds: Math.floor(process.uptime()),
    node_env: process.env.NODE_ENV ?? 'development',
  };
}
