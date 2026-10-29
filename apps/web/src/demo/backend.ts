'use client';
/**
 * The MADAR API, implemented in the browser for the demo.
 *
 * Every route the application pages call is answered here with the same
 * response shapes as the NestJS API, from the same building blocks:
 *   - the shared Zod request schemas validate input;
 *   - the engine's own validator checks every scenario change;
 *   - runs execute the real TrafficSimulation in a Web Worker (engine.worker.ts);
 *   - comparisons, signal proposals, energy and reports use the same engine and
 *     shared functions the server uses.
 * Nothing is prerecorded: sample runs are computed in the visitor's browser the
 * first time the demo opens, and every later run is computed on request.
 */
import {
  CITY_VERSION,
  DEFAULT_PARAMS,
  ENGINE_VERSION,
  TRAFFIC_ENERGY_ASSUMPTIONS,
  cityBounds,
  compareLinks,
  compareSummaries,
  decodeFrames,
  generateCity,
  inputFingerprint,
  proposeSignalTimings,
  simulateCityEnergy,
  validateScenario,
  type CityNetwork,
  type Frame,
  type IntersectionResult,
  type LinkResult,
  type MetricSample,
  type ScenarioParams as EngineParams,
  type SimulationEvent,
  type SimulationSummary,
} from '@madar/sim-engine';
import {
  REPORT_DISCLAIMER,
  WsEvents,
  createProjectSchema,
  createReportSchema,
  createScenarioSchema,
  energyQuerySchema,
  findingsFrom,
  proposeSignalsSchema,
  renderReportHtml,
  runControlSchema,
  startRunSchema,
  updateScenarioSchema,
  type ReportContent,
} from '@madar/shared';
import type { z, ZodTypeAny } from 'zod';
import { uuid } from './ids';
import { demoSocket } from './socket';
import { blobsArePersistent, clearBlobs, clearState, deleteBlob, getBlob, putBlob, readState, stateIsPersistent, writeState } from './storage';

export const DEMO_CITY_ID = 'madar-city';
const MAX_ACTIVE_RUNS = 3;
/** Playback frames are the bulkiest output; keep them for the most recent runs only. */
const PLAYBACKS_KEPT = 8;

export class DemoHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

/* ───────────────────────── state model ───────────────────────── */

type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
interface ParamsDto {
  durationS: number;
  seed: number;
  demandMultiplier: number;
  startHour: number;
  rerouting: boolean;
  sampleIntervalS: number;
  frameIntervalS: number;
  energySetpointDelta: number;
  energyLightingSaving: number;
  energyOccupancyScale: number;
}
interface ScenarioRow {
  id: string;
  projectId: string;
  name: string;
  description: string;
  kind: 'baseline' | 'variant';
  baseScenarioId: string | null;
  isSaved: boolean;
  sample: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  params: ParamsDto;
  signalOverrides: { intersectionCode: string; offsetS: number | null; greens: number[] }[];
  closures: { id: string; roadCode: string; startS: number; endS: number | null; reason: string }[];
  incidents: { id: string; roadCode: string; kind: 'collision' | 'breakdown' | 'roadwork' | 'event'; severity: number; startS: number; durationS: number; description: string; createdAt: string }[];
}
interface RunRow {
  id: string;
  scenarioId: string;
  projectId: string;
  status: RunStatus;
  progress: number;
  simTimeS: number;
  pace: number;
  engineVersion: string;
  cityVersion: string;
  seed: number;
  params: EngineParams;
  inputFingerprint: string;
  resultFingerprint: string | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  wallTimeMs: number | null;
  summary: SimulationSummary | null;
  hasPlayback: boolean;
}
interface ProjectRow { id: string; name: string; description: string; cityId: string; createdAt: string; updatedAt: string }
interface ReportRow { id: string; projectId: string; title: string; baselineRunId: string; variantRunId: string | null; notes: string; content: ReportContent; createdAt: string }
interface NotificationRow { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }
interface ActivityRow { id: number; action: string; entityType: string; entityId: string; metadata: Record<string, unknown>; createdAt: string }
interface State {
  version: 1;
  createdAt: string;
  projects: ProjectRow[];
  scenarios: ScenarioRow[];
  runs: RunRow[];
  reports: ReportRow[];
  notifications: NotificationRow[];
  activity: ActivityRow[];
  seq: number;
}
interface RunDetail { samples: MetricSample[]; links: LinkResult[]; intersections: IntersectionResult[]; events: SimulationEvent[] }
interface PlaybackBlob { frameIntervalS: number; frameCount: number; data: Uint8Array }

export const DEMO_USER = {
  id: '00000000-0000-4000-8000-00000000d3e0',
  email: 'visitor@demo.madar',
  displayName: 'Visitor',
  role: 'planner' as const,
  createdAt: new Date(0).toISOString(),
  lastLoginAt: null,
};

let network: CityNetwork | null = null;
export const demoCity = () => (network ??= generateCity());

let state: State | null = null;
const now = () => new Date().toISOString();
const S = (): State => {
  if (!state) throw new DemoHttpError(503, 'The demo is still starting');
  return state;
};
const save = () => state && writeState(state);

function log(action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  const s = S();
  s.activity.unshift({ id: ++s.seq, action, entityType, entityId, metadata, createdAt: now() });
  s.activity = s.activity.slice(0, 80);
}

