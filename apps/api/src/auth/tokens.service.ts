import { createHash, randomBytes } from 'node:crypto';
import type { UserRole } from '@madar/shared';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV, type Env } from '../config/env';

export interface AccessClaims {
  sub: string;
  role: UserRole;
  email: string;
  name: string;
  sid: string;
}

export const ACCESS_COOKIE = 'madar_at';
export const REFRESH_COOKIE = 'madar_rt';

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  signAccess(claims: AccessClaims): string {
    return this.jwt.sign(claims, {
      secret: this.env.JWT_ACCESS_SECRET,
      expiresIn: this.env.ACCESS_TOKEN_TTL_S,
      issuer: 'madar-api',
      audience: 'madar-web',
      algorithm: 'HS256',
    });
  }

  verifyAccess(token: string): AccessClaims {
    return this.jwt.verify<AccessClaims>(token, {
      secret: this.env.JWT_ACCESS_SECRET,
      issuer: 'madar-api',
      audience: 'madar-web',
      algorithms: ['HS256'],
    });
  }

  /** Opaque 256-bit refresh token; only its SHA-256 digest is stored. */
  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: TokensService.hash(token) };
  }

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  cookieOptions(kind: 'access' | 'refresh') {
    const maxAge = kind === 'access' ? this.env.ACCESS_TOKEN_TTL_S * 1000 : this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;
    return {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'lax' as const,
      path: kind === 'access' ? '/' : '/api/auth',
      maxAge,
      ...(this.env.COOKIE_DOMAIN ? { domain: this.env.COOKIE_DOMAIN } : {}),
    };
  }
}
