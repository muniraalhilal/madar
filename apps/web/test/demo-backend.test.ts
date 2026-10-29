import { beforeAll, describe, expect, it, vi } from 'vitest';
import landing from '@/data/landing.json';
import type { EngineWorker } from '@/demo/backend';
import { runSimulation, type Control } from '@/demo/simulate';

/** Runs the worker's code in-process: same message protocol as the real Web Worker. */
function inProcessWorker(): EngineWorker {
  let control: Control = 'run';
  const w: EngineWorker = {
    onmessage: null,
    onerror: null,
    terminate: () => undefined,
    postMessage(m: unknown) {
      const msg = m as { type: string; runId: string; params: never; pace: number; action?: string };
      if (msg.type === 'control') {
        control = msg.action === 'pause' ? 'pause' : msg.action === 'resume' ? 'run' : 'cancel';
        return;
      }
      void runSimulation(msg.runId, msg.params, msg.pace, (data) => w.onmessage?.({ data } as MessageEvent), () => control);
    },
  };
  return w;
}

async function load() {
  vi.resetModules();
  const backend = await import('@/demo/backend');
  backend.setEngineWorkerFactory(inProcessWorker);
  return backend;
}

type B = Awaited<ReturnType<typeof load>>;
let b: B;
let projectId: string;
interface Run { id: string; status: string; scenarioName: string; summary: { meanTravelTime: number; tripsCompleted: number } | null; resultFingerprint: string | null }
interface Sc { id: string; name: string; kind: string; latestRun: { id: string } | null }

beforeAll(async () => {
  localStorage.clear();
  b = await load();
  await b.demoReady();
  projectId = (await b.demoRequest<{ id: string }[]>('/projects'))[0]!.id;
}, 60_000);

describe('demo backend — first visit', () => {
  it('creates the sample study and computes its three runs in the browser', async () => {
    const scenarios = await b.demoRequest<Sc[]>(`/projects/${projectId}/scenarios`);
    expect(scenarios.map((s) => s.kind)).toEqual(['baseline', 'variant', 'variant']);
    const runs = await b.demoRequest<Run[]>(`/projects/${projectId}/runs`);
    expect(runs).toHaveLength(3);
    expect(runs.every((r) => r.status === 'completed')).toBe(true);
  });

  it('reproduces exactly the numbers the landing page shows (same engine, same seed)', async () => {
    const runs = await b.demoRequest<Run[]>(`/projects/${projectId}/runs`);
    const by = (name: string) => runs.find((r) => r.scenarioName.startsWith(name))!;
    expect(by('Baseline').summary!.meanTravelTime).toBeCloseTo(landing.baseline.meanTravelTime, 6);
    expect(by('Webster').summary!.meanTravelTime).toBeCloseTo(landing.optimised.meanTravelTime, 6);
    expect(by('Orbit').summary!.meanTravelTime).toBeCloseTo(landing.closure.meanTravelTime, 6);
    expect(by('Baseline').resultFingerprint).toBe(landing.baseline.fingerprint);
  });

  it('saves the state to this browser', () => {
    expect(localStorage.getItem('madar.demo.v1')).toContain('Morning Peak Study');
  });
});

