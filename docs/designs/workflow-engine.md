# MIZAN — Workflow engine (command-sourced, ledger-backed, snapshot-authoritative)

- **Status:** Partially realized — the maker-checker `ApprovalStep` ladder + append-only history + the command seam (`decide`/`dispatch`) shipped 2026.06.04 (see `../CURRENT-STATE.md`). ⚠️ The **authoritative *persisted* snapshot (ADR-0004 §3) is NOT built — PENDING, needs to be done**: `deriveWorkflowSnapshot` is a derived projection and `stage` (Int) is still the cursor (the inverse of the target). Tracked in `../planning/workflow-snapshot-persistence.md`; the rest of the model remains the standing blueprint.
- **Last reviewed:** 2026.06.04
- ⚠️ **Predates the RM-led pipeline redesign (merged 2026.06.12).** The flow-trace below still shows the old gate placement — the intake hard-gates (docs/intake-OCR/NIK/AML) **no longer gate Stage 1→2**; they relocated to the **MUAP→Risk submit** (`muapToRiskBlockers`). For current gating read [`../CURRENT-STATE.md`](../CURRENT-STATE.md) + [`rm-led-pipeline-redesign.md`](rm-led-pipeline-redesign.md); the command-sourced/ledger model itself is unchanged.

> **🧭 North Star — Mizan = neraca tepercaya** (ميزان: timbangan/keadilan). Mizan **menimbang & mengingat**
> a human financing process — **it does not drive it**. The team (RM↔Legal↔Appraisal↔Risk↔Komite) runs the
> deal through fast, informal collaboration; Mizan remembers it perfectly (append-only, nothing destroyed)
> and proves it to the regulator. Value = **trustworthy memory + accountability, not control** — **if Mizan
> slows them down, it has failed.** Decision filter: *does this make Mizan a more trustworthy, frictionless
> ledger → do it; a controller/bottleneck → reject.* The six pillars are §"Design principles" below.

> The durable **blueprint** for how the application workflow engine is built. The *why we chose this
> over event sourcing* is `../decisions/0004-workflow-engine-command-sourced.md`. The *process it drives*
> (16-step / 4-phase RM maker-checker target) is `../designs/workflow-target.md` (ADR-0003). This doc is
> the engine shape; it does not restate the process model.

## Overview

Every mutation is a typed **command** through one pure **guarded reducer**. The facts a regulator audits
(`ApprovalStep`, `HistoryEntry`, `DocumentVersion`) are **physically append-only ledgers**. An
authoritative named **snapshot** (`phase`/`step`, not a bare integer) is the operational truth for the
board, work-queues, and guards — written only through the seam, atomically with the ledger inserts.
**⚠️ This persisted snapshot is the design target, NOT yet built — pending** (`../planning/workflow-snapshot-persistence.md`); today it is a derived projection over the `stage` Int.
The **process shape** is a declarative definition in code; **config** owns the numbers/grants. This is
NOT event-sourcing: there is no `WorkflowEvent[]` SSOT and no projection-replay-on-read (ADR-0004).

```
        WRITE                                         READ
  ┌──────────────┐                            ┌──────────────────┐
  │ WorkflowCmd  │                            │ snapshot (cursor)│ ← board, queue, guards
  └──────┬───────┘                            │ + ledgers (facts)│ ← detail, audit, QR
         ▼                                     └──────────────────┘
   decide(state, cmd, actor)  ── PURE ──▶ Decision | Rejection
         ▼ (executor — one Postgres transaction)
   INSERT ledgers (append-only)  +  UPSERT snapshot     ← optimistic version guard
         ▼ post-commit, idempotent (outbox)
   effects: FreezeDoc→SeaweedFS · Notify
```

## Design principles (Mizan records, doesn't gate)

Mizan is a **system of record + audit**, not a straitjacket for the team's collaboration. RM, Legal &
Appraisal, and Risk Analyst work closely and informally; by the time a deal reaches Komite ~90% are
already aligned. The engine must make that fast collaboration **faster** (auto-captured audit, document
generation, single source of truth, no Jira status-chasing) — **never a bottleneck**.

1. **Two-axis RBAC — open visibility, scoped action.**
   - **Read = open:** any authenticated staff can VIEW any application, including a **draft MUAP**
     (V1 = all staff; branch / need-to-know scoping is a W1 question at larger scale).
   - **Act (write / sign / decide) = desk-scoped:** you can only act where you hold the desk.
   - So Risk can *preview* a draft MUAP and RM can *@mention* Risk to align early **without** tasking Risk
     with every draft — visibility is **pull** (opt-in), tasking is **push** (scoped). Early RM↔Risk is an
     **alternative path, not the main path** (else Risk drowns).
2. **Proposal vs workflow — separate the data that evolves from the formal gates.**
   - The **proposal** (akad, plafond, tenor, margin/nisbah, collateral, purpose) is **mutable working
     state** RM revises freely through pre-Komite negotiation. Each revision is `+HistoryEntry`, **not** a
     workflow transition (`ReviseProposal{fields, reason}`). Loops = proposal edits → no state explosion.
   - The **workflow** state machine tracks only **formal milestones** (MUAP frozen, RSK frozen, Komite,
     SP3, Akad, Pencairan).
   - **Akad is part of the proposal: mutable pre-Komite, frozen at the Komite decision** (supersedes the
     earlier "akad immutable at intake"). Bank counter-offers (akad A → akad B + new amount) are proposal
     revisions; the customer formally accepts the final terms at **SP3 (step 12)**.
