<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

# Data Model & Workflow Engine Architecture — consolidated knowledge

## Engine Architecture: Three-Era Evolution

### Era 0: In-Memory Prototype (Brainstorm + Claude Code early, May 16–24)

**Schema encoding (Zod, brainstorm/CC-early):**
- Initial: `ApplicationSchema = z.discriminatedUnion('stage', [...])` with 5 stage-specific schemas
- Revised: `.and()` intersections — rejected; allows impossible states (e.g. Stage-1 shape AND Stage-5 `komiteDecision`)
- **Final prototype form:** flat `z.union` of **31 full standalone leaf schemas** (Stage1:1, Stage2:4, Stage3:2, Stage4-pending:2, Stage4-recommended:6, Stage5-voting:4, Stage5-decided:12). No gaps; legal state set by construction.
- `ApplicationSchema` was **never used at runtime** (no `.parse`/`.safeParse`); `ApplicationSchemaType` imported nowhere. TypeScript `LoanApplication` type is the actual constraint. Schema changes are low-stakes.
- All timestamps converted to native `Date` (not ISO strings): `createdAt`, `enteredStageAt`, `HistoryEntry.timestamp`, `KomiteVote.timestamp`, `ApplicationDocument.uploadedAt`.

**Stage model evolution:**
- May 16: `Stage = 1|2|3|4|5`
- May 21 (session `96b5d932`): widened to `1|2|3|4|5|6` — Pencairan added as own stage. Updated all `Record<Stage>` sites.
- `STAGE_NAMES` stayed English (`'Document Submission'`, `'Legal & SLIK'`, etc.) throughout early era; Bahasa phases surfaced as a derived layer later.

**In-memory store (all CC-early sessions):**
- `APPLICATIONS = LoanApplication[]` — in-memory mutated array; resets on hard refresh, persists on SPA nav.
- Retired from runtime at commit `70e5ccb` (batch-04, May 23). Survives only as `prisma/seed.ts` fixtures.

### Era 1: PostgreSQL + Prisma (May 23–Jun 2, batch-04 onward)

**Persistent storage architecture:**
- Database: PostgreSQL. Migrated from SQLite at batch-04. `@prisma/adapter-pg` + `pg`.
- `better-sqlite3` and `@prisma/adapter-better-sqlite3` removed as dead deps at batch-06.
- Prisma 7 — Rust-free; engine is `query_compiler_fast_bg.wasm`. nft does NOT trace the wasm into standalone bundle; must explicitly copy in Dockerfile.

**The `deleteMany`+recreate bug (CRITICAL):**
- `saveApplication` (`write.ts:65-67`): `deleteMany` + recreate for `historyEntry`, `stageAssignment`, `komiteVote`, `applicationDocument` on EVERY save.
- Discovered in session 019e8ce1 (OMP Jun 3) via code inspection.
- "Append-only" was only a domain-layer convention at this point, **not storage-enforced**.
- Fix: `historyEntry` converted to insert-only delta (slice-0); rest addressed as part of ADR-0004 cutover.

**Optimistic concurrency:**
- `version` column on `Application`; `saveApplication` uses `updateMany({where:{id, version}})`. Count = 0 throws `ConcurrencyError` (Bahasa: "Data aplikasi telah diperbarui oleh pengguna lain. Muat ulang halaman lalu coba lagi.").
- `version?` optional on `LoanApplication` aggregate (avoids touching 37 seed literals). Real load→save path always carries it.

**JSONB audit (batch-08, May 25):**
- Decisive test: "is any sub-field ever filtered/sorted/joined at DB level?" → No for all 14 columns.
- **4 columns migrated to relational:**
  - `aiChatHistory` → `ConversationMessage(surface='discussion')`
  - `aiAssistantLog` → `ConversationMessage(surface='assistant')`
  - `KomiteMeeting.agendaAppIds` → `MeetingAgendaItem` join table
  - `KomiteMeeting.attendeeUserIds` → `MeetingAttendee` join table
- **10 JSON columns kept as-is:** `hardGates`, `hardGateViolations` (derived cache), `financialInputs`, `analysis` (FiveCS), `extractionSources`, `stage2LegalApproval`, `disbursementConditions`, `SlaPolicyVersion.targets`, `CommitteeRoomsVersion.rooms`, `DisbursementConditionsVersion.conditions`.
- `hardGateViolations` redefined as **derived read-cache**: auto-recomputed via `computeViolations(hardGates, activePolicy)` at `saveApplication` write boundary. Manual re-assignments in `application-data.ts` removed. Fixed latent drift bug where `confirmSlikAction` mutated `hardGates.kol` without recomputing violations.
- `chairUserId` stays scalar on `KomiteMeeting` — hot-read path, folding into `MeetingAttendee.isChair` would require a scan.

**`ConversationMessage` schema:**
- `id, applicationId, surface: 'discussion'|'assistant', seq, role: 'user'|'assistant', content (masked), createdAt`
- `@@unique([applicationId, surface, seq])`, `@@index([applicationId, surface, seq])`
- `appendConversationMessage(appId, surface, role, content, actor)` in `write.ts`: assigns next seq, writes row + HistoryEntry audit in one TX, **without calling `saveApplication`** (no version bump → no concurrency collision between chat and stage edits).
- `authorId`, `authorName`, `mentions: String[]` added in MentionUser slice (batch-22, session 019e99e3). Pre-addition: UI displayed the *viewer's* name for all messages — a pre-existing display bug.

### Era 2: Command-Sourced Engine (OMP Jun 3–8, ADR-0004)