function notify(n: Omit<NotificationRow, 'id' | 'readAt' | 'createdAt'>) {
  const row: NotificationRow = { ...n, id: uuid(), readAt: null, createdAt: now() };
  S().notifications.unshift(row);
  S().notifications = S().notifications.slice(0, 50);
  demoSocket.deliver(WsEvents.notification, row);
}

/* ───────────────────────── helpers ───────────────────────── */

const DEFAULT_DTO: ParamsDto = {
  durationS: 3600,
  seed: 42,
  demandMultiplier: 1,
  startHour: 7,
  rerouting: true,
  sampleIntervalS: 60,
  frameIntervalS: 4,
  energySetpointDelta: 0,
  energyLightingSaving: 0,
  energyOccupancyScale: 1,
};

function parse<Schema extends ZodTypeAny>(schema: Schema, body: unknown): z.output<Schema> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new DemoHttpError(400, 'Validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data as z.output<Schema>;
}

function engineParams(sc: Pick<ScenarioRow, 'params' | 'signalOverrides' | 'closures' | 'incidents'>): EngineParams {
  const p = sc.params;
  const byKey = <T>(xs: T[], key: (x: T) => string) => [...xs].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
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
      sc.signalOverrides.map((o) => ({ nodeId: o.intersectionCode, greens: o.greens, ...(o.offsetS != null ? { offset: o.offsetS } : {}) })),
      (o) => o.nodeId,
    ),
    closures: byKey(
      sc.closures.map((c) => ({ linkId: c.roadCode, start: c.startS, ...(c.endS != null ? { end: c.endS } : {}) })),
      (c) => `${c.linkId}:${String(c.start).padStart(6, '0')}`,
    ),
    incidents: [...sc.incidents]
      .sort((a, b) => a.startS - b.startS || (a.id < b.id ? -1 : 1))
      .map((i, idx) => ({ id: `inc-${idx + 1}`, linkId: i.roadCode, start: i.startS, duration: i.durationS, severity: i.severity, kind: i.kind })),
  };
}

const roadName = (code: string) => demoCity().links.find((l) => l.id === code)?.name ?? code;
const nodeName = (code: string) => demoCity().nodes.find((n) => n.id === code)?.name ?? code;

function scenario(id: string): ScenarioRow {
  const sc = S().scenarios.find((x) => x.id === id && !x.archivedAt);
  if (!sc) throw new DemoHttpError(404, 'Scenario not found');
  return sc;
}
function run(id: string): RunRow {
  const r = S().runs.find((x) => x.id === id);
  if (!r) throw new DemoHttpError(404, 'Run not found');
  return r;
}
function project(id: string): ProjectRow {
  const p = S().projects.find((x) => x.id === id);
  if (!p) throw new DemoHttpError(404, 'Project not found');
  return p;
}

function scenarioDetail(id: string) {
  const sc = scenario(id);
  const runs = S()
    .runs.filter((r) => r.scenarioId === id)
    .sort((a, b) => (a.queuedAt < b.queuedAt ? 1 : -1))
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      status: r.status,
      progress: r.progress,
      queuedAt: r.queuedAt,
      finishedAt: r.finishedAt,
      meanTravelTimeS: r.summary?.meanTravelTime ?? null,
      meanDelayS: r.summary?.meanDelay ?? null,
      throughputPerHour: r.summary?.throughputPerHour ?? null,
      resultFingerprint: r.resultFingerprint,
    }));
  const { sample: _sample, archivedAt: _a, ...rest } = sc;
  return {
    ...rest,
    sample: sc.sample,
    cityId: DEMO_CITY_ID,
    signalOverrides: [...sc.signalOverrides].sort((a, b) => (a.intersectionCode < b.intersectionCode ? -1 : 1)).map((o) => ({ ...o, intersectionName: nodeName(o.intersectionCode) })),
    closures: sc.closures.map((c) => ({ ...c, roadName: roadName(c.roadCode) })),
    incidents: sc.incidents.map(({ createdAt: _c, ...i }) => ({ ...i, roadName: roadName(i.roadCode) })),
    runs,
  };
}

function runDto(r: RunRow) {
  const sc = S().scenarios.find((x) => x.id === r.scenarioId);
  const { hasPlayback, ...rest } = r;
  return {
    ...rest,
    summary: r.status === 'completed' ? r.summary : null,
    scenarioName: sc?.name ?? '',
    scenarioKind: sc?.kind ?? 'variant',
    computedIn: 'browser' as const,
    hasPlayback,
  };
}

async function detail(runId: string): Promise<RunDetail> {
  const r = run(runId);
  if (r.status !== 'completed') return { samples: [], links: [], intersections: [], events: [] };
  const d = await getBlob<RunDetail>(`run:${runId}`);
  if (!d) throw new DemoHttpError(410, 'The detailed results of this run are no longer stored in this browser. Run the scenario again to recompute them.');
  return d;
}