3. **Phase A is parallel-by-default and freely iterative — nothing is one-shot.**
   - Legal, Appraisal, SLIK, and MUAP-drafting open **concurrently**; the only ordering is **data
     dependency** (MUAP *submit* needs inputs; Risk *finalize* needs MUAP final). The 1→16 diagram is
     linear for reading; the engine is parallel.
   - **Desks re-open on input change:** a late document invalidates the desk that validated the old set
     (e.g. a new doc re-opens Legal). "Desk complete" is *over the current inputs* — same shape as the
     signature-reset invariant.
   - **Pre-submit = total freedom** (no gates); friction appears only at the signing boundary, where audit needs it.
4. **Gates are confirmatory, not deliberative.** ~90% are pre-aligned, so the maker-checker ladder is a
   **fast one-click + QR** confirmation, send-backs are cheap, and the Komite surface optimizes for
   recording an (often-approve) decision + MOM — not heavyweight review.

## Design

Replaces the as-built engine: the mutable `Stage = 1..6` + `applyTransition` / `advanceOnDualSignOff`
(`apps/web-app/src/lib/stage-action.ts`), and the delete+recreate persistence in `saveApplication`
(`apps/web-app/src/server/repo/write.ts`). Keeps the `loadApplicationForWrite` + version-guard seam.

### Snapshot — authoritative operational state

Named cursor + a cached read-model for the board/queue (rebuildable). Whether the app *may* advance is
**not** stored here — guards compute it from the ledgers + aggregates (`documents`, `amlAttestation`, …).

```ts
type Phase = 'intake' | 'legal-appraisal' | 'muap' | 'risk'
           | 'komite' | 'offer' | 'akad' | 'pencairan'

interface WorkflowSnapshot {
  phase: Phase
  step: StepId                 // 'muap-signing' | 'rsk-signing' | 'komite-decision' …
  status: 'active' | 'closed'
  closeReason?: CloseReason    // extend: + 'risk-reject' | 'nasabah-withdraw' | 'sp3-expired'
  openWork: WorkItem[]         // { desk, sinceAt, slaDueAt } — cache for board/queue
  freeze: { muap?: FreezeState; rsk?: FreezeState }   // 'pending' | 'done'
  // komiteDecision / conditionalResponse / disbursement — carried as today (lib/types.ts)
}
```

### Ledgers — append-only facts

```ts
ApprovalStep   { id, applicationId, chain:'muap'|'rsk', rung:Desk,
                 action:'request'|'approve'|'reject', userId, reason?, qrToken, createdAt }
HistoryEntry   { id, applicationId, action, actorId, phase, reason?, at }
DocumentVersion{ id, applicationId, kind:'muap'|'rsk'|'sp3', version,
                 signers:[{ userId, rung, qrToken, at }], storageKey?, frozenAt? }
```

| Data | Append-only? | Why |
|---|---|---|
| `ApprovalStep`, `HistoryEntry`, `DocumentVersion` | **YES — insert-only** | the regulated, audited facts; re-handling = new rows, never overwrite |
| `WorkflowSnapshot` | **planned** mutable (via seam) — ⚠️ **not yet persisted**; derived from `stage` today, persistence pending (`../planning/workflow-snapshot-persistence.md`) | operational cursor; rebuildable |
| `documents[]`, OCR, `amlAttestation` | mutable fields | working state — **but every change is logged to `HistoryEntry`** |

`qrToken` is the QR-signing anchor (unique per signer × document version; scan → signer + timestamp; NOT
e-meterai). See `workflow-target.md` §"Aturan tetap" + glossary **QR signing (Hijra)**.

### Command + reducer + executor

```ts
type WorkflowCommand =
  | { type:'SubmitApplication'; akad:AkadType; … }
  | { type:'VerifyDocument'; docId; disposition:'pass'|'fail'; reason? }   // reason wajib saat fail
  | { type:'ConfirmExtraction'; docId; field }       // confirm OCR ocr_suggested → ocr_confirmed (desk-owned)
  | { type:'CompleteDesk'; desk; notes? }            // explicit desk handoff (legal/appraisal/sp3-review/akad-draft)
  | { type:'AttestAml' } | { type:'RecordBureau'; … }
  | { type:'RequestApproval'; chain:'muap'|'rsk' }
  | { type:'ApproveStep'; chain } | { type:'RejectStep'; chain; reason }
  | { type:'ReturnToRm'; reason } | { type:'RejectRisk'; reason }   // cross-domain RA→RM
  | { type:'CommitteeDecide'; verdict; note? } | { type:'NasabahRespond'; resp:'accept'|'decline' }
  | { type:'Withdraw'; reason } | { type:'CompletePencairanChecklist' }
  | { type:'ReviseProposal'; fields; reason }        // edit akad/plafond/terms/collateral (pre-Komite)
  | { type:'RegenerateMuap' }                        // re-draft MUAP from latest data (AI-assisted)
  | { type:'RollbackDocument'; kind; toVersion }     // restore a prior version as a NEW current (ADR-0008: snapshot-copy)
  | { type:'MentionUser'; target; text }             // @mention role/person + per-app comment

interface Actor { userId:string; desks:Desk[] }     // who + their grants
type Rejection = { code:string; message:string }     // guard failure → ZERO mutation

interface Decision {
  appends:  { approvalSteps?:…[]; history:…[]; docVersions?:…[] }
  snapshot: WorkflowSnapshot
  effects:  SideEffect[]                              // FreezeDoc | Notify
}

// PURE — testable without a DB.
function decide(state:{ snapshot; ledgers }, cmd:WorkflowCommand, actor:Actor): Decision | Rejection

async function dispatch(appId, cmd, actor) {
  const state  = await loadApplicationForWrite(appId)   // snapshot + ledgers + version (exists)
  const result = decide(state, cmd, actor)              // pure
  if (isRejection(result)) throw new CommandRejected(result)
  await prisma.$transaction(tx => {
    versionGuard(tx, appId, state.version)              // optimistic concurrency (exists)
    insertLedgers(tx, result.appends)                   // INSERT-only — the append-only fix
    upsertSnapshot(tx, result.snapshot)
  })
  await runEffects(result.effects)                      // post-commit, idempotent
}
```

