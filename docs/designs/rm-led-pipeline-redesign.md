# RM-led pipeline redesign

- **Status:** Current — **BUILT P1–P5 and MERGED to `main`** (PRs #1/#2/#5, 2026.06.12), `test`-verified (unit 562 / integration 117, every batch adversarially reviewed). ADRs 0018/0019/0020 ratified; the **regulatory P3-B gating relocation** (NIK/AML gates moved 1→2 → MUAP→Risk) is live. Residuals (deferred, not blocking — tracked in [`../planning/execution-queue.md`](../planning/execution-queue.md)): P1 dedup migration (destructive — human-gated), Playwright e2e smokes, OCR financial-parser real-doc tuning, ADR-0019 broad group/domain folder-share (W1, needs a Workspace org). The phase-by-phase build plan was retired on merge (git history is the archive).
- **Last reviewed:** 2026.06.12

> A durable **blueprint** for reshaping Mizan from a linear stage pipeline into an **RM-led**
> flow over a **Customer → Deal → Document** graph, with Google Drive as the document substrate,
> AI as an always-on draft+recall layer, and soft gates with wide editable windows. Consolidates a
> design conversation (2026.06.10–11) across 9 topics + 9 reconciled forks. NOT a plan (no active
> build yet) and NOT an ADR (the per-decision *why* will be ratified as ADRs at build).
>
> **Posture (user, 2026.06.11):** we are early-dev — **shipped ADRs/code are revisable**; prefer
> change-for-better over preserving prior decisions. **PII/compliance is parked as a forward design
> constraint** (not deleted — see Topic 6 / B4): build the happy path; masking re-enables at W1.

> **How to read this doc (start here if you lack conversation context):**
> - **Decision codes** like `A1`/`B4`/`C7` decode in the table [§Resolved forks](#resolved-forks-the-9-item-recheck-20260611);
>   codes like `N1`/`A2`/`OCR widening` decode in [§Follow-up decisions](#follow-up-decisions-20260611-deep-dive-post-recheck).
>   They are stable IDs for settled decisions — always cite the table row, never assume.
> - **Terms of art:** *colek* (in-app dispatch request) and *W1* (Bank ratification workshop) are defined in
>   [`../GLOSSARY.md`](../GLOSSARY.md). *Inisiasi* = the consolidated intake→MUAP-drafting phase (Topic 1).
> - **BUILT P1–P5 and merged to `main` 2026.06.12.** This doc was authored as the TARGET; the design
>   now matches the shipped code. What is live today (with residuals/deferrals) is in
>   [`../CURRENT-STATE.md`](../CURRENT-STATE.md); remaining follow-ups are in
>   [`../planning/execution-queue.md`](../planning/execution-queue.md).

## Overview

The codebase already contains two pipeline models stacked: a **linear `stage` Int spine** (the SSOT)
and a **parallel workstream worktable** (`apps/web-app/src/lib/workstreams.ts`, shipped in the
CoordinationPanel / ADR-0009). This redesign makes the RM-led, parallel, bounce-friendly model the
product surface — **built over the existing `stage` Int** (no authority inversion yet; see Fork A1) —
and adds the substrate it needs: a persistent **Customer** entity, **two-folder Drive** document
storage with deterministic discovery, **layered AI context**, **open-read access**, and **review /
adendum** lifecycle events.

The UI spine is **a horizontal row of handoffs** with **parallel checklists beneath each**;
completing a checklist unlocks that segment's "main action" (a handoff — some are approval ladders).

## Design

### 1 · Pipeline shape

Horizontal **handoff spine** (the few points where control truly transfers) + **parallel checklists**
beneath each segment. Checklist-complete → the segment's **main action** unlocks → completing it
advances the spine. Some main actions are approval ladders (`lib/approval-chain.ts`).

- The spine is a **derived sequence of handoff-segments** over `stage` Int — illustratively
  `Inisiasi → Risk Review → Keputusan Komite → SP3 → Pencairan` — a **UI grouping**, NOT a renumber and
  **not bound 1:1 to the 4 `phaseOf` values** (e.g. SP3 surfaces as its own segment though it sits in the
  post-Komite phase). Segments are illustrative, not fixed.
- **`Inisiasi` = Phase 1** (`phaseOf` / `PHASE_OF_STAGE { 1:1, 2:1, 3:1 }`: stages 1-3 = intake →
  legal/agunan/biro → feasibility/MUAP; today labeled *Originasi* in `PHASE_NAMES`) — the consolidated phase
  **from the start through MUAP drafting**, NOT "Stage 3." Parallel checklist streams (docs ∥ legal ∥
  appraisal ∥ bureau ∥ MUAP-draft) hang beneath it.
- Stream-state is derived by `lib/workstreams.ts` over engine predicates (`lib/workflow.ts`:
  `isAt`/`isAtOrAfter`/`isBefore`). **Built over `stage` Int**, not a rewrite (Fork A1). The 6→4/1→16
  **renumber** (making phases the actual stage integers) stays **deferred** alongside the A1 inversion.
- **Intra-Inisiasi mechanics (A2):** the internal transitions (1→2, 2→3) keep their **existing milestone
  triggers** (e.g. 2→3 on the RM SLIK handoff) but **never block** — the relocated gates (docs, OCR,
  **NIK-mismatch**, AML) live at MUAP→Risk only. **Desk work-windows widen phase-wide** (Legal/Appraisal/
  bureau/MUAP-draft workable at any internal stage — opening the gates is *why* 1-3 is one Inisiasi).
  A checklist item is checked by **the assignee's explicit action** (e.g. Legal's "Selesaikan Analisa
  Yuridis" closes the colek request) — never by the RM on their behalf, never inferred.
- **Per-segment checklists (illustrative — the *pattern* is what's fixed):**
  - **Inisiasi** — dokumen (2 cards) · OCR/NIK confirms · AML attestation · Analisa Yuridis · Penilaian
    Agunan · SLIK/Pefindo+Kol · 5C+1S/financials · MUAP (**explicit Generate** → draft → ladder
    RM→Team Leader). Exit: all checked → ladder completion = the Risk handoff.
  - **Risk Review** — RSK (auto-created on entry, ADR-0016 §3) → rekomendasi → ladder RA→Risk Team Leader.
    Exit: Komite queue (risk-reject → closed).
  - **Keputusan Komite** — jadwal (sekretariat) · deck · Rapat + Ketua records decision · MoM drafted
    (RM) · MoM signatures (**collected in parallel; they gate SP3-final, not this segment**).
  - **SP3** — draft (opens at decision-recorded) ⇄ review by the **Legal function** (of the single
    Legal & Appraisal desk) (unlimited bounce). Exit: MoM all-signed **+** Legal-approved → SP3 final.
  - **Pencairan** — ***display-only* over the existing engine** (C8/A4): DisbursementStatus steps
    unchanged; P3 must NOT redesign post-SP3 mechanics.

#### Colek — in-app dispatch + sticky auto-assignment (A1)

RM dispatches **in-app**: "Minta Analisa Yuridis / Penilaian Agunan" creates a tracked **request**
(`requestedBy/At` · assignee · status `diminta → dikerjakan → selesai`) + a **notification** to the
desk. Deliberately small — request + notify + track; Diskusi covers conversation (no ticketing
system). The Jira dependency drops for this flow; the SP3 Legal-review chain is the same idea at the
SP3 segment. **Assignment:** the *first* assignment auto-picks the desk holder with the **fewest
active deals** (tie → least-recently-assigned); thereafter **sticky** — the same person keeps that
desk's work on this app start-to-end (all roles: RM inherently, Legal, RA, …). **Admin reassign**
(sakit/cuti), audited; stickiness follows the new person. W1 may add designated-routing rules (the
`approval-routing` pattern).

### 2 · Customer entity

**Customer-first entry:** RM opens/picks the `Nasabah`, then creates an app inside it. New first-class
`Customer` entity (today identity lives on `Application` — `prisma/schema.prisma` `nasabahName`/`nik`/
`npwp`/`nib`/`alamat`…; migrating those up is the blast-radius).

- **One `Customer`, typed `individual | business`** (don't model pengurus/pemegang saham as their own
  entities — Fork-equivalent "A"). They are **attributes** of the company file.
- **Layered data:** real columns for queried identity (npwp, nib, alamat, bidangUsaha) + **Zod-
  validated JSON aggregate** for repeating groups (`pengurus[]`, `pemegangSaham[]`) — matching the
  schema's existing "JSON aggregate, read as a unit, never filtered by sub-field" convention
  (`hardGates`, `financialInputs`) — + a **slimmed `extractionExtras`** for the genuine one-off
  long-tail.
- **Identity key:** NIK (individual) / NPWP (business), NIB secondary. On a create-time match →
  **soft nudge** ("Nasabah ini sudah terdaftar — buka filenya?"), not a hard block.

### 3 · Document storage (Google Drive)

**Two folders per app:** a **Nasabah folder** (customer-level, **shared by reference** across all the
customer's apps → carry-forward with zero copying) + an **app-specific folder** (per deal). Document
tab = two checklist cards (Dokumen Nasabah vs Dokumen Pengajuan), matching the Bank's checklist split
(`references/sources/Hijra Bank Process - 5 Checklist Dokumen Pembiayaan 2025.jpeg`).

- **Ownership × organization are independent choices:** Drive owned by Mizan *or* user-supplied;
  organized as a flat dump *or* the Mizan standard structure. If user-supplied and a doc isn't
  discovered, **the RM fixes it** (rename/move/tag) — not Mizan's job to untangle.
- **Discovery = deterministic substring matcher only** (no AI, no OCR/content peek): each checklist
  item has admin-editable query aliases, e.g. `KTP: ["KTP", "Kartu Tanda Penduduk"]`, tested as a
  case-insensitive substring against the file's **full path** (matches filename *or* folder). It is
  **many-to-many** — one file (`KTP & NPWP Pengurus.pdf`) satisfies *every* item whose query matches,
  so the RM never splits/duplicates.
- **Reconciliation = 3 states:** ✅ satisfied · ⬜ missing · ⚠️ present-but-unrecognized (the RM's
  fix bucket). Match is auto-accepted (link to verify; **no mandatory confirm** unlike OCR).
- **Re-discover: both triggers** — explicit whole-folder rescan ("Pindai ulang") + automatic per-file
  re-check when the RM fixes a ⚠️ row.
- **Opt-in scaffold:** for a user-supplied folder the RM can ask Mizan to create the standard structure
  inside it (needs Editor; missing permission → **warn, never require**).
- **OCR extraction widens with the checklist** (the existing registry/cross-check pattern — `fill/match/
  mismatch`, blessed values never overwritten): LapKeu → omzet/laba bersih; SPT → reported income
  (**cross-doc** vs LapKeu); Rek Koran → saldo rata-rata; SLIK → baki debet + fasilitas aktif (beyond
  Kol); Akta/SK → pengurus & pemegang saham (cross-check vs KTP pengurus + the `Customer` aggregate);
  Laporan Penilaian → **nilai pasar + nilai likuidasi**. Identity also cross-checks the
  **customer-master** on repeat apps. All new mismatches **advisory — NIK stays the only blocker**.
- **Versioning (source docs) = content-addressed manifest ledger** (refs + `sha256` + scan history),
  **no byte copy** (Approach B). Drive-native revisions = a bonus link, never the source of truth.
  Trade-off accepted: the "what existed at Komite" record is a manifest of references, not a
  byte-vault; sha256 *detects* change but can't *reproduce* deleted bytes. Purely additive upgrade to
  byte-copy-at-milestones later. (Generated docs use a different regime — see Topic 6 / Fork B5.)

### 4 · Gating

Hard-gate at the **handoffs**; wide-open editable windows before each; **unlimited bounce loops** via
the existing reject/re-request cycle (`lib/approval-chain.ts` `currentCycleSteps`).

- **MUAP → Risk Review:** checklist done *incl. MUAP ladder (RM→Team Leader) fully approved*. Ships today via
  `makerSubmitGateError` (`lib/stage-action.ts`) + ladder completion = the advance.
- **App → Komite:** checklist done *incl. RSK ladder (RA→Risk Team Leader) approved*; a risk-`reject`
  never enters the queue (ADR-0005/0016).
- **SP3 → final + advance:** SP3-FINAL is gated by **two prerequisites that must BOTH hold** — (1) the
  MoM signed by **all** attending Komite **and** (2) the SP3 **Legal-review approved**. These two are
  independent prerequisites, not a sequence: neither one alone advances the deal.
  **New:** an SP3 single-reviewer "chain" reviewed by the **Legal function of the Legal & Appraisal desk**
  (one combined desk, see Glossary — *not* two separate reviewers), built on the existing
  approval-chain primitive.
  **The DRAFTING window runs in PARALLEL (N1):** SP3 drafting **opens at decision-recorded** while the
  deal **stays at the Komite stage** until the MoM finalises (ADR-0005 §4 untouched — stage routing
  still fires on MoM-final). Meanwhile the SP3 draft ⇄ Legal-review **bounce loops in parallel** — the
  MUAP-early pattern applied to SP3. So drafting+review happen concurrently with MoM collection; only
  when BOTH prerequisites above are met does SP3 reach FINAL and the deal advance.
- **MUAP draftable early** (from Inisiasi) — the advance gate still protects Risk Review, so opening
  the draft window early is safe (reverses ADR-0016 §1's MUAP half only — Fork B6 / ADR-0018). The MUAP
  Doc is minted by an **explicit RM "Generate MUAP"** (N2), not auto at app creation — the seed fill
  reflects the data gathered so far; `RegenerateMuap` re-mints. The doc spine tolerates MUAP-absent in
  early Inisiasi (same pattern as RSK-absent ≤ Stage 3).
- **AML** (`lib/aml.ts`) is a checklist item gating **MUAP→Risk**, not the front door (Fork A2). App
  creation is free; Mizan records, **never screens**. The attestation upgrades from a checkbox to a
  small **structured record** — `{result: clear | hit-cleared+catatan, screenedParties (perusahaan +
  pengurus/pemegang saham), screenedBy/At (ref CS), evidenceDocId?}` — with the screening evidence as a
  checklist **document row**; apps with `originType ≠ original` require a **fresh attestation**
  (periodic re-screening, APU-PPT).
- **Deliverables are structured, not booleans:** Analisa Yuridis → `{opinion: layak | layak-dengan-
  catatan | tidak-layak, catatan[], reportDocId?}`; Penilaian Agunan → `{path: internal|kjpp_short|
  kjpp_long, nilaiPasar, nilaiLikuidasi, penilai/KJPP, tanggalLaporan, reportDocId?}` (the RSK snapshot
  already reads market+liquidation+SCCR — this finally feeds it). The memo/report lands as a document
  row (discovered/OCR'd; the report's value cross-checks the entered figure). **Completion gates; the
  verdict doesn't** — a "tidak layak" opinion is a signal Risk/Komite weigh, not an auto-blocker.

### 5 · AI context + recall

Customer-level memory exists in **two tracks, presented as one editable context**, modeled like
**AGENTS.md** (cascade by scope):

- `Customer.contextMd` (Nasabah-scoped, ≈ root AGENTS.md) + `Application.contextMd` (app-scoped,
  ≈ app-local). Injected **broad → narrow** at the **end of the system prompt** as a **compact
  rendered summary** (not a raw dump).
- Each doc = an **AUTO derived block** (regenerated from derived facts, never hand-edited) + a
  **sacred human "Catatan" block** (free-text, additive, attributed). Correcting a *structured* derived
  fact happens at the **field** (the existing OCR-suggested → human-confirmed `extractionSources`
  path), not in prose.
- **Per-surface context policy** (NOT a global append) — 7 surfaces (`AiSurface` in `lib/ai-api.ts`):
  - **All 3 layers** (derived → customer → app): `narrative`, `advisory`, `assistant`, `bureau`,
    `discussion`.
  - **Customer-identity only** (skip derived): `research` (it fetches *external* info — prior Mizan
    outcomes are noise).
  - **NO context** ⚠️ (correctness rule): `extract` — injecting memory risks the extractor carrying a
    prior deal's value into the current doc's transcription.
- Context injection routes through the masking seam (`maskForEgress`) so it's raw while masking is
  parked and auto-masked when re-enabled (Fork B4).

### 6 · Access

**Open READ, scoped WRITE.**

- **Read = fully open** — any Mizan account sees every customer, deal, doc, AI output. This is the
  "Mizan is not a bottleneck" intent, applied to *seeing*.
- **Write = desk/role-scoped** for **authoritative-state changes** (workflow integrity, not info-
  control — the whole maker-checker engine depends on it). See Fork A3 for the exact boundary.
- **Generated docs** (MUAP/RSK/MoM/SP3) **always live in Mizan's Drive**, Mizan-owned + frozen, in the
  Mizan-standard structure. A **shortcut** is dropped into the user's app folder (points by file ID,
  so the user can reorganize freely). If Mizan lacks Editor to place it: **warn + "Coba lagi" retry
  button** — the doc still lives in Mizan and is viewable in-app, nothing breaks.
- Symmetric: **user-supplied source folders appear as shortcuts** inside Mizan's uniform skeleton
  (resolve shortcut → scan target → match structure-agnostically; no imposed subfolders inside a
  user folder).
- Generated-doc versioning stays **Drive copy-snapshots** (`DocumentVersion` + ADR-0008) — a
  different regime from source docs (Fork B5).

#### Mizan Drive skeleton (Mizan-owned default)

```
Mizan/Nasabah/PT Sumber Rejeki — CUST-00123/
├── 📂 Dokumen Nasabah/            ← customer-level · shared by reference across apps
│   └── 01. Legalitas/ · 02. …     (Akta, SK Menkeh, NPWP, NIB, KTP & NPWP Pengurus, CV, Struktur)
└── 📂 Pengajuan/
    └── FOS-2026-001 — Modal Kerja 5M/
        ├── 🔗 Dokumen Pengajuan  → [folder Drive user]   (shortcut if user-supplied; else real)
        └── 📂 Dokumen Mizan/      ← generated · ALWAYS Mizan-owned + frozen
            └── MUAP/ (+ Riwayat versi/) · RSK/ · MoM/ · SP3/
```

### 7 · Origin flag + review / adendum

Every app carries **`originType` = `original | review | adendum`** + **`sourceApplicationId`** (a
self-reference forming an ordered **lineage**). Distinguished by **initiator**, both reuse the **full
pipeline**; the change/no-change outcome emerges from the Komite decision.

- **Review** = Bank-initiated periodic health-check. **Adendum** = Nasabah-initiated term change.
  Convergence: an adendum is both a standalone entry *and* the change-branch of a review.
- **Cadence flagging** = cascade default **12 months** → Nasabah override → facility override (unit:
  months). Mizan flags scheduled reviews from **its own calendar only**; off-cadence reviews
  (macet bayar) are RM-started with a recorded reason. **Mizan records, never monitors** payment/Kol.
- **"Current terms"** = walk the lineage to head; **"full story"** = the chain in causal order.
- **AI adapts** via `originType` (task framing) + context resolving to current terms — falls out of
  Topic 5's per-surface policy, no new AI machinery.

## Conventions & invariants

- **One editable doc window at a time survives** (ADR-0016 §2–5 kept): MUAP edit window = Inisiasi
  only; RSK = Stage 4 only; they never overlap (RSK doesn't exist until the MUAP freezes).
- **Authoritative state changes are desk-scoped; pure annotations are open+attributed** (Fork A3):
  scoped = stage transitions, approvals/signing, Komite decision & scheduling, doc generation, config,
  **and data that feeds gates** (financials, OCR-confirm, Kol). Open = custom-context *notes*,
  discussion thread, file tags, personal status. Rule: *changes authoritative state → scoped; pure
  annotation → open*.
- **Discovery never reads content** — deterministic path/name substring only; unmatched → the RM fixes
  placement/naming or tags manually.
- **Mizan records, never monitors** — no payment/Kol/balance ingestion; external facts (AML, outstanding
  if ever added) are *recorded snapshots*, not computed.
- **`extract` AI surface gets no context** — non-negotiable correctness rule against cross-deal
  contamination.
- **Checklist items check on the assignee's explicit action** (colek request → explicit completion);
  inside a deliverable, **completion gates, the verdict doesn't** (a "tidak layak" opinion is a signal,
  not an auto-blocker).
- **The private risk assistant stays desk-scoped** (`muap-author`/`rsk-author`) — "open+attributed"
  covers annotations (notes/discussion/tags), not AI work surfaces.

## Resolved forks (the 9-item recheck, 2026.06.11)

| Fork | Decision |
|---|---|
| **A1** authority inversion | **Defer.** Build pipeline UI over `stage` Int (workstreams already prove parallel-over-int). Invert (Phase 3b, `planning/workflow-snapshot-persistence.md`, ~128 readers) only when review/adendum/lifecycle forces it. |
| **A2** front-door gate | AML gates **MUAP→Risk**, not creation. 1-2-3 collapse into Inisiasi; creation free; all docs/OCR/NIK/AML/legal/appraisal become parallel checklist items. |
| **A3** write-scope | Authoritative-state writes (incl. gate-feeding data) **scoped**; annotations (notes/discussion/tags) **open+attributed**. |
| **B4** compliance parking | **Config-flag no-op** on the shared `maskForEgress` seam (default off in dev, keep code, re-enable at W1). Do **not** delete the machinery. |
| **B5** versioning regimes | **Two, by doc class:** generated = Drive copy-snapshots (ADR-0008); source = manifest ledger (refs+sha256, Topic 3). |
| **B6** ADR-0016 | **New superseding ADR** reverses §1 (MUAP-early) only; §2–5 stand. SP3 chain is build work. |
| **C7** facility entity | **No new entity (start small).** Reviews/adendums use the `sourceApplicationId` chain; facility-lifecycle data (outstanding, installment schedule) **deferred** — forward-compatible with a later `Facility` entity. |
| **C8** post-SP3 | **Defer** Persetujuan → Akad → Pencairan; akad doc (after SP3-approve) stays out of scope (V1). |
| **C9** entry paths | **Two coexist:** new deal = customer-first; review/adendum = shortcut from the existing app. |

## Follow-up decisions (2026.06.11 deep-dive, post-recheck)

| Item | Decision |
|---|---|
| **N1** SP3 parallel | SP3 draft + review by the **Legal function** (of the single Legal & Appraisal desk) open at **decision-recorded** and bounce in parallel; stage routing (ADR-0005 §4) untouched; **both** MoM-all-signed **and** Legal-approved gate **SP3-final**. |
| **A1** colek | **In-app** request+notify+track; first-assign = fewest-active-deals auto (tie → least-recently-assigned); **sticky** per app×desk start-to-end; admin reassign, audited. |
| **A2** intra-Inisiasi | Existing milestone triggers stay, gates dropped (all relocated to MUAP→Risk incl. NIK); desk windows widen phase-wide; checklist checks on the assignee's explicit action. |
| **A3** entry CTA | Beranda primary CTA "Nasabah / Pengajuan Baru" (intake-desk only) → customer-first flow. |
| **A4** deferred segments | Spine renders SP3-post-final/Pencairan **display-only** over the existing engine; no mechanic redesign (C8 holds). |
| **N2** Generate MUAP | MUAP Doc minted on **explicit RM action**, not auto at app creation; `RegenerateMuap` re-mints. |
| **N3** checklists | Per-segment checklist sketch in Topic 1 — illustrative; the pattern (checklist → exit gate → handoff) is what's fixed. |
| **OCR widening** | Registry extends to LapKeu/SPT/Rek Koran/SLIK/Akta/Laporan Penilaian (+ customer-master cross-check); advisory-only, **NIK stays the sole blocker**. |
| **AML upgrade** | Structured attestation (+screened parties, evidence doc); **fresh attest required on `originType ≠ original`**. |
| **Deliverables** | Structured results (Yuridis opinion · Penilaian nilai pasar+likuidasi + report docs); completion-gates-verdict-doesn't. |

## Open questions / deferred

- **ADRs:** [0018](../decisions/0018-muap-editable-early.md) (MUAP-early) · [0019](../decisions/0019-open-read-scoped-write-access.md)
  (open-read/scoped-write) · [0020](../decisions/0020-customer-entity-and-rm-led-pipeline.md) (Customer +
  pipeline-over-Int) — **accepted, ratified 2026.06.11** (P0 ✅). Still future: the
  **authority inversion** ADR if/when Fork A1 flips.
- **Authority inversion (Phase 3b)** — deferred per A1; the trigger is the review/adendum/facility-
  lifecycle work that breaks the bare `stage` Int. → `planning/workflow-snapshot-persistence.md`.
- **Facility entity** (outstanding + installment schedule) — deferred per C7; revisit when Mizan needs
  facility-level rollups. If added, it refines the lineage chain into a Facility the apps relate to.
- **Post-SP3 segments + akad generation** — deferred per C8; stay on the existing engine / out of V1.
- **PII/compliance** — parked per B4; OJK W1 ratification will almost certainly reinstate masking +
  access scoping. → `../references/compliance.md`, `pii-masking.md`.
- Build plan: phased P0–P5 with an autonomous safety harness + selective TDD — **retired on merge
  (2026.06.12); git history is the archive.** Remaining follow-ups live in
  [`../planning/execution-queue.md`](../planning/execution-queue.md).
