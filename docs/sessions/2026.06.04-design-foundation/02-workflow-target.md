# Workflow target — SOP-anchored, and why each correction

How the workflow model was corrected to the real Hijra SOP. Decision lives in
`../../decisions/0003-workflow-target-and-rbac.md`; model SSOT in `../../designs/workflow-target.md`.

## The shift

The earlier model ("RM absorbs all desks", a 4-stage sketch from 2026-05-30) was **stale**. The Hijra
SOP slides showed the real shape: **RM (Marketing) is a hub that orchestrates separate desks** (Legal &
Appraisal, Ops), not one that absorbs them. Only the **feasibility / 5C+1S** work (the old "Loan
Analyst") folds into RM. The target became the **SOP-anchored 16-step flow**, grouped into four
maker-checker gate phases.

## Corrections, each re-verified against the actual slides (not memory)

- **SLIK/Pefindo → RM, not Ops.** Re-reading slide 4 showed Ops only owns the *BI-Checking system SLA*;
  the RM records the bureau data. Corrected an earlier wrong attribution.
- **Ops out-of-Mizan.** Pencairan execution + penjaminan/asuransi happen outside the system; Mizan keeps
  an RM checklist, it does not orchestrate Ops.
- **Committee-support steps (jadwal / konten / MOM) → RM role.** System-initialized drafts, desk-confirmed;
  bundled to the RM role (aligns with the slide-2 RM checklist; kept granular so easy to move).
- **Two-layer RBAC.** Desk = granular atomic permission; Role = composition of desks. This let
  **Legal & Appraisal = two desks (`legal`, `appraisal`) in one role** without flattening them.
- **Appraisal is NOT RM.** Re-verified late in the session at the user's request: RM only *orders* the
  appraisal; the **Appraisal desk (internal) or KJPP** does the valuation. Slide 1 bundles Legal &
  Appraisal in one lane, slide 3 shows Appraisal as its own desk — reconciled as two-desks-one-role.

## What the slides do and don't cover

The slides are a **forward happy-path** only — they are silent on rejection/send-back/terminal paths.
The reject/send-back/terminal layer in our diagram is **our inference + direction**, flagged for W1
confirmation, not slide-sourced. (This was caught when the user challenged a "the slide says X" claim
that turned out to lean on our own diagram — a good correction on intellectual honesty.)

## Fixed rules confirmed real (not our invention)

The MUAP and RSK maker-checker gates are real Hijra process: the document must be FINAL (all signatures)
before the flow advances. DPS signs every RSK per deal. Hard-gate override is self-service with a
recorded reason.