### Transaction + freeze boundary

Ledger inserts + snapshot upsert are **atomic in Postgres**. The SeaweedFS freeze + QR token fill cannot
join that transaction, so on the last signature: commit `{ phase advanced, freeze:'pending' }` first,
then the post-commit effect freezes the doc, fills §sig/§IX with the QRs, and flips `freeze:'done'`
(idempotent; a retry reconciles). **Never freeze-before-commit** (avoids a frozen doc with no committed
state). Today's freeze path: `muapStorageKey`/`rskStorageKey` + SeaweedFS (`guides/workflow.md`).

### Process shape — declarative, in code

> **Ladder dua jenjang — BUILT** (shipped 2026.06.12 — typecheck+unit+integration verified; live smoke pending). MUAP = RM → Team Leader; RSK = Risk Analyst → Risk Team Leader. As-built di `apps/web-app/src/lib/approval-chain.ts` (`CHAINS`); keputusan + rasional: [ADR-0021](../decisions/0021-two-rung-approval-chains.md).

```ts
const WORKFLOW: WorkflowDef = {
  chains: {
    muap: ['muap-author','muap-approve-tl'],            // desks, in order
    rsk:  ['rsk-author','rsk-approve-rtl'],
  },
  unlock:   { muap:'risk', rsk:'komite' },   // document FINAL → unlock next phase
  sendBack: { rejectRung:'→maker', riskToRm:'→muap' },
  terminals:['cair','ditutup'],
}
```

### Worked trace — MUAP ladder

```
RequestApproval{muap} by RM
  guard: RM has muap-author? MUAP draft exists? hard-gate clear (or override+reason)?
  → +ApprovalStep(request,RM); snapshot.step='muap-signing'; effect Notify(TL)
ApproveStep{muap} by TL (Team Leader)  → +ApprovalStep(approve,TL); CHAIN COMPLETE   [guard: actor≠RM, order RM→TL, distinct, last=request]
  → +DocumentVersion(muap,v1,signers=[RM,TL]); snapshot.phase='risk', freeze.muap='pending'
  → effect FreezeDoc(muap,v1)   // post-commit: fill §sig QR, push SeaweedFS, freeze.muap='done'
RejectStep{muap,reason} by TL (alt)
  → +ApprovalStep(reject,TL,reason); snapshot.step='muap-author'; NO freeze
```

### Reject taxonomy

- **Intra-chain** (Risk Team Leader rejects RSK): `+ApprovalStep(reject)`, chain restarts at `rsk-author`,
  **phase stays `risk`**. Not a phase move.
- **Cross-domain (Risk Analyst → RM)** — two distinct actions on the incoming MUAP:
  - **`ReturnToRm{reason}`** — send-back for **MUAP edit** (NOT a reject): phase back to `muap`; MUAP
    becomes editable → **its signature ladder RESETS** (new `DocumentVersion`; RM→TL re-sign; new QRs).
  - **`RejectRisk{reason}`** — too risky: **terminal** `closeReason='risk-reject'`; `+History(risk-rejected, reason)`;
    `Notify(RM)` carrying **"rejected by Risk Analyst" + reason** → **RM informs the Nasabah out-of-system** (not
    tracked). General rule: an **internal rejection** (Risk / Komite) closes the app + notifies RM; the customer call is RM's, off-system.

## Conventions & invariants

- **One write seam.** Workflow state changes ONLY via `dispatch(cmd)` → `decide`. Never mutate snapshot
  fields elsewhere. (This is what keeps audit ↔ state consistent.)
- **Ledgers are insert-only.** `ApprovalStep` / `HistoryEntry` / `DocumentVersion` are never deleted or
  updated — fix the `saveApplication` delete+recreate for these tables first.
- **Editing a signed document voids its signatures.** Any content change to a signed doc (e.g. MUAP after
  a Risk send-back) starts a **new `DocumentVersion` with zero signatures** → the maker-checker ladder
  restarts from the first rung. Prior versions' signatures stay in the ledger (historical, superseded).
