# Mizan session-history knowledge map

<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

The session history is where decisions, rationale, and reversals were actually made; the
current-state layers deliberately omit "how it got here" (see `docs/README.md` Doc Rules), so
this register is that missing axis. The 8 per-domain syntheses (`NN-*.md`, siblings of this
file) carry the detail; this file is the cross-cutting map + contradiction registers. Refresh
by re-running the `mizan-knowledge-mining` skill.

---

## 1. Sources mined

| Store | Location | Sessions | Used |
|---|---|---|---|
| OMP exports (HTML) | `.omp/exports/*.html` | 6 | all 6 (the major June sessions) |
| OMP native (JSONL) | `~/.omp/agent/sessions/…-mizan-mizan/` | 22 | 6 dup-of-export + 15 new (this meta-session excluded) |
| Claude Code (JSONL) | `~/.claude/projects/…-hijra-mizan-mizan/` | 123 | 48 substantive (rest were ops/aborted/<20K) |
| Claude Code (JSONL) | `~/.claude/projects/…-hijra-mizan-brainstorm/` | 32 | 9 substantive |

**69 substantive sessions distilled** (~1.4M tokens of signal text) → 30 digests → 8 domain syntheses.
Trivial sessions skipped: "kill dev server", "fix CI", "fix login", tiny ops one-offs — no durable knowledge.

### Timeline / eras (no overlap — the dev migrated tools)
- **BRAINSTORM** `hijra-mizan/brainstorm` (Claude Code): **May 14 – Jun 2**. Where the workflow / role / committee / document model was *invented*.
- **CLAUDE-CODE early** `mizan` repo: **May 16 – Jun 1**. Foundational build (in-memory → Postgres → first UI/engine), later reorganized.
- **OMP** `mizan` repo: **Jun 3 – Jun 8**. The merge + reconcile + maker-checker + signed-MoM + V3 docs + UI rethink era. Closest to current shipped state; **most authoritative when eras disagree.**

---

## 2. Artifact index

### Domain syntheses (`NN-*.md`, siblings of this README) — read these first
| File | Domain |
|---|---|
| `01-workflow.md` | Stages, 16-step SOP, transitions/gates, send-backs, SP3/Akad/Pencairan, SLA/Jakarta-clock |
| `02-roles-desks.md` | Role enum fold, desk catalog, maker-checker, RBAC, superadmin/impersonation, grants |
| `03-komite.md` | Voting→signed-MoM, attendance, DPS, veto, CRO COI, meeting lifecycle |
| `04-documents.md` | MUAP/RSK/MoM/SP3, V1→V2→V3 gen, QR anchors, versioning, OCR, OAuth |
| `05-ai-pii-compliance.md` | AI advisory-only, masking seam, fail-open toggle, Vertex/AI-Studio, OJK/POJK, G1–G5 |
| `06-engine-data.md` | Command-sourced engine, ledgers, hard-gates, 5C+1S, Prisma JSON/migrations, validators |
| `07-uiux.md` | Dossier command center, Tugas Anda grammar, UI spine, pipeline, nav, components, design system |
| `08-infra-seed-process.md` | Deploy/docker/SeaweedFS, seed-data, testing, dev-env, realtime, merge process, doc layers |

### Raw corpus (not committed — regenerable scratch)
The signal-only transcripts (`batches/batch-NN.txt`), per-batch digests (`digests/batch-NN.md`),
and their concatenation (`digests/ALL.md`) live under `.omp/exports/_extracted/` (gitignored).
They are deterministically reproducible by `mizan-knowledge-mining/scripts/mine_sessions.py`
plus the distill step — re-run the skill rather than hunting for them.

---

## 3. North Star (the decision filter that recurs everywhere)

> **Mizan = neraca tepercaya (ميزان). "Menimbang & mengingat — tidak menyetir."**
> Weigh & remember; don't steer. Filter for every feature: *more trustworthy & smoother → do it;
> controlling/obstructing the human → reject.* (Enshrined `docs/README.md` + `designs/workflow-engine.md`.)

This is why: AI is advisory-only, hard-gates flag-don't-block, superadmin is read-only, audit-first
(nothing hidden), and the committee records rather than votes.

---

## 4. Current/final canonical facts (one-screen reference)

