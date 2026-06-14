# Workflow Fine-Tune — End-to-End Redesign Plan

**Status:** App-code follow-up batch built; P3/ops/legal gates remain external/deferred (see §18). · **Started:** 2026.05.26 · **Owner:** app-side
**Decision partner:** human (NoEffort).
**Audit-reconciled:** 2026.05.28 (see §17–§18 — claims corrected against actual code).

> ⚠️ **Superseded specifics (2026.06.04).** This plan predates the role/desk fold + maker-checker + Rapat Komite. Where sections below name old roles/desks (`AO`/`LA`/`RT`, `S1-AO`…) or in-app committee **voting** (`quorumFor`/`calculateMajority`), read them as historical: the as-built model is the SOP role/desk fold (AO+LA→RM, RT→RA; functional desk codes) and a **signed-MoM** committee with no in-app voting (`../decisions/0005-rapat-komite-signed-minutes.md`). Also superseded by the **RM-led pipeline redesign (merged 2026.06.12)**: the intake hard-gates (docs/OCR/NIK/AML) no longer gate Stage 1→2 — they relocated to the **MUAP→Risk submit** (`muapToRiskBlockers`); read any "Stage-1/2 advance gate" discussion below as historical. Current model → `../designs/workflow-target.md` + `../designs/rm-led-pipeline-redesign.md` + `../CURRENT-STATE.md`. Consult this doc only for build rationale + the §0 ops-remainder table. **§15–18** (platform / AI / OCR / compliance analysis) are **pre-audit (2026.05.26)** — cross-check against `../references/compliance.md` + `apps/web-app/AGENTS.md` for current state.

> This is the canonical plan for the stage-by-stage workflow rethink. It supersedes
> ad-hoc discussion. Companion decisions: `docs/planning/config-and-admin.md`
> (versioned config, masking, G1–G5), `docs/guides/document-ai-ocr.md` (2c
> structured extraction), and `docs/references/ai-ml-deferred.md` (deferred AI/ML register).

---

## 0. Status (updated 2026.05.28)

**Core workflow code is built through the 2026.05.28 follow-up batch.** Verification for this batch: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (241 passing, with `.env.local` loaded for DB-backed tests), and `pnpm test:e2e` (10 scenarios / 35 steps passing).

Per-stream:

- **F1** — provider boundary (slice 1, `b496ecd`); `redact.ts` NER-seam + `audit.ts` (slice 2, `314c9ed`); Vercel AI SDK v6 + `generateObject`/Zod (slice 3, `248818f`).
- **F2** — eval scaffold + deterministic guardrail regression live (`f910329`). Provider-swap quality gate scaffolded; thresholds endpoint-gated until the Dec-2026 model swap.
- **Stage 1** — declarative field registry, uniform `uploadDocumentAction`, required-by-desk model, owner-confirmation rule, Data-nav single-count badge.
- **Stage 2** — Legal&SLIK tab deleted, nav rework, re-verify-on-doc-change built. Dual explicit handoff is now implemented: LG clicks "Kirim Review Legal ke Feasibility", RT clicks "Kirim SLIK ke Feasibility", and the second handoff advances. Kol input remains data entry, not formal handoff.
- **Stage 3** — MUAP+RSK auto-draft on stage entry, idempotent best-effort.
- **Stage 4** — RSK narrative via between-sentinel anchors + 14 `rn_*` per-aspect tokens; advisory "Saran AI" risk rec (migration + audited UI).
- **Stage 5** — `nextMeetingId` TOCTOU fix + auto-schedule foundation (`MeetingScheduleTemplateVersion` + parser + resolver + materializer + admin trigger button). P2 proposed agenda auto-assign is built with routing reasons, capacity, and CM confirm/cancel; P3 chair/attendee rotation remains deferred pending policy.
- **Stage 6** — `PencairanTab` audited, mobile refinement; `Cair`-gate server-enforced (unchanged).
- **Cross-cutting** — single `provenance.ts` state model; per-field `ProvenanceBadge` consolidated; MUAP/RSK "Disusun AI · diverifikasi" provenance band.
- **Web research** — provider boundary + egress classifier + stub provider; deterministic `plan → search → fetch → synthesize` pipeline with citation enforcement + `ExploredSource[]` persistence + "Riset Web" card UI on MUAP; `ExploredSource[]` is frozen into `DecisionCheckpoint` at committee decision time.
- **Admin-configurable AI prompts** — `AiPromptVersion` versioned config across 7 surfaces; ADMIN-POLICY Prompts tab editor + full history.

**Remainder = OPS / human action, NOT code:**

| Item | Owner |
|---|---|
| Live-Gemini smoke for "Minta Saran AI" + "Jalankan Riset Web" | human (costs Gemini API; code + gates verified) |
| Populate first `MeetingScheduleTemplateVersion` + run materializer | human / ops (call `setMeetingScheduleTemplatesAction` once; daily cron next) |
| pg-boss daily worker Docker sidecar | ops (when scheduling goes live) |
| Per-template edit form | UX follow-on |
| P3 chair/attendee rotation | explicit next-phase per §8; waits for fairness/absence/quorum/conflict policy |
| OJK offshore permit / DPIA / DPS opinion / G5 DPAs / in-region platform decision | Bank-Legal (external regulatory) |

The remaining sections below are the **design rationale** that produced this build. They are accurate but historical; do not re-plan against them.

---

## 1. Vision / throughline

Mizan moves from **"human fills forms"** to **"draft-then-confirm, semi-autonomous."**
At every stage, OCR / AI / automation produce a **draft**; the field's **owner confirms**.
The spine is unchanged and non-negotiable: **provenance + confirmation + audit**, with
the existing compliance guarantees (PII masking, AI never authors authoritative
numbers/levels/recommendations) preserved everywhere.