**Full event-sourcing proposed then rejected:**
- Session 019e8ce1 (Jun 3): full event sourcing initially proposed ("event log append-only = SATU-SATUNYA sumber kebenaran; state = projeksi murni").
- Oracle second-opinion challenged: "split-truth trap" — partial ES (not all-in including uploads/OCR/attestations) creates 3 competing truth sources (event log + snapshot + documents) = audit fracture in exactly the edge cases that matter.
- Concrete finding: `write.ts:65-67` was `deleteMany`+recreate — "append-only" was only a convention, not a storage guarantee.
- Agent accepted: "Gue revisi rekomendasi gue (proposal full-ES gue over-rotate; oracle benar)."
- **ADR-0004 locked:** command-sourced + ledger-backed + snapshot-authoritative.

**ADR-0004 architecture (final):**
- Single write seam: `decide(state, command, actor) → Decision | Rejection` — **pure, testable without DB**.
- `dispatch()` command seam; `transitionAction` routes through it; authz + guards unified.
- `WorkflowCommand` union (committed `0b23b5f`, session 019e99e3):
  - `Transition` — user manual, authz-guarded
  - `SystemTransition` — consequence of already-authorized action (ladder-complete, Komite decision, conditional accept, revise-regress)
  - `DualSignOff` — Stage 2→3 once both LG+RT handoffs complete
- `applyTransition` and `advanceOnDualSignOff` **removed** (all five callers flipped). Any code calling them directly is a compile error.
- `applyDecision` is the effect applier in the engine (not `applyTransition`).
- `WorkflowSnapshot { phase, step, status, closeReason?, openWork[], freeze }` — cursor authoritative, mutable only through command seam.
- `deriveWorkflowSnapshot(app)` — derived projection (not yet persisted to DB; strangler-fig). `app.stage` stays a derived accessor (Int column).
- Invariant #1 ("one write seam") now actually enforced — was being violated by direct calls in `komite.ts`, `approval.ts`, `application-data.ts`, `application-stage.ts`.

**`lib/workflow.ts` predicates (Phase 2, batch-22):**
- `Phase`/`Step` types, `WORKFLOW` def.
- `isAt`, `isAtOrAfter`, `isBefore`, `isPreKomite` — named step predicates derived from current stage.
- `defaultView` routing migrated onto predicates.
- `phaseOf(stage)` mapping: `1/2/3→1, 4→2, 5→3, 6→4`. Exists as derived presentation; literal 6→4 engine renumber deferred (~158 `.stage===N` sites, high authz blast radius).

---

## Ledger Tables — INSERT-Only

**Three append-only ledgers (ADR-0004):**

### `ApprovalStep`
- INSERT-only, never delete/update.
- `ApprovalStepRecord` shape (from session-S4 durable facts):
  ```
  chain / role / action / userId / userName / reason / qrToken / createdAt
  ```
- Example complete MUAP ladder: `[{chain:'muap', role:'muap-author', action:'request'}, {role:'muap-approve-tl', action:'approve'}, {role:'muap-approve-bm', action:'approve'}]`
- Example complete RSK ladder: `[{chain:'rsk', role:'rsk-author', action:'request'}, {role:'rsk-approve-officer', action:'approve'}, {role:'rsk-approve-cro', action:'approve'}, {role:'rsk-sign-dps', action:'approve'}]`
- MoM signatures also in this table: `{chain:'mom', role:'komite-signer', action:'approve', qrToken}`
- `saveApplication` **never touches** `ApprovalStep` — ledger managed only by separate append path.
- `validateAction` does NOT guard `appendApprovalStep` in the repo layer — only the action layer gates. `reset` action appends cleanly via the repo. By design for audit ledger.
- DB-verified counts post seed-refresh (session-S4): 190 total (39 mom / 73 muap / 78 rsk); 141 unique `qrToken`s (unique constraint enforced).

### `HistoryEntry`
- INSERT-only delta (fixed at slice-0; was `deleteMany`+recreate before ADR-0004).
- All stage transitions, data saves, and AI interactions log here.
- `appendHistory` IDs are collision-proof (not array-index based). HistoryTab needs stable sort.
- `enteredStageAt` invariant test must NOT use strict equality — `enteredStageAt` and the corresponding history timestamp are separate `Date()` calls with independent values. Correct invariant: ordering + advancement.

### `DocumentVersion`
- Append-only milestone snapshot ledger (ADR-0008, Jun 5, session 019e99e3).
- Schema: `{applicationId, kind: 'muap'|'rsk', docId, reason/trigger, createdBy, createdAt}`. No FK to Application (mirrors `DocLinkage` pattern for bootstrap paths).
- Snapshot triggers: stage transition, `ReviseProposal`, `RegenerateMuap`, rollback_current, manual.
- Rollback = snapshot-current-first, then copy checkpoint to new current + repoint `DocLinkage`.
- Google Docs native revision API: cannot pin revisions (keepForever = binary-files-only), revisions purged ~30 days/~100, no API restore/revert for Docs — cannot back durable rollbacks. `files.copy` required.
- ADR-0006 (originally: retire `RollbackDocument`, lean on Google native history) → **superseded by ADR-0008** within the same session (019e99e3).

---

## `StageAssignment` — Mutable, Not Append-Only

- `StageAssignment` shape: `{stage, role, userId, userName, status: 'todo'|'in_progress'|'submitted', assignedAt, submittedAt}`.
- `status` and `submittedAt` are **mutable** fields (pending → submitted).
- Planning documentation incorrectly called `StageAssignment` an "append-only precedent" — this was a documentation error. Corrected in session-S2 (Jun 4).
- `historyEntry` is the genuine append-only table; `StageAssignment` is mutable display state.
- The Kanban personal status (todo/in_progress) is drag-persistable via `setPersonalStatusAction` (`applyPersonalStatusMove` guard). `submitted` column is workflow-owned (locked, not draggable). `assignment.status` is **never read by any workflow gate** — display-only.

---

## Outbox Pattern