- **Stages:** 6 canonical integers (`Pengajuan · Legal,Agunan&Biro · MUAP · RSK · Komite · Pencairan` → Portofolio). 4-phase view is a *derived* presentation (`phaseOf`: 1/2/3→1,4→2,5→3,6→4); engine 6→4 renumber **deferred** (~158 `.stage===N` sites).
- **Roles:** `RM | LG | RA | CM | MG`. AO+LA folded → RM; RT → RA. Single role key `relationship-manager = [intake, slik, muap-author, pencairan]`.
- **Desks** (atomic perms; roles compose them): `intake, legal, appraisal, slik, muap-author, muap-tl, muap-bm, rsk-author, rsk-ro, rsk-cro, rsk-dps, dps-review, komite, pencairan, MG, ADMIN-USERS/MASTER/POLICY`.
- **Maker-checker:** MUAP = RM→TL/SPV→BM/KU; RSK = RA→RO→CRO→**DPS (always signs every deal)**. Distinct-actor enforced. QR-stamp per signature.
- **Stage-2 = RM-coordinated (ADR-0007):** RM advances 2→3 on `stage2RmDataReady = slikUploaded && kolEntered`; Legal/Appraisal are tracked deliverables that lag into Stage 3; `legalAppraisalComplete` gates MUAP→Risk submit. SLIK/Pefindo are **RM's** work (Ops is out of Mizan scope).
- **Komite (ADR-0005):** no in-app voting; chair records outcome; Komite members QR-sign MoM (`chain='mom'`, unordered); routing on all-signed. Risk veto = structural (vetoed apps never queue). CRO-COI = soft flag.
- **RA has two distinct actions:** `RejectRisk` (terminal `risk-reject`) vs `ReturnToRm` (send-back, MUAP re-ladder). Never conflate.
- **Engine (ADR-0004):** command-sourced + ledger-backed + (snapshot-authoritative = **design target; persistence PENDING/needs-doing** — `stage` Int is the live cursor, `deriveWorkflowSnapshot` is derived; plan `../../planning/workflow-snapshot-persistence.md`). `decide()` pure; `dispatch()` single write seam. Ledgers `ApprovalStep/HistoryEntry/DocumentVersion` INSERT-only.
- **Documents (ADR-0013 / V3):** `replaceAllText("[Unique Label]", value ?? placeholder)`; NamedRanges retained only for QR/signature anchors. Akad doc-gen **out of scope (V1)**.
- **AI:** advisory-only invariant; mask-in/unmask-out (`maskForEgress`); gating tokens (kol/dsr/ltv) never AI-written (`assertSafeTokens`). **Now on Vertex** (2026.06.08); decided follow-ups: drop the AI Studio (`GEMINI_API_KEY`) path + relax `assertApacLocation` to allow `global` (out-of-region accepted — `../../planning/vertex-provider-cutover.md`).
- **PII residual backstop:** **fail-open by default**, `PII_RESIDUAL_BLOCK=1` for prod.
- **AI audit (`recordAiInteraction`):** **fail-open / best-effort** by decision (2026.06.08) — a failed audit-write logs, never blocks egress; `assistant` / `advisory` surfaces not yet wrapped in try/catch (still fail-closed in code).
- **Storage:** Postgres + Prisma 7 (wasm). Frozen PDFs in **SeaweedFS** (not Drive). Seed dir = `src/lib/seed-data`.

---

## 5. OPEN contradictions / unresolved (the live "contradicting info")

These are NOT settled. They are the items most worth attention.