Two consequences shape the whole plan:
1. **Most of stages 3–4 already exist in skeleton** (token-templated docs + Gemini
   narrative). The work is *extend + auto-trigger + ground richer*, not *invent*.
2. **Two ideas fight the core design** (AI recommendation, web research). They are
   allowed only under strict, gated forms — see §7 and §11.

---

## 2. Current-state grounding (so the builder doesn't re-discover)

### 2.1 OCR / extraction (today)
- Field extraction is a **hardcoded switch**, only 4 fields:
  `lib/ocr.ts` (`extractFromDocument`, `parseGateValueFromText`) + `server/actions/application-data.ts` (`applyGateSuggestion`).

  | Field | Source doc | Confirmed by (desk) |
  |---|---|---|
  | `nik` | KTP | RM intake (`intake`) |
  | `hardGates.kol` | SLIK | RM bureau-data (`slik`) |
  | `financialInputs.netMonthlyIncome` | slip_gaji / laporan_keuangan | RM analysis (`muap-author`) |
  | `financialInputs.collateralAppraisedValue` | appraisal_agunan | RM analysis / LG appraisal input |

- **Full-document OCR text already runs on EVERY upload** → `ApplicationDocument.extractedText` (`extractAndStoreText`), used for narrative grounding. Untapped for field population beyond the 4 above.
- Provenance state machine exists: `ExtractionSource = human_entered | ocr_suggested | ocr_confirmed | ocr_overridden` (`lib/types.ts:46`). Per-field audit on every write/confirm.
- **Four bespoke upload actions:** `uploadKtpAction`, `uploadRequiredDocAction`, `uploadSupportingDocAction`, `uploadSlikAction` — differ only in desk gate + which extraction runs.
- OCR provider is swappable via `OCR_PROVIDER` (`server/ocr/`): `stub` (offline default) · `documentai` (prod) · `gemini`. External OCR = PII egress, human-confirmed suggestion.

### 2.2 Stage 2 (current)
- Owners parallel: RM bureau-data (`slik`) + Legal & Appraisal (`legal` + `appraisal`). 2→3 advances on `stage2RmDataReady` (SLIK handoff + Kol); Legal/Appraisal gate MUAP→Risk via `legalAppraisalComplete`.
- Legal/Appraisal are tracked deliverables: Analisa Yuridis lives in the Documents tab; Penilaian path lives in the Data tab. Neither controls the 2→3 advance.
- SLIK/Pefindo live as normal document rows; the RM bureau desk uploads and inputs Kol. Per-doc legal verification (`pass`/`fail`) lives in **Documents tab** → `verifyDocumentAction`.
- Stage-2 has no standalone tab: Data + Documents are the surfaced work areas (`lib/detail-nav.ts`).

### 2.3 Docs / MUAP / RSK — **pre-V3 baseline snapshot** (current state → `document-system.md`)
- **Template setup:** this §2.3 captures the state *before* the V3 docs rebuild. Current generation is **V3** — `[bracket]` placeholders + `replaceAllText` (`server/docs/seed.ts`), MoM/SP3 on `{{token}}` (`server/docs/mom-sp3.ts`); see `document-system.md` + `../references/document-templates.md`. The old V1 `setup-template-ranges.ts` NamedRange/sentinel path is retired — do not revive it.
- **Fill split** (`server/docs/seed.ts`): DETERMINISTIC facts (`f_*` — plafond, tenor, dsr, ltv, kol, financials) vs **Gemini narrative** (`m_*` for MUAP). RSK narrative tokens (`r_profil_risiko`, `r_mitigasi`, `r_kesimpulan`) **deferred / empty today**.
- **Trigger today:** user clicks "Buat Dokumen dari Template" (`DocsPanel.tsx`); NOT auto on stage entry.
- **5C+1S first draft** already seeded on Stage-3 entry: `buildAnalysisDraft` via `applyStage3Entry` (`stage-action.ts:50`).
- **Compliance guardrails (must preserve):** response schema has **no level/recommendation key** (`narrative.ts` `objSchema`); `scrubNarrative` drops any verdict/level text; mask-in/unmask-out via `lib/pii-mask.ts` (`maskPii`/`unmaskPii`) — masking ALWAYS runs. The `detectResidualPii` backstop is policy-configurable (`PII_RESIDUAL_BLOCK`, `server/ai/redact.ts`): **default fail-OPEN** (log only, keeps demos unblocked — 2026.06.04); `=1` to fail closed for prod. Do not revert the default to an unconditional throw. Masking = known-fields + regex only (NO NER — accepted residual risk, see configurability memo).
- **Risk recommendation today is human:** RT picks approve/conditional/reject in `RSKTab.tsx` → `saveRiskRecommendationAction` → `riskRecommendation` + `riskNote`.
- **(At snapshot time) no web-scraping existed.** Since then the deep-research agent (`server/research/*`) has been built (RM-invoke; PII-gated) — see `ai-assist.md`.
- Storage: Google Docs (master IDs in env) + `DocLinkage`/`ExtractionRun` tables; PDFs frozen into `DecisionCheckpoint` (SHA-256) at committee decision. Embeds use `/preview`.

### 2.4 Stage 5 (today)
- `KomiteMeeting` (`lib/types.ts:124`): `id, date, time, room?, meetingUrl?, agendaAppIds[], attendeeUserIds[], chairUserId, notes?, status, createdBy, createdAt`. Relational join tables `MeetingAgendaItem`, `MeetingAttendee`.
- Created manually via `scheduleMeetingAction` (`S5-CM` gated) + `MeetingScheduler.tsx` dialog. Rooms from `getActiveCommitteeRooms()` (versioned config).
- Quorum `quorumFor` = ⌈attendees×2/3⌉; `calculateMajority` = strict majority. `committeeOf` resolves attendees+chair (chair must be an attendee).
- **No recurrence, no auto-assignment, no plafond routing.** Confirmed.

