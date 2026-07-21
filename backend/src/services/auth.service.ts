/**
 * Auth service.
 *
 * Holds all authentication business logic: registration, login, refresh-token
 * rotation, and logout. Per rules.md, this layer is HTTP-agnostic — it accepts
 * plain data and returns data or throws typed errors. Token cookies and status
 * codes are the controller's concern.
 */
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { User, IUser } from '../models/User';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  saveRefreshSession,
  isRefreshSessionValid,
  revokeRefreshSession,
  blacklistAccessToken,
  signPasswordResetToken,
  verifyPasswordResetToken,
  consumePasswordResetToken,
} from '../utils/tokenUtils';
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
} from '../utils/errors';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { sendPasswordResetEmail } from './email.service';
import type { RegisterInput, LoginInput } from '../validators/auth.validators';

export interface PublicUser {
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  language: string;
  region?: string;
  state?: string;
}

// A fixed bcrypt hash used to burn an equivalent compare when a login targets a
// non-existent account. This keeps the login response time uniform whether or
// not the account exists, closing the user-enumeration timing side channel.
// Cost 12 matches the User model's BCRYPT_ROUNDS.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('krishi-raksha-dummy-password', 12);

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

function toPublicUser(user: IUser): PublicUser {
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

/** Issue an access token + a rotated refresh token, persisting the session. */
async function issueTokens(user: IUser): Promise<AuthTokens> {
  const accessToken = signAccessToken({
    sub: user.user_id,
    role: user.role,
    lang: user.language,
    region: user.region,
  });

  const { token: refreshToken, jti } = signRefreshToken(user.user_id);
  const decoded = verifyRefreshToken(refreshToken);
  await saveRefreshSession(user.user_id, jti, decoded.exp ?? 0);

  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  // Enforce uniqueness explicitly for a clean 409 (indexes are the backstop).
  const or: Array<Record<string, string>> = [];
  if (input.email) or.push({ email: input.email });
  if (input.phone) or.push({ phone: input.phone });

  if (or.length) {
    const existing = await User.findOne({ $or: or }).lean();
    if (existing) {
      throw new ConflictError(
        'An account with this email or phone already exists',
        'user_exists',
      );
    }
  }

  const user = await User.create({
    user_id: `usr_${nanoid()}`,
    name: input.name,
    email: input.email,
    phone: input.phone,
    password: input.password, // hashed by pre-save hook
    role: input.role,
    language: input.language,
    region: input.region,
    state: input.state,
  });

  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const query = input.email ? { email: input.email } : { phone: input.phone };

  // Password is select:false — request it explicitly for comparison.
  const user = await User.findOne(query).select('+password');

  // Constant-time posture: always run one bcrypt compare, even when the account
  // doesn't exist (against a dummy hash), so a missing account and a wrong
  // password take the same time — no user-enumeration via response timing.
  const valid = await bcrypt.compare(
    input.password,
    user?.password ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !valid) {
    throw new UnauthorizedError('Invalid credentials', 'invalid_credentials');
  }
  if (!user.is_active) {
    throw new UnauthorizedError('Account is deactivated', 'account_inactive');
  }

  user.last_login = new Date();
  await user.save();

  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
}

/**
 * Rotate a refresh token: validate it against the stored session, then issue a
 * fresh access + refresh pair and replace the session (old refresh is invalid).
 */
export async function refresh(refreshToken?: string): Promise<AuthTokens> {
  if (!refreshToken) {
    throw new UnauthorizedError('Refresh token required', 'refresh_missing');
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError('Invalid refresh token', 'refresh_invalid');
  }

  const valid = await isRefreshSessionValid(payload.sub, payload.jti);
  if (!valid) {
    // Token reuse or already-rotated — revoke the session defensively.
    await revokeRefreshSession(payload.sub);
    throw new UnauthorizedError(
      'Refresh token is no longer valid',
      'refresh_revoked',
    );
  }

  const user = await User.findOne({ user_id: payload.sub });
  if (!user || !user.is_active) {
    throw new UnauthorizedError('User not found or inactive', 'user_inactive');
  }

  return issueTokens(user);
}

/**
 * Logout: blacklist the current access token (by jti) and drop the refresh
 * session so neither can be used again.
 */
export async function logout(params: {
  userId: string;
  accessJti: string;
  accessExp: number;
}): Promise<void> {
  if (!params.userId) {
    throw new BadRequestError('Missing user context', 'no_user_context');
  }
  await blacklistAccessToken(params.accessJti, params.accessExp);
  await revokeRefreshSession(params.userId);
}

/**
 * Begin a password reset. Always resolves successfully — we never reveal
 * whether an email is registered (prevents account enumeration). When the email
 * matches an active user, a single-use reset token is signed and emailed.
 */
export async function forgotPassword(email: string): Promise<void> {
  const user = await User.findOne({ email });

  // Silent no-op for unknown / inactive accounts — same response either way.
  if (!user || !user.is_active) {
    logger.info('Password reset requested for unknown or inactive email');
    return;
  }

  const { token } = await signPasswordResetToken(user.user_id);
  const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;

  const state = await sendPasswordResetEmail(user.email as string, resetUrl);
  if (state !== 'sent') {
    // Email is best-effort here; log so ops can see delivery gaps without
    // leaking to the caller (still a generic success response).
    logger.warn('Password reset email not delivered', {
      user_id: user.user_id,
      state,
    });
  }
}

/**
 * Complete a password reset: verify the single-use token, set the new password
 * (re-hashed by the model pre-save hook), consume the token, and revoke the
 * user's refresh session so existing logins can't continue with the old creds.
 * Returns the affected user's user_id + role so the caller can audit the action.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ userId: string; role: string }> {
  let payload;
  try {
    payload = await verifyPasswordResetToken(token);
  } catch {
    throw new BadRequestError(
      'Reset token is invalid or has expired',
      'reset_token_invalid',
    );
  }
  if (!payload) {
    throw new BadRequestError(
      'Reset token is invalid or has expired',
      'reset_token_invalid',
    );
  }

  const user = await User.findOne({ user_id: payload.sub });
  if (!user || !user.is_active) {
    throw new BadRequestError(
      'Reset token is invalid or has expired',
      'reset_token_invalid',
    );
  }

  user.password = newPassword; // pre-save hook hashes it
  await user.save();

  // Single-use: invalidate the token and drop any active refresh session.
  await consumePasswordResetToken(user.user_id);
  await revokeRefreshSession(user.user_id);

  return { userId: user.user_id, role: user.role };
}