- **Commit-before-freeze ordering**: ApprovalStep + DocumentVersion committed first → then SeaweedFS freeze as post-commit idempotent effect.
- Reverse order risks frozen doc without committed state (partial failure leaves orphaned freeze).
- Implementation: `freeze = commit-before-freeze(outbox)` — TTD last → [TX] insert ApprovalStep + DocumentVersion + update snapshot → [eff] FreezeDoc post-commit idempotent retry.
- `freezeDecisionDocs` (`server/docs/service.ts:153-184`) stores frozen MUAP/RSK PDFs via `putDocument`. Backward-compat read-fallback to old Postgres Bytes cols for existing `DecisionCheckpoint`s.
- Frozen MUAP/RSK PDFs were NEVER in Google Drive (common misconception). Drive is only the live authoring surface (export read). Storage path: Postgres Bytes → later moved to SeaweedFS (batch-15, `s3StorageKey` + sha256 + size).

---

## Hard Gates

### `computeViolations` and `RiskPolicy`
- `RiskPolicy` interface in `lib/hardGates.ts`.
- `DEFAULT_RISK_POLICY = {dsrMaxPct:40, ltvMaxPct:70, kolMax:1}`.
- `computeViolations(hardGates, policy?)` — takes policy as param; defaults to current constant.
- Hard gates are **signals, not blockers** in the domain model: over-limit apps still advance; committee decides. DSR > 40% / LTV > 70% / Kol > 1 → auto-flag but do NOT block stage transitions (brainstorm era locked this rule: "hard-gate = flag-not-block").
- Exception: hard-gate block IS enforced at the MUAP-approval-chain request boundary (blocks RM from requesting approval unless override reason provided).
- `hardGateViolations` on `LoanApplication` = derived read-cache, auto-recomputed at `saveApplication` write boundary. Never hand-set.
- `RiskPolicyVersion` table: append-only versioned config. `DecisionCheckpoint` freezes the applied policy version + thresholds at committee decision (`frozenDsrLimit`, `frozenLtvLimit`, `frozenKolLimit`, `riskPolicyVersionId`). Phase C lifecycle = **freeze-at-decision** (distinct from SLA which is recompute-live).
- 7 UI surfaces were found to NOT read `RiskPolicyVersion` (AnalysisTab chips, `analysis-draft.ts DSR_AMBANG/LTV_AMBANG`, `analysis-assist.ts` gap-check, `HardGateFlags`, `RingkasanView`, `IdentitasView`, `ManagementDashboard`). Fixed: `riskPolicy?: RiskPolicy` transient field on aggregate, wired at both repo read paths, all 7 surfaces read `app.riskPolicy ?? DEFAULT_RISK_POLICY`.
- `slaTargetDays?: Record<FinancingStage, number>` is a transient field on aggregate, NOT persisted; must not be passed to `saveApplication`.

### `stage1To2Blockers` (server-enforced)
- Single source of truth for ALL Stage 1→2 advance blockers: docs + OCR + AML simultaneously.
- Server-side checkpoint in `application-stage.ts` (`transitionAction`). Prior code had a UI-only bypass.
- Enforced server-side via `stage1To2Blockers` in `transitionAction` (session-S1, Jun 3, commit `c2c6ec8`).

### AML Attestation Gate
- `amlAttestation: AmlAttestation | null` on `LoanApplication` (Prisma `Json?`; mirrors `stage2SlikApproval?` pattern).
- `attestedAt` stored as ISO string (not Date) — JSON columns use ISO strings as precedent.
- `amlAttestation` is optional (not required) — avoids 26 fragile literal edits across seed/test files.
- Attestation **resets on send-back**: cleared on transitions 2→1 and 3→1.
- AML statement wording: `AML_STATEMENT` constant in `lib/aml.ts` — "MIZAN — applicant has never been screened" (OJK-facing wording).
- `attestAmlAction` desk-gated via `assertCanWorkDesk` + audited via `addAudit`.
- Gate is non-bypassable (server enforced); UI moved from ActionBand inline sub-form → "Kepatuhan (AML)" card in Dokumen tab (session-S5 / batch-22, Jun 5).
- SLIK attestation sibling: `stage2SlikApproval` is the authoritative sibling pattern for optional JSON evidence fields.
- Migration: `20260603054137_add_aml_attestation`.

### `deriveConfidence` / Kol hard-gate field rule
- Kol is a **hard-gate field** — gating fields must ALWAYS be human-reviewed, never auto-advanced.
- Kol entry (`KolPanel`) stays in Data tab separate from SLIK handoff in Tugas Anda (session-S6, Jun 8).
- Reason kept separate: `confirmKolAction` calls `resetSlikHandoff(app)` — confirming Kol *un-sends* any prior SLIK handoff (`verifiedByRT → false`). Merging confirm+advance would invert the correct-then-resend invariant.
- `stage2RmDataReady = slikUploaded && kolEntered` (final form, Jun 8). Separate `verifiedByRT` gate removed.
- OCR rule for gating fields: numeric/gating fields (DSR/LTV/Kol, income, appraisal) **must NEVER auto-confirm** even at high confidence (VLMs show 28–34% numeric-hallucination on degraded scans). Auto-fill OK for low-stakes strings.

---

## 5C+1S Persistence

- **CURRENT-STATE.md incorrectly claimed "5C+1S DB persistence deferred / in-memory"** (session-S1, Jun 3). Code already persisted via `saveAnalysisAction` → `saveApplication`. Regression itest added to prevent re-introduction.
- `analysis.*` stored on `LoanApplication` as decision-support. Authoring locked to Stage 3 (LA @ Feasibility) via `lib/stage-lock.ts`; locked once app advances.
- `AnalysisTab.tsx`: real Gemini AI via `generateAnalysis → POST /api/applications/[id]/analysis`. Overlaid per-aspect on deterministic `buildAnalysisDraft` (graceful fallback).
- Scores stay **deterministic** (`generateAspectScores`) — NOT AI-authored. AI advisory text is separate.
- `analysis.*` is decision-support (not tamper-evident); `DecisionCheckpoint` freezes only the Google Docs PDFs cryptographically.
- FiveCS (5C+1S) is stored as `analysis` JSON on `LoanApplication`; persisted via `saveApplication`.
- Analisa tab was later **deleted** (session 019e99e3, batch-22) — 5C+1S narrative migrated to MUAP doc; deterministic scores remain and auto-draft on Stage-3 entry via `applyStage3Entry` → `buildAnalysisDraft`.