### 2.5 Versioned-config pattern (reuse target)
- `lib/config/versioned.ts` `resolveActiveVersion<T>(rows, at)` = highest `version` with `effectiveFrom ≤ at`.
- Append-only version tables: `SlaPolicyVersion`, `RiskPolicyVersion`, `CommitteeRoomsVersion`, `DisbursementConditionsVersion`. Resolvers in `server/config/*`. Admin writes via `master.ts`/`policy.ts`. Seeded v1 = code constant in `seed-config.ts`. Edited via `ADMIN-MASTER` / `ADMIN-POLICY` desks.

### 2.6 Stage 6 (today)
- `PencairanTab.tsx`: 4-step stepper `Verifikasi Final → Proses Akad → Siap Cair → Cair` (`lib/disbursement.ts`), each with a distinct icon. `Cair` server-gated on all `disbursementConditions` complete (`application-data.ts:407`).

---

## 3. Stage 1 — OCR generalization (SETTLED)

### Goal
Generalize document upload + extraction so there are **no special cases**; OCR
becomes a generalized *field-prefill layer*; the human confirms.

### Design
1. **Declarative field registry** replaces the `ocr.ts` switch + `applyGateSuggestion`:
   ```
   FieldExtractor = {
     fieldPath: string                 // e.g. 'financialInputs.netMonthlyIncome'
     sourceDocTypes: string[]          // docs that can yield it
     extract: (text|structured) => {value, confidence} | null   // conservative; null ⇒ stay manual
     ownerDesk: Desk                   // who confirms
   }
   ```
   - OCR fills whatever it can **confidently** read from docs present; everything else stays manual (no fabrication — matches today's conservative `parseGateValueFromText`).
   - Shape `extract` to accept **structured output `{value, confidence}`**, not just regex-from-text, so the **2c Document AI structured extractor** (`docs/guides/document-ai-ocr.md`) is a drop-in later.
   - **Keep** the `ExtractionSource` provenance state machine + per-field audit unchanged.
2. **Confirmation by the field's OWNER** (NOT all-to-RM): RM intake for identity, RM bureau-data for Kol, RM analysis/LG appraisal for financials. Generalized rule: *prefill → owner confirms*.
3. **One uniform upload action** `uploadDocumentAction(docId, file)`: store bytes → full-text OCR → run field registry → audit. The **desk gate becomes data** ("who may upload this docType"), not 4 separate functions.
4. **Doc model: "required, owned by desk D"** instead of flat `required: boolean`.
   - Fixes SLIK/Pefindo: they become normal checklist rows owned by RM bureau-data (`slik`), shown from the start as "awaiting bureau data," upload control visible only to a holder of that desk. **Must NOT count toward the Stage-1 advance gate**.
   - **Multi-desk users:** controls are keyed off desks held and current workflow window, not hardcoded stage widgets.

### Badges
- **Remove all OCR-specific badges from Documents tab** — kill `"NIK terbaca OCR — konfirmasi di tab Data"` and per-doc "Perlu Tindakan" (`DocumentsTab.tsx`).
- Documents tab keeps **two status chips per doc: upload status + legal status** (`Terunggah` / `Belum ditinjau` side by side).
- **One count badge on the Data nav entry** = count of (`ocr_suggested` + required-but-empty). One badge, one meaning: *"N fields need attention in Data."* It does **not** double as the stage-advance signal (that gate speaks separately). Need-confirm is treated as still-empty input.

### Gate: **LOCAL — build freely** (reversible, no shared surface). Exception: the
"required-by-desk" doc-model touches the Stage-1/2 advance gate → keep that sub-change
consistent with the Stage-2 work in §4.

---

## 4. Stage 2 — dual sign-off + delete the tab (AGREED)

### Decisions
- **Dual explicit handoff** replaces the single button + magic auto-skip. LG and RT each push
  their own **"Kirim ke Feasibility"** action; the **second** handoff (when the other
  desk has already sent) triggers the transition to Stage 3.
  - **Important product rule (2026.05.28): data entry is not handoff.** Uploading SLIK,
    entering Kol, or marking legal docs pass/fail records work, but does **not** by itself
    mean the desk has formally sent the case onward. Each desk needs an explicit send action.
  - Suggested labels: LG = **"Kirim Review Legal ke Feasibility"**; RT =
    **"Kirim SLIK ke Feasibility"**. After one side sends, show a waiting state such as
    "Review Legal sudah dikirim — menunggu SLIK" / "SLIK sudah dikirim — menunggu Legal".
  - Removes `maybeAutoAdvanceStage2` and the auto-skip special case entirely.
  - **Dissolves the history-log question:** there's no "normal vs auto-next" fork
    anymore. Log two real handoffs + one transition; do NOT unify into one message.
  - **Re-verify on doc change:** a changed/replaced verified doc resets its
    `legalVerification` → LG-ready flips false → LG must re-verify.
- **Delete `LegalSlikTab`** and the "Legal & Pencairan" nav group.
  - **Legal verification (per-doc pass/fail + optional reason on fail) → Documents tab.**
    Legal's work centers on the documents. (Per-doc fail-reason replaces the aggregate
    legal-notes blob.)
  - **Kol / SLIK → Data tab** (Kol entry already lives there).
  - **Drop the ephemeral SLIK notes textarea** (never persisted — dead UI).
  - Keep `stage2LegalApproval` as the LG sign-off record; `notes` optional or per-doc.

### Gate: **STATE-MACHINE + IA change → design-before-build with the human**
(the pipeline state machine is a high-stakes surface). Name the surface
(dual sign-off, removal of auto-skip, tab/IA change) and decide it before building.

---

## 5. Stage 3 — AI pre-draft (extend existing; web research gated)

