/**
 * Admin controller (thin).
 *
 * Extracts validated input, delegates to admin.service, and shapes the response.
 * The acting admin's user_id (req.user.id) is passed through so the service can
 * enforce the self-action guard. No business logic here (per rules.md).
 */
import { Request, Response } from 'express';
import * as adminService from '../services/admin.service';
import * as auditService from '../services/audit.service';
import { apiResponse } from '../utils/apiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { auditContext } from '../utils/auditContext';
import type { Role } from '../models/User';

// GET /api/v1/admin/users
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, role, region, active, search } =
    req.query as unknown as {
      page: number;
      limit: number;
      role?: Role;
      region?: string;
      active?: boolean;
      search?: string;
    };

  const result = await adminService.listUsers({
    page,
    limit,
    role,
    region,
    active,
    search,
  });

  res.json(
    apiResponse.success(
      { users: result.users },
      { total: result.total, page: result.page, limit: result.limit },
    ),
  );
});

// GET /api/v1/admin/users/:id
export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminService.getUserDetail(req.params.id);
  res.json(apiResponse.success({ user }));
});

// PATCH /api/v1/admin/users/:id/role
export const changeRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body as { role: Role };
  const user = await adminService.changeUserRole(
    req.user!.id,
    req.params.id,
    role,
  );

  void auditService.log({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'user.role_change',
    resource: `User:${req.params.id}`,
    metadata: { new_role: role },
    ...auditContext(req),
  });

  res.json(apiResponse.success({ user }));
});

// PATCH /api/v1/admin/users/:id/suspend
export const suspendUser = asyncHandler(async (req: Request, res: Response) => {
  const { suspended } = req.body as { suspended: boolean };
  const user = await adminService.setUserSuspended(
    req.user!.id,
    req.params.id,
    suspended,
  );

  void auditService.log({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'user.suspend',
    resource: `User:${req.params.id}`,
    metadata: { suspended },
    ...auditContext(req),
  });

  res.json(
    apiResponse.success({
      user,
      message: suspended ? 'User suspended' : 'User activated',
    }),
  );
});

// DELETE /api/v1/admin/users/:id
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  await adminService.softDeleteUser(req.user!.id, req.params.id);

  void auditService.log({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'user.delete',
    resource: `User:${req.params.id}`,
    ...auditContext(req),
  });

  res.json(apiResponse.success({ message: 'User deleted' }));
});

// GET /api/v1/admin/system/health
export const getSystemHealth = asyncHandler(
  async (_req: Request, res: Response) => {
    const health = await adminService.getSystemHealth();
    res.json(apiResponse.success({ health }));
  },
);