---

## Evidence-Based Mechanisms

All four built as additive stubs with W1-hook placeholders — empty defaults reproduce existing behavior until W1 ratifies values (session-S1, Jun 3, commit `c2c6ec8`).

### Per-Desk SLA
- `SlaPolicyVersion` table with `resolveActiveVersion()` generic resolver.
- `SlaPolicyVersion.deskTargets` versioned column for per-desk SLA targets.
- `deskSlaState(app, desk)` returns `null` if no per-desk target configured → falls back to per-stage behavior. Zero behavior change until W1 wires values.
- SLA targets are **recompute-live** (not freeze-at-use): admin changes should update dashboards immediately. Freeze-at-decision reserved for Phase C compliance gates (risk policy thresholds).
- `jakarta-clock.ts`: `businessDaysElapsed`, `isBusinessDayJakarta`, `isWithinBusinessHoursJakarta` (08:00–17:00 Mon–Fri), `isJakartaHoliday` (W1-stub, always returns false). Jakarta = fixed UTC+7, **no DST**.
- `isJakartaHoliday` always returns `false` (public holidays not hardcoded). W1 value.
- `slaTargetDays?: Record<FinancingStage, number>` transient field on aggregate; NOT persisted.

### Doc-Checklist (required-docs system)
- `buildRequiredDocuments(input, idPrefix)` — `BASE + byNasabahType + byAkadType + CONDITIONAL` layers.
- **Snapshot-at-creation**: `buildRequiredDocuments()` snapshots the list onto the app at creation. Later template changes never retroactively alter in-flight apps.
- `dedup-by-docType` added to `buildRequiredDocuments` (session-S1, Jun 3).
- `financingPurpose` dimension on `RequiredDocsInput` — conditions extra docs (modal-kerja/pembangunan → RAB/Kontrak-SPK-PO/bouwheer). W1-inert until intake captures it.
- `pefindo_report`: `required: false` (advisory; never tightens 1→2 gate).
- Checklist values all NoEffort-proposed defaults pending W1 Bank confirmation.

### Bureau / Pefindo
- `server/ai/bureau.ts` — bureau AI summary orchestrator: mask-in → fail-closed backstop → infer → audit (`surface:'bureau'`) → unmask-out.
- `bureauSummary: BureauSummary | null` (Prisma `Json?`) on `LoanApplication`. Migration `bureau_summary`.
- AI bureau summary is **advisory-only**. Kol/stage-gating remains deterministic. AI bureau summary does not gate transitions.
- `pefindo_report` docType — upload mirrors SLIK via `uploadPefindoAction`. `ownerDeskForDocType('pefindo_report') === 'slik'` (RM-owned). Not a separate Ops desk.

### Komite MoM SLA
- MoM SLA: ≤H+1 business-day after meeting (`meetingMomSlaState`).
- `recordMeetingMinutesAction` is chair-only.
- Cadence: Mon/Wed/Fri (3 weekly schedule templates).
- `KomiteMeeting` gets MOM fields + `meetingMomSlaState`. Migration `komite_mom`.
- `buildMeetingNotifications` wired into notifications page + sidebar badge.
- `mom` added as new `NotificationCategory`.

---

## Prisma JSON Fields & Key Migrations

**JSON fields on `LoanApplication`:**
| Field | Type | Notes |
|-------|------|-------|
| `hardGates` | `Json` | `{dsr, ltv, kol}` |
| `hardGateViolations` | `Json` | Derived read-cache; auto-recomputed at write |
| `financialInputs` | `Json` | `{netMonthlyIncome, existingMonthlyObligations, collateralAppraisedValue, proposedMonthlyInstallment}` |
| `analysis` | `Json` | FiveCS 5C+1S scores + narratives |
| `extractionSources` | `Json` | `Record<string, 'human_entered'|'ocr_suggested'|'ocr_confirmed'|'ocr_overridden'>` |
| `stage2LegalApproval` | `Json?` | `{verifiedByLG: boolean, notes?: string}` |
| `disbursementConditions` | `Json` | Pencairan checklist conditions |
| `amlAttestation` | `Json?` | `{attestedAt: ISO string, actorId, actorName}` |
| `bureauSummary` | `Json?` | AI-generated bureau advisory |
| `exploredSources` | `Json` | `ExploredSource[]` — web research citations |
| `aiRiskAdvisory` | `Json?` | AI advisory for RSK — advisory-only, never authoritative |

**Timestamps as ISO strings** in JSON columns (not `Date`): `aiRiskAdvisory.generatedAt`, `exploredSources[].retrievedAt`, `amlAttestation.attestedAt`.

