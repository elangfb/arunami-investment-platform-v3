# Engine rethink — event-sourcing considered, then rejected

The keystone reversal of the session. Decision + full reasoning live in
`../../decisions/0004-workflow-engine-command-sourced.md`; blueprint in `../../designs/workflow-engine.md`.
This file records *how* we got there.

## The prompt

The user asked to rethink the engine **from scratch**, not anchored on the as-built `Stage = 1..6`
integer + scattered transition functions.

## What I proposed first (and why it was seductive)

**Full event sourcing**: an append-only `WorkflowEvent[]` log as the single source of truth, with current
state a pure projection (`fold(events)`). It looked ideal for this domain: maker-checker becomes a
predicate over events, "state on date X" is a fold (audit gold), QR signatures are events, append-only
matches the regulator's expectations.

## Why it was rejected (the oracle second-opinion)

Consulted the `oracle` (it read the real code). The decisive objection: **in this domain the gate facts
are not workflow transitions** — they are documents, OCR confirmations, AML attestation, and signature
ladders (e.g. `stage1To2Blockers()` reads `documents`/`extractionSources`/`amlAttestation`, not a
transition log). A generic transition event log is therefore **not** the real source of truth unless we
*also* event-source every document/OCR/attestation/signature — a far larger system than a ~30/month app
needs.

The naming we gave the failure mode: the **split-truth trap** — partial event sourcing leaves three
competing truths (event log vs snapshot vs the working/frozen documents) that disagree exactly on the
regulated edge cases (re-uploads, send-backs, mid-ladder rework, legacy cutover). Worse than either pole.

## The reversal — what we chose instead

**Command-sourced, ledger-backed, snapshot-authoritative.** Keep event-sourcing's load-bearing
disciplines, drop the expensive part:
- **One guarded command seam** (`decide(state, cmd, actor)`), pure + testable — no scattered mutation.
- **Physically append-only ledgers for the audited facts only** (`ApprovalStep`, `HistoryEntry`,
  `DocumentVersion`) — insert-only, never delete/update.
- **An authoritative named snapshot** (phase/step) for the board/queue/guards, written only through the
  seam, atomic with the ledger inserts. Rebuildable, not a second SSOT.
- **Process shape in code** (declarative), config owns the numbers/grants.
- **Outbox for the external freeze** (SeaweedFS + QR fill): commit "signed, freeze pending" first, then
  freeze idempotently. Never freeze-before-commit.

## The concrete finding that fell out

`saveApplication` (`server/repo/write.ts`) physically `deleteMany` + recreates the "append-only" tables
(`historyEntry`/`stageAssignment`/…) on every save — so append-only was a *convention*, not a storage
guarantee. **Fixing this to true insert-only is the first build slice** (load-bearing for audit
regardless of the rest).

## Why this fits the volume

~30 apps/month means replay cost is irrelevant — we adopt the ES *discipline* (audit ↔ state can't
drift) without CQRS/distributed machinery. The justification is auditability + correctness, not scale.
