import { hasPermission, type Permission } from '@madar/shared';
import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC, PERMISSION_KEY, type AuthedRequest } from '../common/auth.decorators';
import { AuthService } from './auth.service';
import { ACCESS_COOKIE, TokensService } from './tokens.service';

export function extractAccessToken(req: { headers: Record<string, unknown>; cookies?: Record<string, string> }): { token?: string; via?: 'bearer' | 'cookie' } {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) return { token: header.slice(7).trim(), via: 'bearer' };
  const cookie = req.cookies?.[ACCESS_COOKIE];
  return cookie ? { token: cookie, via: 'cookie' } : {};
}

/** Global guard: every route requires a valid access token unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest & { authVia?: string }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const { token, via } = extractAccessToken(req as never);
    if (token) {
      try {
        const claims = this.tokens.verifyAccess(token);
        if (!(await this.auth.isSessionActive(claims.sid))) throw new Error('session revoked');
        req.user = { id: claims.sub, email: claims.email, role: claims.role, displayName: claims.name };
        req.authVia = via;
      } catch {
        if (!isPublic) throw new UnauthorizedException('Invalid or expired session');
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('Authentication required');
    return true;
  }
}

/**
 * CSRF defence for cookie-authenticated requests. Cookies are SameSite=Lax, and
 * every state-changing request must also carry `X-Requested-With: madar` — a
 * header a cross-site form cannot set and a cross-origin script cannot send
 * without passing the CORS allow-list.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest & { authVia?: string }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (req.authVia === 'bearer') return true;
    if (req.headers['x-requested-with'] !== 'madar') throw new ForbiddenException('Missing CSRF header');
    return true;
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!permission) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || !hasPermission(req.user.role, permission)) {
      throw new ForbiddenException(`Requires permission ${permission}`);
    }
    return true;
  }
}