**Key Prisma migrations timeline:**
- `20260522093114_decision_checkpoint` — `DecisionCheckpoint` PDF freeze
- `20260524012559` — `AiInteraction` table (userId, appId, surface, maskedPrompt, maskedReply, model, timestamp)
- `20260524111202_document_storage_fields` — `ApplicationDocument.storageKey/sha256/sizeBytes/contentType`
- `20260525124831` — `Document.extractedText` (nullable text for OCR full-text)
- `20260526_*` (3 migrations) — `TemplateReferenceText`, `ApplicationDocumentFill`, `ResearchJob`/`ResearchStep`
- `20260527072811_research_jobs` / `20260527074007_template_reference_text` / `20260527074541_v2_application_document_fill`
- `20260528_workflow_followups` — `applicationStatus: 'active'|'closed'`, `closeReason`, `closedAt`, `stage2SlikApproval` column (extended in batch-15)
- `20260603054137_add_aml_attestation` — AML attestation field
- `sla_desk_targets` — `SlaPolicyVersion.deskTargets`
- `bureau_summary` — `LoanApplication.bureauSummary`
- `komite_mom` — `KomiteMeeting` MOM fields
- Batch-22 (`migrate 29`) — `appraisalPath: String?` on `LoanApplication`
- Batch-22 (`migrate 30`) — `authorId/authorName/mentions` on `ConversationMessage`
- `DocumentVersion` (batch-22) — snapshot versioning ledger
- Role key migration (Jun 8) — `account-officer`+`loan-analyst` → `relationship-manager` (non-destructive)

**Config versioning pattern (all new config tables follow this):**
1. Append new versioned table to `schema.prisma`
2. Migrate + regenerate
3. Pure validator in `lib/config/`
4. Resolver + list functions in `server/config/`
5. ADMIN-MASTER or ADMIN-POLICY gated action in `server/actions/`
6. Tab component in `components/admin/`
7. Seed v1 from current constant in `prisma/seed-config.ts`
8. Fallback to constant if no config row

---

## `ApprovalStepRecord` Shape

From session-S4 (Jun 5) — definitive documented shape:
```typescript
{
  chain: 'muap' | 'rsk' | 'mom'
  role: string       // e.g. 'muap-author', 'muap-approve-tl', 'rsk-sign-dps', 'komite-signer'
  action: string     // e.g. 'request', 'approve', 'reject'
  userId: string
  userName: string
  reason?: string
  qrToken?: string   // populated for all signatories
  createdAt: Date
}
```

- Stored in `approvalSteps` relation (INSERT-only ledger via `appendApprovalStep`).
- `reset` action CAN append to an approval-chain — bypasses `validateAction` which blocks re-requesting a `complete` chain (`"Dokumen sudah final"`). `reset` goes through repo directly.

---

## `rskCroSignerUserId` — Runtime-Derived Field

- **NOT a Prisma-writable field**. Not on the `LoanApplication` TypeScript type.
- Runtime-derived from `approvalSteps` via `rskCroSignerUserId(steps)` helper function.
- Attempting to map `app.rskCroSignerUserId` in `seed-dummy.ts` is a type error (discovered and removed in session-S4, Jun 5).
- Used for CRO COI (conflict of interest) soft flag: CRO who signed RSK then sits on Komite = flag (not block). Visible in audit trail for OJK explanation.

---

## Validators

### `validateApprovedTerms` (pure, unit-tested)
- Location: `lib/komite-terms.ts`.
- Purpose: validates committee approved terms at decision time.
- Rules (session b0297d25, May 23):
  - `approvedPlafond ≤ requestedPlafond` (committee may approve same or less, never more)
  - `approvedTenorMonths` must be positive integer
  - Flat akad → `approvedMarginRate ≥ 0`
  - Profit-share akad → `approvedMarginRate` must be `null`
  - `approvedTenorMonths` NOT bounded ≤ requested (user explicitly did not rule on this)
- Called by `submitDecisionAction` for approve decisions only.

### `validateDecisionNote` (pure, unit-tested)
- Location: `lib/komite-terms.ts` (mirrors `validateApprovedTerms` pattern).
- Purpose: enforces `komiteDecisionNote` requirement for conditional/reject decisions.
- Wired into `submitDecisionAction` (session-S1, Jun 3). Was previously accepted without validation — a known gap.
- Rule: conditional decision = note REQUIRED; reject decision = note REQUIRED; approve = optional.
- Note requirement matrix applies to BOTH `riskNote` (Stage 4) and `komiteDecisionNote` (Stage 5):
  - `approve` = optional
  - `conditional` = REQUIRED
  - `reject` = REQUIRED
- This was reversed from the original brainstorm design: fa02e261 said reject = optional-but-recommended → af54c0d9 reversed to REQUIRED.

---

## Data Model Churn in Early Era (May 14–May 25)

Key reversals and churned decisions (all pre-OMP, largely superseded):

1. **Stage owner mapping for Stages 1–3**: NoEffort inference, not Manifesto-confirmed. Stage 4–5 are ✅ canonical. Stages 1–3 = 📝 throughout early era.

2. **NIK at creation**: Initially AO types NIK at creation + OCR cross-checks (verification pattern) → removed from creation form entirely; pure OCR extraction. Schema: `nik?: string` optional in Stage-1 leaf, required in Stages 2–5.

3. **`collateralType` enum churn**: `boolean` → `'none' | 'fixed_asset' | 'vehicle' | 'guarantor'` (not boolean).

4. **OCR model changed twice in session f1ba1699**:
   - Initial: "Terima/Abaikan" button before field filled
   - Revised: OCR auto-fills field directly; stage handoff gated; backward transitions ungated
   - Final: `ocr_suggested` is a persisted state (not just transient)

5. **`DocumentStatus` simplified** (session 17b336e4, May 18): `'missing'|'uploaded'|'verified'|'pending'` → `'missing'|'uploaded'`. `legalVerification: 'pass'|'fail'|null` made orthogonal.

6. **`assignedTo`/`personalStatus` replaced** by `assignments: StageAssignment[]` (session 47f43b9b, May 18). `STAGE_OWNERS = {1:[AO], 2:[LG,RT], 3:[LA], 4:[RT], 5:[CM]}`.

7. **`financialsAssessed` boolean**: replaces `dsr === 0` sentinel. `z.literal(false)` S1–2, `z.boolean()` S3, `z.literal(true)` S4–5.

