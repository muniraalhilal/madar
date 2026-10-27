import { RoadGraph, generateCity, simulate, fingerprint } from '@madar/sim-engine';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildScenarioParams,
  createDb,
  decompressPlayback,
  loadCityNetwork,
  persistRunResult,
  runMigrations,
  seedDemo,
  schema as s,
  type DbHandle,
} from '../src/index.js';
import { decodeFrames, type Frame } from '@madar/sim-engine';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://madar:madar@localhost:5432/madar_test';
let h: DbHandle;

beforeAll(async () => {
  h = createDb(url, { max: 4 });
  await h.db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await runMigrations(h.db);
  await seedDemo(h.db, { demoPassword: 'test-password-123' });
});
afterAll(async () => h?.close());

describe('city persistence', () => {
  it('round-trips the generated city through PostGIS', async () => {
    const { network } = await loadCityNetwork(h.db, 'madar-city');
    const original = generateCity();
    expect(RoadGraph.validate(network)).toEqual([]);
    expect(network.nodes).toHaveLength(original.nodes.length);
    expect(network.links).toHaveLength(original.links.length);
    expect(network.signals).toHaveLength(original.signals.length);
    expect(network.buildings).toHaveLength(original.buildings.length);
    const corniche = network.links.find((l) => l.id === 'c2r0>c3r0')!;
    expect(corniche.shape?.length).toBe(7);
  });

  it('loads deterministically, so simulations of stored data are reproducible', async () => {
    const a = await loadCityNetwork(h.db, 'madar-city');
    const b = await loadCityNetwork(h.db, 'madar-city');
    expect(fingerprint(a.network)).toBe(fingerprint(b.network));
    const ra = simulate(a.network, { duration: 300, frameInterval: 0 });
    const rb = simulate(b.network, { duration: 300, frameInterval: 0 });
    expect(ra.fingerprint).toBe(rb.fingerprint);
  });

  it('answers spatial queries with GiST-indexed geometry', async () => {
    const near = await h.db.execute<{ code: string }>(
      sql`select code from ${s.buildings} where ST_DWithin(footprint, ST_MakePoint(325, 175), 250) order by footprint <-> ST_MakePoint(325, 175) limit 3`,
    );
    expect(near.rows.length).toBeGreaterThan(0);
    const district = await h.db.execute<{ code: string }>(
      sql`select code from ${s.districts} where ST_Contains(boundary, ST_MakePoint(0, 200))`,
    );
    expect(district.rows[0]?.code).toBe('noor');
  });

  it('enforces constraints in the database itself', async () => {
    const [road] = await h.db.select().from(s.roads).limit(1);
    await expect(h.db.update(s.roads).set({ lanes: 0 }).where(eq(s.roads.id, road!.id))).rejects.toThrow();
    await expect(h.db.update(s.roads).set({ lengthM: -1 }).where(eq(s.roads.id, road!.id))).rejects.toThrow();
  });
});

describe('scenario → run → results', () => {
  it('builds engine params from scenario tables and persists a full result', async () => {
    const { network, maps } = await loadCityNetwork(h.db, 'madar-city');
    const [variant] = await h.db.select().from(s.scenarios).where(eq(s.scenarios.kind, 'variant'));
    const params = await buildScenarioParams(h.db, variant!.id, maps);
    expect(params.closures).toEqual([{ linkId: 'c3r2>c3r3', start: 300 }]);

    const quick = { ...params, duration: 300, frameInterval: 10 };
    const frames: Frame[] = [];
    const result = simulate(network, quick, { onFrame: (f) => frames.push(f) });
    const [project] = await h.db.select().from(s.projects).limit(1);
    const [run] = await h.db
      .insert(s.simulationRuns)
      .values({
        scenarioId: variant!.id,
        projectId: project!.id,
        requestedBy: variant!.createdBy,
        engineVersion: result.summary.engineVersion,
        cityVersion: network.version,
        seed: quick.seed,
        paramsSnapshot: quick,
        inputFingerprint: result.inputFingerprint,
      })
      .returning();
    await persistRunResult(h.db, run!.id, result, maps, frames, 10, network.links.length, 123);

    const [stored] = await h.db.select().from(s.simulationRuns).where(eq(s.simulationRuns.id, run!.id));
    expect(stored!.status).toBe('completed');
    expect(stored!.tripsCompleted).toBe(result.summary.tripsCompleted);
    expect(stored!.resultFingerprint).toBe(result.fingerprint);
    const metrics = await h.db.select().from(s.simulationMetrics).where(eq(s.simulationMetrics.runId, run!.id));
    expect(metrics).toHaveLength(result.samples.length);
    const links = await h.db.select().from(s.simulationLinkResults).where(eq(s.simulationLinkResults.runId, run!.id));
    expect(links).toHaveLength(network.links.length);
    const [pb] = await h.db.select().from(s.simulationPlaybacks).where(eq(s.simulationPlaybacks.runId, run!.id));
    const decoded = decodeFrames(decompressPlayback(pb!.data));
    expect(decoded.frames).toHaveLength(frames.length);
  });
});
