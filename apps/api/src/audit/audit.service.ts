import { schema as s, type Database } from '@madar/db';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DB } from '../database/database.module';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Audit writes must never break the request that triggered them. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(s.auditLogs).values({
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ?? {},
        ip: entry.ip ?? null,
      });
    } catch (e) {
      this.logger.error(`Failed to write audit entry ${entry.action}: ${(e as Error).message}`);
    }
  }

  list(limit: number, offset: number, actorId?: string) {
    return this.db
      .select({
        id: s.auditLogs.id,
        action: s.auditLogs.action,
        entityType: s.auditLogs.entityType,
        entityId: s.auditLogs.entityId,
        metadata: s.auditLogs.metadata,
        createdAt: s.auditLogs.createdAt,
        actorEmail: s.users.email,
      })
      .from(s.auditLogs)
      .leftJoin(s.users, eq(s.auditLogs.actorId, s.users.id))
      .where(actorId ? eq(s.auditLogs.actorId, actorId) : undefined)
      .orderBy(desc(s.auditLogs.createdAt), desc(s.auditLogs.id))
      .limit(limit)
      .offset(offset);
  }

  forEntities(entityType: string, ids: string[], limit = 30) {
    if (!ids.length) return Promise.resolve([]);
    return this.db
      .select({
        id: s.auditLogs.id,
        action: s.auditLogs.action,
        entityType: s.auditLogs.entityType,
        entityId: s.auditLogs.entityId,
        metadata: s.auditLogs.metadata,
        createdAt: s.auditLogs.createdAt,
        actorName: s.users.displayName,
      })
      .from(s.auditLogs)
      .leftJoin(s.users, eq(s.auditLogs.actorId, s.users.id))
      .where(and(eq(s.auditLogs.entityType, entityType), inArray(s.auditLogs.entityId, ids)))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(limit);
  }
}
