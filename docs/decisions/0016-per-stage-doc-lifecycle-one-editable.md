# ADR-0016: Per-stage document lifecycle — exactly one editable doc, freeze-on-advance

- **Status:** accepted (supersedes ADR-0014's "never downgrade" stance)
- **Date:** 2026.06.10
- **§1 slated for reversal (2026.06.11) by [rm-led-pipeline-redesign](../designs/rm-led-pipeline-redesign.md):** MUAP becomes
  **editable early** (from the collapsed `Inisiasi` phase), reversing "MUAP editable ONLY at Stage 3 / do-it-early gone." The
  advance gate (MUAP→Risk) still protects Risk Review, and **§2–5 stand** (freeze-on-advance, RSK created at Stage-4 entry,
  single 4→5, server-side decision archive) — the one-editable-window invariant survives (MUAP & RSK edit windows never overlap).
  The superseding ADR **[ADR-0018](0018-muap-editable-early.md) (reverses §1’s MUAP half only; the RSK half of §1
  stands) shipped and merged to `main` 2026.06.12** — §1's MUAP half is now **superseded**; build against ADR-0018 +
  [`../CURRENT-STATE.md`](../CURRENT-STATE.md). §2–5 still stand.

## Context

ADR-0014 grants per-app MUAP/RSK Drive access just-in-time and was **upgrade-only / never-downgrade**
("live docs stay editable"). The full-flow walkthrough (2026.06.09–10) showed that leaves real holes
in the Risk→Komite half:

- A MUAP that is **BEKU** in-app (its approval ladder complete, advanced to Risk) is still a Drive
  `writer` for the RM — an audit hole: the frozen authoritative document can still be edited.
- The MUAP and RSK edit windows **overlapped** (`<= 3` / `<= 4`), so two authoritative docs could be
  editable at once — not the "one document editable at a time" the process intends.
- RSK was created at **Stage-3 entry** from a raw seed, i.e. drafted against a MUAP that wasn't final.

The user decided (2026.06.10) to reverse the never-downgrade stance and make the lifecycle explicit:
progressive per-stage freeze, exactly one editable doc, RSK grounded in the FINAL MUAP. Reversing an
accepted ADR's core stance is hard-to-reverse → this ADR.

## Decision

1. **Exactly one editable doc at a time, exact-stage.** `canEditDoc` is exact-stage: MUAP editable
   ONLY at Stage 3, RSK editable ONLY at Stage 4 (until submitted to committee — stage ≥ 5 or a
   recorded decision). Do-it-early editing is gone. The shared predicate drives both the in-app
   affordance (MUAPTab/RSKTab) and the JIT Drive grant ROLE.
2. **Freeze-on-advance (downgrade writer→reader).** On advance past a doc's edit stage, the doc's
   existing Drive grants are reconciled DOWN to `reader` (reversing never-downgrade). A send-back to
   Stage 3 flips it back (MUAP reopens, RSK re-freezes).
3. **RSK is created entirely at Stage-4 entry**, grounded in the final MUAP (copy master + fill via
   read-back of the final MUAP markdown), not at Stage-3 entry.
4. **Single 4→5 advance + maker-gate.** The only path to committee is a complete RSK ladder; the RSK
   `request` is gated on a recorded `riskRecommendation` (mirrors MUAP↔legalAppraisalComplete).
5. **Decision archive is server-side and fails hard** — the freeze checkpoint is part of the committee
   decision flow, not a fire-and-forget client call; a failure is recorded, never swallowed.

## Consequences

- A frozen authoritative document can no longer be silently edited in Drive; at any moment exactly one
  of {MUAP, RSK} is editable; the RSK reflects the final MUAP.
- The freeze now depends on `permissions.update` (writer→reader) behaving idempotently and not locking
  a mid-edit user — this is why the downgrade rollout is **spike-gated** (S1).
- Builds on ADR-0007 (Legal/Appraisal gate MUAP→Risk) and ADR-0005 (signed-MoM decision).

## Implementation status (2026.06.10)

Accepted as direction; **all five decisions shipped 2026.06.10** (typecheck+test; live not yet verified):

- ✅ **Decision 1** — exact-stage `canEditDoc`, one-editable (T1, commit `ad04022`).
- ✅ **Decision 2** — freeze-on-advance Drive **downgrade** of existing writer grants: the S1 live-Drive
  spike ran **GO** (writer→reader idempotent/reversible by `permissionId`); `isDocFrozen` +
  `reconcileFrozenDocGrants` (`server/docs/access.ts`) are wired into the advance seam (`actOnChain`,
  after 3→4 / 4→5), closing the MUAP-BEKU-still-editable audit hole for new advances (T2).
- ✅ **Decision 3** — RSK created entirely at **Stage-4 entry** (`ensureStage4DocsOnEntry`/`ensureRskDoc`),
  grounded in the final-MUAP read-back; `DocLinkage.rskDocId` made nullable (migration applied); the doc
  spine tolerates RSK-absent ≤ Stage 3 (T3).
- ✅ **Decisions 4 & 5** — single 4→5 path + RSK maker-gate (T5); server-side decision freeze, fails hard (T6).
- ✅ **T4-UI + T7 shipped** (commit `11fe454`, 2026.06.10): "Sinkronkan" button recovery-only + the
  send-back→regress flip with RSK redraft from the revised MUAP (typecheck+test). The consumed handoff
  folder was retired (2026.06.11 audit). Live behaviour (RSK rendering at Stage 4, Drive downgrade)
  not yet smoke-verified.
