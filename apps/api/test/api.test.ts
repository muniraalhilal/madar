import { schema as s } from '@madar/db';
import { WS_NAMESPACE, WsEvents } from '@madar/shared';
import { eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processRun } from '../../../workers/simulation/src/processor';
import { DEMO_PASSWORD, createHarness, type Harness } from './setup';

let h: Harness;
const CSRF = { 'X-Requested-With': 'madar' };

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.close());

async function login(email: string, password = DEMO_PASSWORD) {
  const res = await request(h.url).post('/api/auth/login').set(CSRF).send({ email, password }).expect(200);
  return { token: res.body.accessToken as string, cookies: res.get('Set-Cookie') ?? [], user: res.body.user };
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('health & docs', () => {
  it('reports database and redis readiness', async () => {
    const res = await request(h.url).get('/api/health').expect(200);
    expect(res.body.checks).toEqual({ database: 'ok', redis: 'ok' });
  });
  it('serves an OpenAPI document generated from the controllers', async () => {
    const res = await request(h.url).get('/api/docs/openapi.json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/api/scenarios/{id}/runs', '/api/runs/compare']));
  });
  it('sets security headers', async () => {
    const res = await request(h.url).get('/api/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('authentication', () => {
  it('validates registration input with field-level issues', async () => {
    const res = await request(h.url).post('/api/auth/register').set(CSRF).send({ email: 'nope', password: 'short', displayName: 'A' }).expect(400);
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password', 'displayName']));
  });

  it('registers, stores an argon2id hash and sets httpOnly cookies', async () => {
    const res = await request(h.url)
      .post('/api/auth/register')
      .set(CSRF)
      .send({ email: 'New.User@Example.com', password: 'a-strong-pass-1', displayName: 'New User' })
      .expect(201);
    expect(res.body.user.email).toBe('new.user@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const cookies = (res.get('Set-Cookie') ?? []).join(';');
    expect(cookies).toMatch(/madar_at=.*HttpOnly/);
    expect(cookies).toMatch(/madar_rt=.*Path=\/api\/auth/);
    const [u] = await h.db.db.select().from(s.users).where(eq(s.users.email, 'new.user@example.com'));
    expect(u!.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('rejects duplicate emails case-insensitively', async () => {
    await request(h.url).post('/api/auth/register').set(CSRF).send({ email: 'NEW.user@example.com', password: 'a-strong-pass-1', displayName: 'Dup' }).expect(409);
  });

  it('requires authentication for protected routes', async () => {
    await request(h.url).get('/api/projects').expect(401);
    await request(h.url).get('/api/projects').set(bearer('garbage')).expect(401);
  });

  it('requires the CSRF header for cookie-authenticated writes', async () => {
    const { cookies } = await login('planner@madar.dev');
    await request(h.url).post('/api/projects').set('Cookie', cookies).send({ name: 'X' }).expect(403);
    await request(h.url).post('/api/projects').set('Cookie', cookies).set(CSRF).send({ name: 'Cookie project' }).expect(201);
  });

  it('locks the account after five failed sign-ins', async () => {
    await request(h.url).post('/api/auth/register').set(CSRF).send({ email: 'lock@example.com', password: 'right-pass-123', displayName: 'Lock' }).expect(201);
    for (let i = 0; i < 5; i++) {
      await request(h.url).post('/api/auth/login').set(CSRF).send({ email: 'lock@example.com', password: 'wrong-pass-123' }).expect(401);
    }
    const res = await request(h.url).post('/api/auth/login').set(CSRF).send({ email: 'lock@example.com', password: 'right-pass-123' }).expect(401);
    expect(res.body.message).toMatch(/locked/);
  });

  it('rotates refresh tokens and revokes every session when an old token is replayed', async () => {
    const first = await request(h.url).post('/api/auth/login').set(CSRF).send({ email: 'viewer@madar.dev', password: DEMO_PASSWORD }).expect(200);
    const rt1 = (first.get('Set-Cookie') ?? []).find((c) => c.startsWith('madar_rt='))!.split(';')[0]!;
    const second = await request(h.url).post('/api/auth/refresh').set(CSRF).set('Cookie', rt1).expect(200);
    const rt2 = (second.get('Set-Cookie') ?? []).find((c) => c.startsWith('madar_rt='))!.split(';')[0]!;
    expect(rt2).not.toBe(rt1);
    // Replay of the rotated token → reuse detected → all sessions revoked.
    await request(h.url).post('/api/auth/refresh').set(CSRF).set('Cookie', rt1).expect(401);
    await request(h.url).post('/api/auth/refresh').set(CSRF).set('Cookie', rt2).expect(401);
  });

  it('logout revokes the session behind the access token', async () => {
    const res = await request(h.url).post('/api/auth/login').set(CSRF).send({ email: 'admin@madar.dev', password: DEMO_PASSWORD }).expect(200);
    const cookies = res.get('Set-Cookie') ?? [];
    await request(h.url).get('/api/auth/me').set('Cookie', cookies).expect(200);
    await request(h.url).post('/api/auth/logout').set('Cookie', cookies).set(CSRF).expect(204);
    await request(h.url).get('/api/auth/me').set('Cookie', cookies).expect(401);
  });
});

describe('authorisation', () => {
  it('enforces role permissions', async () => {
    const viewer = await login('viewer@madar.dev');
    await request(h.url).post('/api/projects').set(bearer(viewer.token)).send({ name: 'Nope' }).expect(403);
    await request(h.url).get('/api/audit').set(bearer(viewer.token)).expect(403);
    const admin = await login('admin@madar.dev');
    await request(h.url).get('/api/audit').set(bearer(admin.token)).expect(200);
  });

  it('hides other users\' projects (404, not 403) and blocks writes by project viewers', async () => {
    const planner = await login('planner@madar.dev');
    const projects = await request(h.url).get('/api/projects').set(bearer(planner.token)).expect(200);
    const study = projects.body.find((p: { name: string }) => p.name === 'Morning Peak Study');

    const outsider = await request(h.url).post('/api/auth/register').set(CSRF).send({ email: 'outsider@example.com', password: 'outsider-pass-1', displayName: 'Outsider' }).expect(201);
    await request(h.url).get(`/api/projects/${study.id}`).set(bearer(outsider.body.accessToken)).expect(404);
    await request(h.url).get(`/api/projects/${study.id}/scenarios`).set(bearer(outsider.body.accessToken)).expect(404);

    const viewer = await login('viewer@madar.dev');
    const scen = await request(h.url).get(`/api/projects/${study.id}/scenarios`).set(bearer(viewer.token)).expect(200);
    await request(h.url).patch(`/api/scenarios/${scen.body[0].id}`).set(bearer(viewer.token)).send({ name: 'Hijack' }).expect(403);
  });
});

describe('city model', () => {
  it('serves the network and spatial queries backed by PostGIS', async () => {
    const { token } = await login('viewer@madar.dev');
    const map = await request(h.url).get('/api/cities/madar-city/map').set(bearer(token)).expect(200);
    expect(map.body.links.length).toBe(148);
    const near = await request(h.url).get('/api/cities/madar-city/buildings/near?x=325&y=175&radius=300').set(bearer(token)).expect(200);
    expect(near.body.length).toBeGreaterThan(0);
    expect(near.body[0].distanceM).toBeLessThanOrEqual(near.body.at(-1).distanceM);
    const loc = await request(h.url).get('/api/cities/madar-city/locate?x=10&y=200').set(bearer(token)).expect(200);
    expect(loc.body.district.code).toBe('noor');
    expect(loc.body.road.code).toMatch(/c3r/);
    const energy = await request(h.url).get('/api/cities/madar-city/energy?setpointDelta=2').set(bearer(token)).expect(200);
    expect(energy.body.savingKwh).toBeGreaterThan(0);
    await request(h.url).get('/api/cities/madar-city/energy?setpointDelta=99').set(bearer(token)).expect(400);
  });
});

describe('scenario → simulation → comparison → report', () => {
  let token: string;
  let projectId: string;
  let baselineId: string;
  let variantId: string;
  let baselineRun: string;
  let variantRun: string;

  beforeAll(async () => {
    token = (await login('planner@madar.dev')).token;
    const p = await request(h.url).post('/api/projects').set(bearer(token)).send({ name: 'Integration study' }).expect(201);
    projectId = p.body.id;
    const list = await request(h.url).get(`/api/projects/${projectId}/scenarios`).set(bearer(token)).expect(200);
    baselineId = list.body.find((x: { kind: string }) => x.kind === 'baseline').id;
    await request(h.url).patch(`/api/scenarios/${baselineId}`).set(bearer(token)).send({ params: { durationS: 900 } }).expect(200);
  });

  it('creates a variant that inherits the baseline parameters', async () => {
    const res = await request(h.url).post(`/api/projects/${projectId}/scenarios`).set(bearer(token)).send({ name: 'Retimed core', baseScenarioId: baselineId }).expect(201);
    variantId = res.body.id;
    expect(res.body.params.durationS).toBe(900);
    expect(res.body.baseScenarioId).toBe(baselineId);
  });

  it('rejects invalid edits using the engine validator', async () => {
    await request(h.url).patch(`/api/scenarios/${variantId}`).set(bearer(token)).send({ closures: [{ roadCode: 'no-such-road' }] }).expect(400);
    await request(h.url).patch(`/api/scenarios/${variantId}`).set(bearer(token)).send({ signalOverrides: [{ intersectionCode: 'c3r3', greens: [40] }] }).expect(400);
    const res = await request(h.url).patch(`/api/scenarios/${variantId}`).set(bearer(token)).send({ signalOverrides: [{ intersectionCode: 'g-west', greens: [40, 30] }] }).expect(400);
    expect(JSON.stringify(res.body.issues)).toMatch(/not signalised/);
  });

  it('runs the baseline through queue → worker → database', async () => {
    const res = await request(h.url).post(`/api/scenarios/${baselineId}/runs`).set(bearer(token)).send({}).expect(201);
    baselineRun = res.body.id;
    expect(res.body.status).toBe('queued');
    const status = await processRun(baselineRun, { db: h.db.db, redis: h.redis, log: h.log });
    expect(status).toBe('completed');
    const run = await request(h.url).get(`/api/runs/${baselineRun}`).set(bearer(token)).expect(200);
    expect(run.body.status).toBe('completed');
    expect(run.body.summary.tripsCompleted).toBeGreaterThan(1000);
    expect(run.body.resultFingerprint).toMatch(/^[0-9a-f]{16}$/);
    const metrics = await request(h.url).get(`/api/runs/${baselineRun}/metrics`).set(bearer(token)).expect(200);
    expect(metrics.body).toHaveLength(15);
    const pb = await request(h.url).get(`/api/runs/${baselineRun}/playback`).set(bearer(token)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((pb.body as Buffer).readUInt32LE(0)).toBe(0x3152444d);
  });

  it('proposes Webster timings from the baseline and applies them to the variant', async () => {
    const res = await request(h.url).post(`/api/scenarios/${variantId}/propose-signals`).set(bearer(token)).send({ runId: baselineRun }).expect(200);
    expect(res.body.length).toBeGreaterThan(10);
    const overrides = res.body.map((p: { intersectionCode: string; proposedGreens: number[] }) => ({ intersectionCode: p.intersectionCode, greens: p.proposedGreens }));
    await request(h.url).patch(`/api/scenarios/${variantId}`).set(bearer(token)).send({ signalOverrides: overrides, isSaved: true }).expect(200);
    const run = await request(h.url).post(`/api/scenarios/${variantId}/runs`).set(bearer(token)).send({}).expect(201);
    variantRun = run.body.id;
    expect(await processRun(variantRun, { db: h.db.db, redis: h.redis, log: h.log })).toBe('completed');
  });

  it('compares runs with direction-aware verdicts', async () => {
    const res = await request(h.url).get(`/api/runs/compare?baseline=${baselineRun}&variant=${variantRun}`).set(bearer(token)).expect(200);
    const delay = res.body.metrics.find((m: { key: string }) => m.key === 'meanDelay');
    expect(delay.verdict).toBe('improved');
    expect(res.body.series.baseline.length).toBe(res.body.series.variant.length);
    expect(res.body.sameInputs).toBe(false);
  });

  it('reproduces identical results for identical inputs', async () => {
    const again = await request(h.url).post(`/api/scenarios/${baselineId}/runs`).set(bearer(token)).send({}).expect(201);
    expect(again.body.identicalPreviousRunId).toBe(baselineRun);
    await processRun(again.body.id, { db: h.db.db, redis: h.redis, log: h.log });
    const cmp = await request(h.url).get(`/api/runs/compare?baseline=${baselineRun}&variant=${again.body.id}`).set(bearer(token)).expect(200);
    expect(cmp.body.identicalResults).toBe(true);
  });

  it('freezes a report and exports escaped, printable HTML', async () => {
    const res = await request(h.url)
      .post(`/api/projects/${projectId}/reports`)
      .set(bearer(token))
      .send({ title: 'Signal retiming <script>alert(1)</script>', baselineRunId: baselineRun, variantRunId: variantRun })
      .expect(201);
    expect(res.body.content.findings.length).toBeGreaterThan(0);
    const html = await request(h.url).get(`/api/reports/${res.body.id}/export.html`).set(bearer(token)).expect(200);
    expect(html.text).toContain('&lt;script&gt;');
    expect(html.text).not.toContain('<script>alert');
    expect(html.headers['content-security-policy']).toMatch(/default-src 'none'/);
  });

  it('records an audit trail of scenario changes', async () => {
    const res = await request(h.url).get(`/api/projects/${projectId}/activity`).set(bearer(token)).expect(200);
    const actions = res.body.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['scenario.create', 'scenario.update', 'run.start']));
  });

  it('cancels a queued run and the worker honours it', async () => {
    const res = await request(h.url).post(`/api/scenarios/${baselineId}/runs`).set(bearer(token)).send({}).expect(201);
    await request(h.url).post(`/api/runs/${res.body.id}/control`).set(bearer(token)).send({ action: 'cancel' }).expect(200);
    expect(await processRun(res.body.id, { db: h.db.db, redis: h.redis, log: h.log })).toBe('cancelled');
    await request(h.url).post(`/api/runs/${res.body.id}/control`).set(bearer(token)).send({ action: 'pause' }).expect(409);
  });

  it('cancels a running run between chunks', async () => {
    const res = await request(h.url).post(`/api/scenarios/${baselineId}/runs`).set(bearer(token)).send({ pace: 300 }).expect(201);
    const runId = res.body.id as string;
    const done = processRun(runId, { db: h.db.db, redis: h.redis, log: h.log, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 20))) });
    await new Promise((r) => setTimeout(r, 150));
    await request(h.url).post(`/api/runs/${runId}/control`).set(bearer(token)).send({ action: 'cancel' }).expect(200);
    expect(await done).toBe('cancelled');
  });
});

describe('real-time channel', () => {
  const connect = (token?: string) =>
    io(`${h.url}${WS_NAMESPACE}`, { transports: ['websocket'], auth: token ? { token } : {}, forceNew: true, reconnection: false });

  it('rejects unauthenticated sockets', async () => {
    const sock = connect();
    const reason = await new Promise<string>((resolve) => sock.on('disconnect', (r) => resolve(r)));
    expect(reason).toMatch(/server/);
  });

  it('streams progress, frames and completion to authorised subscribers only', async () => {
    const { token } = await login('planner@madar.dev');
    const projects = await request(h.url).get('/api/projects').set(bearer(token)).expect(200);
    const study = projects.body.find((p: { name: string }) => p.name === 'Integration study');
    const scen = await request(h.url).get(`/api/projects/${study.id}/scenarios`).set(bearer(token)).expect(200);
    const base = scen.body.find((x: { kind: string }) => x.kind === 'baseline');
    const run = await request(h.url).post(`/api/scenarios/${base.id}/runs`).set(bearer(token)).send({}).expect(201);

    const sock: Socket = connect(token);
    await new Promise<void>((r) => sock.on('connect', () => r()));
    const ack = await sock.emitWithAck(WsEvents.subscribeRun, { runId: run.body.id });
    expect(ack.ok).toBe(true);

    const outsider = await request(h.url).post('/api/auth/login').set(CSRF).send({ email: 'outsider@example.com', password: 'outsider-pass-1' }).expect(200);
    const spy: Socket = connect(outsider.body.accessToken);
    await new Promise<void>((r) => spy.on('connect', () => r()));
    expect((await spy.emitWithAck(WsEvents.subscribeRun, { runId: run.body.id })).ok).toBe(false);

    let progress = 0;
    let frames = 0;
    sock.on(WsEvents.progress, () => progress++);
    sock.on(WsEvents.frame, (f: { data: ArrayBuffer; count: number }) => {
      frames++;
      expect(f.data.byteLength).toBe(f.count * 16);
    });
    const completed = new Promise<void>((resolve) => sock.on(WsEvents.status, (m: { status: string }) => m.status === 'completed' && resolve()));
    await processRun(run.body.id, { db: h.db.db, redis: h.redis, log: h.log });
    await completed;
    expect(progress).toBeGreaterThan(5);
    expect(frames).toBeGreaterThan(0);
    sock.close();
    spy.close();
  });
});