- **De-finalizing cascades up the dependency chain** (`proposal → MUAP → RSK → Komite`). A phase is
  open only over the **FINAL** upstream doc (`unlock: muap→risk, rsk→komite` + the `doc-FINAL-before-unlock`
  guard), so voiding the MUAP (a `ReviseProposal` that changes MUAP inputs, a direct edit, or a Risk
  `ReturnToRm`) **also re-opens the RSK**: a draft RSK is re-evaluated against the new MUAP; an
  already-frozen RSK (all signatures, pre-Komite) has its signatures voided too and the
  `RA→RTL` ladder restarts. Same shape as the signature-void + desk-reopen rules. Prior versions
  stay in the ledger (superseded, not destroyed). The proposal freezes at the **Komite decision** — after
  that there is no cascade. **No minor-edit carve-out** (any content change to a signed doc voids its
  signatures — audit-first); the UI confirms when a revision will void an already-frozen RSK.
- **Ledger inserts + snapshot upsert are one transaction**, under the optimistic version guard.
- **`decide` is pure** (no I/O); all guards (chain order, distinct actor `RM≠TL` / `RA≠RTL`,
  desk permission, hard-gate block, doc-FINAL-before-unlock) live there.
- **Commit before freeze.** External freeze/notify are post-commit, idempotent effects.
- **Process shape is code, not config.** Adding/reordering a chain rung or phase edge is a code change +
  migration, never an admin toggle. Config owns SLA numbers, thresholds, required-docs, grants.
- **Snapshot is rebuildable.** A maintenance path must be able to recompute `openWork`/derived fields
  from ledgers + aggregates; nothing audit-critical lives only in the snapshot.
- **Desk validation re-opens on input change.** A desk's "complete" is *over the inputs it validated*; a
  later document or proposal revision that changes those inputs **re-opens** that desk (e.g. a new doc
  re-opens Legal). Same shape as the signature-void rule. Phase A desks run **in parallel**, not sequence.
- **Rollback — snapshot-copy model (ADR-0008, supersedes the ADR-0006 retirement).** Each version is a
  read-only `files.copy` snapshot in the `DocumentVersion` ledger; `RollbackDocument{toVersion}` snapshots
  the CURRENT doc first, then copies the chosen snapshot into a fresh current Doc (repoint `DocLinkage`) —
  nothing destroyed, pre-Komite only. Checkpoints at milestones (stage transition, Regenerate, Revise,
  freeze); keep all (audit-first).
- **Read is open; action is desk-scoped.** Any authenticated staff may *view* any application (V1);
  *write / sign / decide* requires the desk. Visibility never gates collaboration; tasking does.
- **Code uses full names, not abbreviations.** Roles/desks in code spell out — `RelationshipManager` (not RM), `TeamLeader`/`Supervisor`, `RiskAnalyst`, `RiskTeamLeader`. **Keep** established domain terms already clear: **MUAP, RSK, DPS, Komite, SP3, SLIK, Pefindo, Kol, DSR, LTV** — note **DPS** is now only the Stage-5 sharia compliance-gate term (`dps-review` / "opini DPS"), **not** an RSK ladder rung (the RSK ladder freezes at Risk Team Leader; see §"Process shape" + [ADR-0021](../decisions/0021-two-rung-approval-chains.md)). Docs/diagrams may abbreviate for brevity; canonical full-name enums are defined in the Phase-1 foundation (`lib/desks.ts` / roles).

## Interaction spec — per-step: user action → system effect

> 🧑 = what the user concretely does (+ `Command`) · ⚙️ = system guard + effect (ledger / snapshot / side-effect) · → result.
> Build contract for happy path 1→16 + branches. **Demo-critical** = straight 1→16 + Komite-reject + nasabah-decline.

**Desk-work mechanic (reusable — applies to every review/verify desk):**
- **Per-item disposition.** A reviewer dispositions each item: **`pass`**, or **`fail` + alasan wajib** (grounded: `ApplicationDocument.legalVerification: 'pass'|'fail'|null` + `legalVerificationReason`). A `fail` bounces the item back to RM to fix.
- **OCR-assist.** OCR-extracted fields land as `ocr_suggested`; the **owning desk confirms** them → `ocr_confirmed` (`extractionSources`). A desk's advance gate is only blocked by suggestions *its own* desk can confirm. **(full OCR flow ↓)**
- **Auto-reopen on input change.** Re-uploading/editing an item a desk already validated **resets that item's disposition + reopens the desk** (`resetVerificationOnReupload`). New doc arriving = a new item to disposition.
- **Explicit handoff ≠ data entry.** Finishing the data work doesn't advance; the desk makes a separate explicit **`CompleteDesk{…}`** handoff. Every disposition + handoff = `+HistoryEntry`.

#### OCR & field extraction (how "konfirmasi field OCR" works)

Setup (GCP processor, env, upgrade path) lives in [`../guides/document-ai-ocr.md`](../guides/document-ai-ocr.md). The flow:

1. **Engine behind a seam.** `OcrProvider` (`server/ocr/provider.ts`), selected by `OCR_PROVIDER`:
   **`documentai`** = Google **Document AI** "Enterprise Document OCR" (`server/ocr/documentai.ts`,
   region `asia-southeast1`/Singapore — no Document AI in Jakarta; **per-page** billed; per-token
   confidence; synchronous `processDocument`); **`stub`** = offline fabrication for dev/test/CI (no
   credentials, no egress). Swapping engines = **no call-site change**.
