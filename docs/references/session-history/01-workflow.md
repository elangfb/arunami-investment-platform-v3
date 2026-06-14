<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

# Workflow, Stages & Lifecycle — consolidated knowledge

---

## Stage model — current/final

### Canonical stage list (6 stages, engine integer 1–6)

| Stage | Code | Name | Primary Desk(s) |
|-------|------|------|-----------------|
| 1 | S1 | Pengajuan | RM (`intake`, `slik`) |
| 2 | S2 | Legal, Agunan & Biro | LG (`legal`, `appraisal`) + RM (`slik`) |
| 3 | S3 | Analisa Kelayakan / MUAP | RM (`muap-author`) |
| 4 | S4 | Kajian Risiko / RSK | RA (`rsk-author`) |
| 5 | S5 | Komite | CM (`komite`) |
| 6 | S6 | Pencairan | RM (`pencairan`) → Portofolio |

"5-stage" framing was wrong throughout the early era; Pencairan was always a distinct stage (it was just assumed unbuilt, then discovered built by May 21 session d6396b01).

### 4-phase derived view (presentation layer, engine NOT renumbered)

```
phaseOf(stage):  1,2,3 → Phase 1 "Originasi"
                 4     → Phase 2 "Analisis Risiko"
                 5     → Phase 3 "Komite"
                 6     → Phase 4 "Pencairan"
```

`Phase = 1|2|3|4`, `PHASE_NAMES`, `phaseLabel()` all exist in code. Engine 6→4 integer renumber is deferred (~158 `.stage===N` comparisons, high blast-radius on authz surface). Phase labels surface in the Pipeline board and the dossier stepper.

### `STAGE_NAMES` / display

A Jun-5 user decision called for **English** stage names (banking-term familiarity), Bahasa for UI chrome only. ⚠️ **Live `lib/types.ts` only partially reflects this (verified 2026.06.08):** `STAGE_NAMES` is **mixed** — `Risk Review` / `Committee Decision` are English, but `Pengajuan Dokumen` / `Legal, Agunan & Biro` / `Pencairan` are Indonesian (and `Feasibility / MUAP (5C+1S)` mixed). The user-facing display is increasingly the all-Indonesian **phase-label** layer (`PHASE_NAMES`/`phaseLabel`). No i18n framework exists (labels hardcoded); language direction unresolved.

---

## 16-step SOP flow (SOP-anchored, session-S2 / ADR-0003)

Steps are derived from event+document state, NOT stored as an integer. `snapshot.phase` encodes 8 named values.

**Phase A — Intake → MUAP final (Steps 1–6)**
1. Application created (RM fills intake fields)
2. Documents collected/uploaded; OCR auto-runs per doc
3. Legal review (Analisa Yuridis) + Penilaian Agunan ordered by RM (LG & Appraisal desk)
4. SLIK + Pefindo pulled by RM (bureau data; Ops is SLA-owner of BI-Checking system only, not a Mizan actor)
5. Bureau AI summary (advisory, never gating)
6. MUAP drafted + signed via ladder: RM → TL/SPV → BM/KU (all QR-signed; gate into Phase B)

**Phase B — RSK final (Steps 7–8)**
7. RSK created + signed via ladder: RA → RO → CRO → DPS (DPS always signs, every deal)
8a. Komite jadwal prepared (RM)
8b. Komite deck/konten prepared (RM)
8c. MoM drafted (RM; NOT AI-assisted)

**Phase C — Komite (Steps 9–10)**
9. Rapat Komite held (Mon/Wed/Fri cadence)
10. Chair records per-app outcome (approve/conditional/reject); attending Komite QR-sign MoM; routing fires on all-signed

**Phase D — SP3 → Akad → Cair (Steps 11–16)**
11. SP3 drafted (auto if approved; RM-invoked if conditional)
12. Legal review of SP3
13. SP3 final
14. Nasabah acceptance (informal — see Bersyarat section)
15. Akad signed
16. Pencairan checklist → mark Cair (RM); Ops execution is off-system

