# Multi-stage build for the MADAR monorepo (pnpm workspaces).
FROM node:22-bookworm-slim AS base
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build:packages && pnpm --filter @madar/api build && pnpm --filter @madar/worker build && pnpm --filter @madar/web build

FROM base AS api
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
# migrations run on start; they are idempotent
CMD ["sh", "-c", "node ../../packages/db/node_modules/.bin/tsx ../../packages/db/src/cli/migrate.ts && node dist/main.js"]

FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/workers/simulation
CMD ["node", "dist/main.js"]

FROM base AS web
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/web
CMD ["node", "../../node_modules/.pnpm/node_modules/next/dist/bin/next", "start", "-p", "3000"]
