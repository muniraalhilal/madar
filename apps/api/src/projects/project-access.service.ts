import { schema as s, type Database } from '@madar/db';
import { MEMBER_CAPABILITIES, type MemberRole } from '@madar/shared';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { AuthUser } from '../common/auth.decorators';
import { DB } from '../database/database.module';

export type Access = 'read' | 'write' | 'manage';

/**
 * Ownership enforcement. Every project-scoped resource (scenarios, runs, reports,
 * incidents) resolves to a project and is checked here, so authorisation lives in
 * one place instead of being re-implemented per controller.
 *
 * Unauthorised and non-existent resources both return 404 to avoid leaking IDs.
 * Admins can read everything but still need membership to modify.
 */
@Injectable()
export class ProjectAccessService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async assert(user: AuthUser, projectId: string, access: Access): Promise<{ role: MemberRole | 'admin' }> {
    const [project] = await this.db.select({ id: s.projects.id }).from(s.projects).where(eq(s.projects.id, projectId));
    if (!project) throw new NotFoundException('Project not found');
    const [m] = await this.db
      .select({ role: s.projectMembers.role })
      .from(s.projectMembers)
      .where(and(eq(s.projectMembers.projectId, projectId), eq(s.projectMembers.userId, user.id)));
    if (!m) {
      if (user.role === 'admin' && access === 'read') return { role: 'admin' };
      throw new NotFoundException('Project not found');
    }
    const caps = MEMBER_CAPABILITIES[m.role];
    // Global viewers can never write, whatever their membership says.
    const globalWrite = user.role !== 'viewer';
    if ((access === 'write' && !(caps.write && globalWrite)) || (access === 'manage' && !(caps.manage && globalWrite))) {
      throw new ForbiddenException('You do not have permission to change this project');
    }
    return { role: m.role };
  }

  async projectOfScenario(scenarioId: string): Promise<string> {
    const [row] = await this.db.select({ projectId: s.scenarios.projectId }).from(s.scenarios).where(eq(s.scenarios.id, scenarioId));
    if (!row) throw new NotFoundException('Scenario not found');
    return row.projectId;
  }

  async projectOfRun(runId: string): Promise<string> {
    const [row] = await this.db.select({ projectId: s.simulationRuns.projectId }).from(s.simulationRuns).where(eq(s.simulationRuns.id, runId));
    if (!row) throw new NotFoundException('Run not found');
    return row.projectId;
  }

  async projectOfReport(reportId: string): Promise<string> {
    const [row] = await this.db.select({ projectId: s.reports.projectId }).from(s.reports).where(eq(s.reports.id, reportId));
    if (!row) throw new NotFoundException('Report not found');
    return row.projectId;
  }

  async assertScenario(user: AuthUser, scenarioId: string, access: Access) {
    const projectId = await this.projectOfScenario(scenarioId);
    await this.assert(user, projectId, access);
    return projectId;
  }

  async assertRun(user: AuthUser, runId: string, access: Access) {
    const projectId = await this.projectOfRun(runId);
    await this.assert(user, projectId, access);
    return projectId;
  }
}
