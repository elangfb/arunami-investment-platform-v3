<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

# Roles, Desks, RBAC & Access Control — consolidated knowledge

## Role Enum Evolution

### Early Brainstorm (May 14–16)
Original four distinct roles from session `fa02e261`: AO (Account Officer), LA (Loan Analyst), RT (Risk Team), CM (Komite). Rule stated verbatim: "AO ≠ Analis ≠ Risk ≠ Komite — four distinct roles, no overlap." LG (Legal Officer) added in CC session `361648e4` (May 16), making the first code enum `'AO' | 'LA' | 'LG' | 'RT' | 'CM' | 'MG'`.

### Brainstorm Discovery (May–June 2026)
Session `260dea48` (June 1, brainstorm): user direct observation — RM = AO = Analis in Hijra; one person handles Stages 1+2+3. Code constant `S1-AO` preserved, display labels renamed to RM. LA persona dissolved. Marked 📝 pending formal Bank confirmation.

Session `e387ebe7` (June 2, brainstorm): Hijra Bank SOP slides confirmed 🏦. Lane: **Marketing (= RM) · Legal&Appraisal · Analyst (= Risk Review) · Komite · Operasional**. "Analyst" in Bank SOP = Risk lane, NOT feasibility analyst. LA definitively dissolved. New actors from SOP: Finance (special rate), Compliance (Sharia review), CS (AML — DTTOT/PEP). New approval-chain roles from MUAP/RSK signatures: TL/SPV, BM/KU, RiskOfficer, CRO.

### CC Phase 3 Fold (batch-04, May 23)
First formal 3-layer model: users → roles (editable bundles of desks) → desks (fixed, code-defined). 8 desks in old naming: `S1-AO`, `S2-LG`, `S2-RT-SLIK`, `S3-LA`, `S4-RT-RSK`, `S5-CM`, `S6-AO`, `MG`. 6 default roles seeded preserving that access.

### CC Phase 3 Intent-Action Rewrite (batch-05, May 23)
`isRole(...)` → `hasDesk(actor, …)` everywhere in client code. `effectiveRole(actor, app) ?? 'MG'` fallback: MG falls through to read-only observer. `ActorInput` client-passed seam deleted; identity comes exclusively from verified Firebase session cookie via `requireActor()`.

### OMP Role Fold (session-S2, June 4 — FINAL)
Full role fold executed. `Role` enum: **`RM | LG | RA | CM | MG`**.
- AO + LA → **RM** (RelationshipManager)
- RT → **RA** (RiskAnalyst)
- LG, CM, MG unchanged

Desk codes renamed to functional readable:
`intake` · `legal` · `appraisal` · `slik` · `muap-author` · `muap-tl` · `muap-bm` · `rsk-author` · `rsk-ro` · `rsk-cro` · `rsk-dps` · `dps-review` · `komite` · `pencairan` · `MG` · `ADMIN-USERS` · `ADMIN-MASTER` · `ADMIN-POLICY`

Seed uses per-user `roleKey` (decoupled from `DEFAULT_ROLES` grant lookup). `ownersForStage` made desk-based (role too coarse after fold).

### Role Key Consolidation (session-S6, June 8 — FINAL)
**Root-cause bug**: `account-officer` (Siti Rahma) had desks `intake, slik, pencairan`; `muap-author` was stranded on `loan-analyst` (Budi). `MUAPTab canView` requires `muap-author` → Siti denied "Dokumen MUAP tidak tersedia untuk peran Anda."

Decision A1+B1: rename key `account-officer` → `relationship-manager`; in-place migration. `loan-analyst` entry deleted. **Final single role**: `relationship-manager` = `['intake', 'slik', 'muap-author', 'pencairan']`. Both Siti (u-001) and Budi (u-002) → `relationship-manager`.

---

## Two-Layer Desk/Role Model

First explicitly codified in batch-20 / ADR-0003 (June 3):
- **Desk** = granular atomic permission; code-defined, stable, never user-created.
- **Role** = composition of desks; user-editable bundles.
- Design principle: prefer many granular desks, aggregate via roles. Moving work = re-compose role, not change workflow.
- Gate logic never sees roles — `verifySession()` flattens roles + direct grants into `Actor.desks: Desk[]`.