2. **Upload → suggest.** On a document upload, the provider OCRs the file → full text; the **gate
   inputs** (NIK, Kol, income, appraised value) are pulled from that text by **deterministic,
   conservative regex** (`parseGateValueFromText` in `lib/ocr.ts`; NIK regex in `documentai.ts`) → an
   `OcrSuggestion`. `applyGateSuggestion` routes each value to its field + marks
   `extractionSources[field] = 'ocr_suggested'`.
3. **Human confirm (safety net).** A suggestion is **never** authoritative. The **owning desk** reviews
   + confirms it (`ConfirmExtraction{docId, field}`) → `ocr_confirmed`. A desk's advance gate is only
   blocked by suggestions *its own* desk can confirm. **DSR/LTV/Kol are always computed server-side**
   from the confirmed inputs — OCR/AI never sets them directly.
4. **Re-OCR on re-upload.** Replacing a document's bytes re-runs OCR + resets that doc's
   confirmations/`legalVerification` (the auto-reopen invariant).
5. **PII boundary.** OCR full text is the densest PII surface; **only masked text reaches Gemini**
   (`server/ai/narrative.ts`, mask-in/unmask-out). Low-confidence pages log
   `ocr.documentai_low_confidence` (a number only — never PII).
6. **Easier extraction (demo/V1) = LLM structured output.** Instead of regex, an `OcrProvider` can return
   structured fields via the **Vercel AI SDK** `generateObject` + **Zod schema** on **Vertex** (the
   existing `server/ai/gemini.ts` `generateStructured` pattern) — text-structuring after Document AI, or
   raw-image multimodal via `server/ocr/gemini-vision.ts` (`OCR_PROVIDER=gemini`). Far more robust than
   regex, far less work than a Custom Extractor; drops into the seam (no call-site change); human-confirm
   + server-side DSR/LTV/Kol invariants stay. **Demo is safe (dummy data, no real PII).** **Production with
   real PII** is gated — extraction needs the *raw* values, so it can't mask-before-send like narrative:
   same DPA / in-region / Bank-Legal sign-off as the Gemini egress (G5; POJK 34/2025 by 17 Dec 2026; UU
   PDP §56). Custom Extractor (typed, per-field confidence) stays the heavier production option.

#### Document generation & content capture (MUAP · RSK · MoM · SP3)

> **SSOT for this subsystem: [`document-system.md`](document-system.md)** (one-way fill + QR + Markdown read-back; supersedes v2 sync-back/lost-in-doc). Summary:
- **Generation (one-way, Mizan → Doc).** Google Docs templates with a **NamedRange** per **fillable-from-data** token (`scripts/setup-template-ranges.ts`). Mizan fills each **once** (`replaceNamedRangeContent`, style-preserving; no-op if absent → one fact map serves MUAP + RSK) via the resolver **app → ocr → ai → keep template placeholder**. **After the fill, the Doc belongs to the maker** — they edit freely; Mizan stops touching NamedRanges. Token detail: `muap-template-engine-v2.md` (re-targeted per `document-system.md`).
- **No sync-back / no lost-in-doc** (dropped): Mizan does **not** read back via NamedRange. "Extract by named range" was the v2 bidirectional path — removed.
- **Read-back = Markdown export (the only Doc→Mizan read path).** Export the **source Google Doc → Markdown**
  (`drive.files.export mimeType:'text/markdown'`) — cheaper + more faithful than re-OCR'ing the PDF (no
  OCR error; we own the source). The **PDF export** stays the signed/frozen **audit** artifact
  (`drive.files.export application/pdf` → SeaweedFS at the committee `decisionCheckpoint`). MD → AI still
  passes through masking, like narrative.
- **Four docs, all provided:** **MUAP, RSK** (wired: registry + NamedRanges) · **MoM, SP3** (need template
  setup — NamedRanges + registry + fill wiring; for demo, at minimum an empty template). SP3/MoM templates
  are Google Docs behind auth → access ("anyone-with-link"/OAuth) needed to place ranges (W1).
- **Creation trigger + AI-assist per doc:** MUAP **RM-invoke** (AI) · RSK **auto** on Risk-desk entry (AI) · SP3 **approved→auto / conditional→RM-invoke** (AI) · MoM **invoke** (no AI). Detail: [`ai-assist.md`](ai-assist.md) §"Document creation triggers".

### Fase A — Intake → MUAP final (PARALEL; desk re-open saat input berubah; pra-submit bebas)

**1 · Permohonan** — `RM` (atas nama Nasabah)
- 🧑 Bikin app: pilih **akad** (awal, **mutable pra-Komite**), isi identitas (perorangan/badan: nama, NIK/NPWP, `namaUsaha`), **`requestedPlafond`**, **`requestedTenorMonths`**, **`purpose`**, atribut penentu checklist (`incomeSource`, `isMarried`, `collateralType`); upload dok awal (OCR → `ocr_suggested`). → `SubmitApplication{akad, data}`
- ⚙️ Efek: buat `Application`; `buildRequiredDocuments()` susun checklist dok **per akad × tipe-nasabah**; `snapshot{phase:intake, step:doc-collection}`; `+History(submitted)`. → app di antrean RM.

