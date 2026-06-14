# Config and admin — remaining work

> Status: ACTIVE
> Owner: App + Bank product/compliance
> Last reviewed: 2026.06.11
> Source of truth for: remaining admin-editable configuration work

## Principle

Make values configurable; keep behavior in code. Anything that feeds a credit or compliance decision must be versioned, audited, effective-dated, and snapshotted where decisions need an immutable basis.

The core config/admin foundation is live: admin desks, escalation guardrails, SLA policy, risk policy, committee rooms, disbursement conditions, config-only seed, OCR provider boundary, and configurable AI prompts. Durable context lives in `docs/designs/admin-config-layer.md`, `docs/designs/workflow-finetune.md` §0, and `docs/guides/architecture.md`.

## Active scope

### 1. Required-document checklist config

Blocked on Bank Discovery-W1 confirming source lists, predicates, ownership, and effective-date behavior.

Questions to settle:
- Which document types are required by default?
- Which requirements depend on product, akad, collateral, branch, or applicant type?
- Which desk owns each requirement?
- How should in-flight applications treat a newly active checklist version?

### 2. Frozen risk-policy display in decision audit UI

`DecisionCheckpoint` stores the frozen risk policy basis, but the UI does not yet render the exact version/thresholds used at decision time.

Acceptance:
- Decision audit surface shows frozen DSR/LTV/Kol thresholds and policy version.
- Runtime/in-flight surfaces still read active policy via `app.riskPolicy ?? DEFAULT_RISK_POLICY`.
- No historical checkpoint is recomputed.

### 3. OCR coverage beyond KTP

Extend structured OCR coverage for SLIK, slip/income documents, and appraisal documents after provider/legal approval.

Acceptance:
- New extraction remains suggestion-only until the owner desk confirms.
- Gating numbers are never blindly written from OCR.
- External OCR remains env-gated and covered by launch/compliance gates.

### 4. Branch/region master-data scope — RESOLVED (OUT of v1, 2026.06.09)

Resolved **out of v1** (human, 2026.06.09): not demo-critical; adds routing/reporting surface. See [`../references/scope-v1.md`](../references/scope-v1.md) "Out of scope (v1)". Revisit post-v1 (ownership, seed defaults, routing/reporting impact).

## Explicitly deferred / out of scope for this plan

- 5C+1S scoring weights until real scoring replaces prototype scoring.
- Tenor presets until the new-application server/client split is revisited.
- Akad semantics, collateral enum/i18n, quorum/majority/veto, desks/stages/authz primitives, AI masking behavior, rate limits, file caps, DB pool, and retry behavior.

## Verification invariants

- Config changes append new versions; never edit/delete prior versions.
- Superadmin can still do everything.
- Delegated admin desks can only access their own tabs and cannot self-escalate.
- Workflow actors do not gain workflow participation from `ADMIN-*` desks.
- Runtime policy surfaces use active config values, not literals.

## Key files

- `apps/web-app/src/lib/desks.ts`
- `apps/web-app/src/server/actions/admin.ts`
- `apps/web-app/src/server/config/*`
- `apps/web-app/src/app/(app)/admin/*`
- `apps/web-app/prisma/seed-config.ts`
