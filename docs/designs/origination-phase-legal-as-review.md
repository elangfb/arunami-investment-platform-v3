# Origination as one RM phase · Legal/Appraisal as review-requests (PROPOSED)

- **Status:** **Proposed — NOT built, NOT ratified, NOT current behavior.** ADR-level direction captured
  2026.06.09 from a flow-review discussion. Needs an ADR + staged execution before any code. Tied to the
  deferred engine 6→4 renumber (`../designs/workflow-engine.md`).
- **Authority today:** **ADR-0007 (`../decisions/0007-stage2-rm-coordinated-origination.md`) is still the
  truth** — Legal/Appraisal ARE Stage-2 co-owners right now. This note would supersede *part* of its
  framing **only if it is ratified as its own ADR**. Until then, build against ADR-0007, not this.
- **Last reviewed:** 2026.06.09
- **Review/exit:** revisit when the 6→4 engine renumber is scheduled, or delete if rejected.

## Overview

A proposal to stop modelling **Legal** and **Appraisal** as Stage-2 *co-owners of the workflow state
machine*, and instead model them as **review-requests** that RM dispatches — verifications that **gate a
transition** but are **not stages themselves**. The deal's state machine collapses to its true
accountable backbone (≈ the existing 4-phase view): **RM-origination → Risk → Komite → Pencairan**.

## Why (the problem)

Today Legal/Appraisal are "Stage-2 owners", but the stage **doesn't actually wait for them**: ADR-0007
made the 2→3 advance fire on RM's SLIK handoff alone; Legal/Appraisal lag into Stage 3 and gate
**MUAP→Risk** instead. So they are half-in, half-out of the state machine — and that contradiction is
**concrete, observed**:

- **Bug (owed-but-invisible) — FIXED 2026.06.10 (Batch 1, typecheck+test):** `applyDecision`
  (`apps/web-app/src/lib/stage-action.ts`) used to force-mark **every** prior-stage assignment `submitted`
  on advance. When RM advanced 2→3 with Legal unfinished, Legal's task flipped to `submitted` and **left
  their Home "Tugas Saya"** even though Legal never did the work. Now `applyDecision` exempts the LG
  assignment while `!legalAppraisalComplete`, and `settleLgAssignment` settles it from the domain
  predicate (both deliverables in) — called from BOTH `completeLegalAction` and `recordAppraisalAction`,
  so the card leaves "Tugas Saya" exactly when the last deliverable lands, at stage 2 or 3. The remaining
  redesign motivation now rests on the RM-friction + half-in/half-out model-clarity points below.
- **RM friction:** Stages 1–2–3 are all RM, yet RM clicks two artificial advances (1→2, 2→3) inside one
  all-RM span.

## Design (the proposal)

> _Everything in this section describes the **proposed target**, not how Mizan works today._

Separate the two things the current model conflates:

1. **State machine = the deal's accountable forward progression.** A true sequence of *who owns moving it
   forward*: **RM-origination (intake + bureau + feasibility/MUAP) → Risk → Komite → Pencairan.** This is
   already the shape of `phaseOf` (`apps/web-app/src/lib/types.ts`): stages 1/2/3 → Phase 1.
2. **Review-requests = attached verifications.** Legal (Analisa Yuridis, verdict pass/fail) and Appraisal
   (Penilaian, records a value feeding LTV) become **sub-processes RM dispatches**, with their own
   lifecycle (requested → in-review → done/returned), **outside** the stage progression. They **gate**
   the MUAP→Risk transition but never *are* a stage.

**This is a pattern Mizan already runs** — the approval ladder (`lib/approval-chain.ts`) is exactly an
out-of-stage sub-process that gates an advance, and the awaiting-signature Home surface
(`components/kanban/AwaitingSignaturePanel.tsx`) is exactly how a non-stage-owner sees attached work.
The proposal **unifies Legal/Appraisal into that proven pattern** instead of the awkward stage-co-owner
model. Net effect: the force-submit bug disappears by construction; the two RM advance-clicks collapse.

## Invariants — what must NOT be lost (relocate, don't drop)

"Out of the state machine" ≠ "not a gate." These move from stage-machinery to review-request-machinery
(which already exists for the ladder):

1. **The gate stays.** Legal pass + appraisal recorded **still block MUAP→Risk** (`legalAppraisalComplete`,
   `apps/web-app/src/lib/stage-action.ts:70`).
2. **Audit ordering.** Append-only record: requested when/by-whom, reviewed by-whom, result, **on which
   document version** — same shape as `ApprovalStep`.
3. **Separation of duties.** Reviewer ≠ RM, must hold the `legal`/`appraisal` desk (the ladder's four-eyes
   already enforces this class of rule).
4. **Re-review on change.** A re-uploaded document invalidates its prior legal verification (today's
   per-doc `legalVerification` reset must carry over).

## Cost / what's lost

- **Sub-stage granularity.** 6 stages give per-step SLA + pipeline-column position (intake vs bureau vs
  feasibility). Collapsing 1–3 loses that unless a **sub-status within RM-origination** is added. Weigh
  this — it's the main non-trivial cost.

## Status & next step

Not built. **Do not code hastily** — this is engine + audit + UI + SLA-model surface area. Path: write an
ADR (decision + consequences, supersede/extend ADR-0007), draw the new state-machine + review-request
contracts, map relocate-vs-lose, then execute in stages alongside the 6→4 renumber. The force-submit bug
(above) can be fixed independently and sooner, regardless of whether this larger redesign proceeds.