**2 · Visit & kelengkapan dok + atestasi AML** — `RM`
- 🧑 Kunjungan; upload sisa dok checklist; **konfirmasi field OCR RM-owned** (`ConfirmExtraction`); cek **kelengkapan + keterbacaan** (BUKAN keabsahan yuridis — itu Legal); centang **"Initial AML PASSED"** (screening DTTOT/PEP/negative-list oleh **CS di luar Mizan**). → `VerifyDocument{docId,…}`×N · `AttestAml{}`
- ⚙️ Pasca redesign RM-led (2026.06.12): **1→2 bebas** — dok wajib + `amlAttestation` **tidak lagi** memblok 1→2; gate-nya pindah ke **submit MUAP→Risk** (`muapToRiskBlockers`), settable lintas Inisiasi (tahap 1–3). Efek: `+History(aml-attested)`. **Send-back 2→1/3→1 ⇒ atestasi AML di-reset** (re-attest; OJK APU-PPT).
- → Fase A desk kebuka **paralel** (Legal · Appraisal · SLIK · MUAP-draft). *(Scope "verified" intake: correct+legible vs authenticity → W1.)*

**3 · Analisa Yuridis** — `Legal`
- 🧑 Buka app (visibility terbuka), tinjau **dok legal-relevan** (akta+perubahan, SK Kemenkeh, NPWP/NIB, KTP pengurus & pemegang saham, dok agunan: sertifikat/IMB/PBB/BPKB/STNK/faktur). **Per dokumen** beri disposisi:
  - sah → `VerifyDocument{docId, 'pass'}`
  - bermasalah → `VerifyDocument{docId, 'fail', reason}` — **alasan wajib** (mis. "Nama akta ≠ KTP", "Sertifikat bukan a.n. nasabah"); dok **balik ke RM** buat dibenerin.
  - konfirmasi field OCR Legal-owned; catat **analisa yuridis** (temuan/opini hukum, status legalitas agunan) → `notes`.
- 🧑 Saat **semua dok wajib (non-SLIK) = `pass`** → handoff eksplisit `CompleteDesk{legal, notes}`.
- ⚙️ Guard handoff: `legalUnverified(app)` kosong. Efek: `+History(legal-done)`; SLA Legal stop.
- **↩︎ Re-open otomatis:** RM ganti/re-upload dok yang sudah `pass` → `resetVerificationOnReupload` batalkan disposisi dok itu **+ buka lagi Legal**; dok baru nyusul = item baru yang harus di-`pass`.

**4 · Penilaian agunan** — `Appraisal` (RM order)
- 🧑 RM **order penilaian**; Appraisal pilih **jalur** (internal 2 HK / KJPP 3 HK short / 7–14 HK long), periksa agunan, catat **nilai taksir** + upload **laporan appraisal**. → `VerifyDocument{appraisal-report,…}` · `CompleteDesk{appraisal, value, path}`
- ⚙️ Efek: set `financialInputs.collateralAppraisedValue` (→ feed **LTV**); `+History(appraisal-done)`. Re-open kalau agunan/nilai berubah.

**5 · Input SLIK/Pefindo** — `RM`
- 🧑 Rekam data biro (akuisisi **di luar Mizan**): upload **SLIK** (`docType:'slik_report'`) + **Pefindo** + **Rek Koran**; input **Kol** (`kolEntered`); opsi **AI "fineksi"** ringkas → `bureauSummary` (**advisory**). → `RecordBureau{kol,…}`
- ⚙️ Efek: set `hardGates.kol`, `kolEntered=true`. SLIK report **di-exclude** dari verifikasi Legal.

**6 · MUAP + ladder TTD** — `RM → Team Leader` (gerbang maker-checker; **beku di Team Leader**)
- **6a 🧑 RM invoke draft MUAP** (bukan auto — RM klik saat siap; **AI-assisted**: riset + draft 5C+1S + gap-fill), paralel di Fase A:
  - isi **5C+1S** (`analysis`: character/capacity/capital/condition/collateral/syariah — keenam wajib);
  - isi **`financialInputs`** (income, kewajiban, angsuran/`proposedMonthlyInstallment` atau `projectedMonthlyProfitShare`+nisbah utk akad bagi-hasil) → sistem **hitung DSR/LTV/Kol** (`hardGates`) + `hardGateViolations` vs `riskPolicy` aktif (**recompute-live**);
  - boleh **`RegenerateMuap`** (AI re-draft dari data terbaru); `aiRiskAdvisory` advisory di samping (nggak masuk dok). MUAP = **Google Docs** (sync, `muapSyncedAt`). Submit → `RequestApproval{muap}`
  - ⚙️ Guard: 5C+1S + financial lengkap; **hard-gate clear** ATAU **override + alasan auditable** (self-service). Efek: `+ApprovalStep(request,RM,qr)`; step→`muap-signing`; **Notify(TL)**.
- **6b 🧑 Team Leader** tinjau + **TTD QR** (rung akhir) → `ApproveStep{muap}` · guard `muap-approve-tl`, urutan RM→TL, aktor≠RM → **CHAIN LENGKAP** → `+DocumentVersion(muap,v1)`; `phase=risk, freeze.muap=pending`; **post-commit** isi §sig QR + SeaweedFS + freeze done; **Notify(RA)**.
- **↩︎ Tolak** (rung mana pun) → `RejectStep{muap,reason}` → balik RM. **MUAP diedit ⇒ TTD batal ⇒ ladder ulang dari RM** (versi naik, QR baru).