---

## Desk Catalog (Final / Current)

| Desk | Stage | Owner Role | Notes |
|------|-------|------------|-------|
| `intake` | 1 | RM | Document submission, create application |
| `slik` | 2 | RM | SLIK/Pefindo bureau pull; early-work opens at Stage 1 (`canWorkStage(appStage, 2)` = `appStage ≤ 2`) |
| `legal` | 2 | LG | Analisa Yuridis; workable through Stage 3 (ADR-0007) |
| `appraisal` | 2 | LG | Penilaian Agunan; tracked-not-gating for 2→3; IS prerequisite for MUAP→Risk |
| `muap-author` | 3 | RM | MUAP maker; required for MUAP tab access |
| `muap-tl` | 3 | TL/SPV | MUAP checker 1 |
| `muap-bm` | 3 | BM/KU | MUAP checker 2 (MUAP frozen at approval) |
| `rsk-author` | 4 | RA | RSK maker |
| `rsk-ro` | 4 | Risk Officer | RSK checker 1 |
| `rsk-cro` | 4 | CRO | RSK checker 2 |
| `rsk-dps` | 4 | DPS | RSK final signer (always, per-deal) |
| `dps-review` | 4/5 | DPS | Conditional gate when `rekomendasi_dps_or_tidak = yes` |
| `komite` | 5 | CM | Komite Pembiayaan members |
| `pencairan` | 6 | RM | Disbursement checklist |
| `MG` | — | Management | Read-only observer; never workflow participant |
| `ADMIN-USERS` | — | Superadmin only | Users, role↔desk grants |
| `ADMIN-MASTER` | — | Superadmin only | Products, rates, SLA, doc-checklist, branches |
| `ADMIN-POLICY` | — | Superadmin only | DSR/LTV/Kol gate thresholds (high blast-radius, segregated) |

`STAGE_OF_DESK[ADMIN-*] = null` — admin desk holders do NOT count as workflow participants. `canParticipate` = `isSuperadmin || desks.some(d => STAGE_OF_DESK[d] !== null)`.

---

## `ownersForStage`: Role-Based → Desk-Based Evolution

**Early (batch-01, May 18)**: `STAGE_OWNERS = { 1:[AO], 2:[LG,RT], 3:[LA], 4:[RT], 5:[CM] }`, `ownersForStage(stage)` helper in `lib/stage-owners.ts`. `assignment.status` was personal Kanban layer only — gates nothing.

**Batch-10 finding (May 25)**: Two source-of-truth lists for stage owners: `STAGE_OWNERS` in `stage-owners.ts` + `DESK_FOR_STAGE` in `desks.ts`. Any owner change must touch both or they drift — flagged as sharp edge.

**OMP session-S2 (June 4)**: `ownersForStage` made desk-based. Role too coarse after AO+LA→RM fold (all RM-role users would get all RM-stage assignments).

**ADR-0012 / session-S5 (June 6) — FINAL**: Grant-based auto-assignment replaces static seed-based `ownersForStage`. Pure `ownersFromUsers(users, stage)` helper using real effective desk grants, injected through `dispatch` → `applyDecision`. Seed fallback keeps all tests green. "Assign-to-all" strategy (all real desk-holders get the app assigned).

---

## Maker-Checker Ladders

### MUAP Ladder (RM → TL/SPV → BM/KU)

First designed batch-16 session `14e5fb60` (May 30). Built session-S2 (June 4).

- **RM (maker)**: submits MUAP draft (`chain='muap'`, `action='request'`).
- **TL/SPV (checker 1)**: approves (`role='muap-approve-tl'`, `action='approve'`).
- **BM/KU (checker 2)**: approves (`role='muap-approve-bm'`, `action='approve'`); MUAP frozen at this point.
- Each approval auto-fills signature token (`nama_tl_spv`+`tanggal_ttd_tl_spv`, etc.) via QR stamp.
- Reject at any checker → mandatory reason → back to RM; chain restarts.
- **MUAP edited after send-back (by RA `ReturnToRm`)** → all TTD void → ladder resets from RM (version+1, new QR).
- `transitionAction` refuses Stage-3→4 advance; only `approveStepAction` on `chainState === 'complete'` can advance.