---

## Stage-transition gates (current / final state)

### Stage 1→2
- All intake-required docs uploaded (desk `intake`)
- OCR confirmed (NIK, etc.)
- AML attestation completed (server-enforced via `stage1To2Blockers`; resets on send-back)

### Stage 2→3 (RM-coordinated, ADR-0007 — current)
- `stage2RmDataReady = slikUploaded && kolEntered`
- NO LG sign-off required at 2→3 (old `legalSlikComplete` gate superseded by ADR-0007)
- LG Analisa Yuridis + Appraisal are tracked deliverables with work window extending into Stage 3

### MUAP→Risk submit gate (ADR-0007)
- `legalAppraisalComplete`: Legal Analisa Yuridis done + Penilaian Agunan done + docs
- Blocks `actOnChain(MUAP-request)` until this predicate passes

### Stage 3→4 (MUAP ladder complete)
- MUAP approval chain `chainState === 'complete'` (RM→TL/SPV→BM/KU all signed)
- `transitionAction` refuses Stage-3→4 manual advance; only `approveStepAction` on chain-complete can advance

### Stage 4→5 (RSK ladder complete)
- RSK approval chain `chainState === 'complete'` (RA→RO→CRO→DPS all signed)

### Stage 5→6
- `disbursementOpen(app)` = komiteDecision `'approve'` OR (`'conditional'` AND `conditionalResponse === 'accepted'`)
- No in-app voting (ADR-0005); decision recorded by chair; all Komite QR-sign MoM

### Stage 6→Cair
- All `disbursementConditions` done (server-enforced in `application-data.ts`)
- `disbursementStatus` sub-state: `Verifikasi Final → Proses Akad → Menunggu Dokumen → Siap Cair → Cair` (terminal → Portofolio)

---

## RM-led origination (ADR-0007)

Stage 2 is **RM-coordinated**. RM dispatches work to Legal & Appraisal (tracked deliverables); RM advances to Stage 3 (MUAP phase) when bureau data is ready (`stage2RmDataReady`). Legal/Appraisal are parallel, can lag into Stage 3.

Key invariants:
- RA never appears at Stage 2 (confirmed from Hijra SOP all 5 sheets)
- "Legal & Appraisal" = one role (`legal`) holding two desks: `legal` (Analisa Yuridis) + `appraisal` (Penilaian Agunan)
- SLIK + Pefindo are RM's own data work (`slik` desk = RM-owned: `['intake', 'slik', 'muap-author', 'pencairan']`)
- One role: `relationship-manager` = AO + LA folded (no separate `account-officer` or `loan-analyst` — legacy keys deleted)

Approval ladders (maker-checker — signatures auto-fill doc tokens):
- **MUAP**: RM (maker) → TL/SPV (checker 1) → BM/KU (checker 2; MUAP frozen)
- **RSK**: RA (maker) → Risk Officer/Manager (checker 1) → CRO (checker 2) → DPS (final signer; RSK frozen)
- Distinct-actor enforced: RM ≠ TL ≠ BM; RA ≠ Officer ≠ CRO

---

## Send-back / return-to-RM semantics

### Stage 2→1 (from LG)
- **SELECTIVE reset**: only doc with `legalVerification === 'fail'` → `status='missing'`, `legalVerification=null`; other docs keep verified state; LG sign-off invalidated; SLIK/kolEntered untouched; AML attestation cleared

### Stage 3→1 (from LA)
- **RESET ALL**: all legal verifications → null; both Stage-2 handoffs (`legalApproval`, `stage2SlikApproval`) cleared; SLIK/kolEntered untouched (customer is same); AML attestation cleared
- No selective targeting; LA names problem in reason text

### Stage 3→2: DOES NOT EXIST
- Withdrawn (brainstorm session d9ebd10f): Stage 2→3 gate guarantees Legal already done; "LA sends back to Legal" was misread — AO only. LA has one send-back target: Stage 1.

