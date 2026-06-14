# ADR-0009: Detail page as an adaptive RM-coordination command-center

- **Status:** accepted
- **Date:** 2026.06.06

## Context

A lead-level UI/UX audit of the application detail page (`/applications/[id]`, all stages × states × roles, desktop + mobile) found one structural gap plus polish. The page was shaped like a **stage-linear wizard**: one stage → one `Tugas Anda` forward action → navigate-by-view. But Hijra runs origination **without a system today** — the RM coordinates Legal, Appraisal, bureau data (SLIK/Kol), and the MUAP draft **in parallel and out of sequence** (Sheets/Docs + WhatsApp/email + Jira dispatch + manual files). ADR-0007 already made the RM the coordination hub and let Legal/Appraisal lag into Stage 3; the engine already permits do-it-early work (`canWorkStage`). The UI just didn't reflect any of it — the parallel reality was invisible.

The brief made two things first-class: UI/UX quality **and** familiarity to Hijra's *current* (flexible, parallel, person-coordinated) practice — not familiarity to today's Mizan (nobody has used it). Three directions were weighed with adversarial self-eval:

- **A — Polish-in-place.** Fix findings inside the wizard model. Safe, but leaves the rigid-wizard feel → fails the familiarity-to-flexible-practice mandate.
- **B — Full coordinator worktable.** Rebuild the landing as a command-center; stage becomes a derived ribbon; tabs demote. Maximal familiarity, but a large bet that risks discarding the working, audit-legible tab structure.
- **C — Adaptive command-center (hybrid).** Upgrade the Ringkasan landing into the RM's worktable while keeping the audit-first tabs, and clear the polish findings.

## Decision

**Option C (user-approved).** The detail page is an **adaptive RM-coordination command-center over an audit-first tab structure**:

1. **Coordination worktable on Ringkasan** (`components/application/CoordinationPanel.tsx`, model in `lib/workstreams.ts`). Surfaces every workstream the coordinator can act on **now** — its turn (`active`) or startable ahead of time (`early`, the do-it-early window) — as rows with status + owner + a one-click jump. It expands the parallel reality PROSES_STEPS collapses: Stage 2's Legal ∥ Penilaian ∥ Biro run as concurrent rows, and Legal/Appraisal lagging into Stage 3 stay `active`. It **navigates only**; the viewer's own gated forward action stays in the cockpit `Tugas Anda`. It is derived from the **same engine predicates** the gates use (`stage2RmDataReady`, `legalAppraisalComplete`, `analysisComplete`, …) — it never forks "done".
2. **Hard-gate block renders only when assessable** (`app.financialsAssessed`). No three empty "Belum dinilai" tiles during early intake.
3. **Nav stays always-visible grouped** (`DossierNav`, unchanged). A collapsible 4-group disclosure was implemented and then **reverted at the user's direction** — every surface stays one click away (the audit-first all-reachable rule), preferred over progressive disclosure.
4. **Unified doc-tab spine** for MUAP and RSK: **Provenance → Document → role work zone → Approval ladder**. One stable mental model across both Google-Docs-backed tabs.

## Consequences

- The landing reads as a coordinator's worktable (parallel + do-it-early are legible), not a wizard — familiarity to Hijra's current flexible practice, without losing audit-first depth, the tab structure, or any status-at-a-glance signal.
- New durable patterns (coordination worktable, doc-tab spine) are added to the `mizan-design` skill baseline (`.agents/skills/mizan-design`) and the detail-page guide.
- The worktable's only real risk — Ringkasan density — is a design constraint (show active+early only, not the whole pipeline; the Proses stepper keeps orientation), not a structural one.
- `lib/workstreams.ts` becomes a second consumer of the engine predicates. It MUST keep deriving `done` from those predicates (the same rule PROSES_STEPS follows) so the worktable, the stepper, and the gates never disagree.
- Verified: typecheck · lint 0-err · 347 unit (incl. `workstreams.test.ts`) · 42 integration · 21 e2e (136 steps) · live 1280 + 375, zero console errors.
