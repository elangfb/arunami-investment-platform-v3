# ADR-0008: Document versioning via Drive snapshot copies; un-retire RollbackDocument

- **Status:** accepted
- **Date:** 2026.06.06
- **Supersedes:** ADR-0006 (which retired `RollbackDocument` + `DocumentVersion`, leaning on Google-native history + `RegenerateMuap`).

## Context

ADR-0006 retired document versioning because the only model considered — **in-place content restore into a live Google Doc** — is infeasible (the Docs API has no "replace whole document"; you'd delete the body and rebuild structured elements + re-create NamedRanges). A different model removes that obstacle entirely: make each **version a read-only `files.copy` snapshot** (which is reliable and already used for doc creation), and keep "current" always a clean copy. Rollback then never restores *into* a live Doc — it copies a snapshot *to a new* current Doc.

**Can native Google Docs revision history back this instead? No — verified against the Drive API:**
- **`keepForever` is binary-files-only** — *not* applicable to Google Docs. So Docs revisions are **purged** (~30 days, or once a file passes ~100 un-pinned revisions) → **version loss**, which breaks the "no loss" requirement.
- **No API restore/revert for Docs** — "the revision of Google Docs cannot be directly changed by APIs." So there is no Mizan-driven rollback via revisions.
- **Named versions are UI-only** (the API can't read/set them) and the **revision list can be incomplete** for active Docs.

Therefore `files.copy` snapshots are the only mechanism that is durable (survives purge), programmatically restorable, and audit-grade.

## Decision

1. **`DocumentVersion` ledger (append-only):** `{ applicationId, kind: muap|rsk, docId (the snapshot's Drive file), reason/trigger, createdBy, createdAt }`. Each row is an independent read-only Drive snapshot.
2. **Checkpoint at milestones** — snapshot on **stage transitions, `RegenerateMuap`, `ReviseProposal`, and freeze** — **not** every edit/sync (avoids Drive spam with near-identical copies). "On stage move" is the primary trigger.
3. **Retention: keep all snapshots** (audit-first; Drive space is cheap). No auto-pruning in V1.
4. **Rollback = snapshot-current-first, then copy-checkpoint-to-new-current** (no version loss): snapshot the live Doc → a new `DocumentVersion`, then `files.copy` the chosen checkpoint into a fresh current Doc and repoint `DocLinkage`. The timeline only grows; nothing is destroyed. **Pre-Komite only** (post-freeze, the immutable `DecisionCheckpoint` PDF is the record).
5. **Read-only viewing** via the `/preview` embed; a **"Riwayat versi"** list per document.

## Consequences

- **Drive file proliferation** — accepted; aligns with audit-first. Snapshots are per-milestone, not per-edit, so volume is bounded (~10–20 per app over its lifetime).
- **`RollbackDocument` is un-retired** — the `WorkflowCommand` the engine envisioned (ADR-0006 had dropped it) is now feasible and built on the snapshot ledger.
- **Google-native revision history remains a user convenience** (browse/restore manually in the Docs UI) but Mizan does **not** rely on it for checkpoint/rollback.
- Supersedes ADR-0006; `designs/workflow-engine.md`'s versioning section (currently marked "RETIRED (ADR-0006)") is re-activated under this model.
