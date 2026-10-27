import { schema as s, type Database } from '@madar/db';
import type { CreateProjectInput } from '@madar/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth.decorators';
import { DB } from '../database/database.module';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listFor(user: AuthUser) {
    const rows = await this.db
      .select({
        id: s.projects.id,
        name: s.projects.name,
        description: s.projects.description,
        cityId: s.projects.cityId,
        createdAt: s.projects.createdAt,
        updatedAt: s.projects.updatedAt,
        role: s.projectMembers.role,
      })
      .from(s.projectMembers)
      .innerJoin(s.projects, eq(s.projectMembers.projectId, s.projects.id))
      .where(eq(s.projectMembers.userId, user.id))
      .orderBy(desc(s.projects.updatedAt));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const scen = await this.db
      .select({ projectId: s.scenarios.projectId, n: count() })
      .from(s.scenarios)
      .where(and(inArray(s.scenarios.projectId, ids), sql`${s.scenarios.archivedAt} is null`))
      .groupBy(s.scenarios.projectId);
    const runs = await this.db
      .select({ projectId: s.simulationRuns.projectId, n: count() })
      .from(s.simulationRuns)
      .where(inArray(s.simulationRuns.projectId, ids))
      .groupBy(s.simulationRuns.projectId);
    const sc = new Map(scen.map((r) => [r.projectId, r.n]));
    const rc = new Map(runs.map((r) => [r.projectId, r.n]));
    return rows.map((r) => ({ ...r, scenarioCount: sc.get(r.id) ?? 0, runCount: rc.get(r.id) ?? 0 }));
  }

  async create(user: AuthUser, input: CreateProjectInput) {
    const [city] = await this.db.select({ id: s.cities.id }).from(s.cities).where(eq(s.cities.id, input.cityId));
    if (!city) throw new BadRequestException('Unknown city');
    const project = await this.db.transaction(async (tx) => {
      const [p] = await tx.insert(s.projects).values({ ...input, ownerId: user.id }).returning();
      await tx.insert(s.projectMembers).values({ projectId: p!.id, userId: user.id, role: 'owner' });
      // Every project starts with a baseline so the first run is one click away.
      const [baseline] = await tx
        .insert(s.scenarios)
        .values({ projectId: p!.id, name: 'Baseline', description: 'Network as configured, default signal plans.', kind: 'baseline', isSaved: true, createdBy: user.id })
        .returning();
      await tx.insert(s.scenarioParameters).values({ scenarioId: baseline!.id });
      return p!;
    });
    await this.audit.record({ actorId: user.id, action: 'project.create', entityType: 'project', entityId: project.id, metadata: { name: project.name } });
    return project;
  }

  async get(projectId: string) {
    const [p] = await this.db.select().from(s.projects).where(eq(s.projects.id, projectId));
    if (!p) throw new NotFoundException('Project not found');
    const members = await this.db
      .select({ userId: s.users.id, displayName: s.users.displayName, email: s.users.email, role: s.projectMembers.role })
      .from(s.projectMembers)
      .innerJoin(s.users, eq(s.projectMembers.userId, s.users.id))
      .where(eq(s.projectMembers.projectId, projectId));
    return { ...p, members };
  }

  async update(user: AuthUser, projectId: string, patch: { name?: string; description?: string }) {
    const [p] = await this.db.update(s.projects).set({ ...patch, updatedAt: new Date() }).where(eq(s.projects.id, projectId)).returning();
    await this.audit.record({ actorId: user.id, action: 'project.update', entityType: 'project', entityId: projectId, metadata: patch });
    return p;
  }

  async remove(user: AuthUser, projectId: string) {
    await this.db.delete(s.projects).where(eq(s.projects.id, projectId));
    await this.audit.record({ actorId: user.id, action: 'project.delete', entityType: 'project', entityId: projectId });
  }

  async addMember(user: AuthUser, projectId: string, email: string, role: 'editor' | 'viewer') {
    const [target] = await this.db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.email}) = ${email}`);
    // Same response whether or not the email exists would be ideal for privacy; for a
    // team tool we prefer a clear error, but we never reveal anything beyond "not found".
    if (!target) throw new NotFoundException('No user with that email');
    await this.db
      .insert(s.projectMembers)
      .values({ projectId, userId: target.id, role })
      .onConflictDoUpdate({ target: [s.projectMembers.projectId, s.projectMembers.userId], set: { role } });
    await this.audit.record({ actorId: user.id, action: 'project.add_member', entityType: 'project', entityId: projectId, metadata: { userId: target.id, role } });
    return this.get(projectId);
  }

  async activity(projectId: string) {
    const scenarioIds = (await this.db.select({ id: s.scenarios.id }).from(s.scenarios).where(eq(s.scenarios.projectId, projectId))).map((r) => r.id);
    const ids = [projectId, ...scenarioIds];
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
      .where(inArray(s.auditLogs.entityId, ids))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(40);
  }
}