async function linksOf(runId: string) {
  const byCode = new Map(demoCity().links.map((l) => [l.id, l]));
  return (await detail(runId)).links
    .map((l) => ({ ...l, name: byCode.get(l.linkId)?.name ?? l.linkId, roadClass: byCode.get(l.linkId)?.roadClass ?? 'local' }))
    .sort((a, b) => b.congestion - a.congestion);
}
async function intersectionsOf(runId: string) {
  const nodes = new Map(demoCity().nodes.map((n) => [n.id, n]));
  return (await detail(runId)).intersections
    .map((x) => ({ nodeId: x.nodeId, name: nodes.get(x.nodeId)?.name ?? x.nodeId, kind: nodes.get(x.nodeId)?.kind ?? 'priority', throughput: x.throughput, meanDelay: x.meanDelay, maxQueue: x.maxQueue }))
    .sort((a, b) => b.meanDelay - a.meanDelay);
}
async function metricsOf(runId: string) {
  return (await detail(runId)).samples.map((m) => ({
    runId,
    tS: m.t,
    vehiclesInNetwork: m.vehiclesInNetwork,
    queuedVehicles: m.queuedVehicles,
    completedTrips: m.completedTrips,
    meanSpeedMs: m.meanSpeed,
    windowMeanTravelTimeS: m.windowMeanTravelTime,
    throughputPerHour: m.throughputPerHour,
    pendingDepartures: m.pendingDepartures,
  }));
}

/* ───────────────────────── run execution ───────────────────────── */

/** The subset of Worker the runner uses; tests substitute an in-process implementation. */
export interface EngineWorker {
  postMessage(m: unknown): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}
let workerFactory: () => EngineWorker = () => new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
export function setEngineWorkerFactory(f: () => EngineWorker) {
  workerFactory = f;
}

interface Active { runId: string; worker: EngineWorker }
let active: Active | null = null;
const queue: string[] = [];
const waiters = new Map<string, ((status: RunStatus) => void)[]>();

function settle(runId: string, status: RunStatus) {
  for (const w of waiters.get(runId) ?? []) w(status);
  waiters.delete(runId);
}
export function waitForRun(runId: string): Promise<RunStatus> {
  const r = state?.runs.find((x) => x.id === runId);
  if (r && ['completed', 'failed', 'cancelled'].includes(r.status)) return Promise.resolve(r.status);
  return new Promise((res) => waiters.set(runId, [...(waiters.get(runId) ?? []), res]));
}

function setStatus(r: RunRow, status: RunStatus, error?: string) {
  r.status = status;
  if (error) r.errorMessage = error;
  save();
  demoSocket.deliver(WsEvents.status, { runId: r.id, status, ...(error ? { error } : {}) });
}

function pump() {
  if (active) return;
  const next = queue.shift();
  if (!next) return;
  const r = state?.runs.find((x) => x.id === next);
  if (!r || r.status !== 'queued') return pump();
  const worker = workerFactory();
  active = { runId: r.id, worker };
  r.startedAt = now();
  const finish = (status: RunStatus) => {
    worker.terminate();
    if (active?.runId === r.id) active = null;
    settle(r.id, status);
    pump();
  };
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { type: string; [k: string]: unknown };
    switch (m.type) {
      case 'status':
        setStatus(r, m.status as RunStatus);
        break;
      case 'progress': {
        r.progress = Math.min(0.999, m.fraction as number);
        r.simTimeS = m.t as number;
        demoSocket.deliver(WsEvents.progress, { runId: r.id, t: m.t, duration: m.duration, fraction: m.fraction, vehiclesInNetwork: m.vehiclesInNetwork, completedTrips: m.completedTrips });
        break;
      }
      case 'sample':
        demoSocket.deliver(WsEvents.sample, { runId: r.id, sample: m.sample });
        break;
      case 'event':
        demoSocket.deliver(WsEvents.simEvent, { runId: r.id, t: m.t, eventType: m.eventType, message: m.message, ...(m.roadCode ? { roadCode: m.roadCode } : {}) });
        break;
      case 'frame':
        demoSocket.deliver(WsEvents.frame, { runId: r.id, t: m.t, count: m.count, data: m.data, congestion: m.congestion });
        break;
      case 'cancelled':
        r.finishedAt = now();
        setStatus(r, 'cancelled');
        finish('cancelled');
        break;
      case 'error':
        r.finishedAt = now();
        setStatus(r, 'failed', String(m.message).slice(0, 500));
        notify({ kind: 'run.failed', title: `Simulation failed — ${scenarioNameOf(r)}`, body: String(m.message).slice(0, 200), link: runLink(r.id) });
        save();
        finish('failed');
        break;
      case 'done':
        void complete(r, m as unknown as DoneMessage).then(() => finish('completed'));
        break;
    }
  };
  worker.onerror = (ev) => {
    ev.preventDefault();
    r.finishedAt = now();
    setStatus(r, 'failed', 'The simulation worker stopped unexpectedly.');
    finish('failed');
  };
  worker.postMessage({ type: 'start', runId: r.id, params: r.params, pace: r.pace });
}

interface DoneMessage {
  result: RunDetail & { summary: SimulationSummary; fingerprint: string; inputFingerprint: string };
  playback: Uint8Array | null;
  frameCount: number;
  wallTimeMs: number;
}

const scenarioNameOf = (r: RunRow) => S().scenarios.find((x) => x.id === r.scenarioId)?.name ?? 'Scenario';
/** In-app link to a run; the page layer turns it into a static-safe URL. */
const runLink = (id: string) => `/app/results/${id}`;

