import type { Permission, UserRole } from '@madar/shared';
import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
}

export type AuthedRequest = Request & { user?: AuthUser };

export const IS_PUBLIC = 'madar:isPublic';
export const PERMISSION_KEY = 'madar:permission';

/** Opt a route out of authentication (login, register, health, docs). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Require a global role permission (see @madar/shared ROLE_PERMISSIONS). */
export const RequirePermission = (p: Permission) => SetMetadata(PERMISSION_KEY, p);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error('CurrentUser used on a public route');
  return req.user;
});