8. **`aiChatHistory`+`aiAssistantLog` JSON columns** → `ConversationMessage` relational table (May 25, batch-08). Any early-era session referencing these as storage mechanism = superseded.

9. **Schema approach**: `z.discriminatedUnion` → `.and()` intersections → flat `z.union` of 31 leaf schemas. Each step driven by user feedback toward exhaustive modeling. The 31-leaf schema was correct but was never used at runtime.

10. **`requested`/`approved` split** (session af54c0d9): `plafond` → `requestedPlafond` (frozen at creation); `approvedPlafond` on Stage-5 decided leaves only.

11. **6-stage recognition** (May 21, session `96b5d932`): Stage 6 Pencairan was "assumed not started" in all brainstorm docs → was actually built end-to-end. Stage union widened to `1|2|3|4|5|6`. ~8 `Record<Stage>` sites needed updating.

12. **Role model churn**:
    - Early: `AO ≠ Analis ≠ Risk ≠ Komite` (brainstorm PERSONAS.md hard rule)
    - Reversed May 31: RM = AO = Analis in Hijra (📝 pending Bank confirmation)
    - Confirmed Jun 2 by Bank SOP slides: Marketing/RM = penyusun MUAP + feasibility; "Analyst" lane = Risk Review. LA persona dissolved.
    - Final (Jun 4): `Role` enum = `RM|LG|RA|CM|MG`. Desks functional: `intake/legal/slik/muap-author/muap-tl/muap-bm/rsk-author/rsk-ro/rsk-cro/rsk-dps/komite/dps-review/pencairan/MG/ADMIN-*`.
    - Jun 8 final: `account-officer` + `loan-analyst` merged → single `relationship-manager = ['intake', 'slik', 'muap-author', 'pencairan']`.

13. **Stage-2 dual-desk model**: LG + RT-SLIK as separate parallel actors → confirmed by Bank SOP. Then restructured per ADR-0007 (Jun 5): Stage-2 is RM-coordinated; Legal and Appraisal are tracked deliverables workable through Stage 3. Gate moved from 2→3 to MUAP→Risk submit.

14. **`LegalSlikTab` deleted** (session 52d36006, May 25, batch-10): Legal verification → Documents tab; Kol/SLIK entry → Data tab.

---

# Data Model & Workflow Engine — contradictions, reversals & evolution

## Timeline of Major Reversals

### 1. Schema approach: `z.discriminatedUnion` → intersections → flat union [RESOLVED]
- **Early (session 26f492e9/41f38e74, May 16):** `z.discriminatedUnion('stage', [...])`
- **Intermediate (session 0b099ae5, May 16):** `.and()` intersections — allows impossible states
- **Final (session 0b099ae5 same session):** flat `z.union` of 31 full leaf schemas — exhaustive legal state set by construction
- **Resolution:** flat union is the correct pattern; was implemented but never used at runtime (TypeScript type was the real constraint)

### 2. Reject/Conditional note requirement [RESOLVED]
- **Early (session fa02e261, May 14):** Conditional = REQUIRED; Approve = optional; Reject = optional-but-strongly-recommended
- **Reversed (session af54c0d9, May 16):** Reject = REQUIRED for both `riskNote` and `komiteDecisionNote`
- **Final:** Approve = optional; Conditional = REQUIRED; Reject = REQUIRED
- **Server-side enforcement gap** persisted until session-S1 (Jun 3): `validateDecisionNote` wired into `submitDecisionAction` only then. `[VERIFY-DOC]` any doc claiming this was server-enforced before Jun 3.

### 3. Stage model: 5-stage → 6-stage [RESOLVED]
- **Early (brainstorm fa02e261, May 14):** 5-stage canonical pipeline (Stages 1–5), "5-stage label is canonical; Draft/Review/Approval shorthand forbidden"
- **May 21 (session 96b5d932):** Stage 6 Pencairan added as own stage; `Stage` union widened; Pencairan was "assumed not built" in all brainstorm docs
- **Final:** 6 stages canonical: Pengajuan → Legal&SLIK → Analisa Kelayakan → Kajian Risiko → Komite → Pencairan → Portofolio

### 4. Full event-sourcing proposed and rejected [RESOLVED]
- **Early OMP (session 019e8ce1, Jun 3):** Full ES proposed — "event log = SATU-SATUNYA sumber kebenaran; state = projeksi murni"
- **Same session, oracle challenge:** Split-truth trap; partial ES with uploads/OCR/attestations creates 3 competing sources. Concrete finding: `write.ts:65-67` was `deleteMany`+recreate (not truly append-only).
- **Final (ADR-0004):** command-sourced + ledger-backed + snapshot-authoritative. `decide()` pure reducer. Three ledgers INSERT-only.

### 5. `saveApplication` deleteMany→insert-only bug [RESOLVED Jun 3]
- **Early era through batch-22:** `write.ts:65-67` deleted and recreated `historyEntry`, `stageAssignment`, `komiteVote`, `applicationDocument` on every save. Append-only was a domain convention only.
- **Discovered Jun 3 (session 019e8ce1):** named as a critical OJK-audit bug.
- **Fixed:** `historyEntry` converted to insert-only delta at slice-0. `ApprovalStep` managed by separate append path only; `saveApplication` never touches it.

### 6. `StageAssignment` mutable vs append-only [RESOLVED, doc was wrong]
- **Planning docs (through Jun 3):** called `StageAssignment` an "append-only precedent" to justify the command-sourced engine design
- **Reality:** `StageAssignment.status` and `submittedAt` are mutable (pending → submitted). This was always true.
- **Corrected Jun 4 (session-S2):** planning line corrected; `historyEntry` is the genuine append-only table.

