# API

Base path `/api`. Interactive OpenAPI: `http://localhost:4000/api/docs` (JSON at `/api/docs/openapi.json`). Request bodies are validated with the Zod schemas in `packages/shared/src/schemas.ts`; validation errors return `400` with `issues: [{ path, message }]`.

Authentication: httpOnly cookies set by `/auth/login` (browser) or `Authorization: Bearer <accessToken>` (API clients). Cookie-authenticated `POST/PATCH/DELETE` must send `X-Requested-With: madar`.

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` · `/auth/login` | rate-limited (10/min) |
| POST | `/auth/refresh` · `/auth/logout` | refresh rotates the token |
| GET | `/auth/me` | |
| PATCH | `/users/me` · POST `/users/me/password` · GET `/users/me/sessions` | |
| GET · PATCH | `/users` · `/users/:id/role` | `user:manage` (admin) |
| GET | `/cities` · `/cities/:id` · `/cities/:id/map` | network geometry, signals, buildings |
| GET | `/cities/:id/roads/:code` · `/intersections/:code` | |
| GET | `/cities/:id/buildings/near?x&y&radius` · `/locate?x&y` | PostGIS |
| GET | `/cities/:id/energy?setpointDelta&lightingSaving&occupancyScale` | building energy model |
| GET · POST | `/projects` | |
| GET · PATCH · DELETE | `/projects/:id` | membership checked |
| POST | `/projects/:id/members` · GET `/projects/:id/activity` | |
| GET · POST | `/projects/:id/scenarios` | create can copy from `baseScenarioId` |
| GET | `/projects/:id/incidents` · `/projects/:id/runs` · `/projects/:id/reports` | |
| GET · PATCH · DELETE | `/scenarios/:id` | PATCH validated by the engine |
| POST | `/scenarios/:id/duplicate` · `/scenarios/:id/propose-signals` | Webster proposal from a run |
| POST | `/scenarios/:id/runs` | `{ pace }` sim-s per wall-s, 0 = fast; max 3 active per user |
| GET | `/runs/:id` · `/metrics` · `/links` · `/intersections` · `/events` · `/playback` | playback is binary |
| POST | `/runs/:id/control` | `{ action: pause \| resume \| cancel }` |
| GET | `/runs/compare?baseline&variant` | metric deltas with verdicts, link/junction deltas, both time series |
| POST | `/projects/:id/reports` · GET `/reports/:id` · `/reports/:id/export.html` · DELETE | frozen snapshot |
| GET · POST | `/notifications` · `/notifications/read-all` · `/notifications/:id/read` | |
| GET | `/audit` | `audit:read` (admin) |
| GET | `/health` · `/health/live` | readiness checks DB + Redis |

## WebSocket (`/live`, Socket.IO)

Authenticate with the access cookie or `auth: { token }`. Then:

```ts
socket.emitWithAck('run:subscribe', { runId })   // → { ok: true } only with read access
socket.on('run:progress', { runId, t, duration, fraction, vehiclesInNetwork, completedTrips })
socket.on('run:sample',   { runId, sample })     // one per simulated minute
socket.on('run:event',    { runId, t, eventType, message, roadCode? })
socket.on('run:status',   { runId, status, error? })
socket.on('run:frame',    { runId, t, count, data: ArrayBuffer, congestion?: ArrayBuffer })  // volatile
socket.on('notification', notificationRow)        // user room
```

`data` packs `[vehicleId, linkIndex, positionDm, flags]` as `Uint32` per vehicle (flags bit 0 = queued, bits 1+ = lane). `congestion` is `Uint16 × 3` per link: occupancy, queue, congestion × 1000.
