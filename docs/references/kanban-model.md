# MIZAN — Kanban Model

- **Type:** stable spec (UX) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/KANBAN-MODEL.md` (retired).
- **Used by:** pipeline/personal board UI; load the `mizan-design` skill.
- **Review trigger:** fold into `mizan-design` skill if it drifts from build.

> **Reconcile:** two-view model is largely built; this is the spec rationale.

> Two views, two purposes. Don't conflate them.
>
> 📝 **The entire two-view Kanban model below is a NoEffort design proposal.** Manifesto Slide 7 only specifies one "Visual Kanban Pipeline" with drag-drop between stages. The split into Pipeline (read-only) + Personal (drag-drop), and the rule that stage transitions must go via explicit action buttons (not drag), are NoEffort decisions that intentionally reframe the Manifesto's drag-drop framing for audit + validation reasons. Bank confirms the model at Discovery W1.

## View 1: Pipeline Kanban (6 columns = 6 stages)

**Purpose**: visibility into the **whole pipeline** — anyone can see where every loan application is.

| Column | Stage |
|---|---|
| Pengajuan Dokumen | Stage 1 |
| Legal, Agunan & Biro | Stage 2 |
| Feasibility / MUAP (5C+1S) | Stage 3 |
| Risk Review / RSK | Stage 4 |
| Committee Decision | Stage 5 |
| Pencairan | Stage 6 |

- 🚫 **No drag-drop for stage transitions** — read-only for stage movement.
- ✅ Stage transitions happen via **explicit action buttons** ("Submit to Risk Review") with validation, message rules, and audit logging.
- ✅ Filter by stage, owner, akad type, plafond range, SLA status.
- Best for: management oversight, situational awareness, "where is app FOS-2026-042?"

## View 2: Personal Kanban (3 columns = personal state)

**Purpose**: **daily workflow** for the individual user — what's on my plate today.

| Column | Meaning |
|---|---|
| **My TODO** | Assigned to me, haven't started yet |
| **In Progress** | I'm actively working on these |
| **Submitted / Awaiting Others** | I've completed my part; waiting on Risk / Komite / RM / nasabah |

- ✅ **Drag-drop allowed** between TODO ↔ In Progress (personal state, not business state).
- ✅ Moving to "Submitted" happens **automatically** when the user takes an action that transitions the app to next stage.
- Best for: RM / RA daily work, prioritization.

## Default landing

**Personal Kanban** is the default landing page after login — most users care first about "what do I need to do today."

Pipeline Kanban lives in a separate top-level tab/page.

## Why this matters

Conflating the two would be a bug: a drag-drop on Pipeline Kanban that changes app stage would **bypass validation, audit logging, message requirements, and SLA tracking** — a compliance risk. That's why stage transitions go through explicit action buttons, never drag.

## Implementation hints

- Pipeline columns: derived from `application.stage` (1-5).
- Personal columns: derived from a **per-user state field** (e.g., `assignment.personal_status` ∈ `{todo, in_progress, submitted}`).
- Personal state transitions: only the assignee + admin can change.
- Personal state ≠ app stage. An app can be in `Stage 3` and **simultaneously** be on Analyst A's `In Progress` column and on Risk B's `Submitted / Awaiting Others` column (Risk B already did their bit upstream).
