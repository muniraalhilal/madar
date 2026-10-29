import { schema as s, type Database } from '@madar/db';
import { TRAFFIC_ENERGY_ASSUMPTIONS, compareSummaries } from '@madar/sim-engine';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth.decorators';
import { DB } from '../database/database.module';
import { RunsService, summaryFromRow } from '../runs/runs.service';
import { REPORT_DISCLAIMER as DISCLAIMER, findingsFrom, type ReportContent } from '@madar/shared';


@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly runs: RunsService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, projectId: string, input: { title: string; baselineRunId: string; variantRunId?: string; notes: string }) {
    const base = await this.runs.get(input.baselineRunId);
    if (base.projectId !== projectId || base.status !== 'completed') throw new BadRequestException('Baseline run must be a completed run in this project');
    let content: ReportContent;
    const stamp = (r: Awaited<ReturnType<RunsService['get']>>) => ({
      runId: r.id,
      scenarioName: r.scenarioName,
      seed: r.seed,
      engineVersion: r.engineVersion,
      resultFingerprint: r.resultFingerprint,
      params: r.params,
    });
    if (input.variantRunId) {
      const cmp = await this.runs.compare(input.baselineRunId, input.variantRunId);
      if (cmp.variant.projectId !== projectId) throw new BadRequestException('Variant run belongs to another project');
      content = {
        generatedAt: new Date().toISOString(),
        title: input.title,
        notes: input.notes,
        baseline: stamp(cmp.baseline),
        variant: stamp(cmp.variant),
        metrics: cmp.metrics,
        topLinks: cmp.links.map((l) => ({ name: l.name, linkId: l.linkId, baselineCongestion: l.baselineCongestion, variantCongestion: l.variantCongestion })),
        findings: findingsFrom(cmp.metrics, true),
        assumptions: { ...TRAFFIC_ENERGY_ASSUMPTIONS },
        disclaimer: DISCLAIMER,
      };
    } else {
      const [row] = await this.db.select().from(s.simulationRuns).where(eq(s.simulationRuns.id, input.baselineRunId));
      const summary = summaryFromRow(row!);
      const metrics = compareSummaries(summary, summary);
      const links = (await this.runs.links(input.baselineRunId)).slice(0, 12);
      content = {
        generatedAt: new Date().toISOString(),
        title: input.title,
        notes: input.notes,
        baseline: stamp(base),
        variant: null,
        metrics,
        topLinks: links.map((l) => ({ name: l.name, linkId: l.linkId, baselineCongestion: l.congestion, variantCongestion: l.congestion })),
        findings: findingsFrom(metrics, false),
        assumptions: { ...TRAFFIC_ENERGY_ASSUMPTIONS },
        disclaimer: DISCLAIMER,
      };
    }
    const [r] = await this.db
      .insert(s.reports)
      .values({ projectId, title: input.title, baselineRunId: input.baselineRunId, variantRunId: input.variantRunId ?? null, notes: input.notes, content, createdBy: user.id })
      .returning();
    await this.audit.record({ actorId: user.id, action: 'report.create', entityType: 'project', entityId: projectId, metadata: { reportId: r!.id } });
    return r!;
  }

  list(projectId: string) {
    return this.db
      .select({ id: s.reports.id, title: s.reports.title, createdAt: s.reports.createdAt, baselineRunId: s.reports.baselineRunId, variantRunId: s.reports.variantRunId, author: s.users.displayName })
      .from(s.reports)
      .leftJoin(s.users, eq(s.reports.createdBy, s.users.id))
      .where(eq(s.reports.projectId, projectId))
      .orderBy(desc(s.reports.createdAt));
  }

  async get(id: string) {
    const [r] = await this.db.select().from(s.reports).where(eq(s.reports.id, id));
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  async remove(user: AuthUser, id: string) {
    const r = await this.get(id);
    await this.db.delete(s.reports).where(eq(s.reports.id, id));
    await this.audit.record({ actorId: user.id, action: 'report.delete', entityType: 'project', entityId: r.projectId, metadata: { reportId: id } });
  }
}
