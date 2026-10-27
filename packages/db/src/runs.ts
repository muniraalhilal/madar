import { gzipSync, gunzipSync } from 'node:zlib';
import {
  DEFAULT_PARAMS,
  encodeFrames,
  type Frame,
  type ScenarioParams,
  type SimulationResult,
} from '@madar/sim-engine';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { CityIdMaps } from './city.js';
import type { Database } from './client.js';
import * as s from './schema.js';

/**
 * Assembles the engine input for a scenario from its typed tables.
 * The result is snapshotted on the run row so later edits never change history.
 */
export async function buildScenarioParams(db: Database, scenarioId: string, maps: CityIdMaps): Promise<ScenarioParams> {
  const [p] = await db.select().from(s.scenarioParameters).where(eq(s.scenarioParameters.scenarioId, scenarioId));
  if (!p) throw new Error(`Scenario ${scenarioId} has no parameters`);
  const overrides = await db
    .select()
    .from(s.scenarioSignalOverrides)
    .where(eq(s.scenarioSignalOverrides.scenarioId, scenarioId));
  const closures = await db.select().from(s.scenarioClosures).where(eq(s.scenarioClosures.scenarioId, scenarioId));
  const incidentRows = await db
    .select()
    .from(s.incidents)
    .where(eq(s.incidents.scenarioId, scenarioId))
    .orderBy(asc(s.incidents.startS), asc(s.incidents.id));

  const code = (m: Map<string, string>, id: string) => {
    const c = m.get(id);
    if (!c) throw new Error(`Unknown network element ${id}`);
    return c;
  };
  const byKey = <T>(xs: T[], key: (x: T) => string) => xs.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

  return {
    ...DEFAULT_PARAMS,
    duration: p.durationS,
    seed: p.seed,
    demandMultiplier: p.demandMultiplier,
    startHour: p.startHour,
    rerouting: p.rerouting,
    sampleInterval: p.sampleIntervalS,
    frameInterval: p.frameIntervalS,
    signalOverrides: byKey(
      overrides.map((o) => ({
        nodeId: code(maps.nodeCodeById, o.intersectionId),
        greens: o.greens,
        ...(o.offsetS != null ? { offset: o.offsetS } : {}),
      })),
      (o) => o.nodeId,
    ),
    closures: byKey(
      closures.map((c) => ({
        linkId: code(maps.roadCodeById, c.roadId),
        start: c.startS,
        ...(c.endS != null ? { end: c.endS } : {}),
      })),
      (c) => `${c.linkId}:${String(c.start).padStart(6, '0')}`,
    ),
    incidents: incidentRows.map((i, idx) => ({
      id: `inc-${idx + 1}`,
      linkId: code(maps.roadCodeById, i.roadId),
      start: i.startS,
      duration: i.durationS,
      severity: i.severity,
      kind: i.kind,
    })),
  };
}

const CHUNK = 500;

/** Persists a completed run atomically: summary columns, time series, per-link/junction results, events, playback. */
export async function persistRunResult(
  db: Database,
  runId: string,
  result: SimulationResult,
  maps: CityIdMaps,
  frames: Frame[],
  frameInterval: number,
  linkCount: number,
  wallTimeMs: number,
): Promise<void> {
  const sm = result.summary;
  await db.transaction(async (tx) => {
    for (let i = 0; i < result.samples.length; i += CHUNK) {
      await tx.insert(s.simulationMetrics).values(
        result.samples.slice(i, i + CHUNK).map((m) => ({
          runId,
          tS: m.t,
          vehiclesInNetwork: m.vehiclesInNetwork,
          queuedVehicles: m.queuedVehicles,
          completedTrips: m.completedTrips,
          meanSpeedMs: m.meanSpeed,
          windowMeanTravelTimeS: m.windowMeanTravelTime,
          throughputPerHour: m.throughputPerHour,
          pendingDepartures: m.pendingDepartures,
        })),
      );
    }
    for (let i = 0; i < result.links.length; i += CHUNK) {
      await tx.insert(s.simulationLinkResults).values(
        result.links.slice(i, i + CHUNK).map((l) => ({
          runId,
          roadId: maps.roadIdByCode.get(l.linkId) as string,
          entered: l.entered,
          exited: l.exited,
          meanTravelTimeS: l.meanTravelTime,
          meanSpeedMs: l.meanSpeed,
          maxQueue: l.maxQueue,
          meanQueue: l.meanQueue,
          utilization: l.utilization,
          congestion: l.congestion,
        })),
      );
    }
    if (result.intersections.length) {
      await tx.insert(s.simulationIntersectionResults).values(
        result.intersections.map((n) => ({
          runId,
          intersectionId: maps.nodeIdByCode.get(n.nodeId) as string,
          throughput: n.throughput,
          meanDelayS: n.meanDelay,
          maxQueue: n.maxQueue,
        })),
      );
    }
    // Spillback events can be numerous; keep the first 2,000 for the log.
    const events = result.events.slice(0, 2000);
    for (let i = 0; i < events.length; i += CHUNK) {
      await tx.insert(s.simulationEvents).values(
        events.slice(i, i + CHUNK).map((e) => ({
          runId,
          tS: e.t,
          type: e.type,
          roadId: e.linkId ? (maps.roadIdByCode.get(e.linkId) ?? null) : null,
          intersectionId: e.nodeId ? (maps.nodeIdByCode.get(e.nodeId) ?? null) : null,
          message: e.message,
        })),
      );
    }
    if (frames.length) {
      const raw = encodeFrames(frames, linkCount);
      await tx.insert(s.simulationPlaybacks).values({
        runId,
        frameIntervalS: frameInterval,
        frameCount: frames.length,
        data: gzipSync(raw, { level: 6 }),
        rawBytes: raw.byteLength,
      });
    }
    await tx
      .update(s.simulationRuns)
      .set({
        status: 'completed',
        progress: 1,
        simTimeS: sm.duration,
        resultFingerprint: result.fingerprint,
        tripsGenerated: sm.tripsGenerated,
        tripsCompleted: sm.tripsCompleted,
        tripsStranded: sm.tripsStranded,
        vehiclesRemaining: sm.vehiclesRemaining,
        meanTravelTimeS: sm.meanTravelTime,
        meanWaitTimeS: sm.meanWaitTime,
        meanDelayS: sm.meanDelay,
        p95TravelTimeS: sm.p95TravelTime,
        meanStops: sm.meanStops,
        throughputPerHour: sm.throughputPerHour,
        vehicleKm: sm.vehicleKm,
        maxQueue: sm.maxQueue,
        meanNetworkSpeedMs: sm.meanNetworkSpeed,
        reroutes: sm.reroutes,
        fuelLitresEst: sm.energy.fuelLitres,
        evKwhEst: sm.energy.evKwh,
        co2KgEst: sm.energy.co2Kg,
        idleHoursEst: sm.energy.idleHours,
        energyAssumptions: sm.energy.assumptions,
        wallTimeMs,
        finishedAt: sql`now()`,
      })
      .where(and(eq(s.simulationRuns.id, runId)));
  });
}

export function decompressPlayback(data: Buffer): Uint8Array {
  return new Uint8Array(gunzipSync(data));
}
