import { buildScenarioParams, schema as s, type Database } from '@madar/db';
import { RUN_CONTROL_KEY } from '@madar/shared';
import {
  CITY_VERSION,
  ENGINE_VERSION,
  compareLinks,
  compareSummaries,
  inputFingerprint,
  validateScenario,
  type LinkResult,
  type SimulationSummary,
} from '@madar/sim-engine';
import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type Redis from 'ioredis';
import { AuditService } from '../audit/audit.service';
import { CitiesService } from '../cities/cities.service';
import type { AuthUser } from '../common/auth.decorators';
import { DB } from '../database/database.module';
import { REDIS } from '../database/redis.module';
import { SIM_QUEUE } from '../queue/queue.module';

const MAX_ACTIVE_RUNS_PER_USER = 3;
type RunRow = typeof s.simulationRuns.$inferSelect;

export function summaryFromRow(r: RunRow): SimulationSummary {
  return {
    engineVersion: r.engineVersion,
    seed: r.seed,
    duration: r.simTimeS,
    tripsGenerated: r.tripsGenerated ?? 0,
    tripsCompleted: r.tripsCompleted ?? 0,
    tripsStranded: r.tripsStranded ?? 0,
    vehiclesRemaining: r.vehiclesRemaining ?? 0,
    meanTravelTime: r.meanTravelTimeS ?? 0,
    meanWaitTime: r.meanWaitTimeS ?? 0,
    meanDelay: r.meanDelayS ?? 0,
    p95TravelTime: r.p95TravelTimeS ?? 0,
    meanStops: r.meanStops ?? 0,
    throughputPerHour: r.throughputPerHour ?? 0,
    vehicleKm: r.vehicleKm ?? 0,
    maxQueue: r.maxQueue ?? 0,
    meanNetworkSpeed: r.meanNetworkSpeedMs ?? 0,
    reroutes: r.reroutes ?? 0,
    energy: {
      fuelLitres: r.fuelLitresEst ?? 0,
      evKwh: r.evKwhEst ?? 0,
      co2Kg: r.co2KgEst ?? 0,
      idleHours: r.idleHoursEst ?? 0,
      assumptions: (r.energyAssumptions as Record<string, number | string>) ?? {},
    },
  };
}