### RSK Ladder (RA → Risk Officer → CRO → DPS)

Built session-S2 (June 4).

- **Risk Analyst / RA (maker)**: submits RSK draft (`chain='rsk'`, `action='request'`).
- **Risk Officer/Manager (checker 1)**: approves (`role='rsk-approve-officer'`).
- **CRO/Komite (checker 2)**: approves (`role='rsk-approve-cro'`).
- **DPS (final signer)**: signs (`role='rsk-sign-dps'`); RSK frozen. DPS always signs, every deal.
- Reject intra-chain (RO/CRO/DPS) → chain restart at RA; phase stays Risk.
- `transitionAction` refuses Stage-4→5 advance; only chain-complete triggers it.
- De-finalizing MUAP (by `ReviseProposal`) after RSK is frozen → RSK signatures void, new `DocumentVersion` with zero signatures, ladder restarts.

### CRO Conflict of Interest (SoD)
CRO who signed RSK then sits on Komite = **soft flag, not hard block** (conscious design, rationale recorded). `rskCroSignerUserId` stored on application. Flag shown in voting room. Rationale: "tidak selalu ada pilihan anggota lain" (BPRS scale). OJK explanation in audit trail.

### Distinct-Actor Enforcement
Server-side: RM ≠ TL ≠ BM; RA ≠ Officer ≠ CRO. `assertDistinctApprovers` in chain logic.

### Risk Veto over Komite
`riskRecommendation === 'reject'` → entire voting UI replaced by "Tidak Perlu Sidang Komite" card. Defense-in-depth: disabled buttons + `castVote()` guard. OJK rule. Risk-vetoed apps never enter Komite queue (terminal at Risk Review).

### RA Terminal vs Send-Back (Two Distinct Actions)
- `RejectRisk{reason}` → **terminal** `close(risk-reject)` + Notify(RM); RM informs Nasabah off-system.
- `ReturnToRm{reason}` → MUAP editable, MUAP ladder reset; NOT close.
These are NOT interchangeable. Chain approvers (Officer, CRO, DPS) reject only to RA (intra-chain); only RA bounces out to RM.

---

## `assertCanWorkDesk` / `canWorkStage` Gating

**Batch-05 (May 23)**: `assertCanWorkDesk` introduced as single server-side gating primitive. Pattern: `requireActor()` → `assertCanWorkDesk(actor, app, desk)` → field whitelist → audit string server-side. Client code: `hasDesk(actor, …)` replaces all `isRole(...)`.

**"Do it early" prep model (batch-05)**: Stages 1–4: later-stage owners can work prep surfaces early (`appStage ≤ ownerStage`). Stages 5–6 strictly at-stage. State machine and forward transitions always remain sequential.

**`canParticipate` bug fix (batch-07/08, May 24)**: was `desks.some(d => d !== 'MG')` → ADMIN-*-only holders wrongly counted as workflow participants. Fixed to `isSuperadmin || desks.some(d => STAGE_OF_DESK[d] !== null)`.

**ADR-0007 extension (session-S5, June 6)**: `canWorkStage` was gating legal/appraisal to `appStage ≤ 2`. Extended to Stage 3 (`canWorkStage(appStage, 2)` = `appStage ≤ 2` unchanged for slik, but legal/appraisal `canWorkStage` extended to Stage 3 for the lag window).

**Session-S6 (June 8)**: `canWorkStage(appStage, 2)` = `appStage <= 2` — SLIK/Pefindo/Kol desk operations allowed from Stage 1. `docBlockers` for 1→2 counts only `intake`-owned required docs; SLIK/Pefindo absence never blocks 1→2.

---

## Stage-2 RM-Coordination Model (ADR-0007)

**Prior model** (batch-01/02/10, up to June 5): `legalSlikComplete` = LG sign-off + RT SLIK = dual parallel sign-off gates 2→3. `maybeAutoAdvanceStage2` / `advanceOnDualSignOff`.

