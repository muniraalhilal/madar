import { schema as s, type Database } from '@madar/db';
import type { CreateScenarioInput, UpdateScenarioInput } from '@madar/shared';
import {
  DEFAULT_PARAMS,
  proposeSignalTimings,
  validateScenario,
  type LinkResult,
  type ScenarioParams,
} from '@madar/sim-engine';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CitiesService } from '../cities/cities.service';
import type { AuthUser } from '../common/auth.decorators';
import { DB } from '../database/database.module';

type ParamsRow = typeof s.scenarioParameters.$inferSelect;

@Injectable()
export class ScenariosService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly cities: CitiesService,
    private readonly audit: AuditService,
  ) {}

  private async cityOf(projectId: string): Promise<string> {
    const [p] = await this.db.select({ cityId: s.projects.cityId }).from(s.projects).where(eq(s.projects.id, projectId));
    if (!p) throw new NotFoundException('Project not found');
    return p.cityId;
  }

  async list(projectId: string, opts: { savedOnly?: boolean } = {}) {
    const rows = await this.db
      .select()
      .from(s.scenarios)
      .where(and(eq(s.scenarios.projectId, projectId), isNull(s.scenarios.archivedAt), opts.savedOnly ? eq(s.scenarios.isSaved, true) : undefined))
      .orderBy(desc(s.scenarios.kind), desc(s.scenarios.updatedAt));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const runs = await this.db
      .select({
        id: s.simulationRuns.id,
        scenarioId: s.simulationRuns.scenarioId,
        status: s.simulationRuns.status,
        progress: s.simulationRuns.progress,
        queuedAt: s.simulationRuns.queuedAt,
        meanTravelTimeS: s.simulationRuns.meanTravelTimeS,
        meanDelayS: s.simulationRuns.meanDelayS,
        throughputPerHour: s.simulationRuns.throughputPerHour,
      })
      .from(s.simulationRuns)
      .where(inArray(s.simulationRuns.scenarioId, ids))
      .orderBy(desc(s.simulationRuns.queuedAt));
    const latest = new Map<string, (typeof runs)[number]>();
    const counts = new Map<string, number>();
    for (const r of runs) {
      if (!latest.has(r.scenarioId)) latest.set(r.scenarioId, r);
      counts.set(r.scenarioId, (counts.get(r.scenarioId) ?? 0) + 1);
    }
    const [overrides, closures, incidents] = await Promise.all([
      this.db.select({ id: s.scenarioSignalOverrides.scenarioId }).from(s.scenarioSignalOverrides).where(inArray(s.scenarioSignalOverrides.scenarioId, ids)),
      this.db.select({ id: s.scenarioClosures.scenarioId }).from(s.scenarioClosures).where(inArray(s.scenarioClosures.scenarioId, ids)),
      this.db.select({ id: s.incidents.scenarioId }).from(s.incidents).where(inArray(s.incidents.scenarioId, ids)),
    ]);
    const tally = (xs: { id: string }[]) => xs.reduce((m, x) => m.set(x.id, (m.get(x.id) ?? 0) + 1), new Map<string, number>());
    const [o, c, i] = [tally(overrides), tally(closures), tally(incidents)];
    return rows.map((r) => ({
      ...r,
      latestRun: latest.get(r.id) ?? null,
      runCount: counts.get(r.id) ?? 0,
      changes: { signalOverrides: o.get(r.id) ?? 0, closures: c.get(r.id) ?? 0, incidents: i.get(r.id) ?? 0 },
    }));
  }

  async detail(scenarioId: string) {
    const [sc] = await this.db.select().from(s.scenarios).where(eq(s.scenarios.id, scenarioId));
    if (!sc || sc.archivedAt) throw new NotFoundException('Scenario not found');
    const cityId = await this.cityOf(sc.projectId);
    const { maps, network } = await this.cities.get(cityId);
    const [params] = await this.db.select().from(s.scenarioParameters).where(eq(s.scenarioParameters.scenarioId, scenarioId));
    const [overrides, closures, incidents, runs] = await Promise.all([
      this.db.select().from(s.scenarioSignalOverrides).where(eq(s.scenarioSignalOverrides.scenarioId, scenarioId)),
      this.db.select().from(s.scenarioClosures).where(eq(s.scenarioClosures.scenarioId, scenarioId)),
      this.db.select().from(s.incidents).where(eq(s.incidents.scenarioId, scenarioId)),
      this.db
        .select({
          id: s.simulationRuns.id,
          status: s.simulationRuns.status,
          progress: s.simulationRuns.progress,
          queuedAt: s.simulationRuns.queuedAt,
          finishedAt: s.simulationRuns.finishedAt,
          meanTravelTimeS: s.simulationRuns.meanTravelTimeS,
          meanDelayS: s.simulationRuns.meanDelayS,
          throughputPerHour: s.simulationRuns.throughputPerHour,
          resultFingerprint: s.simulationRuns.resultFingerprint,
        })
        .from(s.simulationRuns)
        .where(eq(s.simulationRuns.scenarioId, scenarioId))
        .orderBy(desc(s.simulationRuns.queuedAt))
        .limit(20),
    ]);
    const roadName = (code: string) => network.links.find((l) => l.id === code)?.name ?? code;
    const nodeName = (code: string) => network.nodes.find((n) => n.id === code)?.name ?? code;
    return {
      ...sc,
      cityId,
      params: params ? this.paramsDto(params) : null,
      signalOverrides: overrides
        .map((o) => {
          const code = maps.nodeCodeById.get(o.intersectionId) as string;
          return { intersectionCode: code, intersectionName: nodeName(code), offsetS: o.offsetS, greens: o.greens };
        })
        .sort((a, b) => (a.intersectionCode < b.intersectionCode ? -1 : 1)),
      closures: closures.map((c) => {
        const code = maps.roadCodeById.get(c.roadId) as string;
        return { id: c.id, roadCode: code, roadName: roadName(code), startS: c.startS, endS: c.endS, reason: c.reason };
      }),
      incidents: incidents.map((i) => {
        const code = maps.roadCodeById.get(i.roadId) as string;
        return { id: i.id, roadCode: code, roadName: roadName(code), kind: i.kind, severity: i.severity, startS: i.startS, durationS: i.durationS, description: i.description };
      }),
      runs,
    };
  }

  private paramsDto(p: ParamsRow) {
    const { scenarioId: _id, ...rest } = p;
    return rest;
  }

  async create(user: AuthUser, projectId: string, input: CreateScenarioInput) {
    let base: Awaited<ReturnType<ScenariosService['detail']>> | null = null;
    if (input.baseScenarioId) {
      base = await this.detail(input.baseScenarioId);
      if (base.projectId !== projectId) throw new BadRequestException('Base scenario belongs to another project');
    }
    const cityId = await this.cityOf(projectId);
    const { maps } = await this.cities.get(cityId);
    const scenario = await this.db.transaction(async (tx) => {
      const [sc] = await tx
        .insert(s.scenarios)
        .values({
          projectId,
          name: input.name,
          description: input.description,
          kind: input.kind,
          baseScenarioId: input.baseScenarioId ?? null,
          createdBy: user.id,
        })
        .returning();
      await tx.insert(s.scenarioParameters).values({ scenarioId: sc!.id, ...(base?.params ?? {}) });
      if (base) {
        if (base.signalOverrides.length)
          await tx.insert(s.scenarioSignalOverrides).values(
            base.signalOverrides.map((o) => ({ scenarioId: sc!.id, intersectionId: maps.nodeIdByCode.get(o.intersectionCode) as string, offsetS: o.offsetS, greens: o.greens })),
          );
        if (base.closures.length)
          await tx.insert(s.scenarioClosures).values(
            base.closures.map((c) => ({ scenarioId: sc!.id, roadId: maps.roadIdByCode.get(c.roadCode) as string, startS: c.startS, endS: c.endS, reason: c.reason })),
          );
        if (base.incidents.length)
          await tx.insert(s.incidents).values(
            base.incidents.map((i) => ({
              scenarioId: sc!.id,
              roadId: maps.roadIdByCode.get(i.roadCode) as string,
              kind: i.kind,
              severity: i.severity,
              startS: i.startS,
              durationS: i.durationS,
              description: i.description,
              createdBy: user.id,
            })),
          );
      }
      return sc!;
    });
    await this.audit.record({ actorId: user.id, action: 'scenario.create', entityType: 'scenario', entityId: scenario.id, metadata: { name: scenario.name, from: input.baseScenarioId ?? null } });
    return this.detail(scenario.id);
  }

  /**
   * Applies a patch after validating the *complete* resulting scenario with the
   * engine's own validator, so the database never holds a scenario the worker
   * would reject.
   */
  async update(user: AuthUser, scenarioId: string, patch: UpdateScenarioInput) {
    const current = await this.detail(scenarioId);
    const { network, maps } = await this.cities.get(current.cityId);
    const params = { ...(current.params as NonNullable<typeof current.params>), ...(patch.params ?? {}) };
    const overrides = patch.signalOverrides ?? current.signalOverrides;
    const closures = patch.closures ?? current.closures;
    const incidents = patch.incidents ?? current.incidents;

    const unknown: string[] = [];
    for (const o of overrides) if (!maps.nodeIdByCode.has(o.intersectionCode)) unknown.push(`intersection ${o.intersectionCode}`);
    for (const c of closures) if (!maps.roadIdByCode.has(c.roadCode)) unknown.push(`road ${c.roadCode}`);
    for (const i of incidents) if (!maps.roadIdByCode.has(i.roadCode)) unknown.push(`road ${i.roadCode}`);
    if (unknown.length) throw new BadRequestException({ message: 'Unknown network elements', issues: unknown.map((m) => ({ path: '', message: m })) });

    const engineParams: ScenarioParams = {
      ...DEFAULT_PARAMS,
      duration: params.durationS,
      seed: params.seed,
      demandMultiplier: params.demandMultiplier,
      startHour: params.startHour,
      rerouting: params.rerouting,
      sampleInterval: params.sampleIntervalS,
      frameInterval: params.frameIntervalS,
      signalOverrides: overrides.map((o) => ({ nodeId: o.intersectionCode, greens: o.greens, ...(o.offsetS != null ? { offset: o.offsetS } : {}) })),
      closures: closures.map((c) => ({ linkId: c.roadCode, start: c.startS, ...(c.endS != null ? { end: c.endS } : {}) })),
      incidents: incidents.map((i, k) => ({ id: `i${k}`, linkId: i.roadCode, start: i.startS, duration: i.durationS, severity: i.severity, kind: i.kind })),
    };
    const issues = validateScenario(network, engineParams);
    if (issues.length) throw new BadRequestException({ message: 'Scenario is not valid', issues: issues.map((m) => ({ path: '', message: m })) });

    await this.db.transaction(async (tx) => {
      await tx
        .update(s.scenarios)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.isSaved !== undefined ? { isSaved: patch.isSaved } : {}),
          updatedAt: new Date(),
        })
        .where(eq(s.scenarios.id, scenarioId));
      if (patch.params) await tx.update(s.scenarioParameters).set(patch.params).where(eq(s.scenarioParameters.scenarioId, scenarioId));
      if (patch.signalOverrides) {
        await tx.delete(s.scenarioSignalOverrides).where(eq(s.scenarioSignalOverrides.scenarioId, scenarioId));
        if (patch.signalOverrides.length)
          await tx.insert(s.scenarioSignalOverrides).values(
            patch.signalOverrides.map((o) => ({ scenarioId, intersectionId: maps.nodeIdByCode.get(o.intersectionCode) as string, offsetS: o.offsetS ?? null, greens: o.greens })),
          );
      }
      if (patch.closures) {
        await tx.delete(s.scenarioClosures).where(eq(s.scenarioClosures.scenarioId, scenarioId));
        if (patch.closures.length)
          await tx.insert(s.scenarioClosures).values(
            patch.closures.map((c) => ({ scenarioId, roadId: maps.roadIdByCode.get(c.roadCode) as string, startS: c.startS, endS: c.endS ?? null, reason: c.reason })),
          );
      }
      if (patch.incidents) {
        await tx.delete(s.incidents).where(eq(s.incidents.scenarioId, scenarioId));
        if (patch.incidents.length)
          await tx.insert(s.incidents).values(
            patch.incidents.map((i) => ({
              scenarioId,
              roadId: maps.roadIdByCode.get(i.roadCode) as string,
              kind: i.kind,
              severity: i.severity,
              startS: i.startS,
              durationS: i.durationS,
              description: i.description,
              createdBy: user.id,
            })),
          );
      }
    });
    await this.audit.record({
      actorId: user.id,
      action: 'scenario.update',
      entityType: 'scenario',
      entityId: scenarioId,
      metadata: { fields: Object.keys(patch) },
    });
    return this.detail(scenarioId);
  }

  async archive(user: AuthUser, scenarioId: string) {
    const [sc] = await this.db.select().from(s.scenarios).where(eq(s.scenarios.id, scenarioId));
    if (!sc) throw new NotFoundException('Scenario not found');
    if (sc.kind === 'baseline') {
      const baselines = await this.db
        .select({ id: s.scenarios.id })
        .from(s.scenarios)
        .where(and(eq(s.scenarios.projectId, sc.projectId), eq(s.scenarios.kind, 'baseline'), isNull(s.scenarios.archivedAt)));
      if (baselines.length <= 1) throw new BadRequestException('A project must keep at least one baseline');
    }
    await this.db.update(s.scenarios).set({ archivedAt: new Date() }).where(eq(s.scenarios.id, scenarioId));
    await this.audit.record({ actorId: user.id, action: 'scenario.archive', entityType: 'scenario', entityId: scenarioId });
  }

  /** Webster proposal from the link flows of a completed run. Not saved — the client reviews and applies it. */
  async proposeSignals(scenarioId: string, runId: string, intersectionCodes?: string[]) {
    const sc = await this.detail(scenarioId);
    const [run] = await this.db.select().from(s.simulationRuns).where(eq(s.simulationRuns.id, runId));
    if (!run || run.projectId !== sc.projectId) throw new NotFoundException('Run not found');
    if (run.status !== 'completed') throw new BadRequestException('Run has not completed');
    const { network, maps } = await this.cities.get(sc.cityId);
    const rows = await this.db.select().from(s.simulationLinkResults).where(eq(s.simulationLinkResults.runId, runId));
    const links: LinkResult[] = rows.map((r) => ({
      linkId: maps.roadCodeById.get(r.roadId) as string,
      entered: r.entered,
      exited: r.exited,
      meanTravelTime: r.meanTravelTimeS,
      meanSpeed: r.meanSpeedMs,
      maxQueue: r.maxQueue,
      meanQueue: r.meanQueue,
      utilization: r.utilization,
      congestion: r.congestion,
    }));
    const { details } = proposeSignalTimings(network, links, run.simTimeS || 3600, intersectionCodes);
    return details.map((d) => {
      const plan = network.signals.find((p) => p.nodeId === d.nodeId)!;
      return {
        intersectionCode: d.nodeId,
        intersectionName: network.nodes.find((n) => n.id === d.nodeId)?.name ?? d.nodeId,
        currentGreens: plan.phases.map((p) => p.green),
        proposedGreens: d.greens,
        phaseNames: plan.phases.map((p) => p.name),
        cycle: d.cycle,
        flowRatioSum: d.flowRatioSum,
        oversaturated: d.oversaturated,
      };
    });
  }

  async projectIncidents(projectId: string) {
    const cityId = await this.cityOf(projectId);
    const { network, maps } = await this.cities.get(cityId);
    const rows = await this.db
      .select({
        id: s.incidents.id,
        scenarioId: s.incidents.scenarioId,
        scenarioName: s.scenarios.name,
        roadId: s.incidents.roadId,
        kind: s.incidents.kind,
        severity: s.incidents.severity,
        startS: s.incidents.startS,
        durationS: s.incidents.durationS,
        description: s.incidents.description,
        createdAt: s.incidents.createdAt,
      })
      .from(s.incidents)
      .innerJoin(s.scenarios, eq(s.incidents.scenarioId, s.scenarios.id))
      .where(and(eq(s.scenarios.projectId, projectId), isNull(s.scenarios.archivedAt)))
      .orderBy(desc(s.incidents.createdAt));
    const closures = await this.db
      .select({
        id: s.scenarioClosures.id,
        scenarioId: s.scenarioClosures.scenarioId,
        scenarioName: s.scenarios.name,
        roadId: s.scenarioClosures.roadId,
        startS: s.scenarioClosures.startS,
        endS: s.scenarioClosures.endS,
        reason: s.scenarioClosures.reason,
      })
      .from(s.scenarioClosures)
      .innerJoin(s.scenarios, eq(s.scenarioClosures.scenarioId, s.scenarios.id))
      .where(and(eq(s.scenarios.projectId, projectId), isNull(s.scenarios.archivedAt)));
    const label = (roadId: string) => {
      const code = maps.roadCodeById.get(roadId) as string;
      return { roadCode: code, roadName: network.links.find((l) => l.id === code)?.name ?? code };
    };
    return {
      incidents: rows.map(({ roadId, ...r }) => ({ ...r, ...label(roadId) })),
      closures: closures.map(({ roadId, ...r }) => ({ ...r, ...label(roadId) })),
    };
  }
}