### Decisions
- **Auto-draft on stage entry** instead of the manual "Buat Dokumen" click. Extends
  `seedDocs` + `applyStage3Entry`. Low-risk (it's a draft; LA edits).
- **Richer grounding:** feed the already-stored full-document OCR text + inputted data
  into the MUAP narrative prompt (masked). `documentTexts` seam already exists in
  `seed-context`.
- **"AI dynamic input to placeholders"** = extend the template fill registry + MUAP narrative token set. **Keep guardrails** (no
  number/level key, `scrubNarrative`, mask-in/unmask-out).
- **5C+1S** already gets a first draft on entry; make it AI-richer + OCR-grounded so LA
  never starts from scratch.

### Gate: **LOCAL extension** for the local-data parts. The web-research part is §7.

---

## 6. Stage 4 — AI RSK draft + advisory recommendation

### Decisions
- **AI-draft the RSK narrative** (`r_profil_risiko`, `r_mitigasi`, `r_kesimpulan`),
  currently deferred. Same generator, same guardrails. In-scope extension.
- **AI risk recommendation = ADVISORY ONLY** ("Saran AI"):
  - Labeled, shown on the RSK tab **next to — never inside** — the authoritative
    `riskRecommendation` field.
  - **Never** written to `riskRecommendation`, **never** frozen into the RSK doc.
  - RT must still **explicitly choose** approve/conditional/reject.
  - This preserves the existing guarantee (AI cannot author a decision). It is a
    decision-support hint, not an authored decision.

### Gate: RSK narrative draft = local extension. **AI recommendation = compliance
surface → Bank Legal sign-off** before build.

---

## 7. AI web research (THE CRUX — cross-cutting, gated)

Highest value, highest risk. Fights Mizan's masking design. **Net-new** — nothing exists.

### Two problems
1. **PII egress (the real blocker).** Researching a customer means sending identifying
   terms (company, owner, address) OUT to the open web — exactly what masking prevents,
   and the query can't be masked and still find the entity. This is a **new egress
   surface beyond G1–G5**. (Industry: this is where bank AI compliance gets tested.)
   - **Proposed risk boundary:** allow web research **ONLY for business / public-entity
     data** (company filings, NIB, public news about the *usaha*); **NEVER for an
     individual's PII** (no searching a person's name/NIK). A `PT` name is arguably
     public; a person is not. Final call = the Bank's.
2. **Hallucination.** Banking consensus = RAG + strict guardrails + **citation
   grounding** + human verification. So if approved:
   - **Every web-derived claim carries a source link.** Advisory-only. Never an
     authoritative number. Human-confirmed before it enters any doc.

### Artifact
- **`ExploredSource[]`** as a first-class record: `{ url, title, claim, retrievedAt }`.
  Rendered on the MUAP tab (the human's "explored links" instinct = the grounding/audit
  surface), and **frozen into the decision checkpoint** for audit.

### Gate: **NEW EGRESS → Bank-legal decision (hard gate) BEFORE any
code.** Pursued as a separate workstream, scoped business/public-entity only. Everything
else in §5/§6 proceeds without it.

---

## 8. Stage 5 — configurable auto-scheduling (phased)

### Design — reuse the versioned-config pattern
New append-only table `MeetingScheduleTemplateVersion` (mirrors `CommitteeRoomsVersion`):
```
MeetingScheduleTemplateVersion {
  version           Int @unique
  scheduleKey       String        // 'tue-1600-roomA'
  dayOfWeek         Int           // 0=Sun … 6=Sat
  time              String        // 'HH:mm'
  room              String?       // from active CommitteeRoomsVersion
  meetingUrl        String?       // daring/hybrid; may be confirmed-later
  attendeeUserIds   Json          // from CM roster
  chairUserId       String        // from CM roster
  capacity          Int           // app slots per meeting
  routingFilter     Json?         // { minPlafond?, maxPlafond?, akadTypes?[] }
  notes             String?
  effectiveFrom     DateTime
  reason            String?
  createdBy         String
  createdAt         DateTime
}
```
Resolve with `resolveActiveVersion`; seed v1; edit via `ADMIN-MASTER`.