async function complete(r: RunRow, m: DoneMessage) {
  const { summary, fingerprint, samples, links, intersections, events } = m.result;
  await putBlob(`run:${r.id}`, { samples, links, intersections, events } satisfies RunDetail);
  if (m.playback) {
    await putBlob(`playback:${r.id}`, { frameIntervalS: r.params.frameInterval, frameCount: m.frameCount, data: m.playback } satisfies PlaybackBlob);
    r.hasPlayback = true;
    const withPlayback = S().runs.filter((x) => x.hasPlayback).sort((a, b) => ((a.finishedAt ?? a.queuedAt) < (b.finishedAt ?? b.queuedAt) ? 1 : -1));
    for (const old of withPlayback.slice(PLAYBACKS_KEPT)) {
      if (old.id === r.id) continue;
      old.hasPlayback = false;
      await deleteBlob(`playback:${old.id}`);
    }
  }
  Object.assign(r, {
    status: 'completed',
    progress: 1,
    simTimeS: summary.duration,
    summary,
    resultFingerprint: fingerprint,
    wallTimeMs: m.wallTimeMs,
    finishedAt: now(),
  } satisfies Partial<RunRow>);
  notify({
    kind: 'run.completed',
    title: `Simulation finished — ${scenarioNameOf(r)}`,
    body: `Average travel time ${(summary.meanTravelTime / 60).toFixed(1)} min · ${summary.tripsCompleted.toLocaleString('en-US')} trips completed · computed in your browser in ${(m.wallTimeMs / 1000).toFixed(1)} s`,
    link: runLink(r.id),
  });
  save();
  demoSocket.deliver(WsEvents.status, { runId: r.id, status: 'completed' });
}

function startRun(scenarioId: string, pace: number) {
  const sc = scenario(scenarioId);
  const activeCount = S().runs.filter((r) => ['queued', 'running', 'paused'].includes(r.status)).length;
  if (activeCount >= MAX_ACTIVE_RUNS) throw new DemoHttpError(429, `You already have ${activeCount} active runs; wait for one to finish`);
  const params = engineParams(sc);
  const issues = validateScenario(demoCity(), params);
  if (issues.length) throw new DemoHttpError(400, 'Scenario is not valid', issues.map((message) => ({ path: '', message })));
  const fp = inputFingerprint(demoCity(), params);
  const r: RunRow = {
    id: uuid(),
    scenarioId,
    projectId: sc.projectId,
    status: 'queued',
    progress: 0,
    simTimeS: 0,
    pace,
    engineVersion: ENGINE_VERSION,
    cityVersion: demoCity().version ?? CITY_VERSION,
    seed: params.seed,
    params,
    inputFingerprint: fp,
    resultFingerprint: null,
    errorMessage: null,
    queuedAt: now(),
    startedAt: null,
    finishedAt: null,
    wallTimeMs: null,
    summary: null,
    hasPlayback: false,
  };
  const previous = S()
    .runs.filter((x) => x.inputFingerprint === fp && x.status === 'completed')
    .sort((a, b) => ((a.finishedAt ?? '') < (b.finishedAt ?? '') ? 1 : -1))[0];
  S().runs.unshift(r);
  log('run.start', 'scenario', scenarioId, { runId: r.id, seed: params.seed, pace });
  save();
  const dto = { ...runDto(r), identicalPreviousRunId: previous?.id ?? null };
  queue.push(r.id);
  pump();
  return dto;
}

function control(runId: string, action: 'pause' | 'resume' | 'cancel') {
  const r = run(runId);
  const allowed: Record<string, RunStatus[]> = { pause: ['running'], resume: ['paused'], cancel: ['queued', 'running', 'paused'] };
  if (!allowed[action]!.includes(r.status)) throw new DemoHttpError(409, `Cannot ${action} a ${r.status} run`);
  if (r.status === 'queued') {
    const i = queue.indexOf(runId);
    if (i >= 0) queue.splice(i, 1);
    r.finishedAt = now();
    setStatus(r, 'cancelled');
    settle(runId, 'cancelled');
  } else if (active?.runId === runId) {
    active.worker.postMessage({ type: 'control', action });
  }
  log(`run.${action}`, 'run', runId);
  save();
  return runDto(r);
}

/* ───────────────────────── scenarios ───────────────────────── */

function createScenario(projectId: string, input: { name: string; description: string; kind: 'baseline' | 'variant'; baseScenarioId?: string }, sample = false): ScenarioRow {
  project(projectId);
  const base = input.baseScenarioId ? scenario(input.baseScenarioId) : null;
  if (base && base.projectId !== projectId) throw new DemoHttpError(400, 'Base scenario belongs to another project');
  const t = now();
  const sc: ScenarioRow = {
    id: uuid(),
    projectId,
    name: input.name,
    description: input.description,
    kind: input.kind,
    baseScenarioId: base?.id ?? null,
    isSaved: false,
    sample,
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
    params: { ...(base?.params ?? DEFAULT_DTO) },
    signalOverrides: structuredClone(base?.signalOverrides ?? []),
    closures: (base?.closures ?? []).map((c) => ({ ...c, id: uuid() })),
    incidents: (base?.incidents ?? []).map((i) => ({ ...i, id: uuid(), createdAt: t })),
  };
  S().scenarios.push(sc);
  log('scenario.create', 'scenario', sc.id, { name: sc.name, from: input.baseScenarioId ?? null });
  touch(projectId);
  return sc;
}

function touch(projectId: string) {
  const p = S().projects.find((x) => x.id === projectId);
  if (p) p.updatedAt = now();
}

