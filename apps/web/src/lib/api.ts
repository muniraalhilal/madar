'use client';
/**
 * Typed client for the MADAR API. Requests go same-origin (/api → Next rewrite
 * → NestJS) with httpOnly cookies; state-changing calls carry the CSRF header.
 * A 401 triggers one silent refresh-token rotation and a single retry.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'madar' } })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; retry?: boolean } = {}): Promise<T> {
  const { json, retry = true, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('X-Requested-With', 'madar');
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, { ...rest, headers, credentials: 'include', body: json !== undefined ? JSON.stringify(json) : rest.body });
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refresh()) return api<T>(path, { ...init, retry: false });
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  }
  if (!res.ok) {
    let body: { message?: string | string[]; issues?: { path: string; message: string }[] } = {};
    try {
      body = await res.json();
    } catch {
      /* non-JSON error */
    }
    const msg = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? res.statusText);
    throw new ApiError(res.status, msg, body.issues ?? []);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : (res.arrayBuffer() as unknown)) as Promise<T>;
}

/* ───── response shapes (subset of the API contract) ───── */
export interface User { id: string; email: string; displayName: string; role: 'admin' | 'planner' | 'viewer'; createdAt: string; lastLoginAt: string | null }
export interface Project { id: string; name: string; description: string; cityId: string; role: 'owner' | 'editor' | 'viewer'; scenarioCount: number; runCount: number; updatedAt: string }
export interface Summary {
  tripsGenerated: number; tripsCompleted: number; tripsStranded: number; vehiclesRemaining: number; meanTravelTime: number; meanWaitTime: number; meanDelay: number;
  p95TravelTime: number; meanStops: number; throughputPerHour: number; vehicleKm: number; maxQueue: number; meanNetworkSpeed: number; reroutes: number;
  energy: { fuelLitres: number; evKwh: number; co2Kg: number; idleHours: number; assumptions: Record<string, unknown> };
}
export type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export interface Run {
  id: string; scenarioId: string; projectId: string; status: RunStatus; progress: number; simTimeS: number; pace: number; engineVersion: string; seed: number;
  inputFingerprint: string; resultFingerprint: string | null; errorMessage: string | null; queuedAt: string; startedAt: string | null; finishedAt: string | null;
  wallTimeMs: number | null; summary: Summary | null; scenarioName?: string; scenarioKind?: string; params?: Record<string, unknown>; identicalPreviousRunId?: string | null;
}
export interface ScenarioParams { durationS: number; seed: number; demandMultiplier: number; startHour: number; rerouting: boolean; sampleIntervalS: number; frameIntervalS: number; energySetpointDelta: number; energyLightingSaving: number; energyOccupancyScale: number }
export interface Scenario {
  id: string; projectId: string; name: string; description: string; kind: 'baseline' | 'variant'; baseScenarioId: string | null; isSaved: boolean; createdAt: string; updatedAt: string;
  params: ScenarioParams | null;
  signalOverrides: { intersectionCode: string; intersectionName: string; offsetS: number | null; greens: number[] }[];
  closures: { id: string; roadCode: string; roadName: string; startS: number; endS: number | null; reason: string }[];
  incidents: { id: string; roadCode: string; roadName: string; kind: 'collision' | 'breakdown' | 'roadwork' | 'event'; severity: number; startS: number; durationS: number; description: string }[];
  runs: { id: string; status: RunStatus; progress: number; queuedAt: string; finishedAt: string | null; meanTravelTimeS: number | null; meanDelayS: number | null; throughputPerHour: number | null; resultFingerprint: string | null }[];
}
export interface ScenarioListItem { id: string; name: string; description: string; kind: 'baseline' | 'variant'; isSaved: boolean; updatedAt: string; runCount: number; latestRun: { id: string; status: RunStatus; meanTravelTimeS: number | null; meanDelayS: number | null; throughputPerHour: number | null } | null; changes: { signalOverrides: number; closures: number; incidents: number } }