1. **`recordAiInteraction` fail-closed vs fail-open** — **RESOLVED 2026.06.08 (human): fail-open** (best-effort; audit loss must not deny the user a generation). Code follow-up (deferred, tracked): `assistant` / `advisory` still bare-`await` (fail-closed) — plan `../../planning/ai-audit-fail-open-alignment.md`. See `CURRENT-STATE.md` / §7.
2. **`WorkflowSnapshot` authoritative persistence** — ADR-0004 says snapshot is authoritative cursor, but code has `deriveWorkflowSnapshot(app)` as a *derived projection only*; `app.stage` is still the DB Int column. Design ≠ implementation — **PENDING (needs to be done)**, tracked `../../planning/workflow-snapshot-persistence.md`.
3. **`ExploredSource[]` frozen into `DecisionCheckpoint`** — **RESOLVED** (entry was stale): `freezeDecisionDocs` reads `app.exploredSources` and writes `DecisionCheckpoint.exploredSources` (`server/docs/service.ts:290,333`; migration `20260528090000`). Plumbing is built; the column is only populated once web research is live (gated, `WEB_RESEARCH_PROVIDER`).
4. **Akad document generation** — **OUT OF SCOPE (V1)** (decided 2026.06.08): Mizan generates MUAP/RSK/MoM/SP3 only; the akad contract is authored/signed outside Mizan. `AkadBadge` is a type badge. See `../scope-v1.md`.
5. **Vertex migration** — **DONE → on Vertex** (2026.06.08; API enabled, SA + creds set). Decided code follow-ups (tracked, pending): drop the AI Studio (`GEMINI_API_KEY`) path (Vertex-only, kills the footgun) + relax `assertApacLocation` to **allow `global`** (out-of-region accepted; ⚠️ reverses OJK §27 guard — interim, revisit by Dec-2026). Plan `../../planning/vertex-provider-cutover.md`.
6. **G5 DPA** with LLM/OCR vendors — OPEN; Bank Legal blocker; production AI gated. The single Google Cloud DPA is expected to cover Vertex (Gemini) + Doc AI + Drive/Docs — confirm scope at W1. Separate from the 17 Dec 2026 in-region deadline (§27(5)): in-region **deferred**; **Bedrock Nova plan dropped 2026-06-03**, V1 stays on Vertex/GCP under the §56(b) DPA (`../compliance.md`).
7. **NER / G2 PII kill-switch** — deferred as a bundled future package (Accept-A). Residual risk: free-text person names reach Gemini unmasked.
8. **SLA numbers** — Bank-actual per-desk SLAs loaded as defaults but **not W1-ratified**; `isJakartaHoliday` is a stub (always false → all weekdays treated as business days) — **holiday calendar PENDING**: auto-fetch public API + admin-set overrides (`../../planning/jakarta-holiday-calendar.md`).
9. **Small-branch SoD** (one person, multiple roles) — policy TBD (W1).
10. **`nuqs` search-params migration** — plan exists (`docs/planning/nuqs-search-params.md`); not actioned. Current = `?view=` via `history.replaceState`.
11. **`STAGE_NAMES` i18n** — **[VERIFY-DOC resolved 2026.06.08]** No i18n layer; labels hardcoded in `lib/types.ts`. Live `STAGE_NAMES` is **mixed ID/English** (`Pengajuan Dokumen` / `Legal, Agunan & Biro` / `Pencairan` ID; `Risk Review` / `Committee Decision` EN; `Feasibility / MUAP (5C+1S)` mixed) — **not** "English" as previously stated. The all-Indonesian **phase-label** layer (`PHASE_NAMES`/`phaseLabel` → "Fase N · …") is the derived display that partly supersedes it. ⚠️ A Jun-5 "English stage names" decision (`01-workflow.md`) is only **partially** reflected — language direction unresolved. Single-locale app → real i18n deferred (YAGNI).
12. **Whole W1 config register** (`docs/references/config-ratification-w1.md`): DSR/LTV/Kol thresholds, BWMP tiers, Komite quorum/composition, akad params, DPS review scope, SLA clock-start, min-attendees=2 — all NoEffort/SOP defaults pending Hijra ratification. Engine does NOT block on them (additive stubs).

## 6. `[VERIFY-DOC]` — candidate live doc-drift to reconcile against `docs/`

Verified & reconciled **2026.06.08**. **Confirmed already in sync:** items 3 (PII fail-open + `PII_RESIDUAL_BLOCK`), 5 (SLIK/Pefindo = RM, ADR-0007), 6 (no `@/lib/data` / no live `isRole`/`useRole`/`RoleContext` — only historical comments remain), 7 (`DEFAULT_ROLES` has no `account-officer`/`loan-analyst`), 8 (`setup-template-ranges.ts` alive), 9 (ADR-0006 + all V2-tokenization docs bannered superseded). **Changed:** items 1, 2, 4 below.
- `CURRENT-STATE.md` describes **V3** doc-gen ✓ (MUAP/RSK + Document-system entries). **Fixed 2026.06.08:** the maker-checker entry's stale "NamedRange fill" fragment → V3 `replaceAllText`.
- ⚠️ **INVERTED 2026.06.08** — the backend is now **Vertex**, not AI Studio (the user went live on Vertex). `pii-masking.md` / `compliance.md` / `CURRENT-STATE.md` correctly say Vertex. Decided code follow-ups (drop `GEMINI_API_KEY`, allow `global`): `../../planning/vertex-provider-cutover.md`.
- PII backstop described as **fail-open + `PII_RESIDUAL_BLOCK`** (not "fail-closed") across `pii-masking.md`, `compliance.md`, `layanan-eksternal.md`, app `AGENTS.md`, env examples.
- `komite-mechanics.md` / `workflow-engine.md` §Komite reflect **signed-MoM (ADR-0005)**, not voting; `lib/komite.ts` is clean (no `quorumFor`/`calculateMajority`/`castMemberVote`) ✓. **Fixed 2026.06.08:** `workflow-engine.md` §"Fase C — Komite" still showed per-member voting (`KomiteVote`/`CommitteeDecide{votes[]}`) → ADR-0005 banner added; `komite-mechanics.md` as-built name `submitDecisionAction` → `setKomiteOutcomeAction`.
- SLIK/Pefindo ownership = **RM** everywhere (`required-docs-matrix.md`, `workflow.md` had stale RA attribution); `hijra-bank-sop-digest.md` lists Ops only as the BI-Checking system-SLA owner, not a workflow actor.
- No `src/lib/data` references remain (renamed to `src/lib/seed-data`); no `isRole`/`useRole`/`RoleContext` references remain (→ `useActor`).
- `DEFAULT_ROLES` in `desks.ts`: only `relationship-manager` should exist (`account-officer`/`loan-analyst` keys deleted).
- `setup-template-ranges.ts` is **alive** (extraction/matrix/QR); an old AGENTS.md note that it was deleted was wrong.
- ADR-0006 should be marked **superseded by ADR-0008**; V2 tokenization design docs bannered **superseded by ADR-0013**.

