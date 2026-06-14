<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

# Infra, Seed-data, Testing, Dev-env & Docs/Process — consolidated knowledge

---

## Infra, Seed-data, Testing, Dev-env & Docs/Process — consolidated knowledge

### 1. Deployment stack

**Runtime services (docker-compose.prod.yml, 5 services):**
- `postgres` — Postgres; pgsql container runs `network_mode: host` → binds port 5432 on the host network namespace; `lsof` won't show it (in-container process). Always reachable at `localhost:5432`.
- `migrate` — runs `prisma migrate deploy` then `pnpm seed:config` (factory-defaults idempotent seed). Wired in late batch-07 to ensure desk/role catalog exists in prod (prior versions ran migration only).
- `seaweedfs` — pinned at `4.28` (verified against Docker Hub; `3.97` was a placeholder). Dev creds `mizan`/`mizan-dev-secret`. Bind `127.0.0.1:8333` (internal only). Config: `~/.config/seaweedfs/s3.json` (personal, not in git). S3 vars in `.env.local`: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- `web` — Next.js standalone image. `CMD ["node", "apps/web-app/server.js"]`. Image ~288–292 MB.
- `caddy` — reverse proxy. Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. CSP deferred (needs human watching devtools for Google/Firebase origins).

**Docker build critical facts:**
- Multi-stage: `deps → builder → runner`.
- `output: 'standalone'` + `outputFileTracingRoot: repoRoot` (computed via `fileURLToPath`) — required for monorepo.
- **Prisma 7 is Rust-free** on this project — engine is `query_compiler_fast_bg.wasm` (+ `query_compiler_fast_bg.wasm-base64.js` companion). nft does NOT trace wasm into the standalone bundle automatically → Dockerfile must explicitly `COPY --from=builder /app/apps/web-app/.next/standalone/.pnpm/@prisma+client*/…/.prisma/client/query_compiler*.wasm`.
- `serverExternalPackages: ['@prisma/client', '@prisma/adapter-pg']` in `next.config.ts` (corrected from stale `@prisma/adapter-better-sqlite3` in early sessions).
- Dead deps removed: `better-sqlite3` + `@prisma/adapter-better-sqlite3` (slims image, drops native build).
- **pnpm v11 in Docker BuildKit** `ERR_PNPM_IGNORED_BUILDS` is fatal in non-TTY even with `onlyBuiltDependencies` in `pnpm-workspace.yaml`. Workaround: `pnpm install --ignore-scripts && pnpm rebuild @parcel/watcher esbuild less msw nx sharp unrs-resolver @prisma/client @prisma/engines prisma`. Also set `npm_config_verify_deps_before_run=false` to prevent `pnpm exec` re-triggering install.
- **`NEXT_PUBLIC_*` baked at build time** — Firebase client config must reach the `builder` stage as `ARG`/`ENV` Docker build args. Runtime `env_file` injection comes too late.
- **Firebase admin SDK must be lazy-init** — `getAdminAuth()` accessor pattern (not `export const adminAuth = initializeApp(...)` at module level); eager init throws `FIREBASE_SERVICE_ACCOUNT is not set` during `next build` page-data collection. Mirrors `s3()`/`prisma` lazy singleton patterns.
- **`--network=host`** needed for `docker build` in this environment (Docker daemon's build network has no egress by default).

**Scripts:**
- `scripts/deploy-ghcr.sh` — push to GHCR.
- `scripts/install-autodeploy.sh` — installs autodeploy hooks.
- `scripts/backup.sh` — `pg_dump` + SeaweedFS volume archive.
- `scripts/restore.sh` — restore backup.
- Schedule/destination for backups = ops decision; scripts shipped but not configured.

**CI:**
- `.github/workflows/ci.yml` — three jobs: `verify` (typecheck+lint+unit), `integration` (Postgres+SeaweedFS service containers + itests), `image` (Docker build verify).
- **Inactive until git remote is configured** — no remote as of batch-06/07. SeaweedFS started as a step (not a service container) before the integration job.
- Eval tests run as part of the `verify` CI job (not a separate job).

**Object storage:**
- SeaweedFS chosen over MinIO (archived 2026-04-25; Docker images stopped Oct 2025), RustFS (pre-GA, no WORM, distributed mode untested), Garage (AGPLv3 friction + no WORM), Ceph (ops-heavy).
- No presigned URLs — proxy-only pattern: browser → FormData server action → `storeDocumentFile()` → SeaweedFS. Download via authenticated proxy `GET /api/applications/[id]/documents/[docId]/file`. Rationale: presigned = bearer token, bypasses desk gate, hard to revoke; S3 binds to `127.0.0.1` (internal only).
- SHA-256 computed app-side on upload; stored in `ApplicationDocument.sha256`.
- Storage-level WORM deferred pending compliance ruling. Hash+access-control+backups is the current tamper-evidence model.
- `file-type@22` library for MIME validation (derives true MIME from bytes; not declared `file.type`). `ALLOWED_DOC_TYPES` = pdf/jpeg/png/webp/tiff. `MAX_DOC_BYTES = 10MB`.
- `bodySizeLimit: '12mb'` in `next.config.ts` `experimental.serverActions` for KYC doc uploads.

**Health probe:** `GET /api/health` — `force-dynamic`, calls `db.$queryRaw(SELECT 1)`, returns `{"status":"ok","db":true}`. Wired to `web` service healthcheck in `docker-compose.prod.yml`.

**Rate limiting:** in-memory fixed-window (`server/rate-limit.ts`), Valkey-ready interface (`rateLimit(key, limit, windowMs)`). AI route: 20/min; analysis route: 10/min. Single-instance on-prem choice (user explicitly chose in-memory over Valkey). Lazy sweep of expired buckets prevents unbounded Map growth.

**Structured logging:** zero-dependency JSON logger (`server/log.ts`). Level gating, child bindings, stderr for error/warn, stdout for info/debug. Never PII in log calls. Error responses return generic Bahasa, never echo `error.message`/stack/input to client.

**Exponential backoff:** `withRetry()` helper in `server/retry.ts` applied to all Gemini + Google Docs/Drive runtime calls. Not applied to ops-only tokenizer scripts.

---

### 2. Seed data

**Directory rename:** `src/lib/data` → `src/lib/seed-data` (session S4, 2026-06-05, commits `5ac4de3` rename + `3015f4b` flow refresh). "data" was too generic; `seed-data` signals dev-only fixture intent and stays orthogonal to `prisma/seed*.ts` seeding scripts.

**File layout of `src/lib/seed-data/` (5 files):**
- `applications.ts` (~110 KB) — exports `APPLICATIONS`: 37 demo apps `FOS-2026-001…037` across 6 stages + the **flow-artifact post-processor** (appended, derives MUAP/RSK ladders, AML, SLIK handoff, risk reco, and MoM from each app's `stage` + `komiteDecision` — no per-literal edits to 37 apps).
- `users.ts` — exports `USERS`, `getUserById`: 8 core pipeline actors (Siti/RM `u-001`, Budi/LA `u-002`, Ahmad/RA `u-003`, committee `u-004/u-007/u-008`, Laila/LG `u-006`, Hendra/MG).
- `demo-logins.ts` — 17-persona impersonation roster; SSOT for emulator + dev login (`pnpm seed:emu`).
- `meetings.ts` — exports `MEETINGS`: 3 Rapat Komite sessions (2 upcoming + 1 completed/signed as `MTG-2026-003`).
- `index.ts` — barrel re-exporting `USERS`/`APPLICATIONS`/`MEETINGS`.

**This dir is dev-only fixtures.** Runtime data path is `server/repo/*` against DB. Types live in `src/lib/types.ts`. Prod never touches `seed-dummy`.

**Prisma seed split (batch-07, enforced):**
- `prisma/seed-config.ts` — factory defaults: desks, roles, SLA v1, RiskPolicy v1, CommitteeRooms v1, DisbursementConditions v1. Idempotent, safe on every deploy. Run in prod via `pnpm seed:config`.
- `prisma/seed-dummy.ts` — users, FOS applications, meetings. Guard: `NODE_ENV === 'production'` refuses to run.
- `prisma/seed.ts` — orchestrator for dev: runs config + dummy. Run via `pnpm seed`.
- `prisma/seed-extra.ts` — legacy non-destructive scoped inserts for specific apps (minimal scope); was updated to drop dropped columns alongside schema changes.

**Seed-config wired to Docker prod:** `migrate` service runs `seed:config` after `prisma migrate deploy` (wired batch-07; prior versions ran migration-only, leaving prod with no desk/role catalog).

**Seed is upsert-safe (idempotent):** `pnpm seed` may report more than 37 applications if prior rows exist; not a bug.

**Post-processor in `applications.ts`:** derives flow artifacts (approval ladders, AML attestation, SLIK handoff, komite outcome, MoM signatures) from each app's stage + komiteDecision. Original 37-app skeleton augmented, not rebuilt from scratch (preserves FOS-035/036/037 state-coverage seeds and cross-references).

**`ApprovalStepRecord` shape** (append-only ledger; rides on `approvalSteps` relation):
- Fields: `chain` / `role` / `action` / `userId` / `userName` / `reason` / `qrToken` / `createdAt`.
- Complete MUAP: `[{chain:'muap', role:'muap-author', action:'request'}, {role:'muap-approve-tl', action:'approve'}, {role:'muap-approve-bm', action:'approve'}]`.
- Complete RSK: `[{chain:'rsk', role:'rsk-author', action:'request'}, {role:'rsk-approve-officer'}, {role:'rsk-approve-cro'}, {role:'rsk-sign-dps'}]`.
- MoM signatures: same `approvalSteps` array, `{chain:'mom', role:'komite-signer', action:'approve', qrToken}`.

**`rskCroSignerUserId`** is runtime-derived from `approvalSteps` via `rskCroSignerUserId(steps)` — NOT a Prisma-writable field. Do not map it in seed.

**Seed persona IDs for ladder checkers:** `u-demo-tl` (Teguh TL), `u-demo-bm` (Bambang BM), `u-demo-ro` (Ratna RO), `u-demo-cro` (Cahyo CRO), `u-demo-dps` (Hasan DPS). Every persona has at least one pending approval in seeded data.

**DB-verified counts (post session-S4 flow-refresh seed):**
- `ApprovalStep` rows: 190 total (39 mom / 73 muap / 78 rsk)
- Unique `qrToken`s: 141 (unique constraint enforced)
- AML attestation: 34 (all apps past stage-1)
- SLIK dual handoff: 28
- Decided/closed: 13
- Completed meeting with minutes: 1 (MTG-2026-003)
- Stage distribution (unchanged): 5/6/5/6/4/11

**Emulator:** `.emulator-data/auth_export/accounts.json` — gitignored, local-only. Final state: 18 accounts (luthfi.noeffort@gmail.com + 17 roster). Regenerated via `pnpm seed:emu` tooling, not manual transcription. **Important:** Firebase emulator globs the entire export directory — placing `.bak` files alongside `accounts.json` causes re-import on startup; move backup files completely out.

**`komiteVotes` must be empty** in all seed data (ADR-0005 removed in-app voting; correct model = chair records outcome + QR-signed MoM via `approvalSteps chain:'mom'`). Old `vote009` fixture removed in session-S4.

**`DecisionCheckpoint` freeze rows not seeded** — require Google Doc IDs and exact action strings. Explicitly deferred. Authoritative ladder/MoM record lives in `approvalSteps`.

**FOS-010 special case:** has `riskRecommendation: 'reject'` in the base literal → post-processor must check for pre-existing reject and skip building the RSK ladder for that app.

**`prisma/seed-dummy.ts` is in the typecheck scope** (`**/*.ts` under apps/web-app) — Prisma input types are statically validated by `pnpm typecheck`.

---

### 3. Testing

**Three test tiers:**

| Tier | Files | DB | Command |
|---|---|---|---|
| Unit | `*.test.ts` | None (hermetic) | `pnpm test:unit` |
| Integration | `*.itest.ts` | `mizan_test` | `pnpm test:integration` |
| E2E | `apps/web-app-e2e/features/*.feature` | `mizan_e2e` | `pnpm test:e2e` |

**Unit test infrastructure:**
- `apps/web-app/tsconfig.test.json` — extends app tsconfig, stubs `server-only`/`client-only` → empty exports, resolves `@/*` aliases. This unlocks testing `@/`-importing modules under tsx CLI.
- `TSX_TSCONFIG_PATH=apps/web-app/tsconfig.test.json` in `test:unit` script.
- `apps/web-app/src/__mocks__/server-only.ts` — empty export stub.
- `can.ts` (auth/permissions) must use relative imports, not `@/` aliases — `@/` resolves in Next but fails for tsx test runner.

**Server-only not hermetically testable:** Server actions import `server-only`, which tsx cannot resolve. Test DB round-trips via repo functions in `write.itest.ts` against `mizan_test` DB instead. Playwright covers the full auth/impersonation E2E path (automated Google login is not possible; only superadmin impersonation works in e2e).

**`DOCS_PROVIDER` stub:** session S2 gotcha: `DOCS_PROVIDER` env var is not set in `pnpm test:integration`. Stub-based itests that touch document generation paths must set `process.env.DOCS_PROVIDER = 'stub'` themselves.

**Integration test DB (`mizan_test`):**
- `scripts/test-integration.sh` sources `.env.local` for S3+DB creds; hard-refuses any DB name not matching `*_test` pattern (safety guard).
- `mizan_test` needs migrations applied whenever schema changes: `prisma migrate deploy --schema ... DATABASE_URL=...mizan_test`.
- S3 round-trip integration test: `documents.itest.ts` (real SeaweedFS + Postgres; skip-if-unreachable).

**E2E test infrastructure:**
- Feature files at `apps/web-app-e2e/features/`: `maker-checker-ladder`, `mom-signing`, `conditional-outcome`, `create-application`, `detail-action-band`, `auth-smoke`.
- Auth via `signInAs(persona)` → POST `/api/test-fixture/login` (guarded by `E2E_MODE=1` AND `DATABASE_URL` contains `mizan_e2e`). No Google popup.
- Fixtures: `applicationAt(stage)` spawns clean app at any stage; `meetingFor()` builds committee meeting.
- Selector strategy: `getByRole`/`getByText`/`getByPlaceholder` (semantic). NOT `data-testid`.
- Dev server port `:3000` (dev), e2e target `:4200`. **Must kill dev server before `pnpm test:e2e`** — nx `dev` target lock conflict.
- `E2E_KEEP_RUNNING=1` keeps `:4200` stack alive; if emulator on `:9099` dies, re-run full `pnpm test:e2e` to respawn it.
- **Mobile dual-render:** `hidden md:block` table + `md:hidden` card reflow puts nasabah name in DOM twice. Playwright `getByText` resolves to 2 elements in strict mode → use `.first()`.

**Test count evolution (final states per era):**
- CC era batch-06: 87 unit + 2 integration
- CC era batch-07: 212 unit + 21 eval (all green)
- CC era batch-09: 172 unit
- Session S1 (2026-06-03): 292 unit + 21 itests
- Session S2 (2026-06-04): 316+ unit + 17 integration + 22/22 e2e
- Session S3 (2026-06-04): 32 masking unit (standalone pass)
- Session S4 (2026-06-05): 367/367 unit (after seed rename)
- Session S5 (2026-06-06): ~340–342 unit + 37–42 integration + 21 e2e
- Session S6 / batch-23 (2026-06-08): 373/373 unit (final, post-V3 cleanup)

**Firebase emulator not viable in build/Docker environment** — no firebase-tools, no JAR network access during image build. E2e uses firebase emulator on the dev machine only.

---

### 4. Dev-env

**tmux sessions:**
- Dev server MUST run in `tmux mizan-756c:1` (confirmed name; `tt name` was flaky, returned `web-app-66ac` at times — always use `mizan-756c` directly).
- `scripts/emulator.sh` — starts Firebase emulator for auth.

**`pnpm dev` script:**
- `pnpm clean:dev && NX_DAEMON=false nx dev web-app --no-tui`
- `clean:dev` removes `.next`, `node_modules/.cache`, `.nx/cache` — prevents Turbopack recompile-thrash spike after migrations/dep changes.
- `NX_DAEMON=false` scoped to dev only (daemon speedup preserved for lint/typecheck/build). If put in `.env` at workspace root, daemon is disabled globally — wrong.

**Restart-after-env-change mandatory cases:**
1. After any `.env.local` change — `NEXT_PUBLIC_*` compiled at startup.
2. After any Prisma migration — `prisma generate` must be explicit + dev server hard-restart. HMR does NOT refresh the Prisma client in-process. Symptom of stale client: `Cannot read properties of undefined (reading 'findMany')`.
3. After any dep change that affects Prisma — changing deps can change the `@prisma/client` pnpm hash and orphan the generated client.
4. After `clean:dev` if server was running — state is gone.

**Kill pattern:** `pkill -f 'next[.-]server'` (bracket trick to avoid self-match). Plain `pkill -f 'next'` matches the shell command line itself.

**Btrfs `.next` nocompress:** `chattr +m apps/web-app/.next` (after `rm -rf .next && mkdir .next`) — prevents "Slow filesystem detected" Next.js warning. Applied to all 15 Next.js apps under `~/code/`.

**DNS fix (Firebase auth 49s hang):** Symptom: `POST /api/auth/session 401 in 49s`. Root cause: ISP IPv4 nameservers dead-first in `/etc/resolv.conf`, uniform ~8s per lookup. Fix: systemd-resolved + DNS-over-TLS via Cloudflare (`1.1.1.1#cloudflare-dns.com`).

**nx daemon hot-loops (240% idle CPU):** caused by `NX_NATIVE_LOGGING=nx=debug` + `NX_PROJECT_GLOB_CACHE=false` in pane shell environment. Fix: unset those vars in the pane + `nx reset` + restart. They survive `nx reset` because they're live shell vars.

**`walkthrough.sh`:** headed human demo script (`scripts/walkthrough.sh`). Encodes exact live workarounds (native-click for Google login popup, F3 autofill-pill overlap, F4 inner-scroll container). Gates each step on Y/Enter confirm. Purpose: narrated demo, NOT CI regression. Distinct from headless `apps/web-app-e2e/` Playwright+Cucumber suite.

**`agent-browser` quirks (documented in session-S4):**
- `eval` VM is persistent — top-level `const` collides across calls; wrap bodies in IIFE.
- `click` accepts plain CSS / XPath / `@eN` snapshot refs; NOT `text/`, `aria/`, `xpath/` prefixed forms.
- `signInWithPopup` requires trusted gesture via CDP click; `el.click()` native is popup-blocked.
- Popup tab id varies — `ab` auto-focuses the popup; do not hardcode tab id.
- Scroll container: dossier detail page scrolls inner `<main>`, not the window.

**`SUPERADMIN_EMAILS`:** `mlsk3446@gmail.com` (single email; `[EMAIL REDACTED]` fully purged in batch-13). No filesystem paths — base64/inline only for serverless.

---

### 5. Realtime notifications

**Final decision (established before OMP era, confirmed 2026-06-03):**
- **SSE + Postgres `LISTEN/NOTIFY` chosen** — documented in `docs/planning/realtime-notifications-sse.md` (later promoted to references).
- **Firebase RTDB explicitly rejected** — egress/compliance; on-prem posture.
- **Centrifugo superseded** — was suggested as an option in session 019e8ce1 but immediately overridden by the pre-existing SSE+LISTEN/NOTIFY decision.
- **V1 = polling** — `Decision.effects: Notify` produces a poll-able record. SSE is the V2 implementation.

**Current state:** SSE deferred. Notification records derived from polling. MentionUser notification model (session-S5/batch-22) uses derive-from-`ConversationMessage` with read-state; full SSE/push is the SSE subsystem deferred item. Unread badge wired to polling.

---

### 6. Google OAuth (runtime-critical, not script-only)

**Confirmed in session S3 (2026-06-04):** `getOAuthClient()` is used runtime-critical across ALL document generation and QR routes/actions: `docs/create`, `docs/freeze`, `docs/checkpoint`, `docs/extract`, `sync-v2`, `ai` route, `approval` (QR-stamp), `mom-sp3`, `ai-chat`. Not removable.

**Cannot be replaced by Service Account** — SA has zero Drive storage quota → `files.copy` returns `403 The user's Drive storage quota has been exceeded`. This was tried (mid-session batch-13) and immediately reverted. Final state: dedicated Mizan Google account with OAuth scopes `documents` + `drive`.

**Three separate Google credential systems (architecture.md):**
1. **Docs/Drive:** OAuth refresh token (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN`) — runtime-critical, NOT script-only.
2. **LLM:** `GEMINI_API_KEY` (AI Studio) OR `VERTEX_CREDENTIALS` + `GOOGLE_CLOUD_PROJECT` (Vertex). `GEMINI_API_KEY` takes precedence over Vertex when both set.
3. **Firebase Auth:** `FIREBASE_SERVICE_ACCOUNT` (base64-encoded JSON, no file paths).

**Clearing `GEMINI_API_KEY` / switching to Vertex has zero effect on Docs auth** — they are independent credential paths.

**Vertex status (as of session S3):** `aiplatform.googleapis.com` disabled on `hijra-mizan` project (403). App runs on AI Studio (`GEMINI_API_KEY`). SA `mizan-vertex@hijra-mizan.iam.gserviceaccount.com` created with `roles/aiplatform.user`; key at `/tmp/vertex-sa.json` (local only). Vertex credential fallback chain wired: `VERTEX_CREDENTIALS` (base64) → `FIREBASE_SERVICE_ACCOUNT` → ADC.

**`GOOGLE_MASTER_MUAP_V2_DOC_ID` and `_RSK_V2_DOC_ID`** are vestigial — only referenced in two one-time setup scripts (`scripts/setup-v2-named-ranges.ts`, `scripts/write-v2-tokens.ts`). Runtime `masterIds()` reads `GOOGLE_MASTER_MUAP_DOC_ID` (non-V2 key). Both vars currently point to the same doc in `.env.local`.

---

### 7. Brainstorm→mizan merge/reconcile process

**Context:** `hijra-mizan/brainstorm` was the design-predecessor repo where the workflow model, role model, committee mechanics, and document system were first invented. Sessions from May 14 – Jun 2 were the "BRAINSTORM era"; June 3+ is the OMP era where merge happened.

**Merge event (session 019e8ce1, 2026-06-03):** Route+reconcile, not bulk-copy. 26 docs imported:
- 13 → `docs/references/`
- 4 → `docs/designs/` (incl. `pii-masking.md`, `admin-config-layer.md`)
- 2 reconciled into existing layers (GLOSSARY.md + `guides/workflow.md`)
- `sources/` → `references/sources/` (read-only)
- Excluded: `WORKING-AGREEMENT`, `JOINT-PROTOCOL`, `AGENTS`, `README`, `CLAUDE`, `CONTACTS` (PII), `TIMELINE` (commercial). `SCOPE.md` = scope-of-work only (payment/warranty stripped).

**Recency-aware authority rule (per-topic-by-date):**
- Rule: authority per-topic determined by git date × nature: **built behavior → live (mizan) repo is reality; unbuilt design → newest commit wins.**
- Mizan last reconciled brainstorm 2026-06-01; brainstorm kept committing design-ahead decisions through 2026-06-03 12:07.
- Winners by topic:
  - AML attest, Gemini provider/region, Pefindo, G3/G4, cost, 5-vs-6-stage, AO/LG/LA-vs-RM naming → **mizan (built, 06-03)**
  - DPS model (always signs RSK per-deal), maker-checker shape, SP3→Akad chain, Bersyarat-informal → **brainstorm (06-03 newer commits)**

**Gate-open decision (2026-06-03):** 6→4 restructure (RM-led + maker-checker) was GATED pending Discovery W1. User explicitly overrode: *"buka gate"* — confirmed go-forward. Agent recorded dissent once (brainstorm caveat "ratify at W1"), then honored override.

**JOINT-PROTOCOL evolution:**
- v1 (11 points) → v2 (13 points); brainstorm era sessions 2fd02be3/26f492e9/d6396b01.
- v2 core principle: "communicate by exception." 4 send-triggers only: (1) shared-contract change + design-before-build trigger, (2) correction, (3) HITL escalation, (4) reply-that-unblocks.
- DO NOT send: commit hashes, "here's what I shipped", routine status, bare acks.
- `JOINT-PROTOCOL.md` must be byte-identical in both repos. Version token: `SHARED CONTRACT v2 (2026-05-24)`.
- `WORKING-AGREEMENT.md` (mizan-local) `@`-imports the shared protocol.
- Brainstorm repo (`../brainstorm/`) left untouched pending user review as of session-S2 end.

---

### 8. Docs/knowledge-layer conventions

**8-layer project-context model** (established sessions a3cfd9ff/dd1e7802, 2026-05-30..31):
1. **Glossary** — `docs/GLOSSARY.md` (capitalized; renamed from glossary.md in dd1e7802; 4 path refs updated)
2. **Decisions** — `docs/decisions/NNNN-short-title.md` (4-digit zero-padded ADRs)
3. **Designs/Map** — `docs/designs/` (`short-title.md`; shape: Overview / Design / Conventions & invariants / Open questions)
4. **Planning/In-flight** — `docs/planning/` (active plans; retire-on-ship; completed plans → delete/promote)
5. **References** — `docs/references/` (`short-title.md`; living registers + source-of-record)
6. **Sessions** — `docs/sessions/YYYY.MM.DD-slug/README.md` + sibling narratives (backward: what happened)
7. **Handoffs** — `docs/handoffs/YYYY.MM.DD-slug/README.md` (forward: continuation baton)
8. **Memory** — `docs/MEMORY.md` (slim single-file; one-liner per entry OR intentionally empty)

**Retire-on-ship lifecycle:**
- Completed plan still in `planning/` is a "visible bug."
- Three terminal states: (a) distill→delete, (b) promote to durable doc (designs/references), (c) abandon → delete + one-line "why-not" in memory/ADR.
- No `archive/` folder ever; git is the archive.

**Memory admission gate:** "no other layer owns it." Pointer-to-another-layer fails the gate. Intentionally empty is valid.

**Template naming:** `docs/<layer>/_templates/[pattern].md` (not single `_template.md`). Filename encodes the naming pattern for that layer. Seven old `_template.md` files replaced by `_templates/[pattern].md` in dd1e7802.

**CURRENT-STATE:** `docs/CURRENT-STATE.md` = live "what's true/built right now" snapshot, link-first (not a duplicate of memory). Session dd1e7802.

**External memory:** `~/.claude/projects/.../memory/MEMORY.md` is now a bootstrap redirect pointing to `docs/MEMORY.md`. Content-empty. In-repo memory is canonical.

**Symlinks (verified):**
- `apps/web-app/CLAUDE.md → apps/web-app/AGENTS.md` — editing `CLAUDE.md` directly fails ("Refusing to write through symlink"); edit the real target.
- `apps/web-app/.claude/skills/ → .agents/skills/` — real files in `.agents/`, symlink in `.claude/`.
- `guides/core-workflow.md → alur-kerja-inti.md`
- `guides/external-services.md → layanan-eksternal.md`

**`docs/references/sources/`:** 11 artifacts + provenance README (read-only; original source documents from Hijra).

**Adaptive-learning mandate (established batch-05):** After any non-trivial change/decision/bug/pattern/gotcha, update AGENTS.md + relevant skill + docs + MEMORY in the same batch, before "done."

**Authority hierarchy for documentation:** `workflow-target.md` (model) → `alur-kerja-inti.md` (Bahasa rendering) + `workflow-rm-maker-checker.md` (build-execution only). SSOT principle: value routes to layers first; session/handoff narrates/passes baton.

---

### 9. Scope V1/V2 boundaries

**V1 scope (`docs/references/scope-v1.md`):**
- 6-stage pipeline end-to-end (Pengajuan → Legal&SLIK → Analisa Kelayakan → Kajian Risiko → Komite → Pencairan → Portfolio)
- MUAP/RSK via Google Docs, Firebase Auth, PostgreSQL, SeaweedFS
- OCR (Document AI stubs in dev, `documentai` provider in prod)
- Polling notifications (SSE deferred)
- BWMP: all deals to Komite (no tiering)
- AML attestation (RM checkbox, server-enforced gate)
- QR signing (internal Mizan QR, not external e-sign service)
- Read-only portfolio monitoring
- Admin config layer: `ADMIN-USERS` / `ADMIN-MASTER` / `ADMIN-POLICY` desks
- No maker-checker for admin (single-actor + audit)

**V2 scope (deferred):**
- BWMP tiering (small-plafond apps skip Komite)
- SSE real-time notifications
- SLA escalation command
- Compliance Sharia review desk full flow
- Core-banking API integration / SLIK API / WhatsApp Business API
- AI inference in-region (§27(5), by 17 Dec 2026) — **deferred**; Bedrock Nova plan dropped 2026-06-03, V1 on Vertex/GCP under the §56(b) DPA; Bank decides posture (Nova Jakarta / self-host / accept-Singapore). See `../compliance.md`.
- NER + G2 pre-flight PII kill-switch bundle (explicitly bundled as one future package)
- `conditionalFlavor: 'terms' | 'documents'` on Komite decisions
- Self-host LLM (Qwen/Sahabat-AI on vLLM) after benchmark
- `komiteDecisionNote` server-side enforcement for conditional (currently stored if present, not required)

**Stage model:** 6 stages canonical (NOT 4). The "4-phase" model (`phaseOf(stage)`: 1/2/3→1, 4→2, 5→3, 6→4) exists as a derived presentation layer in `phaseOf()`/`Phase`/`PHASE_NAMES`. Engine 6→4 renumber deferred: ~158 `.stage===N` comparisons, high blast radius on authz surface, organizational gain only. Explicitly deferred in `docs/planning/workflow-rm-maker-checker.md`.

---

### 10. Launch gates

**From `docs/guides/launch-gates.md` (confirmed in compliance.md):**

| Gate | Status | Owner |
|---|---|---|
| G1: Masking operational (bracket+regex) | ✅ DONE | Built |
| G2: Pre-flight PII scan / NER kill-switch | ⚠️ NOT built | Accepted residual risk; bundled future package |
| G3: Masked prompt+response audit all AI paths | ⚠️ PARTIAL | Chat via `AiInteraction`; narrative path fixed session-S1; research path fixed session-S3 |
| G4: LLM behind provider interface (`INFERENCE_PROVIDER`) | ⚠️ PARTIAL | OCR provider-abstracted; inference seam built; production Nova switch pending |
| G5: DPA signed with AI/OCR providers | ❌ OPEN | Bank Legal blocker; Discovery W1; production AI blocked |

**Additional go-live requirements:**
- W6–W8: pentest → UAT → training (not started)
- OJK offshore-processing permit (POJK 11/2022 Art. 35 = prior `izin`, ~3-month decision window, NOT just notification)
- DPIA + vendor DPAs (Gemini, Doc AI, Drive, Docs, Nova) + DPS opinion
- In-region AI inference deadline: 17 Dec 2026 (POJK §27(5))
- Bank egress ruling (confirmed on-prem + internet allowed as of batch-08)

**PII fail-open/fail-closed toggle (session S3):** `PII_RESIDUAL_BLOCK` env var. Unset (default) → fail-open: log warning, proceed. `=1` → fail-closed. `.env.production.example` sets `PII_RESIDUAL_BLOCK=1`. Demo must not be blocked by detection misfires — fail-open default.

**`aiplatform.googleapis.com` not yet enabled on `hijra-mizan`** (403 as of session S3, 2026-06-04). App runs on AI Studio.

---

### 11. W1 config-ratification (JOINT-PROTOCOL)

**`docs/references/config-ratification-w1.md`** — canonical register of all values requiring W1 Hijra Discovery ratification.

**W1-gated config values (all blocking config, NOT engine blockers):**
- DSR/LTV/Kol hard-gate thresholds (currently: DSR > 40%, LTV > 70%, Kol > 1; NoEffort defaults)
- BWMP table (tiering by plafond)
- Komite composition, quorum, voting rules, Pedoman Komite Hijra
- Akad parameters (rate tables, margin rules, nisbah conventions)
- DPS review scope (full RSK review vs Syariah aspects only)
- SLA targets per stage/desk and SLA clock-start definition
- SLA escalation targets
- Komite meeting cadence (Mon/Wed/Fri confirmed by Bank SOP; H+1 MoM confirmed)
- Per-desk SLA targets for `deskTargets` column in `SlaPolicyVersion`
- Jakarta public holiday calendar (`isJakartaHoliday` always returns false; W1-stub)
- Required-doc checklist rules (all currently NoEffort-proposed defaults)
- Komite min-attendees config default (currently 2)

**JOINT-PROTOCOL constraint on W1 items:** Do NOT build until ratified. Any W1-gated item built ahead of ratification must use additive stubs with W1-hook placeholders for values (empty defaults reproduce today's behavior until W1 wires values).

**Source hierarchy (established brainstorm era, batch-17):** Manifesto verbatim > Bank RBAC/SOP slides (🏦) > NoEffort-proposed (📝) > FOS mockup (exploratory) > inference. Hijra SOP slides (5 sheets) confirmed in session 019e8ce1 as the highest-fidelity structural source. HOWEVER: slides = happy-path only. All rejection/send-back/terminal paths in docs = our inference (not slide-anchored), confirmed by user as domain knowledge.

---

## Infra, Seed-data, Testing, Dev-env & Docs/Process — contradictions, reversals & evolution

### Storage backend evolution
- **EARLY (batch-00/brainstorm):** In-memory `APPLICATIONS[]` array as running data store; hard-refresh resets everything.
- **INTERMEDIATE (batch-02/03):** SQLite + Prisma 7 for dev, same schema promotable to Postgres.
- **FINAL (batch-04 dea1c87f):** PostgreSQL everywhere. `better-sqlite3` + `@prisma/adapter-better-sqlite3` removed as dead deps in batch-06. DB name `mizan`. Any session before batch-04 describing in-memory store behavior or SQLite as "current" is stale. RESOLVED.

### Seed destructive vs idempotent
- **EARLY:** `prisma/seed.ts` was a destructive global `deleteMany` + recreate.
- **FINAL (batch-06, commit `2a7e712`):** Idempotent upsert-by-key pattern. Any session before batch-06 referencing seed as "destructive" is describing pre-batch-06 state. `docs/prototype-to-production-handoff.md` still mentions destructive seed — left as point-in-time record. RESOLVED.

### `src/lib/data` vs `src/lib/seed-data`
- **EARLY:** All sessions through batch-22 reference `src/lib/data` as the fixture directory.
- **FINAL (session-S4, 2026-06-05):** Renamed to `src/lib/seed-data`. Any doc/memory still referencing `src/lib/data` is stale post-session-S4. RESOLVED.

### Prisma schema `prisma.config.ts` vs inline `url` in schema
- **EARLY:** Standard `datasource db { url = env("DATABASE_URL") }` in `schema.prisma`.
- **FINAL (batch-02/03 onwards):** Prisma 7 moved `url` out of schema.prisma into `prisma.config.ts` with driver adapter (`@prisma/adapter-pg`). RESOLVED.

### Document storage: Postgres bytes vs SeaweedFS
- **EARLY (batch-03 DecisionCheckpoint):** Frozen MUAP/RSK PDFs stored as `Bytes` columns in `DecisionCheckpoint.muapPdf`/`rskPdf` in Postgres.
- **FINAL (batch-15, session 8fc2db20, Batch D):** Frozen PDFs moved to SeaweedFS (`muapStorageKey`/`rskStorageKey` + sha256 + size). Backward-compat read-fallback to old Bytes cols for existing checkpoints. Prior widespread assumption ("MUAP/RSK stored in Drive") was incorrect — they were in Postgres, not Drive. Drive is the live authoring surface only. RESOLVED.

### `aiChatHistory` / `aiAssistantLog` JSON columns vs `ConversationMessage` table
- **EARLY (through batch-07):** `Application.aiChatHistory` + `aiAssistantLog` as JSON columns.
- **FINAL (batch-08, session ea2c2632, commit efd860b):** Migrated to `ConversationMessage` table with `surface` discriminator. Any session before batch-08 referencing these JSON columns as the storage mechanism is superseded. RESOLVED.

### Document generation: V1 → V2 → V3
- **V1:** `buildFactMap` + `seedApplicationDoc` filling `f_*`/`m_*` NamedRanges (~15 tokens). Live until session-S6.
- **V2 (batch-11..14):** 644-token NamedRange registry (`seedApplicationDocV2`). Built in batch-13 (session 94a3fa86) but **never wired into `createApplicationDocs`**. `seed-v2.ts` had exactly one commit and was never imported. Masters were migrated to `{{token}}` literals on 05-28 while creation stayed V1 → every `{{plafond}}` etc. survived unfilled. `CURRENT-STATE.md` and planning docs overstated completion based on a manual OAuth throwaway test.
- **V3 (session-S6/batch-23, ADR-0013):** `[Unique bracketed labels]` + `replaceAllText`, NamedRange only for QR/signature image anchors. ~38–44 text vars. V1 code deleted (`buildFactMap`, fallback narratives, V1 `seedApplicationDoc`, `seed-v2.ts`, `templates/fill.ts`+test, `verify-seed-e2e`/`inventory-master-tokens` scripts). `seed.ts` is now the single fill module. RESOLVED.
- **[VERIFY-DOC]** Design docs (`document-system.md`, v2 tokenization docs) were bannered "superseded" pointing to ADR-0013. Any reference to V2 fill being "active/shipped" is stale.

### `histories`/`komiteVotes`/`stageAssignments` deleteMany+recreate bug
- **EARLY (through session-S2):** `saveApplication` (`write.ts:65-68`) did `deleteMany` + recreate for `historyEntry`, `stageAssignment`, `komiteVote`, `applicationDocument` on every save. "Append-only" was only a domain-layer convention, not storage-enforced.
- **FINAL (session-S2, batch-20):** Fixed for `historyEntry` (insert-only delta). RESOLVED for history; `StageAssignment.status`/`submittedAt` remain mutable (confirmed: not append-only; plan incorrectly called this "append-only precedent").

### `komiteVotes` in seed data (ADR-0005)
- **EARLY (through session-S3/S4):** Seed data had `vote009` with `KomiteVote` entries for FOS-009/FOS-026.
- **FINAL (session-S4):** `komiteVotes` must be empty; ADR-0005 removed in-app voting; model = chair records outcome + QR-signed MoM via `approvalSteps chain:'mom'`. RESOLVED.

### Realtime: Firebase RTDB vs Centrifugo vs SSE+PG LISTEN/NOTIFY
- **EARLY (review-response doc):** Firebase RTDB mentioned as an option alongside PG LISTEN/NOTIFY.
- **INTERMEDIATE:** Centrifugo proposed as a session-019e8ce1 suggestion.
- **FINAL (pre-OMP, confirmed 2026-06-03):** SSE + Postgres LISTEN/NOTIFY chosen. Firebase RTDB explicitly rejected (egress/compliance). Centrifugo superseded by pre-existing decision. V1 = polling. RESOLVED.

### OAuth: script-only vs runtime-critical assumption
- **EARLY assumption (implied in some sessions):** `getOAuthClient()` used only by setup scripts.
- **FINAL (session S3, 2026-06-04):** Runtime-critical across ALL document generation routes/actions. Not removable. Confirmed and documented in `docs/guides/architecture.md`. RESOLVED.

### SA vs OAuth for Google Docs
- **INTERMEDIATE (batch-13, mid-session):** SA auth attempted for Drive/Docs to avoid personal-Gmail dependency. Committed (`a6f6e95`).
- **Reverted (same session, commit 28d73e6):** SA has zero Drive quota → `files.copy` returns 403.
- **FINAL:** OAuth on dedicated Mizan Gmail account (`drive` scope, not `drive.file`). `[EMAIL REDACTED]` fully purged. RESOLVED.

### GEMINI_API_KEY vs Vertex AI at runtime
- **Prior documentation (`pii-masking.md`):** Stated "Gemini runs via Vertex AI."
- **Reality (confirmed session S3):** App uses AI Studio (`GEMINI_API_KEY`) which takes precedence over Vertex. `assertApacLocation` guard only fires on the Vertex path. AI Studio bypasses the APAC residency guard entirely. `.env.production.example` had `GOOGLE_CLOUD_LOCATION=us-central1` — wrong region (would trigger APAC guard rejection); corrected to `asia-southeast1`. RESOLVED.

### PII residual backstop fail-closed vs fail-open
- **EARLY design (MASKING.md, batch-07):** Fail-closed — if known PII survives masking, throw/block.
- **FINAL (session S3):** Fail-open default (`PII_RESIDUAL_BLOCK` unset). Log warning (types only, never values, `blocked:false`), proceed. `PII_RESIDUAL_BLOCK=1` restores fail-closed for production. Rationale: demo must not be blocked by detection misfires. RESOLVED.

### `lib/data` reference in AGENTS.md
- **PRE-session-S4:** AGENTS.md described `src/lib/data` as the seed source.
- **POST-session-S4:** Updated to `src/lib/seed-data` in the same commit batch. Any prior doc/memory still referencing `src/lib/data` is stale. RESOLVED.

### Authority rule "build-canonical wins" vs recency-aware
- **INITIAL (session 019e8ce1 opening):** Proposed "build-canonical wins" for brainstorm merge.
- **REVISED (same session, after git log check):** Recency-aware per-topic authority rule (newest commit wins for unbuilt design; live repo wins for built behavior).
- **FINAL:** The recency-aware rule is canonical. Captured in session record. RESOLVED.

### W1 config ratification: items originally "deferred as genuine blockers"
- **Early framing (session S1, batch-20):** Several evidence-based mechanisms (SLA per-desk, doc-checklist, bureau Pefindo, komite MOM) listed as "deferred — genuine blockers" or W1-gated.
- **REVERSAL (same session):** User challenged: mechanisms should be built now with empty W1-hook placeholders for values. All four mechanisms built with stubs; no behavior change until W1 wires values.
- **FINAL:** Build the mechanism; leave the value as a W1 stub. RESOLVED.

### Stage-2 gating: `legalSlikComplete` vs `stage2RmDataReady` + `legalAppraisalComplete`
- **EARLY (through batch-10):** Stage 2→3 advance gated on `legalSlikComplete` (LG sign-off + RT SLIK handoff).
- **INTERMEDIATE (batch-10):** Dual sign-off redesign: LG and RT each push own "done"; second to finish triggers 2→3.
- **FINAL (ADR-0007, session-S5/batch-22):** Stage-2 is RM-coordinated. Gate moved: `stage2RmDataReady` (`slikUploaded && kolEntered`) drives 2→3. `legalAppraisalComplete` (Analisa Yuridis + Penilaian + docs) gates MUAP→Risk submit. `legalSlikComplete` deleted. RESOLVED.
- Consequence: "Tolak SLIK & Kembalikan ke RM" return path removed (RM can't send back to itself). `DualSignOff` command deleted. RESOLVED.

### `src/lib/data` blast radius of rename
- 12 reference files updated in session-S4: `komite.ts`, `stage-owners.ts`, `KomiteVoting.tsx`, `MeetingList.tsx`, `MeetingScheduler.tsx`, `app/api/test-fixture/login/route.ts`, `prisma/seed-dummy.ts` (×4), `prisma/seed-extra.ts`, `scripts/seed-emulator-users.ts`, `apps/web-app-e2e/steps/auth-smoke.steps.ts`, plus prose in `demo-logins.ts`, `seed-extra.ts`, `AGENTS.md` (×4 lines), `WORKING-AGREEMENT.md`, `docs/CURRENT-STATE.md`. **OPEN:** Any documentation or memory not updated in that batch still references the old path.

### `DOCS_PROVIDER` not set in integration tests
- **Discovery (session-S2):** `DOCS_PROVIDER` env var is not automatically set in `pnpm test:integration`. Tests touching doc generation paths must set `process.env.DOCS_PROVIDER = 'stub'` explicitly.
- This was a gotcha, not a reversal. OPEN as a convention to enforce.

### `setup-template-ranges.ts` "deleted" claim
- **Incorrect claim:** An early AGENTS.md entry said `setup-template-ranges.ts` was deleted during V1 cleanup.
- **Reality (session-S6):** It is alive — sets up extraction/matrix/QR NamedRanges. Corrected during tidy sweep. RESOLVED.

### CURRENT-STATE.md overstatements on doc generation
- **Overstated (pre-session-S6):** `CURRENT-STATE.md` said "MUAP/RSK docs — done — auto-seed on create" and "Document system — shipped 2026.06.04 … one-way NamedRange fill activated."
- **Reality:** V2 fill (`seedApplicationDocV2`) had one commit and was never imported. The "activated" commit (`0b456d1`) was a manual throwaway-copy OAuth test, not the production path. Corrected in session-S6. RESOLVED.