@Injectable()
export class RunsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SIM_QUEUE) private readonly queue: Queue,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly cities: CitiesService,
    private readonly audit: AuditService,
  ) {}

  async start(user: AuthUser, scenarioId: string, pace: number) {
    const [sc] = await this.db
      .select({ id: s.scenarios.id, projectId: s.scenarios.projectId, cityId: s.projects.cityId, archivedAt: s.scenarios.archivedAt, name: s.scenarios.name })
      .from(s.scenarios)
      .innerJoin(s.projects, eq(s.scenarios.projectId, s.projects.id))
      .where(eq(s.scenarios.id, scenarioId));
    if (!sc || sc.archivedAt) throw new NotFoundException('Scenario not found');

    const active = await this.db
      .select({ id: s.simulationRuns.id })
      .from(s.simulationRuns)
      .where(and(eq(s.simulationRuns.requestedBy, user.id), inArray(s.simulationRuns.status, ['queued', 'running', 'paused'])));
    if (active.length >= MAX_ACTIVE_RUNS_PER_USER) {
      throw new HttpException(`You already have ${active.length} active runs; wait for one to finish`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const { network, maps } = await this.cities.get(sc.cityId);
    const params = await buildScenarioParams(this.db, scenarioId, maps);
    const issues = validateScenario(network, params);
    if (issues.length) throw new BadRequestException({ message: 'Scenario is not valid', issues: issues.map((m) => ({ path: '', message: m })) });
    const fp = inputFingerprint(network, params);

    const [run] = await this.db
      .insert(s.simulationRuns)
      .values({
        scenarioId,
        projectId: sc.projectId,
        requestedBy: user.id,
        engineVersion: ENGINE_VERSION,
        cityVersion: network.version ?? CITY_VERSION,
        seed: params.seed,
        pace,
        paramsSnapshot: params,
        inputFingerprint: fp,
      })
      .returning();
    await this.queue.add('simulate', { runId: run!.id }, { jobId: run!.id, attempts: 1, removeOnComplete: 500, removeOnFail: 500 });
    await this.audit.record({ actorId: user.id, action: 'run.start', entityType: 'scenario', entityId: scenarioId, metadata: { runId: run!.id, seed: params.seed, pace } });

    // Identical inputs have run before → tell the client; reproducibility is a feature.
    const [previous] = await this.db
      .select({ id: s.simulationRuns.id, resultFingerprint: s.simulationRuns.resultFingerprint })
      .from(s.simulationRuns)
      .where(and(eq(s.simulationRuns.inputFingerprint, fp), eq(s.simulationRuns.status, 'completed')))
      .orderBy(desc(s.simulationRuns.finishedAt))
      .limit(1);
    return { ...this.dto(run!), identicalPreviousRunId: previous?.id ?? null };
  }

  dto(r: RunRow) {
    return {
      id: r.id,
      scenarioId: r.scenarioId,
      projectId: r.projectId,
      status: r.status,
      progress: r.progress,
      simTimeS: r.simTimeS,
      pace: r.pace,
      engineVersion: r.engineVersion,
      cityVersion: r.cityVersion,
      seed: r.seed,
      inputFingerprint: r.inputFingerprint,
      resultFingerprint: r.resultFingerprint,
      errorMessage: r.errorMessage,
      queuedAt: r.queuedAt,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      wallTimeMs: r.wallTimeMs,
      params: r.paramsSnapshot,
      summary: r.status === 'completed' ? summaryFromRow(r) : null,
    };
  }

  async get(runId: string) {
    const [r] = await this.db.select().from(s.simulationRuns).where(eq(s.simulationRuns.id, runId));
    if (!r) throw new NotFoundException('Run not found');
    const [sc] = await this.db.select({ name: s.scenarios.name, kind: s.scenarios.kind }).from(s.scenarios).where(eq(s.scenarios.id, r.scenarioId));
    return { ...this.dto(r), scenarioName: sc?.name ?? '', scenarioKind: sc?.kind ?? 'variant' };
  }

  async listForProject(projectId: string, limit = 50) {
    const rows = await this.db
      .select({ run: s.simulationRuns, scenarioName: s.scenarios.name, scenarioKind: s.scenarios.kind })
      .from(s.simulationRuns)
      .innerJoin(s.scenarios, eq(s.simulationRuns.scenarioId, s.scenarios.id))
      .where(eq(s.simulationRuns.projectId, projectId))
      .orderBy(desc(s.simulationRuns.queuedAt))
      .limit(limit);
    return rows.map((r) => ({ ...this.dto(r.run), params: undefined, scenarioName: r.scenarioName, scenarioKind: r.scenarioKind }));
  }

  metrics(runId: string) {
    return this.db.select().from(s.simulationMetrics).where(eq(s.simulationMetrics.runId, runId)).orderBy(asc(s.simulationMetrics.tS));
  }

  private async cityOfRun(runId: string) {
    const [row] = await this.db
      .select({ cityId: s.projects.cityId })
      .from(s.simulationRuns)
      .innerJoin(s.projects, eq(s.simulationRuns.projectId, s.projects.id))
      .where(eq(s.simulationRuns.id, runId));
    if (!row) throw new NotFoundException('Run not found');
    return this.cities.get(row.cityId);
  }

  async links(runId: string): Promise<(LinkResult & { name: string; roadClass: string })[]> {
    const { maps, network } = await this.cityOfRun(runId);
    const rows = await this.db.select().from(s.simulationLinkResults).where(eq(s.simulationLinkResults.runId, runId));
    const byCode = new Map(network.links.map((l) => [l.id, l]));
    return rows
      .map((r) => {
        const code = maps.roadCodeById.get(r.roadId) as string;
        const l = byCode.get(code);
        return {
          linkId: code,
          name: l?.name ?? code,
          roadClass: l?.roadClass ?? 'local',
          entered: r.entered,
          exited: r.exited,
          meanTravelTime: r.meanTravelTimeS,
          meanSpeed: r.meanSpeedMs,
          maxQueue: r.maxQueue,
          meanQueue: r.meanQueue,
          utilization: r.utilization,
          congestion: r.congestion,
        };
      })
      .sort((a, b) => b.congestion - a.congestion);
  }

  async intersections(runId: string) {
    const { maps, network } = await this.cityOfRun(runId);
    const rows = await this.db.select().from(s.simulationIntersectionResults).where(eq(s.simulationIntersectionResults.runId, runId));
    return rows
      .map((r) => {
        const code = maps.nodeCodeById.get(r.intersectionId) as string;
        const n = network.nodes.find((x) => x.id === code);
        return { nodeId: code, name: n?.name ?? code, kind: n?.kind ?? 'priority', throughput: r.throughput, meanDelay: r.meanDelayS, maxQueue: r.maxQueue };
      })
      .sort((a, b) => b.meanDelay - a.meanDelay);
  }

  async events(runId: string) {
    const { maps } = await this.cityOfRun(runId);
    const rows = await this.db.select().from(s.simulationEvents).where(eq(s.simulationEvents.runId, runId)).orderBy(asc(s.simulationEvents.tS), asc(s.simulationEvents.id)).limit(1000);
    return rows.map((e) => ({ t: e.tS, type: e.type, message: e.message, roadCode: e.roadId ? maps.roadCodeById.get(e.roadId) : null }));
  }

  async playback(runId: string) {
    const [p] = await this.db.select().from(s.simulationPlaybacks).where(eq(s.simulationPlaybacks.runId, runId));
    if (!p) throw new NotFoundException('No playback recorded for this run');
    return p;
  }

  async control(user: AuthUser, runId: string, action: 'pause' | 'resume' | 'cancel') {
    const [r] = await this.db.select().from(s.simulationRuns).where(eq(s.simulationRuns.id, runId));
    if (!r) throw new NotFoundException('Run not found');
    const allowed: Record<string, string[]> = { pause: ['running'], resume: ['paused'], cancel: ['queued', 'running', 'paused'] };
    if (!allowed[action]!.includes(r.status)) throw new ConflictException(`Cannot ${action} a ${r.status} run`);

    if (r.status === 'queued' && action === 'cancel') {
      const job = await this.queue.getJob(runId);
      await job?.remove().catch(() => undefined); // may already be picked up — the control key covers that race
      await this.db.update(s.simulationRuns).set({ status: 'cancelled', finishedAt: new Date() }).where(eq(s.simulationRuns.id, runId));
    }
    // The worker polls this key between simulation chunks.
    await this.redis.set(RUN_CONTROL_KEY(runId), action, 'EX', 3600);
    await this.audit.record({ actorId: user.id, action: `run.${action}`, entityType: 'run', entityId: runId });
    return this.get(runId);
  }

  async compare(baselineRunId: string, variantRunId: string) {
    const rows = await this.db.select().from(s.simulationRuns).where(inArray(s.simulationRuns.id, [baselineRunId, variantRunId]));
    const b = rows.find((r) => r.id === baselineRunId);
    const v = rows.find((r) => r.id === variantRunId);
    if (!b || !v) throw new NotFoundException('Run not found');
    if (b.projectId !== v.projectId) throw new BadRequestException('Runs belong to different projects');
    if (b.status !== 'completed' || v.status !== 'completed') throw new BadRequestException('Both runs must be completed');
    const [bl, vl, bm, vm, bi, vi] = await Promise.all([
      this.links(b.id),
      this.links(v.id),
      this.metrics(b.id),
      this.metrics(v.id),
      this.intersections(b.id),
      this.intersections(v.id),
    ]);
    const names = new Map(bl.map((l) => [l.linkId, l.name]));
    const vInt = new Map(vi.map((x) => [x.nodeId, x]));
    const sameInputs = b.inputFingerprint === v.inputFingerprint;
    return {
      baseline: { ...(await this.get(b.id)) },
      variant: { ...(await this.get(v.id)) },
      sameInputs,
      identicalResults: sameInputs && b.resultFingerprint === v.resultFingerprint,
      metrics: compareSummaries(summaryFromRow(b), summaryFromRow(v)),
      links: compareLinks(bl, vl, 15).map((d) => ({ ...d, name: names.get(d.linkId) ?? d.linkId })),
      intersections: bi
        .map((x) => ({ nodeId: x.nodeId, name: x.name, baselineDelay: x.meanDelay, variantDelay: vInt.get(x.nodeId)?.meanDelay ?? 0 }))
        .filter((x) => x.baselineDelay > 0 || x.variantDelay > 0)
        .sort((a, c) => Math.abs(c.variantDelay - c.baselineDelay) - Math.abs(a.variantDelay - a.baselineDelay))
        .slice(0, 10),
      series: {
        baseline: bm.map((m) => ({ t: m.tS, vehicles: m.vehiclesInNetwork, queued: m.queuedVehicles, travel: m.windowMeanTravelTimeS, speed: m.meanSpeedMs, throughput: m.throughputPerHour })),
        variant: vm.map((m) => ({ t: m.tS, vehicles: m.vehiclesInNetwork, queued: m.queuedVehicles, travel: m.windowMeanTravelTimeS, speed: m.meanSpeedMs, throughput: m.throughputPerHour })),
      },
    };
  }
}