## 7. Major reversals already RESOLVED (evolution history — useful, not action items)

Each is now settled; recorded so the *why* survives.

- Stage count **5 → 6** (Pencairan was built but assumed unbuilt). 6→4 restructure → kept 6 engine + 4-phase view.
- Roles: "AO ≠ Analis, four distinct" (brainstorm canon) → **collapsed to RM** once Bank SOP slides showed "Analyst" = Risk lane.
- Komite: full **in-app voting/quorum → signed-MoM** (ADR-0005).
- DPS: not-a-voter → conditional Stage-5 → **always signs every RSK**.
- Akad: "immutable at intake" → **mutable proposal pre-Komite** (bank can counter-offer); frozen at Komite, formalized at SP3.
- SP3 chain + Bersyarat-informal: **absent → imported** from brainstorm Bank-SOP (Jun 2-3).
- Engine: in-memory `APPLICATIONS[]` → Postgres/Prisma → **command-sourced** (full event-sourcing *proposed then rejected* — oracle "split-truth trap").
- `saveApplication` `deleteMany`+recreate (OJK-audit bug) → **insert-only delta**; "append-only" was only a convention.
- Docs: V1 NamedRange-sentinel → V2 644-token NamedRange (built but **never wired** — dead code) → **V3 replaceAllText** (ADR-0013).
- Doc versioning: ADR-0006 (retire) **superseded same day** by ADR-0008 (snapshot copies via `files.copy`).
- Frozen PDFs: Postgres Bytes → **SeaweedFS** (the "stored in Drive" belief was wrong).
- OAuth: `[EMAIL REDACTED]` → Service-Account (reverted — zero Drive quota) → **dedicated Mizan Gmail**.
- PII residual: fail-closed → **fail-open default**.
- AI audit (`recordAiInteraction`): open question → **fail-open by decision** (2026.06.08, human); `assistant` / `advisory` code alignment pending.
- RSK framework: agent kept proposing 5C+**1**S; Hijra template literally says 5C+**2**S → template wins.
- Stage-2 gate: dual-sign-off → **RM-coordinated** (ADR-0007); `DualSignOff`/`completeSlikAction` removed.
- Superadmin: could act directly → **read-only, acts via impersonation only** (ADR-0010).
- UI: Pipeline Kanban → **table**; 10 tabs → 4 groups → **Dossier**; ActionBand `secondaries[]` → typed **`returnAction?`**; AML inline form → **Dokumen tab**; collapsible nav → **always-visible**; decision verbs → **intentional English**; many polish reverts (glass island, left-accent bar, gradient heroes).

---

## 8. Reusable engineering gotchas (cross-cutting)

- Prisma 7 is **Rust-free** (wasm engine); nft doesn't trace it → Dockerfile must `COPY` the `query_compiler*.wasm`. `prisma generate` + dev hard-restart after every migration (HMR won't refresh the client).
- `server-only` modules aren't hermetically unit-testable (tsx can't resolve) → test DB round-trips via repo fns in `*.itest.ts` against `mizan_test`.
- `insertInlineImage` rejects `data:` base64 + needs a publicly-fetchable URL → QR via external render API (goqr.me), Google fetches once and embeds.
- Firebase emulator globs the whole export dir → never leave `accounts.json.bak` beside it.
- `NEXT_PUBLIC_*` bake at build time (Docker ARG); Firebase admin SDK must be lazy-init or `next build` throws.
- pgsql container runs `--network=host` → `lsof` won't show 5432 but it's reachable.
- Mobile dual-render (table + card) → Playwright `getByText` matches twice → `.first()`.
- De-customizing legal templates: denylist-scan after `replaceAllText` (a stray `U+E907` glyph hid 4/6 company-name occurrences — near customer-data leak).
