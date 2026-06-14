# ADR 0002 — Phase 3 solo decisions log (desk authorization)

- **Status:** Accepted · **Reconciled:** behavioral digest sent to brainstorm 2026.06.01.
- **Date:** 2026.05.24
- **Relates to:** [ADR 0001](./0001-write-layer-server-authoritative.md) (the headline
  write-layer decision). This file logs the smaller calls made while implementing it.

Each entry: the decision, the options weighed, and why.

> Note: the action catalogue below is historical to the 2026.05.24 Phase-3 build.
> Current Stage-2 handoff is the dual explicit model in `docs/guides/workflow.md`
> (`completeLegalAction` + `completeSlikAction`), not the old `confirmSlikAction`
> auto-advance path.

---

## 1. The intent-action → desk catalogue (the heart of Phase 3)

The action that owns each operation, and the desk it asserts. (Superadmin holds all
desks, so it passes every gate.) Pipeline role per desk drives the unchanged
`stageActions` matrix.

| Action | Desk gate | Notes |
|---|---|---|
| `createApplicationAction` | `S1-AO` | Intake. |
| `confirmNikAction` | `S1-AO` | NIK confirm/correct (OCR). |
| `uploadKtpAction` | `S1-AO` | KTP upload → OCR-suggests NIK. |
| `uploadRequiredDocAction` | `S1-AO` | Required (non-KTP/SLIK) doc upload. |
| `uploadSupportingDocAction` | `assertCanActOnStage` | Supporting doc: whoever owns the current stage. |
| `uploadSlikAction` | `S2-RT-SLIK` | SLIK report upload. |
| `confirmKolAction` | `S2-RT-SLIK` | Kolektibilitas 1–5; violations recomputed server-side. |
| `verifyDocumentAction` | `S2-LG` | Legal pass/fail on a document. |
| `completeLegalAction` / `saveLegalApprovalAction` | `S2-LG` | Legal review done. |
| `confirmSlikAction` | `S2-RT-SLIK` | SLIK done (auto-advance stage 2). |
| `saveFinancialsAction` | `S3-LA` | DSR/LTV/violations computed server-side. |
| `confirmFinancialOcrAction` | `S3-LA` | Confirm income/collateral OCR figure. |
| `saveAnalysisAction` | `S3-LA` | 5C+1S prose; scores recomputed deterministically. |
| `recordAnalysisGapCheckAction` | `S3-LA` | Audit-only gap-check run. |
| `markMuapSyncedAction` | `S3-LA` | MUAP "done" milestone. |
| `saveRiskRecommendationAction` | `S4-RT-RSK` | Risk verdict (approve/conditional/reject). |
| `markRskSyncedAction` | `S4-RT-RSK` | RSK doc synced. |
| `castVoteAction` / `submitDecisionAction` / `scheduleMeetingAction` | `S5-CM` | Committee. |
| `advanceDisbursementAction` | `S6-AO` | Step order + "all conditions before Cair" server-enforced. |
| `toggleDisbursementConditionAction` | `S1-AO ∪ S6-AO` | See decision #4. |
| `transitionAction` | `assertCanActOnStage` | Generic transition; domain fn validates the move. |
| `appendDiscussionAction` | `assertCanParticipate` | Any non-observer; see decision #5. |

## 2. DSR/LTV computed server-side (not trusted from the client)

- **Decision:** extract the DSR/LTV/installment formula from `DataTab` into a pure
  `lib/financials.ts` and have `saveFinancialsAction` compute the hard-gate numbers
  **server-side** from the submitted inputs. The client imports the same fn for live
  preview.
- **Options:** (a) keep trusting client-sent `hardGates` — rejected: DSR>40 / LTV>70 are
  OJK hard-gate *failures*, the regulator-critical numbers must not be client-trusted.
  (b) recompute server-side ✅.
- **Why:** integrity of the gate that can fail an application. Same reasoning applies to
  `hardGateViolations` (recomputed via `computeViolations`) and Kol.

## 3. Disbursement gating moved server-side

- **Decision:** extract step order + release conditions to `lib/disbursement.ts`;
  `advanceDisbursementAction` enforces one-step-at-a-time + "all conditions before Cair"
  + "only `komiteDecision === 'approve'` may disburse" **server-side**.
- **Why:** the previous gating lived only in `PencairanTab` (client) and was bypassable
  via a direct POST.

## 4. Disbursement-condition toggle gated to BOTH AO desks (`S1-AO ∪ S6-AO`)

