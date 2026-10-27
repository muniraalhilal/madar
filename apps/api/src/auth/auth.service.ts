import { ARGON2_OPTIONS, schema as s, type Database } from '@madar/db';
import type { LoginInput, RegisterInput, UserRole } from '@madar/shared';
import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import argon2 from 'argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { DB } from '../database/database.module';
import { TokensService } from './tokens.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// Verifying against a real hash for unknown emails keeps response time uniform,
// so login timing does not reveal which accounts exist.
let DUMMY_HASH: Promise<string> | null = null;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export const toPublicUser = (u: typeof s.users.$inferSelect): PublicUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
});

interface ClientInfo {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput, client: ClientInfo): Promise<SessionTokens> {
    if (!this.env.ALLOW_REGISTRATION) throw new ForbiddenException('Registration is disabled');
    const [exists] = await this.db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${input.email}`);
    if (exists) throw new ConflictException('An account with this email already exists');
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
    const [user] = await this.db
      .insert(s.users)
      .values({ email: input.email, displayName: input.displayName, passwordHash, role: 'planner' })
      .returning();
    await this.audit.record({ actorId: user!.id, action: 'auth.register', entityType: 'user', entityId: user!.id, ip: client.ip });
    return this.startSession(user!, client);
  }

  async login(input: LoginInput, client: ClientInfo): Promise<SessionTokens> {
    const [user] = await this.db.select().from(s.users).where(sql`lower(${s.users.email}) = ${input.email}`);
    if (!user) {
      DUMMY_HASH ??= argon2.hash('timing-equaliser-not-a-password', ARGON2_OPTIONS);
      await argon2.verify(await DUMMY_HASH, input.password).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked after repeated failed sign-ins. Try again later.');
    }
    const ok = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lock = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await this.db
        .update(s.users)
        .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock })
        .where(eq(s.users.id, user.id));
      await this.audit.record({ actorId: user.id, action: lock ? 'auth.locked' : 'auth.login_failed', entityType: 'user', entityId: user.id, ip: client.ip });
      throw new UnauthorizedException('Invalid email or password');
    }
    const [updated] = await this.db
      .update(s.users)
      .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(s.users.id, user.id))
      .returning();
    await this.audit.record({ actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, ip: client.ip });
    return this.startSession(updated!, client);
  }

  private async startSession(user: typeof s.users.$inferSelect, client: ClientInfo): Promise<SessionTokens> {
    const { token, hash } = this.tokens.newRefreshToken();
    const [session] = await this.db
      .insert(s.userSessions)
      .values({
        userId: user.id,
        refreshTokenHash: hash,
        ip: client.ip ?? null,
        userAgent: client.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      })
      .returning({ id: s.userSessions.id });
    return {
      accessToken: this.tokens.signAccess({ sub: user.id, role: user.role, email: user.email, name: user.displayName, sid: session!.id }),
      refreshToken: token,
      user: toPublicUser(user),
    };
  }

  /**
   * Refresh-token rotation with reuse detection: each refresh token works once.
   * Presenting an already-rotated token means it was stolen or replayed, so every
   * session of that user is revoked.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<SessionTokens> {
    const hash = TokensService.hash(refreshToken);
    const [session] = await this.db.select().from(s.userSessions).where(eq(s.userSessions.refreshTokenHash, hash));
    if (!session) throw new UnauthorizedException('Session not found');
    if (session.revokedAt) {
      await this.db
        .update(s.userSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(s.userSessions.userId, session.userId), isNull(s.userSessions.revokedAt)));
      await this.audit.record({ actorId: session.userId, action: 'auth.refresh_reuse_detected', entityType: 'session', entityId: session.id, ip: client.ip });
      throw new UnauthorizedException('Session revoked');
    }
    if (session.expiresAt < new Date()) throw new UnauthorizedException('Session expired');
    const [user] = await this.db.select().from(s.users).where(eq(s.users.id, session.userId));
    if (!user) throw new UnauthorizedException('Session not found');

    const next = this.tokens.newRefreshToken();
    const [newSession] = await this.db.transaction(async (tx) => {
      const created = await tx
        .insert(s.userSessions)
        .values({
          userId: user.id,
          refreshTokenHash: next.hash,
          ip: client.ip ?? null,
          userAgent: client.userAgent?.slice(0, 300) ?? null,
          expiresAt: session.expiresAt, // rotation never extends the absolute lifetime
        })
        .returning({ id: s.userSessions.id });
      const revoked = await tx
        .update(s.userSessions)
        .set({ revokedAt: new Date(), replacedBy: created[0]!.id, lastUsedAt: new Date() })
        .where(and(eq(s.userSessions.id, session.id), isNull(s.userSessions.revokedAt)))
        .returning({ id: s.userSessions.id });
      if (!revoked.length) throw new UnauthorizedException('Session already rotated');
      return created;
    });
    return {
      accessToken: this.tokens.signAccess({ sub: user.id, role: user.role, email: user.email, name: user.displayName, sid: newSession!.id }),
      refreshToken: next.token,
      user: toPublicUser(user),
    };
  }

  async logout(refreshToken: string | undefined, userId: string | undefined, client: ClientInfo): Promise<void> {
    if (refreshToken) {
      await this.db
        .update(s.userSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(s.userSessions.refreshTokenHash, TokensService.hash(refreshToken)), isNull(s.userSessions.revokedAt)));
    }
    if (userId) await this.audit.record({ actorId: userId, action: 'auth.logout', entityType: 'user', entityId: userId, ip: client.ip });
  }

  async isSessionActive(sessionId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: s.userSessions.id, replacedBy: s.userSessions.replacedBy, revokedAt: s.userSessions.revokedAt })
      .from(s.userSessions)
      .where(and(eq(s.userSessions.id, sessionId), gt(s.userSessions.expiresAt, new Date())));
    // A rotated session is still valid for its outstanding access token; an explicitly
    // revoked one (logout / reuse detection) is not.
    return !!row && (!row.revokedAt || !!row.replacedBy);
  }
}
