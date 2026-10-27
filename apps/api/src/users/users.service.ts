import { ARGON2_OPTIONS, schema as s, type Database } from '@madar/db';
import type { UserRole } from '@madar/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import argon2 from 'argon2';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { toPublicUser } from '../auth/auth.service';
import { DB } from '../database/database.module';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async getPublic(id: string) {
    const [u] = await this.db.select().from(s.users).where(eq(s.users.id, id));
    if (!u) throw new NotFoundException('User not found');
    return toPublicUser(u);
  }

  async updateProfile(id: string, displayName: string) {
    const [u] = await this.db.update(s.users).set({ displayName, updatedAt: new Date() }).where(eq(s.users.id, id)).returning();
    await this.audit.record({ actorId: id, action: 'user.update_profile', entityType: 'user', entityId: id });
    return toPublicUser(u!);
  }

  async changePassword(id: string, current: string, next: string, keepSessionId?: string) {
    const [u] = await this.db.select().from(s.users).where(eq(s.users.id, id));
    if (!u) throw new NotFoundException('User not found');
    if (!(await argon2.verify(u.passwordHash, current).catch(() => false))) {
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await argon2.hash(next, ARGON2_OPTIONS);
    await this.db.transaction(async (tx) => {
      await tx.update(s.users).set({ passwordHash, updatedAt: new Date() }).where(eq(s.users.id, id));
      // Changing the password signs out every other device.
      await tx
        .update(s.userSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(s.userSessions.userId, id),
            isNull(s.userSessions.revokedAt),
            keepSessionId ? ne(s.userSessions.id, keepSessionId) : undefined,
          ),
        );
    });
    await this.audit.record({ actorId: id, action: 'user.change_password', entityType: 'user', entityId: id });
  }

  async listSessions(userId: string) {
    return this.db
      .select({
        id: s.userSessions.id,
        userAgent: s.userSessions.userAgent,
        ip: s.userSessions.ip,
        createdAt: s.userSessions.createdAt,
        lastUsedAt: s.userSessions.lastUsedAt,
        expiresAt: s.userSessions.expiresAt,
      })
      .from(s.userSessions)
      .where(and(eq(s.userSessions.userId, userId), isNull(s.userSessions.revokedAt)))
      .orderBy(asc(s.userSessions.createdAt));
  }

  async listAll() {
    const rows = await this.db.select().from(s.users).orderBy(asc(s.users.createdAt));
    return rows.map(toPublicUser);
  }

  async setRole(actorId: string, userId: string, role: UserRole) {
    if (actorId === userId) throw new BadRequestException('You cannot change your own role');
    const [u] = await this.db.update(s.users).set({ role, updatedAt: new Date() }).where(eq(s.users.id, userId)).returning();
    if (!u) throw new NotFoundException('User not found');
    await this.audit.record({ actorId, action: 'user.set_role', entityType: 'user', entityId: userId, metadata: { role } });
    return toPublicUser(u);
  }
}
