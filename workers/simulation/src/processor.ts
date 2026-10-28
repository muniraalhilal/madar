import { loadCityNetwork, persistRunResult, schema as s, type CityIdMaps, type Database } from '@madar/db';
import { RUN_CONTROL_KEY, runChannel, type RunStatus, type WorkerMessage } from '@madar/shared';
import { ENGINE_VERSION, TrafficSimulation, type CityNetwork, type Frame, type ScenarioParams } from '@madar/sim-engine';
import { and, eq, inArray } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { Logger } from 'pino';

/** Simulated seconds advanced between control checks / progress messages. */
const CHUNK_S = 20;
/** Minimum wall time between live frames sent to clients (~6 fps). */
const FRAME_MIN_INTERVAL_MS = 160;

export interface ProcessorDeps {
  db: Database;
  redis: Redis;
  log: Logger;
  /** Hook for tests: override sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export class RunCancelled extends Error {}

const cityCache = new Map<string, { version: string; network: CityNetwork; maps: CityIdMaps }>();

async function cityFor(db: Database, cityId: string) {
  const [row] = await db.select({ version: s.cities.version }).from(s.cities).where(eq(s.cities.id, cityId));
  if (!row) throw new Error(`City ${cityId} missing`);
  const hit = cityCache.get(cityId);
  if (hit && hit.version === row.version) return hit;
  const loaded = await loadCityNetwork(db, cityId);
  const entry = { version: row.version, ...loaded };
  cityCache.set(cityId, entry);
  return entry;
}

function toBase64(u: ArrayBufferView): string {
  return Buffer.from(u.buffer, u.byteOffset, u.byteLength).toString('base64');
}

/**
 * Executes one simulation run end-to-end:
 *   queued → running → (paused ↔ running) → completed | cancelled | failed
 * The engine runs in chunks so the worker can honour pause/cancel, publish
 * progress, and throttle to a live viewing pace without blocking the event loop.
 */
export async function processRun(runId: string, deps: ProcessorDeps): Promise<RunStatus> {
  const { db, redis, log } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const publish = (m: WorkerMessage) => redis.publish(runChannel(runId), JSON.stringify(m));
  const setStatus = async (status: RunStatus, extra: Partial<typeof s.simulationRuns.$inferInsert> = {}) => {
    await db.update(s.simulationRuns).set({ status, ...extra }).where(eq(s.simulationRuns.id, runId));
    await publish({ type: 'status', payload: { runId, status, ...(extra.errorMessage ? { error: extra.errorMessage } : {}) } });
  };

  const [run] = await db
    .select({ run: s.simulationRuns, cityId: s.projects.cityId, scenarioName: s.scenarios.name })
    .from(s.simulationRuns)
    .innerJoin(s.projects, eq(s.simulationRuns.projectId, s.projects.id))
    .innerJoin(s.scenarios, eq(s.simulationRuns.scenarioId, s.scenarios.id))
    .where(eq(s.simulationRuns.id, runId));
  if (!run) {
    log.warn({ runId }, 'run row missing; skipping');
    return 'failed';
  }
  if (run.run.status !== 'queued') {
    log.info({ runId, status: run.run.status }, 'run no longer queued; skipping');
    return run.run.status;
  }
  // Claim atomically so a duplicate delivery cannot run the same job twice.
  const claimed = await db
    .update(s.simulationRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(and(eq(s.simulationRuns.id, runId), inArray(s.simulationRuns.status, ['queued'])))
    .returning({ id: s.simulationRuns.id });
  if (!claimed.length) return 'cancelled';
  await publish({ type: 'status', payload: { runId, status: 'running' } });

  const started = Date.now();
  try {
    if (run.run.engineVersion !== ENGINE_VERSION) {
      throw new Error(`Run requires engine ${run.run.engineVersion}; worker has ${ENGINE_VERSION}`);
    }
    const { network, maps } = await cityFor(db, run.cityId);
    if (network.version !== run.run.cityVersion) throw new Error(`Run requires city version ${run.run.cityVersion}`);
    const params = run.run.paramsSnapshot as ScenarioParams;
    const frames: Frame[] = [];
    let latestFrame: Frame | null = null;
    let lastFrameSent = 0;

    const sim = new TrafficSimulation(network, params);
    sim.setHooks({
      onFrame: (f) => {
        frames.push(f);
        latestFrame = f;
      },
      onSample: (sample) => void publish({ type: 'sample', payload: { runId, sample: { ...sample } } }),
      onEvent: (e) => {
        if (e.type !== 'spillback') void publish({ type: 'event', payload: { runId, t: e.t, eventType: e.type, message: e.message, ...(e.linkId ? { roadCode: e.linkId } : {}) } });
      },
    });

    const pace = run.run.pace; // sim seconds per wall second; 0 = unthrottled
    while (!sim.done) {
      const control = await redis.get(RUN_CONTROL_KEY(runId));
      if (control === 'cancel') throw new RunCancelled();
      if (control === 'pause') {
        await setStatus('paused');
        while ((await redis.get(RUN_CONTROL_KEY(runId))) === 'pause') await sleep(400);
        if ((await redis.get(RUN_CONTROL_KEY(runId))) === 'cancel') throw new RunCancelled();
        await redis.del(RUN_CONTROL_KEY(runId));
        await setStatus('running');
      }

      const chunkStart = Date.now();
      const step = pace > 0 ? Math.max(1, Math.min(CHUNK_S, Math.round(pace / 5))) : CHUNK_S;
      sim.advance(sim.t + step);
      const p = sim.progress();
      await publish({ type: 'progress', payload: { runId, ...p } });
      await db.update(s.simulationRuns).set({ progress: Math.min(0.999, p.fraction), simTimeS: p.t }).where(eq(s.simulationRuns.id, runId));

      const now = Date.now();
      const frame = latestFrame as Frame | null;
      if (frame && now - lastFrameSent >= FRAME_MIN_INTERVAL_MS) {
        lastFrameSent = now;
        await publish({
          type: 'frame',
          payload: { runId, t: frame.t, count: frame.count, data: toBase64(frame.data), congestion: toBase64(sim.linkState()) },
        });
      }
      if (pace > 0) {
        const target = (step / pace) * 1000;
        const elapsed = Date.now() - chunkStart;
        if (target > elapsed) await sleep(target - elapsed);
      } else {
        await new Promise<void>((r) => setImmediate(r)); // yield to the event loop
      }
    }

    const result = sim.result();
    await persistRunResult(db, runId, result, maps, frames, params.frameInterval, network.links.length, Date.now() - started);
    await redis.del(RUN_CONTROL_KEY(runId));
    await publish({ type: 'status', payload: { runId, status: 'completed' } });
    await notify(deps, run.run.requestedBy, {
      kind: 'run.completed',
      title: `Simulation finished — ${run.scenarioName}`,
      body: `Average travel time ${(result.summary.meanTravelTime / 60).toFixed(1)} min · ${result.summary.tripsCompleted.toLocaleString('en-US')} trips completed`,
      link: `/app/results/${runId}`,
    });
    log.info({ ms: Date.now() - started, fingerprint: result.fingerprint }, 'run completed');
    return 'completed';
  } catch (err) {
    await redis.del(RUN_CONTROL_KEY(runId));
    if (err instanceof RunCancelled) {
      await setStatus('cancelled', { finishedAt: new Date() });
      log.info('run cancelled');
      return 'cancelled';
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'run failed');
    await setStatus('failed', { finishedAt: new Date(), errorMessage: message.slice(0, 500) });
    await notify(deps, run.run.requestedBy, { kind: 'run.failed', title: `Simulation failed — ${run.scenarioName}`, body: message.slice(0, 200), link: `/app/results/${runId}` });
    return 'failed';
  }
}

async function notify(deps: ProcessorDeps, userId: string, n: { kind: string; title: string; body: string; link: string }) {
  try {
    const [row] = await deps.db.insert(s.notifications).values({ userId, ...n }).returning();
    await deps.redis.publish(`madar:user:${userId}`, JSON.stringify(row));
  } catch (e) {
    deps.log.warn({ err: e }, 'notification failed');
  }
}
