# ADR-0006: Document versioning leans on Google-native history + freeze; RollbackDocument retired

- **Status:** superseded by ADR-0008 (2026.06.06) — versioning is now built via Drive snapshot copies; `RollbackDocument` un-retired
- **Date:** 2026.06.06
- **Supersedes:** the `DocumentVersion`-ledger + `RollbackDocument{toVersion}` design in `designs/workflow-engine.md` (§"Rollback never destroys", §"Versioning, rollback & compare", and the `RollbackDocument` arm of the `WorkflowCommand` union).

## Context

The command-sourced engine design envisioned a Mizan-owned, append-only `DocumentVersion` ledger with
`RollbackDocument{toVersion}` ("restore a prior version as a new current version") and compare/diff —
"make as many versions as you want, roll back freely." That vision predates the **Docs-as-source**
architecture decision: MUAP/RSK are now **live Google Docs** (one-way NamedRange fill + free analyst
editing), and the committee freeze writes **immutable PDF snapshots** to SeaweedFS
(`DecisionCheckpoint.muapStorageKey/rskStorageKey`, `contentHash` over both).

Implementing `RollbackDocument` against live Google Docs needs one of:
- **(A) Full-Doc content versioning** — snapshot the entire Doc body per milestone + restore via the
  Docs API. The Docs API has no "replace whole document"; a restore is a delete-all-ranges + re-insert
  of structured elements (tables, formatting, NamedRanges) — substantial and error-prone.
- **(B) Fill-data-only snapshot** — store the structured fill payload + "rollback" = `RegenerateMuap`
  from a prior snapshot. Lighter, but **loses analysts' free-text edits** (only templated fields restore)
  — incomplete for MUAP, where analysts edit prose.

Both build a new subsystem in an OJK-audited document path. Meanwhile, the audit-critical record —
the **frozen decision snapshot** — already exists, and Google Docs ships **native version history** for
the live draft phase.

The fork (build Mizan-owned versioning vs. lean on existing mechanisms) carries compliance implications
(is Google-native history an acceptable draft-phase trail?), so it was put to the product owner.

## Decision

**Lean on existing mechanisms; retire `RollbackDocument` as a Mizan command** (product-owner choice,
2026.06.06):

1. **The audit record is the frozen `DecisionCheckpoint`** — committee freeze writes immutable MUAP/RSK
   PDFs (+ `contentHash`). That is the version that legally mattered for the decision; it is permanent.
2. **Live-draft rollback uses Google Docs' native version history** ("who edited what when", revert in
   Drive) — Mizan does not duplicate it.
3. **`RegenerateMuap` covers "start fresh"** — re-mint the MUAP/RSK pair from current data (pre-Komite).
4. **No `DocumentVersion` table, no `RollbackDocument` command.** Drop them from the design; the
   `WorkflowCommand` union ships without `RollbackDocument`.

## Consequences

- No Mizan-owned, audit-integrated version trail for the **draft** phase (only the frozen decision
  snapshot + Google's native history). Accepted: the binding artifact is the freeze; drafts are working
  material. Revisit only if an auditor requires a Mizan-held draft-edit trail.
- The engine's net-new command set is **complete**: `ReviseProposal`, `Withdraw`, `RegenerateMuap`,
  `MentionUser` shipped; `RollbackDocument` retired here. (`Transition`/`SystemTransition`/`DualSignOff`
  are the internal transition kinds.)
- `designs/workflow-engine.md` should not be implemented as written for versioning/rollback; this ADR
  is the current source of truth for that slice.
