/**
 * Auth controller.
 *
 * Thin HTTP layer: parse validated input, delegate to auth.service, shape the
 * response. Refresh tokens are delivered as an HttpOnly cookie; access tokens
 * are returned in the JSON body for the client to hold in memory.
 */
import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as auditService from '../services/audit.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { auditContext } from '../utils/auditContext';
import { isProduction } from '../config/env';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days (matches refresh TTL)

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE,
    path: '/api/v1/auth',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
}

// POST /api/v1/auth/register
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.register(req.body);
  setRefreshCookie(res, tokens.refreshToken);
  res
    .status(201)
    .json(apiResponse.success({ user, accessToken: tokens.accessToken }));
});

// POST /api/v1/auth/login
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { user, tokens } = await authService.login(req.body);
  setRefreshCookie(res, tokens.refreshToken);

  void auditService.log({
    actorId: user.user_id,
    actorRole: user.role,
    action: 'auth.login',
    resource: `User:${user.user_id}`,
    ...auditContext(req),
  });

  res.json(apiResponse.success({ user, accessToken: tokens.accessToken }));
});

// POST /api/v1/auth/refresh
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  const tokens = await authService.refresh(token);
  setRefreshCookie(res, tokens.refreshToken);
  res.json(apiResponse.success({ accessToken: tokens.accessToken }));
});

// POST /api/v1/auth/logout
export const logout = asyncHandler(async (req: Request, res: Response) => {
  await authService.logout({
    userId: req.user!.id,
    accessJti: req.user!.jti,
    accessExp: req.user!.exp,
  });
  clearRefreshCookie(res);

  void auditService.log({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'auth.logout',
    resource: `User:${req.user!.id}`,
    ...auditContext(req),
  });

  res.json(apiResponse.success({ message: 'Logged out successfully' }));
});

// POST /api/v1/auth/forgot-password
export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };
    await authService.forgotPassword(email);
    // Always a generic success — never reveal whether the email is registered.
    res.json(
      apiResponse.success({
        message:
          'If an account exists for that email, a reset link has been sent.',
      }),
    );
  },
);

// POST /api/v1/auth/reset-password
export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { token, password } = req.body as { token: string; password: string };
    const { userId, role } = await authService.resetPassword(token, password);

    void auditService.log({
      actorId: userId,
      actorRole: role,
      action: 'auth.password_reset',
      resource: `User:${userId}`,
      ...auditContext(req),
    });

    res.json(
      apiResponse.success({
        message: 'Password has been reset. Please log in with your new password.',
      }),
    );
  },
);
