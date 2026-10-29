# Deployment

## Public demo — GitHub Pages (free, deployed)

`.github/workflows/pages.yml` builds the static site on every push to `main` and deploys it with GitHub Pages. The site contains the landing page and the application in **demo mode**, where the engine runs in the visitor's browser (see [architecture → Demo mode](architecture.md#demo-mode-static-hosting)).

- It needs no secrets, server, database or paid service.
- The base path comes from `actions/configure-pages`, so the site works under `/<repo>/`.

## Full stack (not deployed)

The full stack (accounts, PostGIS, server-side queue) is not deployed. This is the recommended path and what it costs; confirm the costs before starting.

| Piece | Option | Notes |
|---|---|---|
| Web (Next.js) | Vercel (Hobby is free for personal, non-commercial use) | set `API_INTERNAL_URL`, `NEXT_PUBLIC_WS_URL` |
| API + worker | Render (web service + background worker) or Fly.io | each is a paid instance on Render's always-on plans; check current pricing |
| PostgreSQL + PostGIS | Render Postgres, Neon, Supabase | PostGIS must be available (`CREATE EXTENSION postgis`) |
| Redis | Render Key Value, Upstash | BullMQ needs a non-evicting Redis (`maxmemory-policy noeviction`) |

## Production checklist

- `NODE_ENV=production`, `COOKIE_SECURE=true` (the API refuses to boot otherwise), a fresh `JWT_ACCESS_SECRET` (≥ 32 chars).
- Serve web and API under one site (e.g. `madar.example` and `api.madar.example`) and set `COOKIE_DOMAIN=.madar.example` so the socket handshake receives the cookie; set `WEB_ORIGIN` to the web origin(s).
- Run `pnpm db:migrate` on release; seed only demo environments (`DEMO_PASSWORD` must not be a production credential). Consider `ALLOW_REGISTRATION=false`.
- Terminate TLS at the platform; the API trusts one proxy hop for client IPs (rate limiting, audit).
- Scale the worker horizontally (`WORKER_CONCURRENCY` per instance); for more than one API instance add `@socket.io/redis-adapter`.
- Health checks: `/api/health/live` (liveness), `/api/health` (readiness: DB + Redis).
- Logs are JSON (pino) with cookies and authorization headers redacted.

`infrastructure/docker-compose.yml --profile app` runs the whole stack in containers locally as a reference.
