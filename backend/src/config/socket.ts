/**
 * Socket.io real-time layer (Phase 12).
 *
 * Attaches a WebSocket server to the existing HTTP server so clients receive
 * live push events (scan results, new notifications) instead of polling.
 *
 * Design:
 *  - JWT handshake auth: the client sends its access token in
 *    `socket.handshake.auth.token`; we verify it (and honour the logout
 *    blacklist) with the SAME tokenUtils the REST layer uses. Unauthenticated
 *    sockets are rejected before `connection`.
 *  - Rooms: every socket joins its private `user:{userId}` room (targeted
 *    delivery), plus role rooms — `role:admin` and, for extension officers,
 *    `officer:{region}` (district broadcasts, e.g. outbreak alerts).
 *  - Redis adapter: wired to the pubClient/subClient duplicates pre-created in
 *    config/redis.ts so events fan out across horizontally-scaled instances.
 *    Non-fatal — if Redis pub/sub can't be established the server falls back to
 *    the in-memory adapter (single-instance still works), mirroring the S3 /
 *    Qdrant "degrade, don't crash" startup policy.
 *
 * The service is HTTP-agnostic to its callers: other services emit via the
 * exported `emitToUser` / `emitToRoom` helpers and never touch `io` directly.
 */
import type http from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { pubClient, subClient } from '../config/redis';
import {
  verifyAccessToken,
  isAccessTokenBlacklisted,
} from '../utils/tokenUtils';
import type { Role, Language } from '../models/User';

/** Authenticated context attached to each connected socket. */
interface SocketAuth {
  userId: string;
  role: Role;
  lang: Language;
  region?: string;
}

/** Room name helpers — one source of truth for room naming. */
export const userRoom = (userId: string): string => `user:${userId}`;
export const officerRoom = (region: string): string => `officer:${region}`;
export const ADMIN_ROOM = 'role:admin';

let io: Server | null = null;

/**
 * Initialize the Socket.io server on the given HTTP server. Idempotent-safe:
 * intended to be called once during bootstrap after datastores are connected.
 */
export async function initSocketServer(
  httpServer: http.Server,
): Promise<Server> {
  io = new Server(httpServer, {
    cors: { origin: env.APP_URL, credentials: true },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter for multi-instance fan-out — non-fatal on failure.
  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.io Redis adapter connected');
  } catch (err) {
    logger.warn(
      'Socket.io Redis adapter unavailable — using in-memory adapter',
      { error: err instanceof Error ? err.message : String(err) },
    );
  }

  // Handshake authentication — reject unauthenticated/blacklisted tokens.
  io.use((socket, next) => {
    void authenticateSocket(socket)
      .then(() => next())
      .catch((err: Error) => next(err));
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as SocketAuth;

    // Private room for targeted delivery.
    void socket.join(userRoom(auth.userId));
    // Role rooms for broadcasts.
    if (auth.role === 'admin') void socket.join(ADMIN_ROOM);
    if (auth.role === 'extension_officer' && auth.region) {
      void socket.join(officerRoom(auth.region));
    }

    logger.info('Socket connected', {
      userId: auth.userId,
      role: auth.role,
      socketId: socket.id,
    });

    socket.on('disconnect', (reason) => {
      logger.info('Socket disconnected', { userId: auth.userId, reason });
    });
  });

  logger.info('Socket.io server initialized');
  return io;
}

/**
 * Verify a socket's handshake token and stash the auth context on the socket.
 * Throws on a missing/invalid/expired/revoked token so `io.use` rejects it.
 */
async function authenticateSocket(socket: Socket): Promise<void> {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) throw new Error('Authentication token required');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('Access token expired');
    }
    throw new Error('Invalid access token');
  }

  if (await isAccessTokenBlacklisted(payload.jti)) {
    throw new Error('Token has been revoked');
  }

  const auth: SocketAuth = {
    userId: payload.sub,
    role: payload.role,
    lang: payload.lang,
    region: payload.region,
  };
  socket.data.auth = auth;
}

/** Get the initialized Socket.io server, or null if not yet initialized. */
export function getSocketServer(): Server | null {
  return io;
}

/**
 * Emit an event to a specific user's room. No-op (logged) if the socket layer
 * isn't up, so callers can emit fire-and-forget without guarding.
 */
export function emitToUser(
  userId: string,
  event: string,
  payload: unknown,
): void {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}

/** Emit an event to an arbitrary room (e.g. an officer district or admins). */
export function emitToRoom(
  room: string,
  event: string,
  payload: unknown,
): void {
  if (!io) return;
  io.to(room).emit(event, payload);
}

/** Close the Socket.io server (graceful shutdown). */
export async function closeSocketServer(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