- **Context:** the condition checklist is reused in two places — the **approved** path
  (app at stage 6 → `S6-AO`) and the **conditional** follow-up (app routed back to stage
  1 → `S1-AO`). Both are the "AO" job (the seeded `account-officer` role holds both desks).
- **Decision:** `toggleDisbursementConditionAction` asserts `S1-AO` **or** `S6-AO`;
  `advanceDisbursementAction` (approved path only) asserts `S6-AO`.
- **Behaviour change (flagged):** the prototype let `['AO','RT','LA']` toggle the
  approved-path conditions. Tightened to AO only, matching the UI's own copy ("pencairan
  diproses oleh AO"). Net compliance-positive; documented here in case it surprises.
- **Update (2026.05.29):** the conditional follow-up now also records the nasabah's
  response — `recordConditionalResponseAction` (accept → advance to Stage 6 with the
  decision preserved as `conditional`; decline → close) and `closeRejectedApplicationAction`
  (reject notified → close) — both gated `S1-AO ∪ S6-AO`, same as the toggle. The new
  terminal `applicationStatus='closed'` ends the application without disbursement.
  `advanceDisbursementAction` now gates on the shared `disbursementOpen(app)` predicate
  (approve OR accepted-conditional), not `komiteDecision==='approve'` alone. See
  `docs/guides/workflow.md`.

## 5. Discussion thread = any participant; observers (MG) are read-only

- **Decision:** `appendDiscussionAction` uses `assertCanParticipate` (superadmin or any
  non-`MG` desk holder). AI-chat capability stays LA/RT (`AIChatTab` is mock-only and
  does **not** call a server action — compliance debt to wire real AI remains, see
  Phase 8).
- **Why:** mirrors the prototype (`isRole('MG')` disabled the composer) without hardcoding
  a role; MG is the read-only observer desk.

## 6. Document uploads + doc-sync milestones are now audited

- **Decision:** the new upload/sync actions append concise server-composed audit entries
  (KTP/required/supporting/SLIK uploads; MUAP/RSK sync; disbursement condition toggles).
  The prototype's generic patch did **not** audit these.
- **Why:** chain-of-custody for documents and milestone completion is OJK-relevant; the
  server now owns the audit string so adding them is free and correct.

## 7. Analysis scores recomputed server-side; AI never sets levels

- **Decision:** `saveAnalysisAction` accepts the 5C+1S **prose** from the client but, when
  `analysis.generated`, recomputes `analysis.scores` via `generateAspectScores` rather
  than trusting client-sent scores.
- **Why:** the standing compliance line — AI/clients never write gating levels or the
  recommendation. Prose is analyst/AI-authored (allowed); scores stay deterministic.

## 8. Committee chair identity — stricter check IMPLEMENTED (2026.05.24)

- **Decision:** `castVoteAction` gates at `S5-CM`. `submitDecisionAction` now ALSO
  asserts the actor is the chair: it resolves the meeting carrying the app (preferring the
  in-session `upcoming` one) and throws `AuthzError` unless
  `actor.userId === meeting.chairUserId` — superadmin bypasses (Phase 5 impersonation acts
  AS the chair). The human requested this; the former `TODO(chair)` is closed.
- **Approved-terms bounds** (was ADR 0001's open question) are likewise RESOLVED — the
  human ruled to enforce them; see `lib/komite-terms.ts` + ADR 0001.

## 9. Verification approach for Phase 3 (and the login blocker)

- **Reality:** with the localStorage role-picker gone (Phase 2), **only the
  `SUPERADMIN_EMAILS` Google account can actually log in** — and superadmin holds *all*
  desks, so it bypasses every desk gate. Seeded non-superadmin users have fake emails and
  cannot authenticate with Firebase. Therefore **desk-separation cannot be E2E-verified
  through the UI until Phase 5 impersonation** (superadmin acts-as a single desk) lands.
- **Decision:** prove the gate logic now with **automated unit tests over the pure
  deciders** (`hasDesk`/`canActOnStage`/`assertDesk` + the desk matrix) — no login needed
  — plus `typecheck` + `lint` + a **superadmin Playwright smoke** (proves nothing broke
  for the all-desks case). The desk-separation UI E2E is **explicitly deferred to Phase 5**
  and called out as not-yet-proven.
- **Options weighed:** (a) build a throwaway dev-only "act as desk" override now — rejected
  as ~80% of Phase 5 impersonation infra, i.e. wasted throwaway work; (b) pull Phase 5
  forward — possible, but Phase 3's *logic* is independently valuable and testable now;
  (c) automated authz tests + defer UI E2E ✅ — honest, cheap, no throwaway.
