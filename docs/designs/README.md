# Designs — index

Durable system blueprints + conventions. **Read the CURRENT ones**; the HISTORICAL ones are frozen
archives kept only as provenance (current docs link to them with a `historical:` marker).

## Current (build against these)

| Doc | Covers |
|---|---|
| [workflow-target.md](workflow-target.md) | The confirmed end-to-end target flow (roles · stages · ladders · Rapat); engine shipped 2026.06.04. |
| [workflow-engine.md](workflow-engine.md) | Engine architecture — command-sourced · ledgers · derived/persisted `WorkflowSnapshot`. |
| [document-system.md](document-system.md) | **V3** doc system (MUAP/RSK + MoM/SP3): leak-proof `[bracket]`/`{{token}}` `replaceAllText` fill, QR anchors, Markdown→AI read-back (ADR-0013). |
| [doc-fill-v3.5-namedrange.md](doc-fill-v3.5-namedrange.md) | V3.5 targeted NamedRange fill for underscore slots (plafond/tenor); shipped Batch 4. |
| [ai-assist.md](ai-assist.md) | AI advisory-only design (white-box · human-confirms · never gating · masked+audited); doc triggers (RSK auto at Stage-4 entry). |
| [pii-masking.md](pii-masking.md) | Mask-in/unmask-out PII handling, residual backstop, accepted residual risk + G5 gating. |
| [admin-config-layer.md](admin-config-layer.md) | Versioned admin config (SLA, holidays, approval routing, policy) + the authority-vs-routing split. |

## Proposed / deferred (not built)

| Doc | Status |
|---|---|
| [rm-led-pipeline-redesign.md](rm-led-pipeline-redesign.md) | **Settled design, NOT built (2026.06.11).** RM-led pipeline over a Customer→Deal→Document graph (Drive substrate, layered AI context, open-read, review/adendum). 9 topics + 9 reconciled forks. Spawns ADRs + a plan at build; compliance parked as a forward constraint. |
| [origination-phase-legal-as-review.md](origination-phase-legal-as-review.md) | **Batch 7 — DEFERRED.** Origination-as-one-RM-phase + Legal/Appraisal-as-review. Needs an ADR + user re-activation; build against ADR-0007 until then. |

## Historical (frozen — provenance only, do NOT build against)

| Doc | Superseded by |
|---|---|
| [muap-v2-tokenization-playbook.md](muap-v2-tokenization-playbook.md) | The **reusable token-derivation methodology** (kept for future template work); the live V3 registry is `lib/templates/doc-registry.ts` + `references/document-templates.md`. |
| [muap-template-engine-v2.md](muap-template-engine-v2.md) | The V2 NamedRange engine — superseded by V3 (`document-system.md`, ADR-0013). |
| [muap-v2-tokenization.md](muap-v2-tokenization.md) · [rsk-v2-tokenization.md](rsk-v2-tokenization.md) | V2 token-walkthrough dumps — superseded by V3. |
| [workflow-finetune.md](workflow-finetune.md) | 2026.05.26 build plan; superseded specifics (old roles/voting). Consult only for build rationale + its §0 ops-remainder. Current model → `workflow-target.md` + `../CURRENT-STATE.md`. |