### Phasing (keep a human in the loop — semi-autonomous, not black-box)
- **P1 — Recurring templates materialize empty meetings** on cadence (e.g. "Selasa
  16:00 Ruang A, 2 slot"). Removes create-from-scratch toil. Low risk.
- **P2 — Auto-assign eligible Stage-5 apps** to the next matching slot by routing rule
  (plafond tier → template) + capacity → presented as a **"proposed agenda" the
  official confirms in one tap.** (Balanced/rules-based scheduling adapted to committee.)
- **P3 — Rotate chair/attendees** (round-robin fairness) + auto-confirm for trusted
  templates.

### UX (for high-ranking officials — control + glanceability)
Calendar/agenda view of upcoming auto-materialized meetings, each with auto-proposed
agenda, capacity bar, one-tap confirm/adjust. The win is **"system proposes, you approve
at a glance,"** never "system decided." Full dribbble/pattern pass (2–3 options) when
the phase scope is picked.

### Gate: **Data-model + workflow surface → decide with the human.**

---

## 9. Stage 6 — polish only

No structural change. Already a 4-step stepper with distinct icons. Apply the design
skill for polish. Confirm `Cair`-gated-on-conditions stays server-enforced (it is).

---

## 10. Cross-cutting standards

- **Colorblind-safe everywhere:** never color alone — pair with icon/shape/text.
  `StatusChip` already does this; apply consistently to new surfaces (badge counts,
  capacity bars). (Documented app rule.)
- **Intuitive, no-manual:** the app should need no manual. Every new surface goes
  through the `mizan-design` skill; bring **2–3 pattern options** for genuinely new UIs
  (auto-schedule, unified Documents/Data flow), researched against current web/dribbble
  patterns — not one.
- **Preserve compliance spine** in all AI work: masking (`pii-mask.ts`), no AI-authored
  numbers/levels/recommendations (schema + `scrubNarrative`), per-field/per-action audit.

---

## 11. Compliance & protocol gates

| Thread | Gate |
|---|---|
| Stage-1 OCR registry, uniform upload, badges | **Local — build freely** |
| "required-by-desk" doc model (Stage-1/2 gate) | Bundle with Stage-2 (touches advance gate) |
| Stage-2 dual sign-off + delete Legal&SLIK tab | **State-machine + IA → design-before-build with the human** |
| Auto-draft MUAP/RSK narrative (local data only) | Local extension; mirror guardrails |
| AI risk recommendation (advisory) | **Compliance surface → Bank Legal** |
| AI web research | **New egress → Bank Legal (HARD gate)** |
| Stage-5 auto-schedule | **Data-model + workflow → decide with the human** |

Decide each shared surface **with the human when a thread is locked for build**,
not before. PUSH waits for the human.

---

## 12. Sequencing (agreed)

1. **Stage-1** OCR field-registry + uniform upload + badge cleanup *(local)*
2. **Stage-2** dual sign-off + tab consolidation *(human design sign-off first)*
3. **MUAP/RSK auto-draft** (local-data grounding) *(local)*
4. **Stage-5 auto-schedule** *(human design sign-off; may be pulled FORWARD — high impact,
   compliance-light — at the human's discretion)*
5. **Gated AI** — advisory risk rec + web research *(Bank-legal gated; last)*

---

## 13. Resolved decisions

- Confirmation = **field's owner** (not all-to-AO).
- Stage 2 = **dual sign-off + delete the tab** (legal→Documents, Kol→Data).
- AI risk recommendation = **advisory "Saran AI" only** (never authoritative/frozen).
- Web research = **gated workstream, business/public-entity data only, never
  individuals**; citation-grounded; `ExploredSource[]` artifact.
- Sequencing = §12 (auto-schedule may move earlier).

## 14. Open / deferred

- Exact field set to light up in the Stage-1 registry beyond the existing 4 (e.g.
  nama/alamat from KTP, existing-obligations from SLIK) — each new field needs a
  parser + confirm row. Decide per-field at build.
- Web-research egress boundary — **Bank Legal** must ratify the business-only scope.
- 2c structured extraction (Document AI Form/Custom Extractor) — registry is shaped for
  it; not built here.
- ML/"learning" adaptive OCR (learn from overrides) — explicitly **deferred** (bundle
  with NER as a future package; do not build alone).
- Auto-schedule P2/P3 routing fairness + UX option pass — at phase pickup.

---

## 15. Research findings & tech decisions (2026.05.26)

Four parallel research streams (UI/UX, AI platform, OCR, scheduling). These REFINE
§3/§5/§6/§7/§8 above; source links omitted here but captured in the research run.

### 15.1 AI inference platform — the Dec-2026 mandate reshapes the architecture
- **"In-region inference by 17 Dec 2026" rules out the convenient options:** Vertex AI
  Jakarta does NOT commit to in-country *processing* (ML-processing residency = US/EU
  only); Bedrock Jakarta runs only **Amazon Nova** in-region (all Claude = global
  cross-region).
- **Only compliant paths:** (A) **self-hosted open model** (Qwen 2.5/3, Llama 3.x, or
  **Sahabat-AI** for Bahasa) on Indonesian sovereign GPU (Lintasarta GPU Merdeka) or
  on-prem bank GPUs via **vLLM**; or (B) **Amazon Nova Pro in-region** (Bedrock
  ap-southeast-3), accepting a quality step-down from Gemini.
- **DECISION → new foundational primitive: an `INFERENCE_PROVIDER` boundary** mirroring
  `OCR_PROVIDER` (`gemini` today → `vllm`/`bedrock-nova`). Cutover = config flip + adapter,
  not a rewrite. Masking + `detectResidualPii` stay provider-agnostic. **This is a
  prerequisite for the AI-heavy stages, built before/under them.** De-risk by standing up
  a vLLM endpoint behind the boundary and eval'ing on MUAP/RSK drafting vs Gemini.
- **Escalate to Bank:** self-host vs Nova (cost + MLOps weight); model-quality eval gate.

### 15.2 OCR — typed extraction now (Singapore), in-region self-host by deadline
- **Google Document AI Custom Extractor** = right shape for the 2c upgrade: typed
  per-doc schemas (KTP/SLIK/slip/laporan/appraisal/NPWP/akta), 0–50 train docs,
  **per-field confidence 0–1.** BUT not in Jakarta — nearest is **Singapore
  (asia-southeast1) = cross-border PII** (G5-class DPA gate). Pretrained Identity
  processor is US-only (useless for KTP).
- **In-region endgame:** self-host **Qwen2.5-VL + PaddleOCR PP-StructureV3** behind the
  existing `OcrProvider`, same typed schemas.
- **Two SAFETY rules → into the design (high-stakes core):**
  1. **Numeric/gating fields (DSR/LTV/Kol inputs, net income, appraised value, Kol)
     NEVER auto-confirm**, even at high confidence — VLMs hallucinate 28–34% on degraded
     scans. Auto-fill only low-stakes strings (nama/alamat) above threshold.
  2. **Don't trust model-reported confidence** — derive it (OCR-vs-VLM agreement +
     checksum/format validation: NIK 16-digit, Kol ∈ 1–5, NPWP format).
- **Typed output shape** (engine-agnostic; this IS the §3 registry `extract` return type):
  `ExtractedField<T> = { value: T|null, rawConfidence: number|null,
  confidence: 'high'|'review'|'low', provenance, source, validation? }`.
  Confidence tiers: ≥0.9 auto-fill · 0.6–0.9 prefill+flag · <0.6 leave blank — but
  numeric/gating fields force human confirm regardless of tier.

### 15.3 Grounded web research — architecture decided, egress still Bank-gated
- **Use raw-results search APIs** (Tavily for citations, Exa for discovery, Brave for
  index-independence) **+ synthesis on the in-region model.** AVOID "answer" APIs
  (Perplexity Sonar, Vertex Grounding) — they inject a 2nd uncontrolled LLM that authors
  prose, colliding with the in-region goal AND "AI never authors conclusions."
- **Enforce citations structurally:** schema requires `citations[]`; a guardrail drops
  uncited sentences (reuse `scrubNarrative` muscle). **Source allowlist** (AHU/
  Kemenkumham, OJK, IDX, news) — narrows leakage + hallucination.
- **Egress scoping (the boundary):** a classifier ensures a `[NASABAH]`-class PERSONAL
  identifier can NEVER be a query; only `[USAHA]`-class business identifiers pass.
  **POJK 11/2022 may require OJK approval even for business-term egress → Bank Legal.**

### 15.4 UI/UX — three surfaces are ONE problem
- **Per-field provenance, doc-extraction review, and AI-narrative citations are the same
  thing:** *AI suggested → human confirmed → audited.* Build **one provenance state model
  (`suggested | confirmed | overridden | ungrounded`) rendered through the one StatusChip
  vocabulary** across all three. Keeps the codebase DRY + one audit story for OJK.
- **Per-field:** tri-state badge **Disarankan AI → Dikonfirmasi → Diubah** + a **batch
  review panel** for the "N fields just arrived from extraction" moment. Friction matched
  to risk (light confirm for phone; explicit logged confirm for decision-bearing values).
- **MUAP/RSK citations:** always-on section band **"Disusun AI · diverifikasi [nama]"**
  (AI-vs-human distinction) + Harvey-style **hover-to-ground excerpt** (on-demand claim
  tracing, memo stays clean). Flag **ungrounded** claims explicitly ("tanpa sumber").
- **Exec agenda:** proposed-agenda card — one-tap **Konfirmasi**, inline **Sesuaikan**,
  **capacity bar**, and *why each app was slotted* (e.g. "SLA jatuh tempo 3 hari") so
  officials ratify with context. Approval-queue list wraps it; full builder behind Sesuaikan.
- **Colorblind pitfall to FIX:** don't over-desaturate status red/green into the navy
  palette (collapses contrast). Audit current StatusChip reds/greens; target AAA for chips.
  Prefer blue/orange adjacency over red/green when two states sit side by side.

### 15.5 Scheduling tech (refines §8)
- **`pg-boss`** (Postgres job queue + cron; no Redis, no extension; multi-master-safe via
  `SKIP LOCKED`) over pg_cron/node-cron/BullMQ — consistent with the repo's Postgres-first
  stance (LISTEN/NOTIFY). Worker runs in a dedicated long-lived process in the Docker image.
- **Simple day-of-week + time + Asia/Jakarta model, NOT RRULE** (no DST → removes the
  hardest recurrence bug). Holidays handled by deleting/rescheduling the `proposed` draft,
  not EXDATE.
- **Idempotency:** unique `(sourceTemplateId, scheduledDate)` on KomiteMeeting + advisory
  lock around the batch; materialize as `status='proposed'` → human confirm → `upcoming`.
  New `KomiteMeeting` fields: `status` (add `proposed`/`cancelled`), `sourceTemplateId?`,
  `scheduledDate?`, `slotCapacity?`; make `chairUserId` nullable (proposed has no chair),
  validate chair-in-attendees at the confirm transition.
- **Rules engine: plain TS predicates over active config** — NOT json-rules-engine (only if
  admins must author rules at runtime via UI, a P4 fork).
- ⚠️ **Latent bug to FIX (independent of scheduling):** `nextMeetingId()`
  (`server/repo/meetings.ts:44`) does `findMany → max+1` in JS — a **TOCTOU race**
  auto-materialization will trigger. Move into the locked txn or use a DB sequence.

### 15.6 New escalations for human / Bank Legal
- **Self-host LLM vs Amazon Nova** — strategic AI-platform call (Vertex Jakarta fails the mandate).
- **Singapore Document AI as interim vs skip to in-region self-host** — cross-border KTP/SLIK PII, POJK 11/2022.
- **Web-research egress approval** — POJK 11/2022 may gate even business-term search egress.
- **`nextMeetingId` race fix** — latent bug; do regardless.

---

## 16. Research round 2 — regulatory, platform economics, AI architecture, eval (2026.05.26)

Refines §15. Source links captured in the research run.

### 16.1 Indonesian regulatory (the gating layer)
- **POJK 11/2022 Art. 35 / Ch. VII — offshore processing needs PRIOR OJK APPROVAL (izin), not notification.** ~3-month decision window → the **gating long-pole** for any cross-border (Singapore Doc AI / US Gemini / search API) go-live. Cloud-outside-Indonesia counts as offshore placement. Core banking can't go offshore at all.
- **Module-separation rule (FAQ Q7):** only a *separable* module may be offshored → **VALIDATES the provider-boundary architecture** — the OCR/`INFERENCE_PROVIDER` seams are the isolatable module a permit would scope. Keep AI egress cleanly separable.
- **OJK AI Governance guidance (29 Apr 2025)** — non-binding but a supervisory benchmark. Pillars: Reliability / Accountability / **Human-Oversight**. Mizan's advisory-only + human-decides design is the **strongest compliance asset** — preserve it. **DPIA effectively mandatory.** [LEGAL CALL] whether the credit-memo LLM is "high-impact" (board sign-off).
- **PDP Law (UU 27/2022, in force Oct 2024):** no adequacy list yet → cross-border PII rests on **DPA + explicit consent**; processor agreement mandatory per vendor (Gemini/Doc AI/search/Nova); breach notify 3×24h; fines to 2% revenue.
- ⚠️ **"Business" research can still be PERSONAL data** — sole-proprietor / director names are personal under PDP. The egress classifier must strip *person* names from business queries, not just trust that the entity is a "PT."
- **Syariah:** no DSN-MUI fatwa on AI; **DPS must bless the workflow** (advisory framing avoids *gharar*). [LEGAL CALL]
- **Residency:** PP 71/2019 + POJK 11 → onshore default; interim cross-border = highest-regulatory-cost window → minimize PII offshored + shortest duration. In-region by Dec 2026 removes the offshore + PDP-cross-border triggers for inference.
- **Pre-go-live blockers are Bank-Legal-owned, not code:** (1) OJK offshore permit for any interim cross-border, (2) vendor DPAs (the existing **G5** artifact satisfies PDP+POJK11+AI-Guidance at once — prioritize), (3) DPIA + PDP lawful basis, (4) DPS opinion.

### 16.2 Platform economics — REVISES the §15.1 lean
- **Self-host is 5–15× more expensive than managed at Mizan's volume** (dedicated GPU sits mostly idle; ~$1,500–5,500/mo vs managed ~$80–400/mo). **Don't buy GPUs** (break-even ~14–16mo at 100% util, which Mizan won't hit).
- **REVISED recommendation: Amazon Nova Pro on Bedrock Jakarta (ap-southeast-3)** = pragmatic path — managed, **already in-region, satisfies the Dec-2026 mandate with near-zero ops.** Self-host (Qwen2.5-32B-FP8 on a *rented* H100; Sahabat-AI 70B for Bahasa) = **sovereignty option the Bank elects after a benchmark**, not the default.
- **FP8 yes; AVOID 4-bit** for the long-context OCR→narrative path (up to ~32–59% quality loss on long context). Serving = vLLM + guided decoding. Benchmark 32B vs 70B on real masked MUAP/RSK before committing; decide by data.

### 16.3 AI architecture — concrete, behavior-preserving for today's Gemini
- **Vercel AI SDK v6** for the `INFERENCE_PROVIDER` boundary (NOT roll-your-own / LangChain / LiteLLM). vLLM = OpenAI-compatible → self-host is *config, not code*; `@ai-sdk/amazon-bedrock` covers Nova. One `LanguageModel` interface across Gemini → Nova → vLLM.
- **Centralized compliance helpers** carry mask-in/unmask-out + `detectResidualPii` (fail-closed) + `AiInteraction` audit + `withRetry`. **As-built (2026.05.28 audit):** this is NOT a `wrapLanguageModel` middleware — it is shared helpers (`server/ai/redact.ts` `maskForEgress`/`activeRedactor`, `server/ai/audit.ts` `recordAiInteraction`) that each caller (`assistant.ts`, `advisory-rec.ts`, `narrative.ts`, `research/*`) invokes; `withRetry` is owned by the provider impl. Provider-agnostic and honors the ratified known-fields+regex masking (no NER claim). A real `wrapLanguageModel` middleware remains a viable future refactor (would remove the per-caller invocation), but was not built.
- **`generateObject` + one Zod 4 schema** replaces the hand-rolled `responseSchema`+manual-parse in `server/ai/gemini.ts`.
- **Research loop = DETERMINISTIC pipeline** (`plan → search(Tavily/Exa) → fetch → synthesize`), citations enforced in code, LLM confined to plan+synthesize. **No agent framework, no tool-calling control loop** (auditability/reproducibility for OJK; avoids "tool-call hacking").
- Caveat: AI-layer is plain server TS (no Next coupling) — but anything touching routes/Server Actions/streaming-to-client (`useChat`/`streamText`) must be checked against `apps/web-app/node_modules/next/dist/docs/` (modified Next).

### 16.4 Eval / QA — the cutover gate
- **Promptfoo** (Node/CLI, self-hostable, 50+ red-team plugins incl. `pii:*`, `prompt-extraction`, `hijacking`, `indirect-prompt-injection`) = gate spine + **RAGAS** (faithfulness/citation) + optional **Langfuse** (prod monitoring). All self-hostable with a **local judge** (no SaaS egress).
- **Never gate compliance on an LLM judge** — reuse `scrubNarrative` / Zod schema / `detectResidualPii` as **deterministic assertions**, **zero-tolerance** for PII leak / injection / authoritative-output. Judge only for narrative *quality* (discrete anchored rubric, different model family, validated vs human labels; 100% pass = eval too weak).
- **OCR:** golden-set per-field F1 + **shadow-mode** through the existing provider boundary (candidate ≥ current per critical field, NIK especially) before flip.
- **Grounding:** RAGAS faithfulness ≥ current−ε; citation correctness.
- Layout: new top-level `eval/` (golden sets + promptfoo configs + RAGAS + assertion modules reusing prod seams) + a CI `eval` job; guardrail suites run on **every PR**, not just at cutover.

### 16.5 Revised build foundation (foundation-first)
Build-now, **behavior-preserving, NO Bank gating** — and prerequisite for the AI stages:
- **F1.** AI SDK provider boundary (`INFERENCE_PROVIDER`) + centralized mask/audit/retry helpers (`redact.ts`/`audit.ts`; NOT a `wrapLanguageModel` middleware — see §16.3 + §17) + `generateObject` schema migration — cut over the *existing Gemini path* with no behavior change; prove `AiInteraction` + masking unchanged.
- **F2.** Eval harness (`eval/` + CI job) + the deterministic guardrail regression suite — locks the compliance invariants as a permanent gate before any model swap.
- These two unblock: the Dec-2026 provider swap (Nova/self-host become config + an eval-gate pass), and every AI-drafting stage (3/4/web-research) sits on F1+F2.

---

## 17. Audit reconciliation (2026.05.28)

A claim-by-claim audit of the "SHIPPED" status against the actual code (four parallel
review passes + spot-verification). **Headline: the build is real — not phantom.** Stage 1–6,
F1/F2, web-research (egress-dormant), admin prompts, and Stage-5 auto-schedule are genuinely
implemented and wired, with migrations applied. The exceptions below are now either FIXED in
code or recorded as accepted/deferred so the plan stops over-claiming.

### Fixed in this pass (code)
- **MUAP/RSK narrative now writes an `AiInteraction` audit row.** Previously `narrative.ts`
  masked egress but recorded no audit, while every other AI surface (chat/advisory/research)
  did — a compliance-spine gap on the highest-stakes path (the memo that becomes a frozen
  regulatory doc). Added `surface: 'narrative'`, masked-prompt + masked-reply recording inside
  `runNarrative`, and an `auditUserId` threaded from the manual "Buat Dokumen" button and the
  analysis route (acting user) / auto-draft (`'system'`). Best-effort (a failed audit write
  logs, never discards prose). `AiInteraction.userId` has no FK, so `'system'` is safe.
- **Stale comments corrected:** `schema.prisma` `AiInteraction.surface` now lists all five
  surfaces; `exploredSources` comment no longer claims it is frozen into the checkpoint;
  `service.ts` RSK token naming comment uses the real `<aspect>_finding`/`_mitigation`.

### Doc over-claims corrected (code was always fine)
- **`wrapLanguageModel` middleware was never built** (§16.3, §16.5 corrected): mask/audit/retry
  are caller-invoked shared helpers (`redact.ts`/`audit.ts`), not a model-wrapper middleware.
  Functionally compliant; the middleware is a viable future refactor.
- **"One uniform upload action" is partial:** `uploadDocumentAction` exists and is the primary
  path, but `uploadSlikAction` + `uploadSupportingDocAction` remain bespoke (and
  `uploadKtpAction`/`uploadRequiredDocAction` are thin wrappers). Not "no bespoke actions."
- **Stage-1 registry layers OVER the old parsers, not a rip-out:** `extraction-registry.ts`
  wraps `parseGateValueFromText`; `ownerDeskForDocType` is a derived function (the flat
  `ApplicationDocument.required: boolean` is unchanged). Behavior matches design; the "replaces
  the switch / instead of flat boolean" wording overstated it.
- **`rn_*` token prefix never shipped** — RSK narrative tokens are `<aspect>_finding`/
  `<aspect>_mitigation`, no prefix.
- **Eval is a step in the `verify` CI job, not a standalone `eval` job** — guardrail suite still
  gates every PR, so the gate exists.

### Accepted deviations (functional; not changing)
- **`KomiteMeeting.chairUserId` left non-nullable** (§15.5 wanted nullable for `proposed`). The
  P1 materializer fills the chair from the template default, so proposed meetings always have a
  chair; the schema comment already notes the deviation. Revisit only if a no-chair proposed
  state becomes required.
- **`DocProvenanceBand` shows "Disusun AI · {role} {date}", not the verifier's name** (§15.4
  wanted "diverifikasi [nama]"). Acceptable; tracking who-verified is a future enhancement.

### Deferred / resolved follow-ups
- **Resolved 2026.05.28:** `ExploredSource[]` is now frozen into `DecisionCheckpoint` by
  `freezeDecisionDocs`; the freeze captures the exact application citations available at decision
  time and never recomputes research.
- **Hover-to-ground citation excerpt + "tanpa sumber" ungrounded flag** (§15.4) — the
  `ungrounded` provenance state exists in `lib/provenance.ts` but nothing renders it, and MUAP
  shows a static `ExploredSource` list, not a per-claim grounding hover. A future feature, not
  a regression.

## 18. Follow-up decisions from code audit (2026.05.28)

These are the agreed next implementation decisions after checking the actual code against this
plan. Build status is noted inline.

### 18.1 Build-now corrections — built 2026.05.28
- **Stage 2 explicit dual handoff:** LG and RT each have their own explicit "Kirim ke Feasibility"
  action; data entry (legal doc verification / SLIK upload / Kol input) is prerequisite work, not
  handoff. The second handoff advances.
- **Legal fail reason:** LG must enter a reason when marking a document `fail`; `pass` clears the
  reason. The reason is stored on the document, shown read-only under failed docs, and included in
  audit history.
- **Data-nav badge:** the badge now counts OCR suggestions plus conservative required-but-empty
  data for the relevant desk/stage. Optional blanks remain ignored.

### 18.2 Upload-path cleanup decision — built 2026.05.28
- Do **not** force every upload into one public server action. `uploadDocumentAction` remains the
  canonical path for existing checklist documents, but SLIK and supporting docs legitimately have
  different creation semantics.
- Refactored toward **uniform internals**: checklist, SLIK, and supporting uploads share the
  post-upload OCR/extraction spine. SLIK replacement also resets RT handoff and requires Kol to be
  re-entered.

### 18.3 Decision checkpoint freeze — built 2026.05.28
- `DecisionCheckpoint.exploredSources` captures the application's current cited sources inside
  `freezeDecisionDocs`. It freezes the exact sources the committee had available and does not
  recompute research at freeze time.

### 18.4 Stage 5 scope boundary
- **P2 proposed agenda auto-assign — built 2026.05.28:** materialized proposed meetings now select
  eligible Stage-5 apps not yet on proposed/upcoming agendas, match active template `routingFilter`,
  respect capacity, record a routing reason per agenda item, and require CM confirm/cancel before
  voting.
- **P3 chair/attendee rotation** remains deferred until P2 has real usage. It is policy-sensitive
  (fairness, absence handling, seniority, quorum, conflict of interest) and should not be guessed.

### 18.5 Ops/legal/live gates
- Ops/legal/live items are tracked in `docs/guides/launch-gates.md`, not as normal app-code
  completion: pg-boss/worker sidecar, materializer cron, live template seeding, live
  Gemini/web-research smoke, OJK offshore permit, DPIA, DPS opinion, vendor DPAs/G5,
  web-research approval, and final inference provider decision.
- Keep external-egress features behind safe defaults/feature gates until those owners complete their
  sign-offs. Code can be build-complete while production enablement remains blocked by this list.
