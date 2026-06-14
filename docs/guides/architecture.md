# Architecture Guide

> Status: Current
> Last reviewed: 2026.06.08
> Source of truth for: persistence, auth, authorization, and write architecture

## Invariants

- Runtime data lives in PostgreSQL. Seed arrays are fixtures only, not runtime sources.
- Reads go through `src/server/repo/*`; writes go through server actions in `src/server/actions/*`.
- Server actions read identity from the verified session. Never trust a client-provided actor.
- Every write must enforce authorization server-side. Client UI gates are convenience only.
- Compliance-relevant audit text is composed on the server, not by the client.
- Values may be configurable; behavior and authorization primitives stay in code unless a decision explicitly says otherwise.
- Runtime external calls use shared retry/rate-limit helpers; do not hand-roll transient-error loops or unaudited throttles.

## Current Design

The app is a Next.js application in `apps/web-app` using Prisma 7 with PostgreSQL. The repo layer serializes database rows into the application aggregate used by React Server Components and client panels.

Canonical write loop:

```txt
server action -> requireActor/assert desk -> loadApplicationForWrite -> pure domain change -> saveApplication -> return fresh aggregate
```

Key files:

- `src/server/db.ts` — Prisma client and pool configuration.
- `src/server/repo/applications.ts` — read boundary for applications.
- `src/server/repo/write.ts` — transactional aggregate persistence and optimistic version guard.
- `src/server/actions/*` — intent-specific mutations.
- `src/server/auth/session.ts` — Firebase session verification and actor resolution.
- `src/lib/desks.ts` — fixed desk catalog and desk-to-pipeline-role mapping.
- `src/lib/auth/can.ts` — capability and participation checks.

## Auth And Authorization

Firebase Auth is used for Google login. The server verifies a session cookie and resolves an `Actor` with effective desks:

```txt
effective desks = desks from assigned roles + direct desk grants
superadmin = all desks unless impersonating
```

First Google login may auto-create a `User` with zero grants. Never assign default workflow access at signup; route them to awaiting-access until an admin grants desks.

Desks are fixed authorization primitives. Admin capability is also desk-based (`ADMIN-USERS`, `ADMIN-MASTER`, `ADMIN-POLICY`); these are non-stage desks and must not grant workflow participation.

Impersonation is superadmin-only. Audit real-user start/end, then let the effective actor drive workflow actions.

Pipeline role names (`AO`, `LG`, `RT`, `LA`, `CM`, `MG`) are not configurable roles. They are derived from desks for legacy workflow behavior and UI copy.

## Config Pattern

Business-tunable values use append-only version tables with effective dates. Seeded v1 rows preserve current behavior. High-stakes policy must be snapshotted at decision time where auditability matters.

Current examples:

- `SlaPolicyVersion` for stage SLA targets.
- `RiskPolicyVersion` for DSR/LTV/Kol hard gates.
- Committee rooms and disbursement conditions as versioned master data.

Read risk thresholds from `app.riskPolicy ?? DEFAULT_RISK_POLICY`; never hardcode 40/70/1 in runtime UI or logic.

## External Calls And Limits

Runtime Gemini, Google Docs, and Google Drive calls go through `withRetry()` from `src/server/retry.ts`; transient 408/429/5xx/network failures retry with backoff, client 4xx errors fail fast. AI/egress routes use `rateLimit()` from `src/server/rate-limit.ts`. The in-memory limiter is acceptable for the current single-host deployment; move to Valkey/Redis before multi-instance scale.

**Three separate Google credential systems — do not conflate.** (1) Google **Docs/Drive** uses an **OAuth refresh-token** client (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`, `src/server/google/auth.ts` → `docsClient()`/`driveClient()`). It is **runtime-critical** — per-app MUAP/RSK/MoM/SP3 generation, QR-stamping, PDF export, and read-back run through it across many API routes (`app/api/applications/[id]/docs/*`, `sync-v2`) and server actions (`approval`, `mom-sp3`, `ai-chat`). It is **not** script-only and **not** safe to remove, and a Service Account **cannot** replace it (SAs have zero Drive quota — tried + reverted; see `docs/designs/muap-template-engine-v2.md`). (2) **Gemini/Vertex** LLM auth is independent: `GEMINI_API_KEY` (AI Studio, takes precedence) **or** `VERTEX_CREDENTIALS`/`GOOGLE_CLOUD_PROJECT` (Vertex, SA-based). (3) **Firebase Auth** (`FIREBASE_SERVICE_ACCOUNT`) handles login. Switching the LLM to Vertex or clearing `GEMINI_API_KEY` does **not** touch Docs/Drive auth. Full external-service map: `docs/guides/layanan-eksternal.md`.

## Gotchas

- This project uses modified Next.js 16 behavior. Check `apps/web-app/AGENTS.md` before changing framework-sensitive code.
- `cookies()` is async.
- `proxy.ts` is optimistic only; real auth belongs in the session DAL.
- Do not use `useSearchParams` for detail-page `?view=` deep links.
- Restart the dev server after Prisma migrations.
- Production seeding is config-only. Demo data must not be loaded in production.

## Change Checklist

- Add or update server-side authz before UI gates.
- Keep repo serialization and write persistence in sync with schema changes.
- Add tests for pure compliance logic and transaction-sensitive writes.
- Run `pnpm typecheck`, `pnpm lint`, and the relevant tests before claiming done.