### Stage 4→ (from RA)
- Two distinct buttons with mandatory reason: "Kembalikan ke Analis" OR "Kembalikan ke AO"
- Both are valid non-terminal send-backs (see RejectRisk vs ReturnToRm for the terminal path)

### "Tolak SLIK & Kembalikan ke RM": REMOVED
- Was: Stage-2 RT-SLIK could reject SLIK → send back to AO
- Removed when SLIK ownership moved to RM (RM can't send back to itself; D1 batch-21/22)

---

## RejectRisk vs ReturnToRm

Two **distinct** RA actions — must never be conflated (session-S2, confirmed by user):

**`ReturnToRm{reason}`** — non-terminal send-back:
- Phase reverts to muap; MUAP editable; MUAP ladder reset (all TTD invalidated; re-ladder from RM)
- Application stays active; `closeReason` not set

**`RejectRisk{reason}`** — terminal close:
- `closeReason = 'risk-reject'`
- `applicationStatus = 'closed'`
- Notify(RM) with reason → RM informs Nasabah off-system
- Risk-rejected apps never enter Komite queue (structural invariant)

Early docs had one diagram arrow S7→S2 bundling both; corrected to explicit split (session-S2).

---

## Intra-chain reject restart

- **RSK chain intra-reject** (RO or CRO or DPS rejects): chain restarts at RA (Risk Analyst). Phase stays Risk. The `reset` action on `ApprovalStep` ledger handles this; `validateAction` does NOT guard `appendApprovalStep` at repo layer (audit ledger always appends).
- **MUAP chain intra-reject** (TL or BM rejects): chain restarts at RM. RSK chain is not affected (RSK is still draft if in Phase B).
- **RSK frozen + MUAP edited (pre-Komite)**: RSK signatures void; new `DocumentVersion` with zero signatures; full RA→RO→CRO→DPS ladder restarts. UI warns before voiding frozen RSK (no "minor edit" carve-out — audit-first stance).

---

## SP3 chain

From batch-19 (session e387ebe7, brainstorm SOP) + session-S2 (confirmed target):

Post-Komite artifact chain:
1. **SP3 creation**: auto if Komite `approve`; RM-invoked if `conditional`
2. **Legal review** of SP3 draft
3. **SP3 final** (formal binding terms)
4. **Nasabah acceptance** (see Bersyarat — informal, tracked only via `closeReason='nasabah-decline'` if declined)
5. **Akad** signed (formalization of financing contract)
6. Pencairan checklist → Cair

SP3 was entirely absent from early Mizan design and was imported from brainstorm 06-03 SOP slides. It carries the formal terms that may differ from Komite's conditional terms.

---

## Bersyarat (informal pre-SP3)

**Bersyarat-informal** = RM's informal notification to Nasabah after conditional Komite outcome — happens out of system, not tracked in Mizan. SP3 carries the formal binding terms.

Two distinct Bersyarat concepts to not conflate:
1. **Komite outcome `conditional`**: tracked in `komiteDecision`; requires `conditionalResponse` field (`'accepted'` → Pencairan; `'declined'` → `closeReason='nasabah-decline'`). `komiteDecision` stays `'conditional'` even after nasabah accepts — preserves audit trail.
2. **Informal pre-SP3 bersyarat**: RM informs nasabah of conditions off-system; Mizan records the eventual formal SP3 acceptance/rejection.

Early design (b2a03ad3, May 29) documented Stage-4 "Bersyarat stops here"; this was immediately superseded by session 8fc2db20 which made conditional at Stage 4 forward to Komite (Stage 5). Stage-5 conditional → nasabah branch was formalized in 8fc2db20.

---

## Pencairan / Cair & Ops out of scope

**Ops is NOT a Mizan workflow participant** (session-S2, confirmed explicitly):
- Ops owns the BI-Checking system SLA (1 HK per slide 4), but the mechanical SLIK/Pefindo pull is RM's business action (slides 1/2/3)
- Pencairan execution (fund transfer) = Ops off-system
- Step 16: Mizan = RM checklist → mark Cair; fund transfer is external

**Disbursement sub-state machine** (within Stage 6):
```
Verifikasi Final → Proses Akad → Menunggu Dokumen → Siap Cair → Cair (terminal)
```
Gate to Cair: all `disbursementConditions` done (server-enforced). After Cair: app moves to Portofolio.

**Conditional outcome**: `disbursementConditions` list tracks specific conditions. `disbursementOpen(app)` = approve OR accepted-conditional.

---

## CloseReason values

| Value | Trigger | Description |
|-------|---------|-------------|
| `committee-reject` | Stage 5, chair records reject | Komite rejects |
| `nasabah-decline` | Stage 5, conditional branch | Nasabah declines conditional offer |
| `risk-reject` | Stage 4, `RejectRisk` command | Risk Analyst terminal reject (pre-Komite) |
| `withdrawn` | Any active pre-disbursement, RM | RM withdraws application (`withdrawApplicationAction`) |

All closed apps: `applicationStatus = 'closed'`, `closedAt` set. Active pipeline board filters out closed apps. `slaUtils.disbursementOpen()` and SLA chip treats closed as terminal (no false overdue alerts, shows `'done'` / `'Selesai'`).

---

## SLA / Jakarta-clock / business-days

### Clock model (`lib/jakarta-clock.ts`)
- Business days: Mon–Fri, 08:00–17:00 WIB
- Jakarta = fixed UTC+7, **no DST**
- `isJakartaHoliday` = W1-stub (always `false`); public holiday calendar deferred
- Functions: `businessDaysElapsed`, `isBusinessDayJakarta`, `isWithinBusinessHoursJakarta`

### SLA storage (`SlaPolicyVersion` table)
- Versioned, append-only, effective-dated — admin-editable via `ADMIN-MASTER` desk
- Strategy: **recompute-live** (not snapshot-on-use). SLA is operational; admin change reflects dashboards immediately. Hard-gate risk policy uses freeze-at-decision instead.
- Fallback to constant `SLA_TARGETS_DAYS` if no DB row
- Per-desk SLA model: `deskSlaState` returns null if no per-desk target → falls back to per-stage

### Bank-actual per-desk SLAs (from SOP slides — not NoEffort defaults)
- Risk: 3 HK
- Legal: 2 HK/task
- Ops BI-Checking: 1 HK (system SLA, not Mizan actor)
- CS AML: 1 HK
- Pencairan: same-day up to 16:00 WIB

Early NoEffort SLA defaults (3/5/5/5/3 days per stage, from FOS mockup) are superseded by Bank-actual values; neither has been formally W1-ratified yet.

### SLA terminal guard
- `SLAStatus` extended with `'done'`; `SLAChip` accepts `app` prop
- Disbursed (`Cair`) and rejected/closed apps show `done`/`Selesai` — never count as "Terlambat"

---

## Meeting cadence (Rapat Komite)

- **Mon/Wed/Fri** cadence (confirmed from Bank SOP slides, session e387ebe7)
- **MoM deadline**: ≤ H+1 business day after meeting (`meetingMomSlaState`)
- `MeetingScheduleTemplateVersion` config: `dayOfWeek`, `time`, `room/url`, `attendees`, `chair`, `capacity`, `routing-filter by plafond/akad`

### Komite composition (ADR-0005)
- Komite Pembiayaan: ≥2 blocking signers (minimum config, W1 confirm)
- `involved-team` participants: attesting (non-blocking), derived from `ApprovalStep` ledger + `StageAssignment`
- Chair records per-app outcome — NO in-app voting
- CRO conflict of interest: soft flag (not block) if CRO signed RSK then sits in Komite; `rskCroSignerUserId` runtime-derived from `approvalSteps`

### MoM signing
- Chair records `komiteDecision` per app (approve/conditional/reject)
- All Komite members QR-sign the MoM (`chain='mom'` on `ApprovalStep`, unordered)
- Routing fires on all-Komite-signed
- `recordMeetingMinutesAction` is chair-only
- Risk-vetoed apps never enter Komite queue

---

## Command-sourced engine (ADR-0004)

### Architecture
- `WorkflowCommand` union: `Transition` (user, authz-gated) | `SystemTransition` (consequence of authorized action — ladder-complete, Komite decision, conditional accept, revise-regress) | `DualSignOff` (Stage 2→3)
- `decide(state, cmd, actor) → Decision | Rejection` — **pure, no DB**
- `dispatch()` = command seam; all workflow mutation routes through it
- Ledger tables: `ApprovalStep`, `HistoryEntry`, `DocumentVersion` — INSERT-only, never delete/update
- `WorkflowSnapshot` = authoritative cursor, mutable only through command seam

### Invariants
1. One write seam: all stage/phase changes through `dispatch()`
2. Distinct approvers: RM ≠ TL ≠ BM; RA ≠ Officer ≠ CRO (enforced server-side)
3. Hard-gate blocks approval-request (DSR/LTV/Kol); self-service override: RM writes reason, continues
4. Commit-before-freeze: ApprovalStep + DocumentVersion committed first, SeaweedFS freeze as post-commit idempotent retry
5. Desk re-opens on input change (e.g., Kol confirm resets SLIK handoff)
6. `decide` stays pure

### Key removals (batch-22)
- `applyTransition` removed
- `advanceOnDualSignOff` removed
- `completeSlikAction` removed (Jun 8, stage-2 standardization)
- `DualSignOff` command removed (Jun 8)
- `form`-directive ActionBand patterns removed

---

# Workflow — contradictions, reversals & evolution

## 1. Stage count: 5 → 6
- **BRAINSTORM era (May 14)**: 5-stage canonical from Manifesto slide 6; "5-stage" label locked as canonical
- **CC early (May 21, d6396b01)**: Stage 6 Pencairan discovered already built — had been assumed "not started" in all brainstorm docs. `Stage` widened to `1|2|3|4|5|6`.
- **FINAL (batch-10, May 25, session 52d36006)**: 6-stage confirmed, "5-stage framing was wrong"
- **RESOLVED** — 6 stages canonical

## 2. Stage model 6→4 restructure
- **BRAINSTORM (May 30, 14e5fb60)**: 6→4 proposed (S1+2+3=Origination/RM, S4=Risk, S5=Committee, S6=Disbursement). Status: **GATED** pending compliance sign-off
- **CC (Jun 1, 260dea48)**: Gate remains, 6→4 mapping confirmed as direction
- **OMP (Jun 3, 019e8ce1)**: User explicitly opened the gate: "buka gate" — 6→4 confirmed go-forward. Code build NOT started at that point.
- **OMP (Jun 4, session-S2)**: Role fold executed (AO+LA→RM, RT→RA). Engine integer 6→4 renumber DEFERRED (~158 `.stage===N` sites). Phase-view (`phaseOf`) ships as derived presentation.
- **FINAL**: Engine stays 1–6 integers; 4-phase derived view via `phaseOf()`
- **RESOLVED** — 6-stage engine + 4-phase presentation

## 3. Stage 2 gating model: dual-sign-off → RM-coordinated
- **BRAINSTORM (May 16, d9ebd10f)**: Stage 2 = LG + RT-SLIK parallel; `advanceOnDualSignOff` when second finishes
- **CC early (May 18, 17b336e4)**: Stage 2→3 composite gate: `kolEntered` + `verifiedByLG` + all docs + OCR
- **CC (batch-10, May 25)**: `LegalSlikTab` deleted; dual sign-off confirmed; `advanceOnDualSignOff`
- **OMP (Jun 5, batch-22, ADR-0007)**: Stage-2 redesigned as **RM-coordinated**. Gate moved: `legalSlikComplete`-gates-2→3 → `legalAppraisalComplete`-gates-MUAP→Risk-submit. RM advances 2→3 on `stage2RmDataReady`. `advanceOnDualSignOff` removed.
- **OMP (Jun 8, batch-23)**: `completeSlikAction`, `DualSignOff` removed; `stage2RmDataReady = slikUploaded && kolEntered` (dropped `verifiedByRT`)
- **FINAL**: RM-coordinated 2→3 advance (ADR-0007). "Tolak SLIK & Kembalikan ke RM" removed (SLIK is RM's own work).
- **RESOLVED**

## 4. Stage 3→2 send-back proposed and withdrawn
- **BRAINSTORM (May 18)**: Stage 3→2 send-back listed as GAP 2 (HIGH)
- **WITHDRAWN (same session, d9ebd10f/17b336e4)**: After user escalation, Stage 2→3 gate guarantees Legal already done; LA can only send to AO (Stage 1). "LA sends back to Legal" was a misread.
- **FINAL**: Stage 3 LA has exactly ONE send-back target: Stage 1 (AO/RM)
- **RESOLVED**

## 5. Stage-4 "Bersyarat" routing
- **CC (May 21, 96b5d932)**: Stage 5 committee conditional/reject both route to AO. Stage 4 Bersyarat = send-back with destination switch (Analis/AO).
- **CC (May 29, b2a03ad3)**: Documented "Conditional outcome only at Stage 4 (RSK) — committee never receives Conditional as inbound state"
- **CC (May 29, 8fc2db20, Batch A)**: **REVERSED** — RSK `conditional` now FORWARDS to Komite (Stage 5). Rationale: committee should see conditional recommendations; rework uses send-back button instead.
- **FINAL**: RA `conditional` → forward to Stage 5 Komite
- **RESOLVED**

## 6. SLIK ownership: RT-SLIK → RM
- **BRAINSTORM era**: SLIK owned by RT-SLIK desk; Stage 2 dual-desk (LG + RT-SLIK as separate actors)
- **CC (batch-10, May 25)**: `confirmSlikAction` removed as redundant; desk model kept RT-SLIK
- **OMP (Jun 3, 019e8ce1)**: Role fold; RM=AO=Analis confirmed
- **OMP (Jun 5, batch-21, session 019e977c)**: SLIK→RM sweep identified as D1 fix (~28 sites)
- **OMP (Jun 5, batch-22)**: SLIK→RM executed; `role_of_desk['slik'] = 'RM'`; "Tolak SLIK & Kembalikan ke RM" removed
- **FINAL**: `slik` desk = RM-owned
- **RESOLVED**

## 7. AO/LA/RT → RM/RA role fold
- **BRAINSTORM (May 14)**: "AO ≠ Analis ≠ Risk ≠ Komite — four distinct roles, no overlap" (from Manifesto, labeled canonical)
- **CC (Jun 1, session 260dea48)**: "RM = AO = Analis in Hijra" — confirmed from user's direct Hijra observation (📝 pending formal Bank confirmation). "AO ≠ Analis" overturned.
- **BRAINSTORM (Jun 2, session e387ebe7)**: Bank SOP slides confirmed: "Analyst" lane = Risk Review, NOT 5C+1S analyst. LA persona **dissolved** — merged into RM.
- **OMP (Jun 4, session-S2)**: Role fold executed: `AO+LA→RM`, `RT→RA`. `Role` enum: `RM|LG|RA|CM|MG`
- **OMP (Jun 8, batch-23)**: `account-officer`+`loan-analyst` legacy role keys deleted; single `relationship-manager` role
- **FINAL**: `relationship-manager = ['intake', 'slik', 'muap-author', 'pencairan']`
- **RESOLVED**

## 8. Komite: in-app voting → signed-MoM-as-decision (ADR-0005)
- **BRAINSTORM (May 16-18)**: Full in-app voting with quorum, Ketua-last unlock, per-member `castVote()`, `KomiteVote` records
- **CC (May 22, 96c42472)**: Per-meeting composition; dynamic chair; `komite` hub `/komite`
- **CC (May 24, b0297d25)**: Chair-only committee decision enforced server-side
- **OMP (Jun 4, session-S2, ADR-0005)**: **Complete redesign** — no in-app voting. Chair records per-app outcome. All attending Komite QR-sign MoM (`chain='mom'`). Routing fires on all-Komite-signed. `komiteVotes` field emptied/removed from seed.
- **OMP (Jun 8, session-S4)**: `komiteVotes` stale per ADR-0005; `vote009` fixture removed
- **FINAL**: No in-app voting; signed-MoM model
- **RESOLVED**

## 9. akad mutability: immutable at intake → mutable pre-Komite
- **BRAINSTORM (May 16-18)**: "akad set at intake, immutable end-to-end." `approvedAkadType` absent — different akad = reject + new app
- **BRAINSTORM (May 18)**: `akadType` stays immutable end-to-end confirmed
- **OMP (Jun 3, 019e8ce1)**: User raised bank counter-offer scenario ("Bank maunya akadnya B") → **REVERSED**
- **FINAL**: akad = mutable proposal parameter pre-Komite; frozen at Komite decision; formalized at SP3. Edit after MUAP signed → MUAP re-author + ladder reset.
- **RESOLVED**

## 10. RejectRisk: one action → two distinct actions
- **OMP (Jun 3, 019e8ce1) initial framing**: Diagram showed S7→S2 as one arrow; risk rejection described as send-back
- **Session-S2 correction**: User challenged: "Slide Hijra yang mana yang bilang Risk engga boleh nutup deal?" Agent admitted claim was circular (own diagram). User confirmed: RA has TWO separate actions — (a) terminal reject (`RejectRisk`, close) AND (b) send-back for MUAP rework (`ReturnToRm`).
- **FINAL**: `RejectRisk` = terminal `closeReason='risk-reject'`; `ReturnToRm` = non-terminal send-back, MUAP ladder reset
- **RESOLVED**

## 11. DPS model: conditional Stage-5 sign-off → always signs RSK (per-deal)
- **Early OMP docs (≈May 30, GLOSSARY/plan 06-01)**: DPS = conditional Stage-5 sign-off
- **BRAINSTORM (Jun 3, 06-03 commits)**: Revised — DPS always signs RSK, every deal (final signer after CRO)
- **OMP (Jun 4, session-S2)**: Applied to GLOSSARY + CURRENT-STATE + plan
- **FINAL**: DPS always signs RSK as final signer; RSK frozen after DPS signs. DPS reject → chain restart at RA.
- **RESOLVED**

## 12. SP3 chain: absent → confirmed target
- **All pre-Jun-2 sessions**: SP3 entirely absent from MIZAN design
- **BRAINSTORM (Jun 2, session e387ebe7)**: SP3 identified from Bank SOP slides as distinct artifact
- **BRAINSTORM (Jun 3)**: SP3 chain + Bersyarat-informal-before-SP3 designed
- **OMP (Jun 4, session-S2)**: SP3 chain imported; confirmed target
- **FINAL**: SP3 chain is phase D of the 16-step SOP
- **RESOLVED**

## 13. Ops desk: in Mizan → explicitly out of scope
- **Early sessions**: Step 5 (SLIK/Pefindo) modeled as Ops; "Ops — tarik SLIK + Pefindo"
- **OMP (Jun 3, 019e8ce1)**: Re-reading all 4 slides — Ops = Pencairan execution + BI-Checking SLA owner only. RM pulls SLIK/Pefindo. Ops not a Mizan workflow actor.
- **FINAL**: Ops out of Mizan scope. SLIK/Pefindo = RM's work.
- **RESOLVED**

## 14. MUAP ladder / maker-checker: "theater" → real (ADR confirmed)
- **Pre-ADR**: MUAP signatures (T87: RM/TL/BM) and RSK signatures (§IX: RA/Officer/CRO) = dumb name+date fields, zero workflow backing
- **OMP (Jun 3-4)**: Maker-checker chains designed as real workflow primitive; approval auto-fills doc signature tokens. Note: MUAP ladder (RM→TL→BM) is Mizan's own maker-checker addition — **not in Hijra slide 1** (slide 1 shows MUAP → directly to Risk).
- **FINAL**: `ApprovalStep` ledger (INSERT-only), per-chain QR-signed gates
- **RESOLVED**

## 15. Command-sourced engine: in-memory → Prisma → command-sourced
- **Early era (May 16-22)**: In-memory `APPLICATIONS[]` array; no DB; `applyTransition` hardcoded
- **May 23**: Postgres + Prisma; `saveApplication` had `deleteMany`+recreate for historyEntry (not actually append-only)
- **Jun 3 (ADR-0004)**: Command-sourced design selected over full event-sourcing (oracle challenged: split-truth trap with partial ES)
- **Jun 5 (batch-22)**: Full engine rebuild — `dispatch()`/`decide()`, `applyTransition` removed, `advanceOnDualSignOff` removed
- **FINAL**: Command-sourced + ledger-backed + snapshot-authoritative
- **RESOLVED**

## 16. `CloseReason` evolution
- **Early (May 21, 96b5d932)**: `closeReason: 'nasabah-decline' | 'committee-reject'`
- **May 29 (8fc2db20)**: `closeReason` formalized with `applicationStatus: 'active' | 'closed'`; `closedAt` field
- **Jun 3 (019e8ce1)**: `risk-reject` confirmed as terminal close
- **Jun 5 (batch-22)**: `withdrawn` added (`withdrawApplicationAction`)
- **FINAL**: `committee-reject | nasabah-decline | risk-reject | withdrawn`
- **RESOLVED**

## 17. SLA numbers: NoEffort defaults → Bank-actual (still W1-pending ratification)
- **BRAINSTORM (May 14)**: 3/5/5/5/3 days per stage (from FOS mockup, NoEffort)
- **BRAINSTORM (Jun 2, SOP slides)**: Replaced with Bank-actual per-desk SLAs (Risk 3 HK, Legal 2 HK, etc.)
- **OMP (Jun 3, session-S1)**: `SlaPolicyVersion` built with per-desk model; `isJakartaHoliday` = W1-stub
- **FINAL**: Bank-actual SLAs from SOP slides loaded as defaults, but W1 formal ratification still pending. `[VERIFY-DOC]` in `docs/references/config-ratification-w1.md`.
- **OPEN** — numbers are Bank-sourced from SOP slides but not formally W1-ratified

## 18. Stage-2 label evolution
- **Early**: "Legal & SLIK"
- **batch-10 (May 25)**: `LegalSlikTab` deleted
- **Jun 5 (batch-21)**: Stage-2 renamed to **"Legal, Agunan & Biro"** (Legal · Penilaian/Appraisal · Biro/SLIK-Pefindo)
- **FINAL**: "Legal, Agunan & Biro"
- **RESOLVED**

## 19. `[VERIFY-DOC]` flags
- W1 config values (DSR/LTV/Kol thresholds, BWMP tiers, Komite quorum/composition, akad parameters, DPS review scope, SLA targets, clock-start definition) — all flagged in `docs/references/config-ratification-w1.md` as W1-pending. Engine does NOT block on these; defaults preserve current behavior.
- Komite support desk (8a/8b/8c) owner = RM (interim assignment; flagged W1 confirm per slide 2)
- SLIK/Pefindo puller = RM vs Ops: current model = RM; slide 4 SLA assigns BI-Checking to Ops (system SLA, not workflow actor). Model confirmed as RM; W1 to formally ratify.