function updateScenario(id: string, body: unknown) {
  const patch = parse(updateScenarioSchema, body);
  const sc = scenario(id);
  const city = demoCity();
  const next = {
    params: { ...sc.params, ...(patch.params ?? {}) },
    signalOverrides: patch.signalOverrides ? patch.signalOverrides.map((o) => ({ intersectionCode: o.intersectionCode, offsetS: o.offsetS ?? null, greens: o.greens })) : sc.signalOverrides,
    closures: patch.closures ? patch.closures.map((c) => ({ id: uuid(), roadCode: c.roadCode, startS: c.startS, endS: c.endS ?? null, reason: c.reason })) : sc.closures,
    incidents: patch.incidents
      ? patch.incidents.map((i) => ({ id: uuid(), roadCode: i.roadCode, kind: i.kind, severity: i.severity, startS: i.startS, durationS: i.durationS, description: i.description, createdAt: now() }))
      : sc.incidents,
  };
  const unknown: string[] = [];
  for (const o of next.signalOverrides) if (!city.nodes.some((n) => n.id === o.intersectionCode)) unknown.push(`intersection ${o.intersectionCode}`);
  for (const c of next.closures) if (!city.links.some((l) => l.id === c.roadCode)) unknown.push(`road ${c.roadCode}`);
  for (const i of next.incidents) if (!city.links.some((l) => l.id === i.roadCode)) unknown.push(`road ${i.roadCode}`);
  if (unknown.length) throw new DemoHttpError(400, 'Unknown network elements', unknown.map((message) => ({ path: '', message })));
  const issues = validateScenario(city, engineParams(next));
  if (issues.length) throw new DemoHttpError(400, 'Scenario is not valid', issues.map((message) => ({ path: '', message })));
  Object.assign(sc, next, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.isSaved !== undefined ? { isSaved: patch.isSaved } : {}),
    updatedAt: now(),
  });
  log('scenario.update', 'scenario', id, { fields: Object.keys(patch) });
  touch(sc.projectId);
  save();
  return scenarioDetail(id);
}

function listScenarios(projectId: string, savedOnly: boolean) {
  project(projectId);
  const rows = S()
    .scenarios.filter((x) => x.projectId === projectId && !x.archivedAt && (!savedOnly || x.isSaved))
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === 'baseline' ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1));
  return rows.map((sc) => {
    const runs = S()
      .runs.filter((r) => r.scenarioId === sc.id)
      .sort((a, b) => (a.queuedAt < b.queuedAt ? 1 : -1));
    const l = runs[0];
    const { params: _p, signalOverrides, closures, incidents, archivedAt: _a, ...rest } = sc;
    return {
      ...rest,
      latestRun: l ? { id: l.id, scenarioId: sc.id, status: l.status, progress: l.progress, queuedAt: l.queuedAt, meanTravelTimeS: l.summary?.meanTravelTime ?? null, meanDelayS: l.summary?.meanDelay ?? null, throughputPerHour: l.summary?.throughputPerHour ?? null } : null,
      runCount: runs.length,
      changes: { signalOverrides: signalOverrides.length, closures: closures.length, incidents: incidents.length },
    };
  });
}

async function proposeSignals(scenarioId: string, body: unknown) {
  const { runId, intersectionCodes } = parse(proposeSignalsSchema, body);
  const sc = scenario(scenarioId);
  const r = run(runId);
  if (r.projectId !== sc.projectId) throw new DemoHttpError(404, 'Run not found');
  if (r.status !== 'completed') throw new DemoHttpError(400, 'Run has not completed');
  const city = demoCity();
  const { details } = proposeSignalTimings(city, (await detail(runId)).links, r.simTimeS || 3600, intersectionCodes);
  return details.map((d) => {
    const plan = city.signals.find((p) => p.nodeId === d.nodeId)!;
    return {
      intersectionCode: d.nodeId,
      intersectionName: nodeName(d.nodeId),
      currentGreens: plan.phases.map((p) => p.green),
      proposedGreens: d.greens,
      phaseNames: plan.phases.map((p) => p.name),
      cycle: d.cycle,
      flowRatioSum: d.flowRatioSum,
      oversaturated: d.oversaturated,
    };
  });
}

/* ───────────────────────── comparison & reports ───────────────────────── */

async function compare(b: string, v: string) {
  const br = run(b);
  const vr = run(v);
  if (br.projectId !== vr.projectId) throw new DemoHttpError(400, 'Runs belong to different projects');
  if (br.status !== 'completed' || vr.status !== 'completed') throw new DemoHttpError(400, 'Both runs must be completed');
  const [bl, vl, bm, vm, bi, vi] = await Promise.all([linksOf(b), linksOf(v), metricsOf(b), metricsOf(v), intersectionsOf(b), intersectionsOf(v)]);
  const names = new Map(bl.map((l) => [l.linkId, l.name]));
  const vInt = new Map(vi.map((x) => [x.nodeId, x]));
  const sameInputs = br.inputFingerprint === vr.inputFingerprint;
  const series = (ms: Awaited<ReturnType<typeof metricsOf>>) => ms.map((m) => ({ t: m.tS, vehicles: m.vehiclesInNetwork, queued: m.queuedVehicles, travel: m.windowMeanTravelTimeS, speed: m.meanSpeedMs, throughput: m.throughputPerHour }));
  return {
    baseline: runDto(br),
    variant: runDto(vr),
    sameInputs,
    identicalResults: sameInputs && br.resultFingerprint === vr.resultFingerprint,
    metrics: compareSummaries(br.summary!, vr.summary!),
    links: compareLinks(bl, vl, 15).map((d) => ({ ...d, name: names.get(d.linkId) ?? d.linkId })),
    intersections: bi
      .map((x) => ({ nodeId: x.nodeId, name: x.name, baselineDelay: x.meanDelay, variantDelay: vInt.get(x.nodeId)?.meanDelay ?? 0 }))
      .filter((x) => x.baselineDelay > 0 || x.variantDelay > 0)
      .sort((a, c) => Math.abs(c.variantDelay - c.baselineDelay) - Math.abs(a.variantDelay - a.baselineDelay))
      .slice(0, 10),
    series: { baseline: series(bm), variant: series(vm) },
  };
}