describe('demo backend — scenario journey', () => {
  let variantId: string;
  it('creates a variant from the baseline and validates edits with the engine', async () => {
    const list = await b.demoRequest<Sc[]>(`/projects/${projectId}/scenarios`);
    const baseline = list.find((s) => s.kind === 'baseline')!;
    const v = await b.demoRequest<{ id: string; closures: unknown[] }>(`/projects/${projectId}/scenarios`, { method: 'POST', json: { name: 'Test closure', baseScenarioId: baseline.id } });
    variantId = v.id;
    await expect(b.demoRequest(`/scenarios/${v.id}`, { method: 'PATCH', json: { closures: [{ roadCode: 'nope', startS: 0, reason: 'x' }] } })).rejects.toMatchObject({ status: 400 });
    const patched = await b.demoRequest<{ closures: { roadName: string }[] }>(`/scenarios/${v.id}`, { method: 'PATCH', json: { closures: [{ roadCode: 'c3r2>c3r3', startS: 300, reason: 'Works' }] } });
    expect(patched.closures).toHaveLength(1);
    expect(patched.closures[0]!.roadName).toBeTruthy();
  });

  it('runs it, compares with the baseline and saves a report', async () => {
    const started = await b.demoRequest<Run & { identicalPreviousRunId: string | null }>(`/scenarios/${variantId}/runs`, { method: 'POST', json: { pace: 0 } });
    expect(started.status).toBe('queued');
    expect(await b.waitForRun(started.id)).toBe('completed');
    const list = await b.demoRequest<Sc[]>(`/projects/${projectId}/scenarios`);
    const baseRun = list.find((s) => s.kind === 'baseline')!.latestRun!.id;
    const cmp = await b.demoRequest<{ metrics: { key: string; verdict: string }[]; links: unknown[]; series: { baseline: unknown[] } }>(`/runs/compare?baseline=${baseRun}&variant=${started.id}`);
    expect(cmp.metrics.find((m) => m.key === 'meanTravelTime')).toBeDefined();
    expect(cmp.links.length).toBeGreaterThan(0);
    expect(cmp.series.baseline.length).toBeGreaterThan(0);
    const report = await b.demoRequest<{ id: string }>(`/projects/${projectId}/reports`, { method: 'POST', json: { title: 'Closure report', baselineRunId: baseRun, variantRunId: started.id } });
    expect(b.demoReportHtml(report.id)).toContain('Closure report');
    const frames = await b.demoPlayback(started.id);
    expect(frames.length).toBe(900);
  }, 30_000);

  it('flags identical inputs and proposes signal timings from a run', async () => {
    const list = await b.demoRequest<Sc[]>(`/projects/${projectId}/scenarios`);
    const baseline = list.find((s) => s.kind === 'baseline')!;
    const proposals = await b.demoRequest<{ proposedGreens: number[] }[]>(`/scenarios/${baseline.id}/propose-signals`, { method: 'POST', json: { runId: baseline.latestRun!.id } });
    expect(proposals.length).toBe(28);
    const again = await b.demoRequest<{ id: string; identicalPreviousRunId: string | null }>(`/scenarios/${baseline.id}/runs`, { method: 'POST', json: { pace: 0 } });
    expect(again.identicalPreviousRunId).toBe(baseline.latestRun!.id);
    await b.waitForRun(again.id);
  }, 30_000);

  it('pauses, resumes and cancels a paced run', async () => {
    const list = await b.demoRequest<Sc[]>(`/projects/${projectId}/scenarios`);
    const r = await b.demoRequest<{ id: string }>(`/scenarios/${list[0]!.id}/runs`, { method: 'POST', json: { pace: 60 } });
    await vi.waitFor(async () => expect((await b.demoRequest<Run>(`/runs/${r.id}`)).status).toBe('running'), { timeout: 5000 });
    await b.demoRequest(`/runs/${r.id}/control`, { method: 'POST', json: { action: 'pause' } });
    await vi.waitFor(async () => expect((await b.demoRequest<Run>(`/runs/${r.id}`)).status).toBe('paused'), { timeout: 5000 });
    await expect(b.demoRequest(`/runs/${r.id}/control`, { method: 'POST', json: { action: 'pause' } })).rejects.toMatchObject({ status: 409 });
    await b.demoRequest(`/runs/${r.id}/control`, { method: 'POST', json: { action: 'cancel' } });
    expect(await b.waitForRun(r.id)).toBe('cancelled');
  }, 30_000);

  it('refuses account routes', async () => {
    await expect(b.demoRequest('/users/me/sessions')).rejects.toMatchObject({ status: 403 });
  });
});

describe('demo backend — persistence', () => {
  it('reloads the saved demo and marks interrupted runs as cancelled', async () => {
    const saved = JSON.parse(localStorage.getItem('madar.demo.v1')!);
    saved.runs[0].status = 'running';
    localStorage.setItem('madar.demo.v1', JSON.stringify(saved));
    const fresh = await load();
    await fresh.demoReady();
    const r = await fresh.demoRequest<Run & { errorMessage: string }>(`/runs/${saved.runs[0].id}`);
    expect(r.status).toBe('cancelled');
    expect(r.errorMessage).toMatch(/Interrupted/);
    b = fresh;
  });

  it('reset clears everything', async () => {
    await b.resetDemo();
    expect(localStorage.getItem('madar.demo.v1')).toBeNull();
  });
});
