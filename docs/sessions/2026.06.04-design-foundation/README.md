# Mizan design foundation — 2026.06.04 design-foundation

Backward record of a substantial *design/planning* session — the synthesized reasoning **is** the record
(no transcript). Decisions/terms/current facts live in their canonical layers (ADRs, `designs/`,
CURRENT-STATE, plans); this folder captures the **reasoning, the rejected alternatives, and the
mid-session reversals**, and links the artifacts.

## Summary

An ~11-hour design session (31 commits, **zero application code**) that matured Mizan's knowledge layer
before building: SOP-anchored workflow target, a **command-sourced** engine (full event-sourcing
considered + rejected), a re-thought **one-way** document system, an **AI-assist** design, and the
"neraca tepercaya" North Star. Demo-first goal; flow verified technically correct before any build.

> **Predecessor:** the 6→4 gate this session builds on was opened in
> [`../2026.06.03-brainstorm-merge-and-gate`](../2026.06.03-brainstorm-merge-and-gate/README.md)
> (brainstorm merge + git-recency reconciliation + gate-open).

## In this folder

- `01-context.md` — where we started, the goals, the working mode, tooling caveats
- `02-workflow-target.md` — SOP-anchored 16-step target + why each correction
- `03-engine-rethink.md` — event-sourcing considered → rejected → command-sourced (the keystone)
- `04-flow-and-collaboration.md` — interaction spec, "records-not-gates", the akad + risk-reject reversals
- `05-document-and-ai.md` — document-system rethink, QR signing, AI-assist + the kocek counter-offer borrow
- `06-decisions-and-reversals.md` — decision ledger + the "we changed our mind" reasoning
- `follow-ups.md` — non-active candidates (build work is linked to planning)