### 7. Akad immutability [RESOLVED Jun 3]
- **Early (brainstorm/CC-early):** "akadType stays immutable end-to-end — no `approvedAkadType`"
- **Reversed (session 019e8ce1, Jun 3):** bank can counter-offer ("Bank maunya akadnya B"). Akad = proposal parameter, mutable until Komite decision. Komite approve + different akad = MUAP re-authored + ladder reset + new QR.
- **Final:** akad frozen at Komite decision, formalized at SP3 (step 12 nasabah acceptance).
- **Corrected in:** `workflow-target.md`, `akad-types.md`

### 8. Stage-2 gate: dual sign-off → RM-coordinated [RESOLVED Jun 5, ADR-0007]
- **CC-early (batch-01, May 18):** Stage 2→3 gate: `kolEntered && stage2LegalApproval.verifiedByLG === true` (both LG and RT-SLIK must complete)
- **Batch-10 (May 25):** `advanceOnDualSignOff` — second to finish triggers transition
- **ADR-0007 (session 019e99e3, Jun 5):** Stage 2 is RM-coordinated. Gate moved: `legalAppraisalComplete` now blocks MUAP→Risk-submit (not 2→3 advance). RM can advance 2→3 on bureau data alone; Legal/Appraisal are tracked deliverables workable through Stage 3.
- **`legalSlikComplete` predicate superseded by `legalAppraisalComplete` + `stage2RmDataReady`**

