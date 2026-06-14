# MIZAN — Admin & Configuration Layer

- **Type:** design blueprint (built core) · **Status:** Built (core) · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/ADMIN.md` (retired).
- **Used by:** versioned-config (`resolveActiveVersion`), 3 admin desks; remaining extensions in `../planning/config-and-admin.md`.
- **Review trigger:** Discovery W1 (admin RBAC model).

> **Reconcile:** core (3 admin desks, versioned/effective-dated config, superadmin guardrail) is built (`../CURRENT-STATE.md`); open extensions tracked in `../planning/config-and-admin.md`.

> The system-configuration surface that sits **beside** the S1–S6 financing
> pipeline, not inside it. Admin desks are **not workflow participants** — they
> don't own a stage or touch an application's flow; they govern the rules the
> pipeline runs under.
>
> 📝 **Provenance:** sources imply *some* admin configurability (Bank §ops: "admin
> can adjust SLA without code deploy" — see [SLA.md](../references/sla-targets.md)), but the specific
> three-desk split, the versioned/effective-dated config model, and the superadmin
> guardrail below are **NoEffort engineering design.** **Engineering live as of
> 2026.05.27** (SLA policy, risk policy, committee rooms/capacity, disbursement
> conditions, configurable AI prompts — 7 surfaces via `AiPromptVersion`). Bank
> confirms the admin RBAC model at Discovery W1.

## Configuration taxonomy

- **Reference config** (ADMIN-MASTER): operational values such as SLA targets, holiday calendar, rooms/capacity, branches, and product attributes. Plain versioned config tables are enough.
- **Policy config** (ADMIN-POLICY): values that feed credit/compliance decisions such as DSR/LTV/Kol thresholds and document-checklist rules. These must be versioned, audited, effective-dated, and snapshotted where a decision needs an immutable basis.

Principle: make **values** configurable; keep **behavior** in code. Akad routing, stricter Mudharabah treatment, stage flow, and desk primitives remain code-level behavior. Cutover is behavior-preserving: seed v1 config from today's constants, then recompute live for in-flight applications and freeze the applied policy version at committee decision.

## The three admin desks

| Desk | Governs | Notable config |
|---|---|---|
| **ADMIN-USERS** | Users & role grants | Create users; assign roles; grant/revoke desk access |
| **ADMIN-MASTER** | Master data ("Master" tab) | SLA stage targets, holiday calendar, business-day mode — see [SLA.md](../references/sla-targets.md) |
| **ADMIN-POLICY** | Risk policy ("Policy" tab) | DSR / LTV / Kol hard-gate thresholds — see [COMPLIANCE.md](../references/compliance.md) |

These are distinct from the pipeline desks (the S1–S6 stage queues). A user holding
an ADMIN-* desk is configuring the system, not advancing applications.

## Versioned, effective-dated config (the core mechanic)

All admin-tunable config is **append-only and versioned**, never destructive:

- Every edit creates a **new version** with an **effective date** — the prior
  version is preserved as history, never overwritten.
- A pure `resolveActiveVersion` selects the version in force at any given moment
  (by effective date). One function, one source of truth for "what's active now."
- This applies to both tunable surfaces: **SLA targets** (ADMIN-MASTER) and
  **risk-policy thresholds** (ADMIN-POLICY).

**Why versioned, not just editable:** an OJK-defensible system must be able to
answer *"what threshold/SLA was in force when this application was decided?"* —
not just "what is it today." Append-only history makes that answerable.

## How tuned policy meets a live application

The DSR/LTV/Kol hard gates are **admin-tunable** through ADMIN-POLICY, so the gate
thresholds are no longer hardcoded. The interaction with an in-flight application:

1. **Recompute-live before decision** — while an application is in-flight, its hard
   gates recompute against the currently-active policy version.
2. **Frozen at decision** — when the committee records its decision, the active
   policy version (the exact DSR/LTV/Kol thresholds then in force) is **frozen into
   the DecisionCheckpoint**. The decision is forever auditable against the precise
   thresholds applied — later policy edits don't rewrite history.

This is the compliance-relevant consequence of admin-tunable gates; the full
framing lives in [COMPLIANCE.md](../references/compliance.md). Build status: [BUILD-STATE.md](../CURRENT-STATE.md).

## Superadmin guardrail

Granting an ADMIN-* desk (or bundling admin desks into a role) is **superadmin-only**.
A regular admin cannot escalate themselves or others into the configuration layer —
the privilege to hand out configuration power is held one level up. This bounds the
blast radius of the admin layer: only superadmin decides who may change the rules.

## No maker-checker — single actor + append-only audit

Admin config changes use a **single authorized actor**: one admin writes a new config version; the versioned/append-only row history is the audit trail. There is no secondary approval before a change takes effect. Rationale: the immutable version history is the accountability mechanism; a maker-checker layer is V2+ if Bank requires it.

## Still blocked (pending Discovery W1)

- **Required-doc checklist config** — which docs are required per product/akad/collateral/branch; ownership model; effective-date behavior.
- **Frozen risk-policy display** in decision audit UI — policy is frozen into `DecisionCheckpoint` but not yet rendered in the audit view.
- **OCR coverage beyond KTP** — SLIK, slip/income, appraisal OCR awaiting provider selection + legal/DPA approval.
- **Branch/region master data** — whether a multi-branch model is needed in V1 and what it governs.

## Compliance & audit posture

- Config changes are **non-destructive + dated** → audit trail of who changed which
  rule, when, and from what to what (the OJK-defensibility rationale is stated under
  "Versioned config" above).
- Admin desks being non-pipeline keeps a clean separation: rule-setting vs
  rule-application.