async function createReport(projectId: string, body: unknown) {
  const input = parse(createReportSchema, body);
  const base = run(input.baselineRunId);
  if (base.projectId !== projectId || base.status !== 'completed') throw new DemoHttpError(400, 'Baseline run must be a completed run in this project');
  const stamp = (r: RunRow) => ({ runId: r.id, scenarioName: scenarioNameOf(r), seed: r.seed, engineVersion: r.engineVersion, resultFingerprint: r.resultFingerprint, params: r.params });
  let content: ReportContent;
  if (input.variantRunId) {
    const cmp = await compare(input.baselineRunId, input.variantRunId);
    content = {
      generatedAt: now(),
      title: input.title,
      notes: input.notes,
      baseline: stamp(base),
      variant: stamp(run(input.variantRunId)),
      metrics: cmp.metrics,
      topLinks: cmp.links.map((l) => ({ name: l.name, linkId: l.linkId, baselineCongestion: l.baselineCongestion, variantCongestion: l.variantCongestion })),
      findings: findingsFrom(cmp.metrics, true),
      assumptions: { ...TRAFFIC_ENERGY_ASSUMPTIONS },
      disclaimer: REPORT_DISCLAIMER,
    };
  } else {
    const metrics = compareSummaries(base.summary!, base.summary!);
    const links = (await linksOf(base.id)).slice(0, 12);
    content = {
      generatedAt: now(),
      title: input.title,
      notes: input.notes,
      baseline: stamp(base),
      variant: null,
      metrics,
      topLinks: links.map((l) => ({ name: l.name, linkId: l.linkId, baselineCongestion: l.congestion, variantCongestion: l.congestion })),
      findings: findingsFrom(metrics, false),
      assumptions: { ...TRAFFIC_ENERGY_ASSUMPTIONS },
      disclaimer: REPORT_DISCLAIMER,
    };
  }
  const row: ReportRow = { id: uuid(), projectId, title: input.title, baselineRunId: input.baselineRunId, variantRunId: input.variantRunId ?? null, notes: input.notes, content, createdAt: now() };
  S().reports.unshift(row);
  log('report.create', 'project', projectId, { reportId: row.id });
  save();
  return row;
}

/* ───────────────────────── projects ───────────────────────── */

function projectDto(p: ProjectRow) {
  return {
    ...p,
    role: 'owner' as const,
    scenarioCount: S().scenarios.filter((x) => x.projectId === p.id && !x.archivedAt).length,
    runCount: S().runs.filter((x) => x.projectId === p.id).length,
  };
}

function createProject(body: unknown, sample = false) {
  const input = parse(createProjectSchema, body);
  if (input.cityId !== DEMO_CITY_ID) throw new DemoHttpError(400, 'Unknown city');
  const t = now();
  const p: ProjectRow = { id: uuid(), name: input.name, description: input.description, cityId: input.cityId, createdAt: t, updatedAt: t };
  S().projects.push(p);
  const baseline = createScenario(p.id, { name: 'Baseline', description: 'Network as configured, default signal plans.', kind: 'baseline' }, sample);
  baseline.isSaved = true;
  log('project.create', 'project', p.id, { name: p.name });
  save();
  return p;
}

/* ───────────────────────── first visit ───────────────────────── */

export type BootStep = { label: string; done: boolean };
let bootListeners: ((steps: BootStep[]) => void)[] = [];
let bootSteps: BootStep[] = [];
function step(label: string) {
  bootSteps = [...bootSteps.map((s) => ({ ...s, done: true })), { label, done: false }];
  for (const l of bootListeners) l(bootSteps);
}
export function onBootProgress(fn: (steps: BootStep[]) => void) {
  bootListeners.push(fn);
  fn(bootSteps);
  return () => {
    bootListeners = bootListeners.filter((x) => x !== fn);
  };
}

/**
 * The sample study, matching what the landing page shows: the morning peak
 * baseline, a Webster signal re-timing derived from the baseline's own flows,
 * and the Orbit Boulevard closure. All three runs are computed here and now.
 */