**ADR-0007 (session-S5, June 6) — FINAL**:
- Stage-2 is RM-coordinated, not gated by Legal sign-off.
- **Gate moved**: `legalAppraisalComplete` (both Analisa Yuridis + Penilaian done + docs) gates MUAP→Risk ladder submit (`actOnChain` MUAP-request), not 2→3.
- `stage2RmDataReady` = `slikUploaded && kolEntered` (no separate `verifiedByRT` — removed).
- Legal (Analisa Yuridis) and Penilaian Agunan = tracked deliverables, both workable through Stage 3.
- RA never a Stage-2 actor (confirmed from Hijra SOP).
- SLIK stays RM's own data work (slide 2 step 4 = RM's checklist).
- `DualSignOff` command and `completeSlikAction` removed; 2→3 advance routed through standard `transitionAction`.
- "Tolak SLIK & Kembalikan ke RM" action dropped (RM can't send back to itself).

Stepper bug fix (session-S6): `computeStepStatuses` `app.stage > step.stage` shortcut force-marked Stage-2 "Legal, Agunan & Biro" done once Stage-3 reached, even with Legal pending. Fix: `canLag: true` on the Stage-2 step; lag steps bypass both the `app.stage > step.stage` shortcut and the later-artifact clause.

---

## Superadmin: Read-Only via Impersonation (ADR-0010)

**Batch-05 (May 23)**: Superadmin impersonation via separate cookie. `SUPERADMIN_EMAILS` env var. Footer "Bertindak sebagai…". Audit entries attributed "X (a.n. Superadmin Y)". `submitDecisionAction` bypasses chair check for superadmin.

**Batch-06/07 (May 24)**: 3-way admin desk split: `ADMIN-USERS` (user/role management), `ADMIN-MASTER` (SLA/products/config), `ADMIN-POLICY` (risk thresholds). Escalation guardrail: only superadmin can grant ADMIN-* desks or include them in role bundles (prevents `ADMIN-USERS` holder from self-escalating via role bundles). `assertNoAdminDesksInBundle` + `assertNotAdminDeskEscalation`.

**ADR-0010 (session-S5, June 6) — FINAL**: Superadmin = **workflow-read-only**. Effective desks = `ADMIN_DESKS + MG` (console power + observer view, no pipeline desks). All `isSuperadmin` short-circuits removed from workflow predicates: `canActOnDesk`, `canParticipate`, `effectiveRole`, `actingRolesForStage`, `hasAnyDesk`. Acts on workflow only by impersonating a real role (audited). Komite chair-bypass removed (break-glass = impersonate actual chair user). End-impersonation button added to sidebar footer.

---

## Grant-Based Stage Auto-Assignment (ADR-0012)

**ADR-0012 (session-S5, June 6)**: Prior `ownersForStage` used static seed `USERS`, not actual desk grants — admin-granted users never got assigned. Fix: `ownersFromUsers(users, stage)` pure helper using real effective desk grants, injected through `dispatch → applyDecision`. Seed `ownersForStage` is fallback. "Assign-to-all" strategy.

---

## Doc-Access JIT Per-User Grants (ADR-0014)

From decision file `docs/decisions/0014-doc-access-jit-per-user-grants.md`:
- Access model: direct desk grants on users for exceptions (e.g. RT who also does SLIK but not RSK).
- `verifySession()` flattens roles + direct grants into `Actor.desks: Desk[]` at request time.
- Gates are checked at action time (JIT), not cached.
- Read (view) = open to all staff in V1 (audit-first, nothing hidden).
- Write/sign/decide = desk-scoped.

---

## Legal & Appraisal: 1 Role, 2 Desks

**OMP batch-20 (June 3)**: Explicitly confirmed from Hijra slide 3 (separate spokes in communication line) and slide 4 (separate SLAs). Slide 1 bundles them as one lane = display only.

**Session-S2 (June 4) / ADR-0007**: `legal` desk (Analisa Yuridis) + `appraisal` desk (Penilaian Agunan). Both under single "Legal & Appraisal" role. Legal & Appraisal = 2 desks, 1 role in code (`legal` role named "Legal & Appraisal"). `appraisal` desk: Stage-2, LG-owned, tracked-not-gating for 2→3; IS prerequisite for MUAP→Risk advance.

**Session-S6 (June 8)**: Confirmed: "Legal & Appraisal is one role" — already true; `legal` role holds both `legal` desk (Analisa Yuridis) and `appraisal` desk (Penilaian Agunan).

---

## SoD Overlap Policy

- **Risk veto over Komite** (hard gate): `riskRecommendation === 'reject'` → apps never enter Komite queue (terminal at Risk Review). OJK rule.
- **CRO COI** (soft flag): CRO who signed RSK may sit in Komite — flagged but not blocked. Must appear in audit trail for OJK explanation. Design rationale recorded explicitly.
- **Small-branch SoD** (open/W1): one person holding multiple roles. Policy TBD. Open per session-S2.
- **Distinct-actor enforcement** (hard): RM ≠ TL ≠ BM; RA ≠ Officer ≠ CRO. Server-enforced.
- **Komite min-attendees**: default 2 Komite Pembiayaan (blocking signers); added involved-team as attesting (non-blocking). W1 confirm with Hijra.

---

## Intent-Action Authz Rewrite (ADR-0001)

**Batch-05 (May 23) — foundational**.

Prior: generic `patchApplicationAction` (one endpoint collapses all detail-tab writes). Problem: cannot enforce S2-LG vs S2-RT-SLIK separation — both desks write the same `documents` field.

Decision: ~16 intent-specific desk-gated server actions. Three options evaluated; human chose split intent actions after seeing that field-map hybrids can't enforce desk separation.

**Pattern** (canonical, all server actions follow this):
1. `requireActor()` — identity from Firebase session cookie only; client cannot supply/spoof.
2. `assertCanWorkDesk(actor, app, desk)` — per-intent desk check.
3. Load app from DB.
4. Field whitelist — only fields relevant to this intent.
5. Compose audit string server-side (never trust client-authored audit strings).

**Phase 3 (batch-05, May 23)**: `dispatch()` command seam; `transitionAction` routes through it; authz + guards unified.

**Session-S5 (June 6) — complete**: `applyTransition` / `advanceOnDualSignOff` removed. All workflow mutation through `dispatch()` with `WorkflowCommand` union: `Transition` (user manual, authz-guarded) · `SystemTransition` (consequence of already-authorized action) · `DualSignOff` (Stage 2→3 once both LG+RT handoffs in). `decide()` pure reducer — pure, testable without DB. Engine invariants: one write seam; ledgers insert-only; distinct approvers; hard-gate blocks approval; commit-before-freeze; desk re-opens on input change.

ADR-0004 (command-sourced engine) + ADR-0001 (write-layer authz split) are the canonical references.

---

## DPS Desk Evolution

**Early (pre-June 3)**: DPS = conditional Stage-5 sign-off; only when Syariah concern flagged.

**Batch-12/13 (May 26)**: `S5-DPS-REVIEW` desk added as conditional gate when `rekomendasi_dps_or_tidak = yes`. Dual sign-off pattern (precedent: Stage 2 LG+RT).

**June 3 reversal (brainstorm 06-03 commits absorbed by session-S2)**: DPS = **always signs RSK** (per-deal, every deal). Final signer after CRO. Reject → Risk Analyst (chain restart). Applied to GLOSSARY, CURRENT-STATE, plan.

---

## Komite Voting Model Evolution

**Early (batch-01/02)**: Individual votes via `KomiteVote` table. `quorumFor(meeting)` = `ceil(2/3 × attendees.length)`. Ketua voting-order (Ketua unlocks when non-Ketua votes ≥ quorum-1). `komiteDecisionNote` mandatory for Conditional + Reject. Risk veto: `riskRecommendation === 'reject'` → entire KomiteVoting UI replaced.

**ADR-0005 (session-S2, June 4) — FINAL**: No in-app voting. Ketua records per-app outcome. Attending Komite members QR-sign the MoM (`chain='mom'` on `ApprovalStep`, unordered). Routing fires on all-Komite-signed. `komiteVotes` array removed from seed (stale per ADR-0005). Komite Pembiayaan (≥2) = blocking signers; involved-team = attesting (non-blocking). Min-attendees config default = 2.

---

# Roles, Desks, RBAC & Access Control — contradictions, reversals & evolution

## 1. "AO ≠ Analis — zero overlap" rule
- **EARLY** (fa02e261, brainstorm May 14): Stated as canon: "AO ≠ Analis ≠ Risk ≠ Komite — four distinct roles, no overlap." Written into PERSONAS.md as must-not-drift fact.
- **INTERMEDIATE** (260dea48, brainstorm June 1): User's direct Hijra observation: RM = AO = Analis (one person). Overturned; replaced with 📝 label pending formal Bank confirmation.
- **FINAL** (e387ebe7, brainstorm June 2 🏦): Bank SOP slides confirmed LA dissolved entirely. "Analyst" in Bank SOP = Risk lane, NOT 5C+1S analyst. PERSONAS.md must-not-drift rule definitively overturned.
- **STATUS**: RESOLVED. LA persona dissolved, RM absorbs all Stage 1-3 work.

## 2. Role enum / desk naming
- **EARLY** (361648e4, CC May 16): `Role = 'AO' | 'LA' | 'LG' | 'RT' | 'CM' | 'MG'`; desks inherited same shape.
- **MID** (batch-04, CC May 23): `S1-AO/S2-LG/S2-RT-SLIK/S3-LA/S4-RT-RSK/S5-CM/S6-AO/MG` desk codes, 6 roles.
- **FOLD** (session-S2, OMP June 4): `Role = 'RM' | 'LG' | 'RA' | 'CM' | 'MG'`; functional desk names.
- **FINAL** (session-S6, June 8): `account-officer` + `loan-analyst` legacy keys deleted; single `relationship-manager` = `['intake', 'slik', 'muap-author', 'pencairan']`.
- **STATUS**: RESOLVED.

## 3. SLIK/Pefindo ownership
- **EARLY** (batch-01/02, May 18): SLIK = RT-uploaded at Stage 2, `S2-RT-SLIK` desk. "Tolak SLIK & Kembalikan ke AO" secondary action existed.
- **MID** (batch-10, May 25): SLIK owned by `S2-RT-SLIK` but conceptually beginning to be questioned.
- **SESSION-S1 D1** (June 5): SLIK→RM sweep mapped; "Tolak SLIK & Kembalikan ke RM" return path becomes nonsensical (RM can't return to itself) → must drop.
- **ADR-0007 / session-S5** (June 6): `slik` desk = RM-owned (`role_of_desk['slik'] = 'RM'`). "Tolak SLIK & Kembalikan ke RM" action removed.
- **FINAL** (session-S6, June 8): `ownerDeskForDocType('slik') === 'slik'`; `ownerDeskForDocType('pefindo_report') === 'slik'`. RM owns both. Confirmed by SOP slide 2 step 4 = RM's checklist. Docs corrected: `required-docs-matrix.md:117`, `workflow.md:22/61` stale RA attribution fixed.
- **STATUS**: RESOLVED.

## 4. Stage-2 gate: dual sign-off → RM-coordinated
- **EARLY** (batch-01/10, May 18–25): `legalSlikComplete` = LG sign-off + RT SLIK = dual parallel sign-off gates 2→3. `maybeAutoAdvanceStage2` / `advanceOnDualSignOff`.
- **INTERMEDIATE** (batch-10, May 25): "Stage 2 had TWO separate source-of-truth lists for owners." Sharp edge flagged.
- **ADR-0007 (session-S5, June 6) — FINAL**: Gate moved. `stage2RmDataReady` = `slikUploaded && kolEntered` → drives 2→3. `legalAppraisalComplete` → gates MUAP→Risk ladder. `legalSlikComplete` predicate superseded.
- **STATUS**: RESOLVED.

## 5. `ownersForStage`: role-based → desk-based
- **EARLY** (batch-01/03, May 18): `STAGE_OWNERS = { 1:[AO], 2:[LG,RT], 3:[LA], 4:[RT], 5:[CM] }`, role-based.
- **BUG** (session-S2, June 4): After fold, role too coarse (all RM-role users would get all RM-stage assignments). Fixed to desk-based.
- **ADR-0012 (session-S5, June 6) — FINAL**: Grant-based `ownersFromUsers(users, stage)` using real effective desk grants.
- **STATUS**: RESOLVED.

## 6. Superadmin workflow access
- **EARLY** (batch-05, May 23): Superadmin could directly perform actions (chair-bypass in `submitDecisionAction`). `isSuperadmin` short-circuits present in workflow predicates.
- **ADR-0010 (session-S5, June 6) — FINAL**: All `isSuperadmin` short-circuits removed from `canActOnDesk`, `canParticipate`, `effectiveRole`, `actingRolesForStage`, `hasAnyDesk`. Superadmin = workflow read-only + impersonation.
- **STATUS**: RESOLVED.

## 7. DPS sign-off model
- **EARLY** (pre-June 3, e.g. batch-12 May 26): DPS = conditional Stage-5 sign-off; `S5-DPS-REVIEW` desk.
- **REVERSAL** (brainstorm 06-03 commits, absorbed session-S2 June 4): DPS = per-deal, always signs RSK. Final signer after CRO. Reject → RA chain restart.
- **STATUS**: RESOLVED.

## 8. Generic patchApplicationAction → intent-specific
- **EARLY** (pre-batch-05): Single `patchApplicationAction` endpoint handling all detail-tab writes. `ActorInput` client-passed seam.
- **ADR-0001 (batch-05, May 23)**: ~16 intent-specific desk-gated server actions. `ActorInput` deleted. `requireActor()` from Firebase session only.
- **FINAL (session-S5, June 6)**: `dispatch()` command seam; `applyTransition`/`advanceOnDualSignOff` removed; invariant #1 (one write seam) enforced.
- **STATUS**: RESOLVED.

## 9. Legal & Appraisal relationship
- **EARLY** (batch-02, May 21-22): Legal and SLIK modeled as separate Stage-2 actors (two parallel desks). Appraisal not explicitly modeled as a separate desk.
- **BATCH-19 (brainstorm, June 1)**: "Legal + SLIK = same person as RM in Hijra — Stage 2 dual-desk (LG + RT-SLIK as separate actors) likely doesn't exist."
- **OMP BATCH-20 (June 3)**: "Legal & Appraisal = 2 desks, 1 role" confirmed from Hijra slides. Slide 3 = separate spokes, slide 4 = separate SLAs.
- **ADR-0007 (session-S5, June 6) — FINAL**: Both desks tracked-not-gating for 2→3; `legalAppraisalComplete` gates MUAP→Risk submit.
- **STATUS**: RESOLVED.

## 10. Komite voting model
- **EARLY** (batch-01/02/03, May 18–22): Individual `KomiteVote` per member. Quorum = `ceil(2/3 × attendees)`. Ketua voting-order unlock.
- **ADR-0005 (session-S2, June 4) — FINAL**: No in-app voting. Chair records per-app outcome. All-Komite QR-sign MoM. `komiteVotes` removed from seed data.
- **STATUS**: RESOLVED.

## 11. `account-officer` + `loan-analyst` legacy split [VERIFY-DOC]
- **EARLY** (batch-04, May 23): `account-officer` role = `[S1-AO, S6-AO]`; `loan-analyst` role = `[S3-LA]`.
- **SESSION-S2 (June 4)**: Fold to RM but the legacy DB role keys were NOT renamed — they persisted in DB.
- **SESSION-S6 (June 8)**: Bug discovered: Siti (account-officer) lacked `muap-author` desk. Fixed by renaming + merging. `[VERIFY-DOC]`: Check `DEFAULT_ROLES` in `desks.ts` — only `relationship-manager` should exist; `account-officer` and `loan-analyst` keys should be deleted.
- **STATUS**: RESOLVED in code per session-S6 (DB migration applied).

## 12. `ADMIN-*` desks granted outside superadmin (privilege escalation)
- **BATCH-07 (May 24)**: `ADMIN-USERS` desk holder could create role containing `ADMIN-POLICY` and self-grant → privilege escalation. Guards added: `assertNoAdminDesksInBundle` + `assertNotAdminDeskEscalation`. Only superadmin can grant ADMIN-* desks.
- **STATUS**: RESOLVED with guards.

## 13. `canParticipate` ADMIN-* holders
- **BATCH-07 (May 24)**: Bug: `canParticipate` was `desks.some(d => d !== 'MG')` → ADMIN-*-only holders counted as workflow participants. Fixed to `isSuperadmin || desks.some(d => STAGE_OF_DESK[d] !== null)`.
- **STATUS**: RESOLVED.

## 14. DualSignOff / completeSlikAction removal
- **EARLY (batch-10, May 25)**: `advanceOnDualSignOff` = Stage 2→3 when both LG+RT handoffs in. Two-fork history log ambiguity ("normal vs auto-next").
- **SESSION-S5 (June 6)**: `DualSignOff` command retained but `completeSlikAction` removed. `stage2RmDataReady = slikUploaded && kolEntered` (no `verifiedByRT`).
- **SESSION-S6 (June 8)**: "Kirim SLIK ke Feasibility" moved to Tugas Anda primary. `SlikHandoffPanel` deleted from DataTab. `form: 'slik-handoff'` branch deleted from `ActionBand`.
- **STATUS**: RESOLVED.

## 15. Ops desk (SLIK/Pefindo step 5) [VERIFY-DOC]
- **EARLY (brainstorm/session-S2 early draft)**: Step 5 (SLIK/Pefindo) modeled as "Ops — tarik SLIK + Pefindo" (separate desk step). `workflow-target.md` initially listed Ops as desk role.
- **REVERSAL (session-S2, June 4)**: Ops = NOT a Mizan workflow participant. RM pulls SLIK/Pefindo. Ops = Pencairan execution + SLA of BI-Checking system. Step corrected. Any desk/assignment referencing Ops in Mizan workflow = stale.
- `[VERIFY-DOC]`: `hijra-bank-sop-digest.md` "SLA: BI-Checking/Pefindo ≤1 HK (Ops)" still lists Ops — this is the system SLA, not a workflow actor. Future reviewers should not confuse this.
- **STATUS**: RESOLVED.

## 16. CRO COI classification
- **EARLY (batch-19 brainstorm, June 1)**: CRO COI = soft flag, not block. Rationale recorded.
- **CURRENT**: Same. No OPEN item. `rskCroSignerUserId` stored; flag shown in voting room. Design rationale explicitly preserved.
- **STATUS**: RESOLVED/STABLE.

## 17. Small-branch SoD policy
- **SESSION-S2 (June 4)**: "SoD overlap at small branches: one person holding multiple roles — policy TBD." W1 item.
- **STATUS**: OPEN — pending W1 Hijra ratification.

## 18. `isRole` → `hasDesk` migration completeness [VERIFY-DOC]
- **BATCH-05 (May 23)**: `isRole(...)` → `hasDesk(actor, …)` everywhere. `currentUser` retained for display/identity only.
- **SESSION-S5 (June 6)**: `RoleContext.tsx` shim deleted; `useRole`/`currentUser`/`isRole` no longer exist. Use `useActor()` everywhere.
- `[VERIFY-DOC]`: Any remaining `isRole` / `useRole` reference in current code is a regression introduced after May 23.
- **STATUS**: RESOLVED per session-S5.

## 19. Two stage-owner source-of-truth lists
- **BATCH-10/11 (May 25)**: "Stage-2 has two separate source-of-truth lists for owners (`STAGE_OWNERS` in `stage-owners.ts` + `DESK_FOR_STAGE` in `desks.ts`). Any owner change must touch both or they drift." — flagged as sharp edge.
- **SESSION-S2 (June 4)**: `ownersForStage` made desk-based; `STAGE_OWNERS` constant superseded by desk-based resolver.
- **STATUS**: RESOLVED.