### 9. SLIK desk ownership: RA → RM [RESOLVED Jun 5]
- **CC-early (batch-09):** SLIK owned by RA (Risk Analyst / RT-SLIK desk)
- **Session 019e97ce (Jun 5, batch-21):** D1 finding: SLIK/Kolektibilitas should be owned by RM. `role_of_desk['slik'] = 'RM'`.
- **Consequence:** "Tolak SLIK & Kembalikan ke RM" return path became nonsensical (RM can't send back to itself) → action removed.
- **Session-S6 (Jun 8):** `stage2RmDataReady = slikUploaded && kolEntered` — `verifiedByRT` gate removed.

### 10. `validateDecisionNote` server-side enforcement gap [RESOLVED Jun 3]
- **CC-early through batch-14:** `komiteDecisionNote` stored if present but NOT server-enforced (action stores note without requiring it)
- **Session-S1 (Jun 3):** `validateDecisionNote` wired into `submitDecisionAction`; gap closed.
- **Note:** KOMITE.md twice incorrectly said "no gap" before Jun 3 — a known documentation error.

### 11. ADR-0006 superseded by ADR-0008 (same session) [RESOLVED Jun 5]
- **ADR-0006 (session 019e99e3, Jun 5):** `RollbackDocument`/`DocumentVersion` retired — lean on Google Docs native history + checkpoints
- **Same session, user revisited:** Google Docs native revision API cannot pin revisions (binary-files-only), purged ~30d/~100, no restore/revert for Docs. `files.copy` required.
- **ADR-0008 (same session):** snapshot-copy versioning via `DocumentVersion` ledger (INSERT-only); milestone snapshots at stage transitions + ReviseProposal + RegenerateMuap + freeze. Rollback = snapshot-current-first then copy checkpoint.
- **ADR-0006 marked superseded.**

### 12. Document system V1→V2→V3 fill mechanism [RESOLVED Jun 8]
- **V1 (through May 26):** `buildFactMap` + `seedApplicationDoc` filling `f_*`/`m_*` NamedRanges (~15 tokens). Masters on V1 sentinel format `${{x}}…${{/x}}`.
- **V2 (built May 26–Jun 2, orphaned):** 644-token NamedRange system, `seedApplicationDocV2` orchestrator, `templates/fill.ts`. Masters migrated to `{{token}}` literals on May 28. BUT `createApplicationDocs` never switched → every `{{...}}` survived unfilled. CURRENT-STATE.md incorrectly claimed "shipped 2026.06.04." `seed-v2.ts` had exactly one commit and was never imported.
- **V3 (session 019ea4ce, Jun 8, ADR-0013):** `replaceAllText("[Unique Label]", value ?? placeholder)`. No NamedRanges for text fill. NamedRanges retained ONLY for QR/signature image anchors. V1/V2 code deleted. `fillApplicationDoc` in `seed.ts` is single module.
- **Resolution:** V2 was built but never wired. V3 is the current production path.

### 13. PII fail-closed → fail-open reversal [RESOLVED Jun 4]
- **CC-early / OMP to Jun 3:** residual PII backstop was fail-closed (any known PII surviving masking throws/blocks).
- **Session-S3 (Jun 4):** User: "PII leaked to LLM should not trigger failure and block for now." All 5 egress sites reversed to fail-open by default, toggled by `PII_RESIDUAL_BLOCK` env var. Default = fail-open; `PII_RESIDUAL_BLOCK=1` for production.
- **All docs corrected:** `pii-masking.md`, `CURRENT-STATE.md`, `compliance.md`, `AGENTS.md`, env comments.

### 14. `hardGateViolations` from hand-set to auto-derived [RESOLVED May 25]
- **Early era:** `hardGateViolations: ['dsr']` on FOS-2026-002 was "illustrative-only" seed data — incorrectly set at Stage 1 when inputs don't exist.
- **Batch-08 (May 25):** redefined as derived read-cache. Auto-recomputed via `computeViolations(hardGates, activePolicy)` at `saveApplication` write boundary. Manual recompute assignments removed.
- Latent drift bug fixed: `confirmSlikAction` mutated `hardGates.kol` without recomputing violations.

### 15. Research corpus PII masking gap [RESOLVED Jun 4]
- **CC-early:** research synthesis corpus passed `buildCorpusPrompt(...)` straight to Gemini AND written to `AiInteraction.maskedPrompt` without running `maskForEgress`. All other AI egress paths already called `maskForEgress`.
- **Session-S3 (Jun 4):** `maskForEgress(buildCorpusPrompt(...), [])` added before both model call and audit write.
- **`AiInteraction.maskedPrompt` was always labeled wrong** (held unmasked corpus). Fixed: field now receives actually-masked corpus.

### 16. `narrative.ts` audit gap [RESOLVED May 28]
- **CC-early:** `narrative.ts` called `maskForEgress` but never `recordAiInteraction` — highest-stakes AI path (MUAP/RSK drafter) had no per-call masked audit trail while chat/advisory/research did.
- **Session d24cf23f (May 28):** `auditUserId` threading + `recordAiInteraction` call in `runNarrative`. New `narrative` surface added to audit type.

### 17. `ExploredSource[]` frozen in `DecisionCheckpoint` [RESOLVED — confirmed 2026.06.08]
- **Planning docs / `schema.prisma:83` comment:** claimed `ExploredSource[]` frozen into `DecisionCheckpoint`.
- **Session d24cf23f (May 28):** `service.ts:153-184` freeze omits it. Schema comment false. Deferred until web research goes live. Schema comment corrected.
- **Status: RESOLVED** — implemented after May 28. `freezeDecisionDocs` reads `app.exploredSources` and writes `DecisionCheckpoint.exploredSources` (`server/docs/service.ts:290,333`; migration `20260528090000`). The column is only populated once web research is live (gated, `WEB_RESEARCH_PROVIDER`); the freeze never recomputes research (`apps/web-app/AGENTS.md:66`).

### 18. Role fold: AO/LA/RT evolving names [RESOLVED Jun 8]
- **Brainstorm May 14:** "AO ≠ Analis ≠ Risk ≠ Komite — four distinct roles, no overlap" (hard PERSONAS rule)
- **May 31 (batch-19):** RM = AO = Analis in Hijra (📝 pending Bank confirmation). PERSONAS.md rule overturned.
- **Jun 2 (batch-19, Bank SOP):** "Analyst" lane = Risk Review (not 5C+1S analyst). LA persona dissolved. RM = AO = Analis confirmed 🏦.
- **Jun 4 (session-S2):** `Role` enum folded: AO+LA→RM, RT→RA. Desks functional.
- **Jun 8 (session-S6/session 019ea4ce):** `account-officer` + `loan-analyst` legacy roles → single `relationship-manager = ['intake', 'slik', 'muap-author', 'pencairan']`. Root cause of "Dokumen MUAP tidak tersedia" for Siti (AO) was `muap-author` desk stranded on `loan-analyst`.

### 19. `WorkflowSnapshot` authoritative persistence [PENDING — needs to be done]
- **ADR-0004 design:** `WorkflowSnapshot` is the authoritative cursor.
- **Current state (Jun 8):** `deriveWorkflowSnapshot(app)` is a derived projection only — `app.stage` still derives from the DB `stage` Int column. Snapshot columns not yet written to DB on transitions.
- **Plan:** strangler-fig; persist the snapshot via the command seam + invert so `app.stage` derives from it. Tracked `../../planning/workflow-snapshot-persistence.md`.
- **Status: PENDING (needs to be done)** — structural gap between design and implementation; required, not optional.

### 20. `5C+1S` vs `5C+2S` for RSK [RESOLVED]
- **Multiple CC sessions:** RSK described as 5C+1S (Syariah)
- **Session 59463e0a (May 26) and batch-12:** Agent proposed 5C+1S based on web research → user corrected: Hijra RSK template literally says "kerangka 5C + 2S (Syariah)." Template = source of truth.
- **Final:** RSK = 5C+2S = 7 dimensions: Character/Capacity/Capital/Collateral/Condition + Syariah-Akad + Syariah-Halal.

### 21. Stage-2 `DualSignOff` removed [RESOLVED Jun 8]
- **Batch-10 through batch-22:** `DualSignOff` WorkflowCommand for Stage 2→3 once both LG+RT handoffs complete. `advanceOnDualSignOff` function.
- **Session 019ea4ce (Jun 8):** `completeSlikAction`, `DualSignOff` command, `form: 'slik-handoff'` branch all deleted. 2→3 advance routed through standard `transitionAction`. `stage2RmDataReady = slikUploaded && kolEntered` (simplified; no separate `verifiedByRT` flag).
- `stage2SlikApproval` column kept as audit record but no longer gates.

---

## [VERIFY-DOC] Flags

- `[VERIFY-DOC]` **`komiteDecisionNote` server-enforcement before Jun 3:** any doc claiming `validateDecisionNote` was server-enforced before session-S1 (Jun 3) is likely incorrect.
- `[VERIFY-DOC]` **`ExploredSource[]` in `DecisionCheckpoint`:** ✓ confirmed 2026.06.08 — implemented after May 28; `freezeDecisionDocs` writes `app.exploredSources` into the checkpoint (`server/docs/service.ts:290,333`).
- `[VERIFY-DOC]` **`WorkflowSnapshot` persistence:** ✓ confirmed 2026.06.08 — `app.stage` is still the `Int` cursor and the snapshot is derived; docs now mark persistence **PENDING** (`../../planning/workflow-snapshot-persistence.md`).
- `[VERIFY-DOC]` **V2 vs V3 doc-gen:** if CURRENT-STATE.md still says "MUAP/RSK docs — done, shipped 2026.06.04, one-way NamedRange fill activated" — this was corrected to V3 in session 019ea4ce (Jun 8). Check CURRENT-STATE reflects V3 as the active mechanism.
- `[VERIFY-DOC]` **Structured extraction `sync-back` vs `read-back`:** `document-system.md` went through multiple rewrites. Final correct state (Jun 8): "sync-back" (bidirectional fill round-trip) DROPPED; "structured extraction" (`extractApplicationDocs` → `ExtractedSnapshot` → scoring + AI prompt) is LIVE. `exportDocMarkdown` is built but unwired.
