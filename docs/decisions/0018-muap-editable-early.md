# ADR-0018: MUAP editable early (from Inisiasi) — supersedes ADR-0016 §1 only

- **Status:** accepted — ratified 2026.06.11; **partially implemented** (corrected 2026.06.12 — the
  earlier "implemented (P1–P5)" over-claimed). RM-led P1–P5 shipped the *adjacent* pieces (phase-wide
  Inisiasi desk windows per ADR-0020 P3-B, explicit Generate-MUAP), but **this ADR's core decision —
  `canEditDoc` keyed off `phaseOf(stage) === 1` — is NOT yet built**: `apps/web-app/src/lib/auth/doc-access.ts`
  `canEditDoc` still gates MUAP editing to exact Stage 3 (verified 2026.06.12). Build against exact-stage
  until the predicate flip ships. Live facts in [`../CURRENT-STATE.md`](../CURRENT-STATE.md); residuals
  tracked in [`../planning/execution-queue.md`](../planning/execution-queue.md).
- **Date:** 2026.06.11
- **Supersedes [ADR-0016](./0016-per-stage-doc-lifecycle-one-editable.md) §1 only** (exact-stage "MUAP editable
  ONLY at Stage 3 / do-it-early gone"). **ADR-0016 §2–5 stand unchanged** — freeze-on-advance, RSK created at
  Stage-4 entry, single 4→5 + maker-gate, server-side decision archive.

## Context

The [RM-led pipeline redesign](../designs/rm-led-pipeline-redesign.md) surfaces old Stages 1-2-3 as one
`Inisiasi` phase — the existing **Phase 1** (`phaseOf`: stages 1-3 = intake → legal/agunan/biro →
feasibility/MUAP; today labeled *Originasi*), a *derived* grouping, **not** an engine renumber (which stays
deferred). The RM works it as parallel checklist streams (docs ∥ legal ∥ appraisal ∥ bureau ∥ **MUAP-draft**).
In that shape, "MUAP editable ONLY at Stage 3" (ADR-0016 §1) is wrong by construction: the MUAP draft is one of
the parallel streams the RM works *throughout* Phase 1 (start → MUAP drafting), before the spine advances to
Risk Review — not a single Stage-3 window.

ADR-0016 §1 deliberately removed do-it-early MUAP editing to close two holes (a BEKU MUAP still writable in
Drive; MUAP and RSK windows overlapping). Those holes are real, but §1 was the wrong fix for the *first* of
them in the redesigned flow — it conflated "the document is frozen once advanced" (the actual audit
requirement) with "the document cannot be drafted until the last moment before the gate" (an incidental
restriction). The redesign keeps the freeze (§2) and only reopens the *draft* window. Reversing an accepted
ADR's core stance is hard-to-reverse → this ADR (Fork B6 in the redesign).

## Decision

**MUAP is editable throughout the `Inisiasi` phase (Phase 1 = stages 1-3)**, not only at Stage 3. The RM drafts
the MUAP as a parallel checklist stream from the start of the deal; `canEditDoc` for the MUAP keys off
**`phaseOf(stage) === 1`** and not-yet-frozen-past the MUAP→Risk gate — not `stage === 3`.

This reverses **the MUAP half of ADR-0016 §1 only** — §1's RSK half (**RSK editable ONLY at Stage 4,
until submitted**) **stands unchanged**. **ADR-0016 §2–5 are explicitly retained:**

- **§2 freeze-on-advance** — on advance past the MUAP→Risk gate, the MUAP's Drive grants reconcile DOWN to
  `reader`; a send-back reopens it. Unchanged.
- **§3 RSK created at Stage-4 entry**, grounded in the *final* (frozen) MUAP read-back. Unchanged.
- **§4 single 4→5 advance + RSK maker-gate.** Unchanged.
- **§5 server-side decision archive, fails hard.** Unchanged.

## Consequences

**Safety is preserved, on two independent legs:**

- **The advance gate still protects Risk Review.** Opening the draft window early changes *when the RM may
  type into the MUAP*, not *what it takes to leave Inisiasi*. The MUAP→Risk advance still requires the
  checklist done **incl. the MUAP ladder (RM→TL→BM) fully approved** (`makerSubmitGateError` +
  `lib/approval-chain.ts`). An unfinished or unapproved MUAP cannot reach Risk Review; Risk reviews only a
  laddered, frozen document.
- **The "exactly one editable doc at a time" invariant survives.** The MUAP edit window (Inisiasi) and the RSK
  edit window (Stage 4) **never overlap**: the RSK does not exist until the MUAP freezes on advance (§3
  retained), and freeze-on-advance (§2 retained) downgrades the MUAP to `reader` at the moment the RSK window
  could open. At no instant are both {MUAP, RSK} editable. The invariant ADR-0016 §1 was meant to protect is
  held by §2+§3, not by the exact-stage restriction this ADR drops.

**What this makes easy:** the RM can build the MUAP incrementally across the whole Inisiasi phase alongside
docs/legal/appraisal/bureau, instead of being blocked until a late single-stage window — matching the
parallel, RM-led intent of the redesign.

**What it rules out / costs:** the MUAP edit window is now wider, so the affordance can no longer rely on a
single exact-stage equality; `canEditDoc` for the MUAP becomes a phase+gate predicate (built over the existing
`stage` Int per Fork A1) that must agree exactly with the freeze seam so no edit slips past the advance. Getting
that predicate and the §2 freeze to stay mutually exclusive is the implementation-correctness burden this ADR
takes on. (Build work — the `Inisiasi` predicate, the wider grant window, and the SP3 reviewer chain — shipped
in P3 and merged to `main` 2026.06.12; see `CURRENT-STATE.md`.)