async function seed() {
  const t = now();
  state = { version: 1, createdAt: t, projects: [], scenarios: [], runs: [], reports: [], notifications: [], activity: [], seq: 0 };
  const p = createProject({ name: 'Morning Peak Study', description: 'How signal timing and the Orbit Boulevard corridor shape the 07:00–08:00 peak. Sample project — everything in it was computed in this browser.' }, true);
  const baseline = S().scenarios.find((x) => x.projectId === p.id)!;
  Object.assign(baseline, { name: 'Baseline — fixed 35/35 s signals', description: 'Default uncoordinated two-phase plans at every signalised junction.' });

  const closure = createScenario(p.id, { name: 'Orbit Boulevard closed from 07:05', description: 'Both directions between Noor Square and Orbit Circle closed for utility works from 07:05. Traffic re-routes.', kind: 'variant', baseScenarioId: baseline.id }, true);
  closure.closures = ['c3r2>c3r3', 'c3r3>c3r2'].map((roadCode) => ({ id: uuid(), roadCode, startS: 300, endS: null, reason: 'Utility works' }));
  closure.isSaved = true;
  const webster = createScenario(p.id, { name: 'Webster signal timing', description: 'Every signal re-timed with Webster’s method from the baseline run’s own flows.', kind: 'variant', baseScenarioId: baseline.id }, true);
  webster.isSaved = true;
  save();

  step('Running the baseline morning peak (07:00–08:00, seed 42)');
  const b = startRun(baseline.id, 0);
  if ((await waitForRun(b.id)) !== 'completed') throw new Error('The baseline run did not complete');

  step('Re-timing 28 signals with Webster’s method from the baseline flows');
  const city = demoCity();
  const { overrides } = proposeSignalTimings(city, (await detail(b.id)).links, 3600);
  webster.signalOverrides = overrides.map((o) => ({ intersectionCode: o.nodeId, offsetS: o.offset ?? null, greens: o.greens }));
  webster.description = `All ${overrides.length} signals re-timed with Webster’s method from the baseline run’s own flows.`;
  save();

  step('Running the re-timed signals scenario');
  const w = startRun(webster.id, 0);
  await waitForRun(w.id);
  step('Running the Orbit Boulevard closure');
  const c = startRun(closure.id, 0);
  await waitForRun(c.id);
  S().notifications = S().notifications.map((n) => ({ ...n, readAt: n.readAt ?? now() }));
  save();
  step('Ready');
}