### Fase B — Risk / RSK
**7 · Risk Review + ladder TTD** — `Risk Analyst → Risk Team Leader` (**beku di Risk Team Leader**)
- **7-masuk** RSK **auto-created saat masuk desk Risk** (MUAP final) + **AI-assisted** (draft risk review). 🧑 Risk Analyst review/edit + tinjau 5C+1S + biro + hard-gate → pilih:
  - **(a) Proceed:** susun **RSK** (`riskRecommendation` approve/conditional/reject + `riskNote`; `aiRiskAdvisory` advisory — RA tetap pilih sendiri) → `RequestApproval{rsk}` → **Notify(RTL)**.
  - **(b) Tolak Risiko (terlalu riskan):** `RejectRisk{reason}` → **terminal** `risk-reject`; `Notify(RM)` "rejected by Risk Analyst" + alasan → RM infokan Nasabah **di luar sistem**. ✕
  - **(c) Kembalikan minta edit MUAP:** `ReturnToRm{reason}` → `phase=muap`; **ladder MUAP reset**; **Notify(RM)**. (Bukan tolak.)
- **7b 🧑 Risk Team Leader** TTD final → **CHAIN LENGKAP** → `+DocumentVersion(rsk,v1)`; `phase=komite`; freeze RSK (post-commit); **enqueue Komite + Notify(Komite)**.
- **↩︎ intra-chain:** Risk Team Leader **Tolak** → `RejectStep{rsk}` → chain ulang dari **RA**, **fase tetap risk**.

### Fase C — Komite
**8 · Keputusan Komite** — `Komite` (sesi Sen/Rab/Jum, MOM ≤H+1)
> ⚠️ **Superseded by [ADR-0005](../decisions/0005-rapat-komite-signed-minutes.md) (signed-MoM):** there is **no in-app per-member voting** — the `KomiteVote` / `CommitteeDecide{votes[]}` / `+komiteVotes` model in this step is **retired**. Built flow: the chair records the per-app outcome (`setKomiteOutcomeAction`) + attending Komite **QR-sign the per-app MoM** (≥2 signers), routing on all-signed; involved-team attestation is non-blocking. The freeze (`decisionCheckpoint` = MUAP+RSK PDF + SHA-256) below is current.
- 🧑 Di sesi, **tiap anggota vote per-orang** (`KomiteVote`: nama · approve/conditional/reject · timestamp · komentar opsional); ketua catat **keputusan** (`komiteDecision`) + **note** (wajib bila conditional) + **MoM** (doc = **invoked** chair/RM, **TANPA AI**). → `CommitteeDecide{verdict, votes[], note?}`
- ⚙️ Guard: RSK final; aktor anggota Komite. Efek: `+komiteVotes` (per-member); **`decisionCheckpoint`** = freeze PDF MUAP+RSK + **SHA-256** (audit); `+History(komite-decided)`.
  - **Setuju** → `phase=offer, step=sp3-draft`; set `approvedPlafond/Tenor/MarginRate`; **SP3 auto-created + AI-assisted**; **Notify(RM)**.
  - **Bersyarat** → step→`conditional-followup`; **Notify(RM)** → RC (SP3 nanti **RM-invoked + AI-assisted**).
  - **Tolak** → **terminal** `committee-reject`; `Notify(RM)` → RM infokan Nasabah **di luar sistem**. ✕
- **RC (hanya Bersyarat) 🧑 RM** beri tahu nasabah **INFORMAL** (di luar sistem, **tak di-track**) → `ProceedToSp3{}` (`conditionalResponse='accepted'`) **atau** `Close{nasabah-decline}` (`'declined'`). ✕

### Fase D — SP3 → Akad → Pencairan
**9 · SP3** — `RM` — **trigger: approved → auto-create+AI · conditional → RM-invoke+AI.** 🧑 review/lengkapi dari term **approved** (plafond/tenor/margin) → `DraftSp3{}` · ⚙️ step→`sp3-review`; **Notify(Legal)**.
**10 · Review SP3** — `Legal` — 🧑 review legal SP3 (2 HK), disposisi pass/fail+reason → `CompleteDesk{sp3-review}` · ⚙️ step→`sp3-final`; **Notify(RM)**.
**11 · SP3 Final** — `RM` — 🧑 finalisasi + **TTD QR RM** → `FinalizeSp3{}` · ⚙️ `+DocumentVersion(sp3,v1)`; step→`sp3-nasabah`.
**12 · Persetujuan SP3** — `Nasabah` (RM catat) — 🧑 setuju/tidak → `NasabahRespond{sp3, resp}` · ⚙️ **setuju** → `phase=akad, step=akad-draft`; **Notify(Legal)** · **tidak** → **terminal** `nasabah-decline`. ✕
**13 · Draft Akad & Order Notaris** — `Legal` — 🧑 draft akad + order notaris (2 HK) → `CompleteDesk{akad-draft}` · ⚙️ step→`akad`; **Notify(RM)**.
**14 · Akad** — `Nasabah` (notaris **di luar sistem**; RM catat) — 🧑 akad ditandatangani → `RecordAkad{}` · ⚙️ `+History(akad-done)`; step→`pencairan-checklist`.
**15 · Checklist Pencairan** — `RM` — 🧑 lengkapi **`disbursementConditions`** (done-map vs `releaseConditions` config; binding agunan/asuransi = line-item, eksekusi luar sistem) → `CompletePencairanChecklist{}` · ⚙️ `disbursementStatus` sub-state; guard `disbursementConditionsComplete()`.
**16 · Pencairan** — `RM` (Ops eksekusi luar sistem, ≤16:00) — 🧑 tandai cair → `MarkCair{}` · ⚙️ Guard: checklist lengkap. `status=closed`, `disbursementStatus='Cair'`. **→ ✓ Cair.**

