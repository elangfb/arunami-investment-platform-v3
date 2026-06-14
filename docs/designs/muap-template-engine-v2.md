# MUAP/RSK template engine v2 — design

**Status**: **SUPERSEDED by V3 (2026.06.08).** Design settled 2026.05.27; the V2 token-engine *fill* was never wired into production. Live document generation is **V3** ([ADR-0013](../decisions/0013-docs-generation-v3-replace-all-text.md) + [`document-system.md`](./document-system.md)); the **deep-research agent** designed here IS built (`server/research/*`).

> ⚠️ **SUPERSEDED (2026.06.08)** — the fill mechanism (NamedRange `{{token}}` tokenization, sync-back, lost-in-doc) is replaced by V3 (`[bracket]` placeholders + `replaceAllText`); see ADR-0013 + `document-system.md`; live IDs/tokens/scripts in [`../references/document-templates.md`](../references/document-templates.md). This doc remains historical reference for the **token walkthrough, the decision log, and the deep-research agent design**.

**Reading order for AI session pickup**: this doc → [Session decision log](#session-decision-log) → [Tokenization state map](#tokenization-state-map) → [Sequencing / what's next](#sequencing--whats-next) → [Pickup pointers](#pickup-pointers-for-next-session). Everything else is reference.

**Companion docs (this is the canonical set; read all of them for a complete picture)**:

| Doc | Purpose |
|---|---|
| [muap-template-engine-v2.md](./muap-template-engine-v2.md) (this doc) | Design + 33-entry decision log + architecture |
| [muap-v2-tokenization.md](./muap-v2-tokenization.md) | Token walkthrough rev 2.2 — every cell categorized + named, 371 new tokens proposed, 27 renames |
| [muap-v2-tokenization-playbook.md](./muap-v2-tokenization-playbook.md) | Methodology — HOW to derive tokens from a template (replay protocol for RSK or future templates) |
| [document-system.md](./document-system.md) (current V3) · [document-templates.md](../references/document-templates.md) (live IDs/tokens) | what the engine became — V3 supersedes the V2 build TODO that used to live here |
| [muap-template.md](../references/muap-template.md) | MUAP document **layout** (sections I–IX + per-akad financial tables) — the "what" this engine fills (merged from brainstorm) |

**Origin**: V1 template engine had ~16 high-level slots (mostly AI-narrative blobs `m_capacity`, `m_capital`, etc.). Bank/analyst feedback: too few variables, too much AI prose, not matching real Indonesian MUAP form. V2 redesigns from scratch: **granular field-level tokens** + **AI narrative restricted to specific cells**.

This doc is the single source of truth for v2 design decisions. Read in full before touching MUAP/RSK templating, deep-research agent, doc sync, or fill engine.

## Source artifacts

> ⚠️ These are **historical V1/V2 artifacts** (superseded by V3). The *live* MUAP/RSK master IDs and env
> keys are in [`../references/document-templates.md`](../references/document-templates.md): `GOOGLE_MASTER_MUAP_DOC_ID`
> now points to the **V3 RAW master** (`1rydh9Hp…`), **not** the `1MfuT…` v1 doc listed below.

| Doc | ID | Role |
|---|---|---|
| Master MUAP v2 (tokenized) | `1kw5Tf5KxzCwKlTu9BBnxz0ZNde4D9zMYbOmbXp3amI8` | Authoritative template — tokens live here |
| References (bracket+blank original) | `1XGLy1LyrmupcLqs3XQEf2eKqTYc0D8jj-HdvQL8HYR4` | Single source for reference text (the `___` and `[bracket]` fallback content per token) |
| Live MUAP master (v1, legacy) | `1MfuT-uX2h-fFA6kkxtKNxAoeYI5lBAUG8SwUAS7Eztw` (`GOOGLE_MASTER_MUAP_DOC_ID`) | Current production. Will be REPLACED by v2 — do not edit further |

Both v2 docs are accessed via OAuth with a DEDICATED Mizan Google account (not a real human's Gmail). The account owns every per-app MUAP/RSK Doc in its own 15 GB Drive. Scopes: `documents` + `drive`. Setup: `pnpm google:auth` → consent in browser as the Mizan account → refresh token written to `.env.local`. Full guide: `docs/guides/google-docs-oauth.md`. (A Service Account experiment was tried + reverted because SAs have zero Drive quota.)

Diagnostic script: `apps/web-app/scripts/scan-muap-braces.ts` — structural scan of any Doc by ID/URL (auto-converts `.docx` via Drive copy if needed). Emits per-cell location + token catalog + legacy `{{token}}` literal list. Run: `pnpm --filter web-app exec tsx scripts/scan-muap-braces.ts <docIdOrUrl> [...]`.

## Philosophical pivot (v1 → v2)

| Aspect | v1 | v2 |
|---|---|---|
| Token granularity | ~16 high-level slots | ~150+ field-level tokens |
| AI scope | AI authors most prose (`m_*`) | AI restricted to explicit `ai_*` slots only |
| Source of truth | Doc is bidirectional, app extracts | App initializes Doc → Doc takes over → sync back to App |
| Anchor mechanism | Hidden 1pt-white sentinels `${{x}}…${{/x}}` + NamedRange | NamedRange only, no sentinels, no styling tricks |
| Reference text on fill failure | n/a (AI fills) | Restore original placeholder text from References Doc |
| Compliance posture | Many fields touch LLM | Most fields never see LLM; masking pipeline only relevant for `ai_*` |

## Naming conventions

- **`snake_case`** lowercase. No abbreviations except established (no, nib, npwp, kbli, slik, ojk, ahu).
- **`ai_*` prefix** = AI-authored narrative. Engine routes these through masking pipeline + LLM. All other tokens are facts/categoricals from app/OCR/analyst. **`uraian_*`** prefix from initial human tokenization should be normalized to `ai_*` if content is AI prose.
- **`_1`, `_2` suffix** = positional row slot. Tables fixed-row for MVP (e.g., `modal_kerja_or_investasi_{1,2}`, `keterangan_{1,2}`). Dynamic rows deferred — first try just following the reference structure.
- **`_or_X` suffix** encodes embedded categorical choice (`nasabah_baru_or_lama` → "Baru" or "Lama"; `tanggal_menjadi_nasabah_or_strip` → date or "-"; `proffesional_or_keluarga_*` [sic]). Value resolver picks one branch deterministically; not an arbitrary text field.

### Typos in human tokenization (fix during walkthrough)

- `no_akta_perubaahan` → `no_akta_perubahan` (double-a in original)
- `tanggal_akta_perubaahan` → `tanggal_akta_perubahan`
- `proffesional_or_keluarga_direktur` → `professional_or_keluarga_direktur`
- `proffesional_or_keluarga_komisaris` → `professional_or_keluarga_komisaris`
- `sesuai_or_tidak_dengan_rill` → `sesuai_or_tidak_dengan_riil`

These are intentionally NOT fixed yet (per human: "fix later in master MUAP template baru"). Fix as part of walkthrough commit.

## Categorization framework for walkthrough

Every cell/word in the References Doc gets classified into ONE of six categories:

| Cat | Description | Example in references | Action |
|---|---|---|---|
| **A. Fact** | Single data point | `___ Bulan`, `Rp ____________,-`, `[Nama Lengkap Perusahaan]`, `[DD Bulan YYYY]` | Token: `{{name}}` |
| **B. Categorical** | Pick-one from enum | `[Modal Kerja / Investasi]`, `[Sesuai / Tidak Sesuai]`, `[Positif / Stagnan / Negatif]` | Token: `{{name_or_X}}` style |
| **C. Narrative** | Prose 1+ sentences | `[Jelaskan kondisi …]`, `[Uraikan secara naratif minimal 3 …]` | Token: `{{ai_name}}` |
| **D. Composite** | Multi-field per cell | `SHM/SHGB ___ a.n. ___ di [Lokasi]` | Decompose to multiple tokens |
| **E. Presentational** | Static label/header | `IDENTITAS NASABAH`, `Per Desember`, `Rp`, column headers | NOT a variable, leave alone |
| **F. Pseudo-blank** | `-`, `—` ambiguous | Single strip in optional column | Decide per case: A with default `-`, or E |

Patterns triggering "this might be a variable":
- `___` (3+ underscore), `_______________` (long underscore), `20___`, `Rp ___________`
- `[…]` bracket guidance
- `/` inside `[…]` = separator for categorical choice
- `-` or `—` standalone = ambiguous, needs case-by-case judgment

## Engine architecture

### NamedRange-only (no sentinels)

- Setup script (`scripts/setup-template-ranges.ts` will be rewritten or replaced) walks Doc, for each `{{token}}` literal creates a NamedRange covering exactly that text. No hidden sentinels.
- Fill = `replaceNamedRangeContent(rangeName, value)`. Google Docs API preserves `namedRangeId` across content replacement.
- Extract / sync-back = walk `doc.namedRanges`, read content per range.

### NamedRange ID is primary anchor

Per fill, we persist `{appId, docId, tokenName, namedRangeId, value, source, filledAt}` to a new DB table. On sync-back:

1. **Lookup by `namedRangeId`** (primary) — read content, compare to last-known, update if changed
2. **Fallback to `name` lookup** (secondary) — if ID drifted (range deleted + recreated), find any range with same name, take its content, log ID drift, update DB with new ID
3. **Lost-in-doc** (tertiary) — neither found. Mark status `'lost-in-doc'`, keep last-known value in DB

### Lost-in-doc behavior

- App form for the lost field becomes **editable again** (per-field exception to "Doc menang post-init")
- Analyst re-enters value in Mizan → DB updated, source = `'analyst-app-edit'`
- **NO write-back to Doc** — value stays in app only
- PDF freeze: field appears empty/missing in PDF. Banner before freeze surfaces all `'lost-in-doc'` fields; hard sync refuses freeze if any present, forcing analyst to acknowledge

### Bidirectional fill semantics

- App value present → `replaceNamedRangeContent(range, value)`
- App value null/unresolvable → restore reference text from References Doc cache
- Reference text per token = stored in `TemplateReferenceText` DB cache, regenerable by walking References Doc + master Doc in parallel (structural diff: token at position X in master ↔ text at position X in references)

### Token registry shape

TS-code-defined, e.g. `apps/web-app/src/lib/templates/muap-tokens.ts`:

```typescript
interface TemplateToken {
  name: string                          // e.g. 'tanggal_akta_pendirian'
  kind: 'fact-calc' | 'fact-display' | 'narrative-ai' | 'categorical'
  source: 'app' | 'ocr' | 'ai-with-research-context' | 'analyst'
  description: string                   // human-readable
  triggersRecompute?: Array<'dsr'|'ltv'|'sla'|'scoring'|'hardgate'>
                                        // sync-back side effects
  enum?: string[]                       // for categorical (e.g. ['Baru', 'Lama'])
}
```

`referenceText` is NOT in the registry — it lives in DB cache, regenerable from References Doc.

### Why `kind` matters

Sync-back side effects depend on kind:
- `fact-calc` (plafond, tenor, dsr, ltv, kol, financial inputs) → update DB **AND** trigger recompute (`hardGateViolations`, scoring, SLA)
- `fact-display` (nama, alamat, no_npwp) → update DB only
- `narrative-ai` (`ai_*`) → store in narrative table, no recompute
- `categorical` → update DB, log enum value

## Doc lifecycle

```
1. Stage transition: LG/RT advances → Stage 3 set in <1s
   Browser detached from rest of flow
   
2. ResearchJob row created (status='queued', cap=6hr)

3. Worker picks job (DB-polling, ~10s)
   Deep research agent: tree exploration, 5-12 sub-questions, strict-to-plan
   Per sub-Q: ~30 min cap, ~$2 budget
   Completed sub-Q persisted incrementally
   
4. Research done OR analyst clicks "Hentikan & Buat Dokumen"
   → ExploredSource[] committed to app
   → Triggers DocCreationJob
   
5. DocCreationJob:
   a. Drive.files.copy(master) → newDocId
   b. Walk newDoc.namedRanges
   c. For each range: resolve value → fill OR restore reference text
   d. AI narrative slots (`ai_*`): mask → LLM with research context → unmask → fill
   e. Persist {appId, docId, tokenName, namedRangeId, value, source} per range
   
6. Analyst notified (in-app derived, polled). Opens MUAPTab. Doc ready.

7. Analyst edits in Docs OR Mizan form (where applicable). Doc is source of truth post-init.

8. Sync-back (lazy, on triggers): pre-check headRevisionId → if differ, walk ranges, update DB.

9. Pre-freeze: hard sync. Refuse if any `'lost-in-doc'`. Then Drive.files.export(PDF) → S3.
```

## Background job infrastructure

### `ResearchJob` table (new)

```
id (uuid)
appId (FK)
status: 'queued' | 'running' | 'completed' | 'completed-partial' | 'completed-capped'
       | 'failed' | 'failed-restart' | 'cancelled'
plan: jsonb  // sub-questions
progress: jsonb  // completed sub-Q count, current activity, last update
startedAt, completedAt
elapsedMs
exploredSourcesPartial: jsonb[]  // incrementally appended
costEstimateUsd, tokensUsed, llmCalls, fetches
errorMessage (nullable)
```

### `ResearchStep` table (new) — audit per LLM call/search/fetch

```
id (uuid)
jobId (FK)
stepType: 'plan' | 'search' | 'fetch' | 'synthesize' | 'consolidate'
query / url / prompt (nullable, text)
response (text)
tokensIn, tokensOut
durationMs
timestamp
```

Volume: ~500-1000 rows per job × ~100 jobs/month = ~50k-100k rows/month. Index by `jobId`.

### Worker

Polling worker in same Next.js process. Pseudocode:

```typescript
// boot.ts (called on app boot)
setInterval(async () => {
  const queuedJobs = await db.researchJob.findMany({
    where: { status: 'queued' },
    take: 5,  // max concurrent
    orderBy: { createdAt: 'asc' },
  })
  for (const job of queuedJobs) {
    runResearchJob(job).catch((e) => log.error('job_failed', { jobId: job.id, e }))
    // intentionally not awaited — async/await concurrency in same event loop
  }
}, 10_000)
```

Constraints:
- **Max 5 concurrent jobs** in same process
- **Restart-safe**: on boot, mark all `running` jobs from previous instance as `failed-restart`, require manual re-queue. (Granular sub-Q resume deferred.)
- **Cancellation**: `cancelRequested` flag on job. Agent loop checks flag between sub-questions; if set, finish current sub-Q's in-flight LLM call (already paid for) then commit completed sub-Qs + flip to `cancelled` or `completed-partial`.

### Budget caps (hardcoded MVP)

```
MAX_WALL_CLOCK_MS         = 6 * 60 * 60 * 1000   // 6 jam
MAX_SUB_QUESTIONS         = 12
MAX_BUDGET_PER_SUB_Q_MS   = 30 * 60 * 1000        // 30 menit
MAX_LLM_TOKENS_PER_JOB    = 8_000_000              // ~$20-40 Gemini Pro
MAX_FETCHES_PER_SUB_Q     = 30
MAX_LLM_CALLS_PER_JOB     = 800
```

Migrate to admin policy versioned table later if bank wants tunable budgets.

## Deep research agent design

### Already built (DO NOT rebuild)

| Component | File | Status |
|---|---|---|
| Provider boundary | `apps/web-app/src/server/research/provider.ts` | `WebResearchProvider { search, fetch }` interface |
| Stub provider (default) | `apps/web-app/src/server/research/stub.ts` | Returns empty — offline default |
| Pipeline (current: deterministic) | `apps/web-app/src/server/research/pipeline.ts` | 5-step linear: plan → search → fetch → synthesize → audit. **Will be REPLACED by agent tree-exploration.** |
| Egress classifier | `apps/web-app/src/lib/research/classifier.ts` | `planResearch()` refuses non-business / no-namaUsaha; URL allowlist via `isAllowedSource()` |
| Synthesis schema | inside pipeline.ts | Zod schema enforcing URL ∈ input corpus (hallucinated URLs dropped) |
| Audit | `recordAiInteraction` with surface=`'research'` | One row per pipeline run; will become MANY rows per job for agent (use `ResearchStep`) |
| Action endpoint | `apps/web-app/src/server/actions/research.ts` → `runWebResearchAction` | Gated `muap-author`, rate-limited 3/min. **Will be REPLACED by job queue.** |
| Narrative integration | `apps/web-app/src/server/ai/narrative.ts:152` | `exploredSources` injected into MUAP prompt — already wired |
| UI | `apps/web-app/src/components/application/MUAPTab.tsx` | "Jalankan Riset Web" button — **rename to "Riset Ulang"** post-MVP |
| App field | `LoanApplication.exploredSources` | Already persisted, serialized |

### To build for v2 (replaces pipeline.ts)

**Tree-exploration agent**:

```
1. PLAN (one-shot LLM call)
   Input: ResearchContext (namaUsaha, sektor, KBLI, akadType, purpose, collateralType,
                           + full-text OCR'd doc text if available)
   Output: 5-12 sub-questions, each with: topic, rationale, expected sources, budget
   
   Example sub-questions:
     - "Tren industri [KBLI deskripsi] di Indonesia 2024-2026"
     - "Regulasi OJK terkait sektor [X] dalam 12 bulan terakhir"
     - "Fatwa DSN-MUI relevan untuk akad [Y] di sektor [X]"
     - "Profil [pelanggan utama 1] dari OCR — credit signals, news"
     ...
   
2. LOOP per sub-Q (parallel up to N concurrent within job; serial across jobs)
   sub_q_agent(sub_q):
     state = empty
     while budget remains AND not done:
       next_action = LLM(state, sub_q) → {type: 'search'|'fetch'|'synthesize'|'stop',
                                           query?, url?}
       if next_action.type == 'search':
         results = provider.search(masked(query))
         classifier.checkPerQuery(query)  # PII gate per call
         state.add(results)
       elif next_action.type == 'fetch':
         page = provider.fetch(url) if allowlisted
         state.add(page)
       elif next_action.type == 'synthesize':
         sub_report = LLM(state) → structured findings + sources
         break
       elif next_action.type == 'stop':
         sub_report = LLM(state) → best-effort findings
         break
     return sub_report
   
   STRICT: agent cannot spawn new sub-questions, cannot abandon plan, cannot fetch
   outside allowlist, cannot query with raw PII.
   
3. CONSOLIDATE (one-shot LLM call)
   Input: all sub-reports
   Output: ExploredSource[] (max ~30 sources, ranked, deduplicated by URL)
```

### Per-query PII masking (refactor)

Current classifier runs once at plan-time. Agent loop generates queries dynamically → MUST be gated per-call:

```typescript
function checkQueryPII(query: string): { ok: true } | { ok: false, reason: string } {
  // Block if query contains: NIK pattern, phone pattern, person names (≥4 chars
  // matching nasabah/direktur/komisaris list), email pattern.
  // Allow business name, sektor, KBLI, generic terms.
}
```

Call before EVERY `provider.search(query)`. Refused queries logged to `ResearchStep` with reason; agent forced to rephrase.

### Provider: SearXNG + Firecrawl self-hosted

- **SearXNG**: federated meta-search. Docker container, ~200MB RAM. Backend rate limits possible — rotate engines, respect Retry-After. Pattern `withRetry()` already in `server/retry.ts`.
- **Firecrawl OSS**: headless-browser crawler. Returns clean markdown. Docker container, ~1-2GB RAM per instance.
- **Deploy**: both in same Docker Compose as Mizan, internal network. Env vars: `SEARXNG_URL`, `FIRECRAWL_URL`, `WEB_RESEARCH_PROVIDER=searxng-firecrawl`.
- **Implementation**: create `apps/web-app/src/server/research/searxng-firecrawl.ts`, implement `WebResearchProvider` interface, register in `index.ts`.

## Doc sync mechanism

### Queue dedup per-doc

```typescript
const inFlight = new Map<docId, Promise<void>>()

async function syncDoc(docId: string) {
  if (inFlight.has(docId)) return inFlight.get(docId)
  const job = (async () => {
    try {
      // 1. Pre-check via headRevisionId
      const meta = await drive.files.get({ fileId: docId, fields: 'headRevisionId,modifiedTime' })
      const dbLastRev = await getLastSyncedRevisionId(docId)
      if (meta.headRevisionId === dbLastRev) return // no-op
      
      // 2. Full sync
      const doc = await docs.documents.get({ documentId: docId })
      await reconcileNamedRanges(doc, /* persisted fills */)
      await setLastSyncedRevisionId(docId, meta.headRevisionId)
    } finally {
      inFlight.delete(docId)
    }
  })()
  inFlight.set(docId, job)
  return job
}
```

### Triggers (no manual sync button)

- MUAP tab mount (RSC fetch or client useEffect)
- `window.visibilitychange` event (returning to Mizan from Docs)
- Detail page open if app is past Stage 3
- Stage transition attempt (`transitionAction` calls hard sync before applyTransition)
- Freeze attempt (refuse if any `'lost-in-doc'`)

### Badge UX

3-state: `[idle/synced]` ↔ `[checking]` (100ms pre-check) ↔ `[syncing]` (1-3s full pull) → `[synced ✓]` (or `[error]`).

### Debounce 10s

Last successful sync timestamp per doc — if <10s ago, skip new trigger.

### No background cron

List/dashboard views don't depend on Doc data. Confirmed skip Layer C for MVP.

## Conflict resolution

- **Post-init**: Doc menang absolute. App form fields that correspond to filled NamedRanges become read-only with hint "Edit di Google Docs".
- **Lost-in-doc exception**: per-field unlock as recovery — app form for that field editable; on save, source=`'analyst-app-edit'`; no write-back to Doc.
- **Pre-freeze hard sync**: refuse if any `'lost-in-doc'` until analyst acknowledges.
- **Master template propagation**: forward-only. Existing Doc copies untouched when master changes.

## Compliance gates (v2 implications)

Cross-ref: `docs/guides/launch-gates.md` and `docs/references/compliance.md` (G1–G5 gate table — source of truth).

| Gate | v2 status |
|---|---|
| G1 masking — bracket+regex | ✅ already built (`apps/web-app/src/lib/pii-mask.ts`, `detectResidualPii` fail-closed). v2 reuses unchanged for `ai_*` slots. Per-query agent gate is NEW extension (planned). |
| G2 pre-flight PII block | ⏳ planned for v2. Per-query check before `provider.search`. Refused queries logged. |
| G3 masked-prompt audit | ✅ extended via `ResearchStep` (per-call audit) + `AiInteraction` (per-job summary). |
| G4 provider interface | ✅ already built (`server/research/provider.ts`). v2 adds `SearxngFirecrawlProvider`. |
| G5 LLM-vendor DPA | ⛔ BLOCKED — Bank Legal, Discovery-W1. v2 deep research production-run gated on this. |

Bank-egress: on-prem + internet allowed (resolved 2026.05.24). Self-hosted SearXNG/Firecrawl is on-prem; LLM (Gemini) is internet egress; per-query masking is the egress guardrail.

## Full-text OCR — current state

Full-text OCR is shipped and wired. Every uploaded document gets `ApplicationDocument.extractedText`; production uses Google Document AI via `OCR_PROVIDER=documentai` (code default remains `stub`). KTP is excluded from narrative grounding to reduce PII egress. See `docs/guides/document-ai-ocr.md` and `apps/web-app/AGENTS.md` OCR/AI rules.

For v2 research, the remaining work is to read persisted `extractedText` from the research context, mask PII before any generated query/prompt, and feed it into the tree-exploration agent.

## Sequencing / what's next

| # | Task | Status | Blocker for |
|---|---|---|---|
| 1 | Token registry skeleton | NEXT | Reference sync, NamedRange setup, fill engine |
| 2 | `TemplateReferenceText` DB cache + sync-from-References-Doc script | After 1 | Fill engine restore-fallback |
| 3 | Setup NamedRanges (v2, no sentinels) | After 1 | Fill engine |
| 4 | Fill engine rewrite (NamedRange only, restore-reference-text) | After 1-3 | Doc creation |
| 5 | `ResearchJob` + `ResearchStep` schema + DB-polling worker | Parallel after 1 | POC agent |
| 6 | POC tree-exploration agent (1 sub-Q, 15min cap, SearXNG+Firecrawl stub) | After 5 | Full agent |
| 7 | Full agent (12 sub-Q, 6hr cap, real SearXNG+Firecrawl containers) | After 6 | Production research |
| 8 | Sync-back queue + headRevisionId pre-check + 3-state badge | After 4 | UX polish |
| 9 | Cancellation UI + "Hentikan & Buat Dokumen" button | After 5+6 | Operator control |
| 10 | Lost-in-doc app-form re-edit + pre-freeze banner | After 8 | Edge case recovery |

## RSK template — same architecture, separate scope

This doc focuses MUAP. RSK template (`GOOGLE_MASTER_RSK_DOC_ID`) follows the **same engine + same naming conventions + same lifecycle**, with its own token registry. Walkthrough RSK after MUAP is settled.

## Session decision log

Chronological record of every settled decision in the 2026.05.27 design session. **If a future change reverses one of these, update this list and add an entry with the reason.**

| # | Decision | Rationale |
|---|---|---|
| 1 | V2 philosophy: granular field-level tokens, AI restricted to explicit `ai_*` slots | V1 had ~16 high-level AI slots; bank/analyst feedback was "too few variables, too much AI prose, doesn't match real Indonesian MUAP form". Granular = auditable, less PII exposure to LLM, OJK-friendlier. |
| 2 | AI narrative prefix = `ai_` (not `ain_`, not `uraian_`, not no-prefix) | Short, explicit, engineering contract (engine routes through masking pipeline), discoverable when reading template directly. |
| 3 | Typos in human tokenization fixed during walkthrough commit (deferred from initial scan) | Human said "fix nanti di Master MUAP template yang baru." Captured in [Typos](#typos-in-human-tokenization-fix-during-walkthrough). |
| 4 | Fixed-row tables for MVP (no dynamic row insertion) | Dynamic rows via Docs API are mahal (insertTableRow + format inheritance). Start with fixed N, expand later if real cases need it. |
| 5 | Engine: NamedRange only, **no sentinels** `${{x}}…${{/x}}` | Human: "tidak menambah word atau mengubah styling yang ada di template. WYSIWYG, jujur." Setup script jadi trivial: find `{{token}}` → create NamedRange around it. |
| 6 | NamedRange ID is primary anchor; fallback to name; lost-in-doc as tertiary | Per human: "best effort and pray it will always works; we will think again if it doesn't work." Failure mode designed: `'lost-in-doc'` status surfaced to UI, blocks freeze. |
| 7 | Lost-in-doc → app value stays in app, **NO write-back to Doc** | Simplest. PDF will be missing that field; analyst acknowledges via pre-freeze banner. Drop the "Lampiran A appendix" idea I (Claude) proposed. |
| 8 | Bidirectional fill: replace with value, OR restore reference text | Reference text = original placeholder from References Doc (`___`, `[bracket]`). Round-trips: null in app ↔ reference text in doc. |
| 9 | Reference text source: **References Doc + DB cache (regenerable)** — NOT DB-as-authoritative | Avoids two-source drift. References Doc is single human-edit surface; DB is regenerable cache. |
| 10 | Hybrid source-of-truth: App init → Doc takes over → sync back to App | Pragmatic. Analyst familiar with Docs, PDF is artifact for committee. Per human: "app jangan jadi hambatan." |
| 11 | Doc menang absolute post-init (form fields tied to Doc-filled ranges = read-only) | Avoids split-brain. Exception: `'lost-in-doc'` re-unlocks app form for that specific field. |
| 12 | Forward-only master template propagation (no backfill of existing Doc copies) | Simplest. Existing apps' Docs are snapshots of template at copy time. |
| 13 | MUAP/RSK auto-created on Stage 3 entry (NOT button click) | Already built: `ensureStage3DocsOnEntry` in `server/docs/auto-draft.ts`, wired in `transitionAction` and `completeLegalAction`. Best-effort, idempotent. |
| 14 | Deep research runs **before** doc creation in same job (was: separate analyst-triggered) | Wiring change needed in `ensureStage3DocsOnEntry`: research first → then `createApplicationDocs`. Manual "Riset Web" button renamed to "Riset Ulang" for re-research after edits. |
| 15 | "Synchronous" advance REVISED → async background job queue | Original "sync" assumption (<60s) broke when human wanted 6-hour research cap. Resolved by role separation: role advancing (LG/RT) ≠ role owning MUAP (LA), so advance fires-and-forgets to queue. |
| 16 | 6-hour wall-clock cap for deep research (up from initial 2hr → 4hr → 6hr) | Per human: "naikan cap ke 6 jam" to give agent room without rushing to premature stop. |
| 17 | Tree-exploration agent (NOT free-roaming tool-use loop) | Predictable, auditable, parallelizable. Plan once → branches strict to plan → consolidate. No off-script wandering. |
| 18 | Strict-to-plan: agent CANNOT spawn new sub-questions mid-flight | Cost control. Wandering = expensive without proportional value. |
| 19 | Web research provider: **self-hosted SearXNG + Firecrawl OSS** | Bank-friendly (on-prem possible), zero per-query API cost. Operational cost shifts to infra (RAM, monitoring). |
| 20 | Stop-and-commit: analyst can interrupt research at any time; partial results used | Operator control. Finish current LLM call (already paid), abort next step, commit completed sub-Qs. |
| 21 | Audit per-step: new `ResearchStep` table + `AiInteraction` summary | OJK-grade auditability. Every search/fetch/LLM-call logged with timestamp + tokens + duration. |
| 22 | Restart-safety: MVP = in-progress jobs die on restart (`'failed-restart'`, manual re-queue) | Granular sub-Q checkpoint resume deferred. Acceptable for stable deploys. |
| 23 | Worker concurrency: async/await in same Node process, max 5 concurrent jobs | Research is I/O-bound. No child process needed for MVP. Scale out via separate worker process when 5 isn't enough. |
| 24 | AI fill failure mode: fallback to reference text + reasonable N retry | If Gemini fails for an `ai_*` slot, restore reference text — analyst can hit "Regenerate" later. Job doesn't fail. |
| 25 | `kind` column in token registry: `'fact-calc' / 'fact-display' / 'narrative-ai' / 'categorical'` | Sync-back triggers downstream recompute (hardgate, scoring) based on kind. |
| 26 | Sync mechanism: queue dedup per-doc + pre-check `headRevisionId` + 3-state badge | >90% reads are no-op (pre-check is ~100ms). Eliminates manual sync button. |
| 27 | Sync triggers: tab mount + window focus + detail page open + transition + freeze | Catches "analyst returns from Docs" without needing webhooks or polling. |
| 28 | Sync debounce 10s (was: 2s) | Per human: "supaya tidak kill server & Google Docs server." 10s tidak terasa stale, jauh lebih hemat. |
| 29 | No background cron (Layer C skipped for MVP) | List views don't depend on Doc data. On-read + transition triggers cover all real use. |
| 30 | Notification: in-app derived (polled), defer SSE | `lib/notifications.ts` already exists. SSE planned in `realtime-notifications-sse.md` future. |
| 31 | Per-query PII masking gate (refactor of existing classifier) | Agent generates queries dynamically; must gate per-call, not per-plan. |
| 32 | Full-text OCR fix: every uploaded doc gets full-text extracted, persisted to `ApplicationDocument.extractedText` | Shipped after the original design session. It is now available as research input; v2 still needs the tree agent to consume it with per-query PII masking. |
| 33 | Sequencing: walkthrough tokenisasi FIRST, then POC research agent | Tokenisasi blocks fill engine. POC validates research cost before committing to 6hr infrastructure. Documentation comprehensive enough that next session can pickup either independently. |

## Tokenization state map

**Status as of 2026.05.27**: both v2 masters fully tokenized. The rev 2.4 walkthrough (MUAP) and rev 2.1 walkthrough (RSK) are the spec; the masters were brought up to that spec via the coverage-gate flow (see playbook §Coverage gate).

- **MUAP v2 master** (`1kw5T…amI8`): **376 distinct `{{token}}` literals** placed. Coverage-gate RED count: 4 (presentational — 3 Tanda Tangan signature blanks in T87 + 1 metadocumentation reference to the literal word `[bracketed]` in the intro paragraph).
- **RSK v2 master** (RSK_Template_Profesional - Active): **106 distinct `{{token}}` literals** placed. Coverage-gate RED count: 1 (presentational — Tanda Tangan signature blank in T33).

All 5 residual RED slots are intentionally presentational signature lines, not data slots. Tokenization complete.

To re-derive the per-table state (e.g. after a future template revision), run:

```bash
pnpm --filter web-app exec tsx scripts/scan-muap-braces.ts $GOOGLE_MASTER_MUAP_DOC_ID
pnpm --filter web-app exec tsx scripts/scan-muap-braces.ts $GOOGLE_MASTER_RSK_V2_DOC_ID
```

The `── {{token}} catalog ──` section lists every token name + its section coordinates; the `RED slots` section flags any new gap. The catalog is the live source of truth — this doc deliberately does not duplicate it (would go stale).

Source-of-truth chain: rev walkthrough (`muap-v2-tokenization.md` rev 2.4, `rsk-v2-tokenization.md` rev 2.1) → reconcile tables (`.tt/handoffs/alfa-reconcile-{muap,rsk}.md`) → composite-cell spec (`.tt/handoffs/alfa-composite-spec.json`) → applied via `scripts/apply-token-spec.ts` → verified by `scripts/scan-muap-braces.ts`.

## Why the role-separation matters for async architecture

Critical insight from human (2026.05.27): the person who clicks "Advance ke Stage MUAP" is **not** the person who owns MUAP work. Workflow is:

- Stage 2 → 3 transition triggered by **LG or RT** (the role that completes stage 2)
- Stage 3 MUAP owner is **LA** (separate person)

This is what makes long-running async OK. The clicker isn't waiting; they advance and move on. LA picks up Stage 3 work later — by then, research may have finished or be in progress with status visible. No HTTP timeout, no browser tab issue, no UX block.

If the same role both advanced AND owned MUAP, 6-hour async would be psychologically painful (they'd watch the spinner). Role separation makes async free.

## Cost reality check (deep research production)

Per-app estimate at full 6hr cap:
- ~500-1000 LLM calls × ~4K tokens avg = 2-4M tokens × $1.25-5/MTok (Gemini Pro) = **$5-25/app**
- SearXNG self-hosted: zero per-query cost (infra only)
- Firecrawl self-hosted: zero per-page cost (infra only)

Most jobs WON'T hit cap. Real average likely **$3-10/app**. At 100 apps/month = $300-1000/month. At 500 apps/month = $1500-5000/month.

**Budget visibility needed**: admin dashboard showing per-app cost. Not built; placeholder in [Sequencing](#sequencing--whats-next) for later iteration.

## Bank-egress posture (source: external-services guide + launch gates)

- **Resolved 2026.05.24**: bank-egress = **on-prem + internet ALLOWED**, including external OCR + external LLM.
- **G5 LLM-vendor DPA**: still open (Bank Legal, Discovery-W1) — production go-live of any LLM (including research) gated on this.
- **Self-hosted SearXNG/Firecrawl** = on-prem stack, no per-query egress beyond what those tools fetch from public web (already public domain content).
- **LLM call (Gemini) = internet egress** — masked prompt only (G1), per-query PII gate (G2 in research scope), audit row (G3).

## Pickup pointers for next session

If you (next AI agent) are picking this up cold:

1. **Read this doc front-to-back** before touching MUAP/RSK code.
2. **Cross-reference**:
   - `docs/designs/document-system.md` (current V3) + `docs/references/document-templates.md` (live IDs/tokens) — what superseded the V2 build TODO
   - `docs/designs/workflow-finetune.md` — broader workflow context, §5 and §7 most relevant
   - `docs/references/ai-ml-deferred.md` — deferred AI work register
   - `docs/guides/launch-gates.md` — production-enable compliance/ops gates
   - `apps/web-app/src/server/research/*` — existing research stack (provider, pipeline, classifier)
   - `apps/web-app/src/server/docs/*` — auto-draft, seed, service
   - `apps/web-app/scripts/scan-muap-braces.ts` — diagnostic for any Doc by ID/URL
   - `apps/web-app/scripts/setup-template-ranges.ts` — current setup script (will be replaced/rewritten in v2)

3. **Current state of work (what's done vs not)**:
   - ✅ Design + decisions (this doc)
   - ✅ Web research pipeline (deterministic, will be REPLACED for v2 tree-exploration)
   - ✅ Auto-draft on Stage 3 entry (will be EXTENDED with research-first step)
   - ✅ Provider boundary for research (will gain `SearxngFirecrawlProvider`)
   - ✅ Tokenization complete on both v2 masters (MUAP=376, RSK=106)
   - ✅ Full-text OCR shipped and persisted (`ApplicationDocument.extractedText`)
   - ⏳ Token registry (TS) — NEXT TASK
   - ❌ Fill engine rewrite (NamedRange only, restore-reference-text)
   - ❌ Reference text DB cache + sync-from-References script
   - ❌ Job queue infrastructure (ResearchJob, ResearchStep, worker)
   - ❌ Tree-exploration agent
   - ❌ SearXNG + Firecrawl provider implementation
   - ❌ Sync-back queue + revision check + badge
   - ❌ Lost-in-doc app-form re-edit + pre-freeze banner

4. **Critical conventions to NOT change without explicit human re-approval**:
   - NamedRange-only (no sentinels)
   - `ai_*` prefix for narrative
   - Reference text source = References Doc, NOT DB-authoritative
   - Doc menang post-init, app form read-only for filled fields
   - Lost-in-doc → app value stays, no write-back
   - Forward-only master propagation
   - Research = tree exploration, strict to plan
   - Self-hosted SearXNG + Firecrawl
   - 6-hour cap

5. **Conversation source** (if you need to re-derive context): the design session of 2026.05.27 in a Claude Code thread. This doc is the durable extract — the original conversation may be compacted/lost.

## Open questions / future revisits

- **Restart-safety upgrade**: granular sub-Q checkpoint resume (currently MVP loses in-progress jobs on restart)
- **Real-time notifications**: planned via SSE+LISTEN/NOTIFY (`docs/planning/realtime-notifications-sse.md`) — defer until needed
- **Multi-instance scale-out**: in-memory `inFlight` dedup + worker poll lock will need Redis or DB row-lock if Mizan scales horizontally
- **Bank-customizable token catalog**: tokens currently TS-defined. If bank wants to add custom fields without code deploy, migrate to versioned DB pattern (like `SlaPolicyVersion`)
- **Token typo fix** (during walkthrough): `perubaahan` → `perubahan`, `proffesional` → `professional`, `rill` → `riil`
