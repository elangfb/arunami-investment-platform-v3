# syntax=docker/dockerfile:1
#
# Mizan production image (Tier 0.2, on-prem Docker). Multi-stage:
#   deps    → install workspace deps (cached on the lockfile)
#   builder → prisma generate + `next build` (output: 'standalone')
#   runner  → minimal Next standalone server (default target)
# The `builder` stage is reused as the one-shot DB migrator in compose
# (`prisma migrate deploy`) — it already has the CLI + engines + migrations.
#
# Prisma 7 here is Rust-free (query_compiler wasm + pg driver adapter) — the runtime
# needs NO native query engine. The schema engine (native) is only used by the
# migrator stage, not the app runtime.

ARG NODE_IMAGE=node:24-slim

# ─── deps ─────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
# node:slim already ships ca-certificates + openssl (node depends on them) — no apt needed.
RUN corepack enable
WORKDIR /app
# Only the manifests + lockfile, so this layer caches until deps change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web-app/package.json apps/web-app/
COPY apps/web-app-e2e/package.json apps/web-app-e2e/
# pnpm v11 gates dependency build scripts behind an approval list that isn't honored
# in a non-interactive BuildKit step (it hard-errors on "ignored builds"). Install with
# scripts off (no gate), then explicitly rebuild only the trusted packages that ship
# native binaries / postinstall steps we actually need.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm rebuild @parcel/watcher esbuild less msw nx sharp unrs-resolver @prisma/client @prisma/engines prisma

# ─── builder ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS builder
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 NX_DAEMON=false NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=4096
# Dummy URL so prisma.config.ts env() + the lazy db client never fail at build/generate.
# The client connects lazily (only on a real query) — nothing connects during `next build`.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# Stop pnpm's run/exec from auto-verifying deps (it would re-trigger the v11 ignored-builds gate).
ENV npm_config_verify_deps_before_run=false
# NEXT_PUBLIC_* are inlined into the browser bundle at BUILD time. The Firebase client SDK
# initialises at import and `/login` is prerendered, so these must be present during the build
# (passed as build args by compose.build.yaml / GHCR workflow from .env) or the build fails on /login.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
RUN corepack enable
WORKDIR /app
# Copy ALL of the deps stage (root + per-package node_modules — pnpm's workspace layout),
# then overlay the source (.dockerignore keeps host node_modules out, so this never clobbers).
COPY --from=deps /app ./
COPY . .
# Generate the Prisma client (query_compiler wasm) into node_modules before the build, so
# output-file-tracing picks it up. Invoke binaries directly (NOT pnpm exec/run) — deps were
# installed with --ignore-scripts, so any pnpm-triggered re-verify would re-hit the v11 gate.
RUN apps/web-app/node_modules/.bin/prisma generate
RUN node_modules/.bin/nx build web-app
# Output-file-tracing copies the generated Prisma client JS into .next/standalone but MISSES
# the dynamically-loaded query-compiler wasm. Copy it into the same .pnpm path in the bundle
# (globs resolve the version hash) and fail loudly if it isn't there.
RUN set -e; \
  src="$(ls node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/query_compiler_bg.wasm 2>/dev/null \
        || ls node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*.wasm | head -1)"; \
  dst="$(ls -d apps/web-app/.next/standalone/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client)"; \
  echo "copying $src -> $dst/"; cp "$src" "$dst/"; \
  test -f "$dst/$(basename "$src")"

# ─── runner ───────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# Standalone bundle (traced from the monorepo root → preserves the apps/web-app/ path).
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-app/.next/static ./apps/web-app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-app/public ./apps/web-app/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web-app/server.js"]