### Lintas-potong
- **Revisi proposal** — `RM`, **pra-Komite**: `ReviseProposal{fields, reason}` ubah akad/plafond/tenor/agunan → `+History` (bukan transisi). MUAP sudah diteken ⇒ **TTD batal, ladder & dok divalidasi ulang**.
- **Withdraw** — `RM`, kapan pun **pre-SP3**: `Withdraw{reason}` → terminal `nasabah-withdraw`.
- **Internal rejection** (Risk/Komite) → tutup + `Notify(RM)` ("rejected by X" + alasan); **RM infokan Nasabah di luar sistem, tak di-track**.
- **Hard-gate override** (step 6) — RM tulis alasan auditable, lanjut (self-service).
- **Visibility terbuka** — siapa pun login bisa **lihat** app mana pun (incl. draft MUAP); **aksi tetap desk-scoped**. Risk **boleh preview draft MUAP** + di-@mention = **jalur alternatif** (pull), bukan task.
- **@mention + komentar** — `MentionUser{target, text}` → notifikasi (polling) + komentar di app (masuk audit; thread = `aiChatHistory`). Opsional, nggak nge-gate.
- **Versioning / rollback / compare** — MUAP/RSK/SP3 + proposal auto-berversi (`DocumentVersion`); `RollbackDocument{toVersion}` = restore jadi versi baru (lama tak dihapus); banding dua versi gampang.
- **QR signing** — tiap `approve`/sign → QR unik (signer × versi dok), anchor `ApprovalStep`, discan → siapa+kapan. **Token & verify = milik Mizan** (bukan otoritas e-sign/e-meterai eksternal); **gambar QR** dirender via QR-render API eksternal yang hanya melihat URL opaque tanpa-PII (`insertInlineImage` tak bisa base64). SSOT render: [`document-system.md`](document-system.md) §Signing.
- **Notifikasi** — **V1 polling**: tiap `Notify` = record yang di-poll user (realtime ditunda).
- **SLA** — clock per-desk mulai "sejak dokumen lengkap"; breach → projeksi + notif (V1).
- **Audit** — tiap aksi = baris append-only (`ApprovalStep`/`History`/`DocumentVersion`/`komiteVotes`/`decisionCheckpoint`), tak pernah ditimpa.

## Collaboration, visibility & versioning

- **Open read visibility.** Any authenticated staff sees any application + its documents (incl. drafts).
  PII masking still applies to AI / external surfaces (`pii-masking.md`); internal staff see per role.
  Branch / need-to-know scoping is deferred (W1, `../references/discovery-open-questions.md`).
- **@mention + comments.** A per-application comment thread; `@role` / `@person` → a notification
  (polling V1) + the comment, captured in the audit trail. Optional, ungated (`MentionUser`).
- **Early RM↔Risk alignment (alternative path).** Risk may *preview* a draft MUAP (open visibility) and be
  @mentioned to discuss before MUAP is final — but is **never tasked** with drafts (push stays scoped), so
  the main path stays MUAP-final → RSK.
- **MUAP regenerate.** `RegenerateMuap` re-drafts from the latest data (AI fills more as data grows).
- **Versioning/rollback — snapshot-copy ledger (ADR-0008, supersedes the ADR-0006 retirement).**
  `DocumentVersion` (append-only) holds a read-only `files.copy` snapshot per milestone; `RollbackDocument`
  restores a prior snapshot as a new current version (no loss). Native Google revision history is a user
  convenience only — it can't back this (no API restore for Docs; revisions aren't `keepForever`-pinnable →
  purged). See ADR-0008.

## Open questions / deferred

- **In-flight migration — RESOLVED (2026.06.04): no live prod data** (pre-launch). The 6→4 move is a
  **reset/reseed**, not a cutover; the finish-on-old vs checkpoint question is **moot for V1**. (For the
  record, if a future migration ever has live data: old roles `AO/LA/LG/RT/CM/MG` have no
  RM/TL/RA/RTL approver identities → operator-attested checkpoints, never fabricated approval history.)
- **Exception commands** (`Withdraw`, SP3 expiry, akad no-show, SLA-breach escalation) — wiring + which
  are V1 vs V2. → `workflow-target.md` §W1.
- **`DocumentVersion` identity + QR** — version = request-cycle since the latest `request`. The **QR token,
  identity & verify are Mizan-owned** (a `qrToken` / `ApprovalStep` ref it resolves), **not** an external
  signing authority / Hijra QR service; the QR **image** is rendered by an external QR-render API that sees
  only the opaque verify URL (`insertInlineImage` can't take base64 — see [`document-system.md`](document-system.md)
  §Signing). Confirm whether an explicit cycle marker is needed beyond the request-cycle.
- The engine build shipped 2026.06.04 (command-sourced · maker-checker · desks · Rapat); the 6→4/1→16 stage renumber stays **deferred-indefinitely** (organizational-only, high authz blast-radius — see `../CURRENT-STATE.md`).
