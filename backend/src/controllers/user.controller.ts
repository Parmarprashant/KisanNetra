/**
 * User controller (thin).
 */
import { Request, Response } from 'express';
import * as userService from '../services/user.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';

// GET /api/v1/users/me
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getByUserId(req.user!.id);
  res.json(apiResponse.success({ user }));
});

// GET /api/v1/users  (admin only)
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, role } = req.query as unknown as {
    page: number;
    limit: number;
    role?: string;
  };
  const result = await userService.listUsers({ page, limit, role });
  res.json(
    apiResponse.success(
      { users: result.users },
      { total: result.total, page: result.page, limit: result.limit },
    ),
  );
});