let ready: Promise<void> | null = null;
/** Loads the saved demo, or creates and computes the sample study on first visit. */
export function demoReady(): Promise<void> {
  ready ??= (async () => {
    const saved = readState<State>();
    if (saved?.version === 1 && saved.projects.length) {
      state = saved;
      // A run cannot survive a closed tab: say so instead of leaving it "running".
      for (const r of state.runs)
        if (['queued', 'running', 'paused'].includes(r.status)) Object.assign(r, { status: 'cancelled', finishedAt: now(), errorMessage: 'Interrupted: the page was closed or reloaded while this run was in progress.' });
      save();
      step('Ready');
      return;
    }
    await seed();
  })().catch((e: unknown) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Deletes everything this browser stored for the demo and starts again. */
export async function resetDemo(): Promise<void> {
  active?.worker.terminate();
  active = null;
  queue.length = 0;
  state = null;
  ready = null;
  bootSteps = [];
  clearState();
  await clearBlobs();
}

export async function demoStorageInfo() {
  return { stateSaved: stateIsPersistent(), resultsSaved: await blobsArePersistent(), createdAt: state?.createdAt ?? null };
}

export async function demoPlayback(runId: string): Promise<Frame[]> {
  const r = run(runId);
  if (r.status !== 'completed') throw new DemoHttpError(404, 'No playback recorded for this run');
  const p = r.hasPlayback ? await getBlob<PlaybackBlob>(`playback:${runId}`) : undefined;
  if (!p) throw new DemoHttpError(404, `Playback is kept for the ${PLAYBACKS_KEPT} most recent runs in this browser. Run the scenario again to watch it.`);
  return decodeFrames(p.data).frames;
}

export function demoReportHtml(id: string): string {
  const r = S().reports.find((x) => x.id === id);
  if (!r) throw new DemoHttpError(404, 'Report not found');
  return renderReportHtml(r.content);
}

/* ───────────────────────── router ───────────────────────── */

type Handler = (m: RegExpMatchArray, body: unknown, q: URLSearchParams) => unknown;
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/auth\/me$/, () => DEMO_USER],
  ['POST', /^\/auth\/logout$/, () => undefined],
  ['GET', /^\/notifications$/, () => S().notifications],
  ['POST', /^\/notifications\/read-all$/, () => void (S().notifications.forEach((n) => (n.readAt ??= now())), save())],

  ['GET', /^\/cities\/([^/]+)\/map$/, ([, id]) => {
    if (id !== DEMO_CITY_ID) throw new DemoHttpError(404, `City ${id} not found`);
    return { ...demoCity(), bounds: cityBounds(demoCity()) };
  }],
  ['GET', /^\/cities\/([^/]+)\/energy$/, ([, id], _b, q) => {
    if (id !== DEMO_CITY_ID) throw new DemoHttpError(404, `City ${id} not found`);
    const lv = parse(energyQuerySchema, Object.fromEntries(q));
    const baseline = simulateCityEnergy(demoCity());
    const sc = simulateCityEnergy(demoCity(), lv);
    return { baseline, scenario: sc, savingKwh: baseline.dailyKwh - sc.dailyKwh, savingPercent: baseline.dailyKwh ? ((baseline.dailyKwh - sc.dailyKwh) / baseline.dailyKwh) * 100 : 0, kind: 'estimate' as const };
  }],

  ['GET', /^\/projects$/, () => S().projects.map(projectDto)],
  ['POST', /^\/projects$/, (_m, body) => projectDto(createProject(body))],
  ['GET', /^\/projects\/([^/]+)\/scenarios$/, ([, id], _b, q) => listScenarios(id!, q.get('saved') === 'true')],
  ['POST', /^\/projects\/([^/]+)\/scenarios$/, ([, id], body) => {
    const sc = createScenario(id!, parse(createScenarioSchema, body));
    save();
    return scenarioDetail(sc.id);
  }],
  ['GET', /^\/projects\/([^/]+)\/runs$/, ([, id]) => S().runs.filter((r) => r.projectId === id).slice(0, 50).map((r) => ({ ...runDto(r), params: undefined }))],
  ['GET', /^\/projects\/([^/]+)\/activity$/, ([, id]) => {
    const ids = new Set([id, ...S().scenarios.filter((x) => x.projectId === id).map((x) => x.id), ...S().runs.filter((x) => x.projectId === id).map((x) => x.id)]);
    return S().activity.filter((a) => ids.has(a.entityId)).slice(0, 40).map((a) => ({ ...a, actorName: 'You' }));
  }],
  ['GET', /^\/projects\/([^/]+)\/incidents$/, ([, id]) => {
    const scs = S().scenarios.filter((x) => x.projectId === id && !x.archivedAt);
    return {
      incidents: scs.flatMap((sc) => sc.incidents.map((i) => ({ ...i, scenarioId: sc.id, scenarioName: sc.name, roadName: roadName(i.roadCode) }))).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
      closures: scs.flatMap((sc) => sc.closures.map((c) => ({ ...c, scenarioId: sc.id, scenarioName: sc.name, roadName: roadName(c.roadCode) }))),
    };
  }],
  ['GET', /^\/projects\/([^/]+)\/reports$/, ([, id]) => S().reports.filter((r) => r.projectId === id).map((r) => ({ id: r.id, title: r.title, createdAt: r.createdAt, baselineRunId: r.baselineRunId, variantRunId: r.variantRunId, author: 'You' }))],
  ['POST', /^\/projects\/([^/]+)\/reports$/, ([, id], body) => createReport(id!, body)],

  ['GET', /^\/scenarios\/([^/]+)$/, ([, id]) => scenarioDetail(id!)],
  ['PATCH', /^\/scenarios\/([^/]+)$/, ([, id], body) => updateScenario(id!, body)],
  ['DELETE', /^\/scenarios\/([^/]+)$/, ([, id]) => {
    const sc = scenario(id!);
    if (sc.kind === 'baseline' && S().scenarios.filter((x) => x.projectId === sc.projectId && x.kind === 'baseline' && !x.archivedAt).length <= 1)
      throw new DemoHttpError(400, 'A project must keep at least one baseline');
    sc.archivedAt = now();
    log('scenario.archive', 'scenario', sc.id);
    save();
  }],
  ['POST', /^\/scenarios\/([^/]+)\/duplicate$/, ([, id]) => {
    const src = scenario(id!);
    const copy = createScenario(src.projectId, { name: `${src.name} (copy)`.slice(0, 80), description: src.description, kind: 'variant', baseScenarioId: src.id });
    save();
    return scenarioDetail(copy.id);
  }],
  ['POST', /^\/scenarios\/([^/]+)\/propose-signals$/, ([, id], body) => proposeSignals(id!, body)],
  ['POST', /^\/scenarios\/([^/]+)\/runs$/, ([, id], body) => startRun(id!, parse(startRunSchema, body).pace)],

  ['GET', /^\/runs\/compare$/, (_m, _b, q) => {
    const b = q.get('baseline');
    const v = q.get('variant');
    if (!b || !v) throw new DemoHttpError(400, 'baseline and variant are required');
    return compare(b, v);
  }],
  ['GET', /^\/runs\/([^/]+)$/, ([, id]) => runDto(run(id!))],
  ['GET', /^\/runs\/([^/]+)\/metrics$/, ([, id]) => metricsOf(id!)],
  ['GET', /^\/runs\/([^/]+)\/links$/, ([, id]) => linksOf(id!)],
  ['GET', /^\/runs\/([^/]+)\/intersections$/, ([, id]) => intersectionsOf(id!)],
  ['GET', /^\/runs\/([^/]+)\/events$/, async ([, id]) => (await detail(id!)).events.slice(0, 1000).map((e) => ({ t: e.t, type: e.type, message: e.message, roadCode: e.linkId ?? null }))],
  ['POST', /^\/runs\/([^/]+)\/control$/, ([, id], body) => control(id!, parse(runControlSchema, body).action)],

  ['GET', /^\/reports\/([^/]+)$/, ([, id]) => {
    const r = S().reports.find((x) => x.id === id);
    if (!r) throw new DemoHttpError(404, 'Report not found');
    return r;
  }],
  ['DELETE', /^\/reports\/([^/]+)$/, ([, id]) => {
    const r = S().reports.find((x) => x.id === id);
    if (!r) throw new DemoHttpError(404, 'Report not found');
    S().reports = S().reports.filter((x) => x.id !== id);
    log('report.delete', 'project', r.projectId, { reportId: id });
    save();
  }],
];

/** Settings, account and administration routes have no meaning without accounts. */
const NOT_IN_DEMO = /^\/(users|auth\/(login|register|refresh)|admin|audit)/;

export async function demoRequest<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  await demoReady();
  const method = (init.method ?? 'GET').toUpperCase();
  const [p, qs = ''] = path.split('?');
  if (NOT_IN_DEMO.test(p!)) throw new DemoHttpError(403, 'Accounts are not available in the demo.');
  for (const [m, re, h] of routes) {
    if (m !== method) continue;
    const match = p!.match(re);
    if (match) return (await h(match, init.json, new URLSearchParams(qs))) as T;
  }
  throw new DemoHttpError(404, `Not available in the demo: ${method} ${p}`);
}
