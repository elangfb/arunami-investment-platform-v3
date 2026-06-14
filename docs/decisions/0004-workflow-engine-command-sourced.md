# ADR-0004: Workflow engine — command-sourced, ledger-backed, snapshot-authoritative (not event-sourced)

- **Status:** accepted
- **Date:** 2026.06.04
- **Implementation status (2026.06.08):** §3's *authoritative persisted* `WorkflowSnapshot` is **PENDING — not yet built**. `stage` (Int) remains the cursor and `deriveWorkflowSnapshot` is a derived projection (the inverse of the target); the §1 command seam and §2 insert-only ledgers shipped. Tracked in `../planning/workflow-snapshot-persistence.md`.

## Context

Before building the 6→4 RM maker-checker workflow (ADR-0003), we had to choose the **fundamental
technical model** for the application workflow engine — deliberately rethought from scratch, not
anchored on the as-built shape.

As-built: a mutable `Stage = 1..6` integer plus mutation logic scattered across `applyTransition` /
`advanceOnDualSignOff` (`apps/web-app/src/lib/stage-action.ts`). The audit history and assignments are
treated as append-only by the domain functions, but `saveApplication`
(`apps/web-app/src/server/repo/write.ts`) physically `deleteMany` + recreates `historyEntry` /
`stageAssignment` / `komiteVote` / `applicationDocument` on **every** save — so append-only is a
**convention, not a storage guarantee**, which is a real weakness for a regulated audit trail.

We seriously considered full **event sourcing**: an append-only `WorkflowEvent[]` log as the single
source of truth, with current state a pure projection (`fold(events) → state`). It is seductive here —
maker-checker becomes a predicate over events, "state on date X" is a fold, QR signatures are events.

A senior second-opinion review plus our own analysis surfaced the decisive objection. In this domain
the gate facts are **not workflow transitions** — they are **documents, OCR confirmations, AML
attestation, and signature ladders** (e.g. `stage1To2Blockers()` reads `documents` /
`extractionSources` / `amlAttestation`, not a transition log). A generic transition event log would
therefore not be the real source of truth unless we **also** event-sourced every document upload /
re-upload, OCR confirmation, attestation, and signature — a far larger system than a ~30
application/month regulated app needs. **Partial event sourcing is worse than either pole:** the event
log, the snapshot, and the working/frozen documents become three competing truths that disagree exactly
on the regulated edge cases (re-uploads, send-backs, mid-ladder rework, legacy cutover).

## Decision

The workflow engine is **command-sourced, ledger-backed, snapshot-authoritative** — NOT
event-log-as-SSOT. Take the load-bearing disciplines of event sourcing; drop the expensive parts.

1. **Single write seam.** Every mutation is a typed `WorkflowCommand` through one **pure guarded
   reducer** `decide(state, cmd, actor) → Decision | Rejection`; no scattered field mutation. Guards
   (chain order, distinct actor, desk permission, hard-gate block, "document FINAL before unlock") live
   here and are unit-testable without a DB.
2. **Audit-critical facts are physically append-only ledgers** — `ApprovalStep` (signature rungs / QR
   anchor), `HistoryEntry` (audit log), `DocumentVersion` (signed/frozen provenance). **Insert-only;
   never delete/update.** This replaces the current delete+recreate persistence for those tables.
3. **An authoritative, named `WorkflowSnapshot`** (phase/step, not a bare integer) is the operational
   truth for the board, work-queues, and guards. Written **only** through the command seam, **atomically
   with the ledger inserts** (the existing optimistic version guard). It is a rebuildable read-model, not
   a second SSOT.
4. **Process shape in code, declaratively.** The phase graph, ordered approval chains, send-back edges,
   document-dependency ("FINAL before unlock") rules, and terminals are a **typed definition in code** —
   reviewed, tested, migrated. **Config owns the numbers and grants**: SLA, hard-gate thresholds,
   required-doc matrix, desk/role grants, future BWMP tiers.
5. **External side-effects run post-commit, idempotent (outbox-style).** The SeaweedFS document freeze +
   QR token fill cannot join the Postgres transaction: commit "signed, freeze pending" first, then
   freeze; a retry reconciles. **Never freeze-before-commit.**

## Consequences

- **Easy:** the reducer is unit-testable without a DB; audit trail and operational state cannot silently
  drift (ledgers are the regulated facts, snapshot is written in the same transaction); the build keeps
  the proven `loadApplicationForWrite` + version-guard seam; reassigning duties stays role-config
  (ADR-0003), not an engine change.
- **Hard / ruled out:** no generic `WorkflowEvent[]` SSOT, no projection-replay-on-read, no event
  upcasters. We accept a mutable snapshot, so discipline is required to **never** mutate workflow state
  outside the command seam.
- **Foundation first:** the physical append-only fix (`ApprovalStep` + `HistoryEntry` insert-only, atomic
  with the snapshot) is the **first build slice** — load-bearing for audit regardless of the rest.
- **Watched risk (biggest):** partial event sourcing creeping back — if any surface trusts a derived
  "event log" for workflow position while gate facts still live in mutable document/OCR/AML fields, the
  three-truths split-truth trap returns. Guard against it in review.
- **Reversibility:** if we later genuinely need many independent rebuildable projections from immutable
  facts, these ledgers can be promoted toward fuller event sourcing; we do not start there.
- Detail blueprint: `../designs/workflow-engine.md`. Process target it serves: `../designs/workflow-target.md` (ADR-0003).
