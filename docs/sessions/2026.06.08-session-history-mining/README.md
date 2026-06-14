# Session-history knowledge mining — 2026.06.08 session-history-mining

Backward record of a substantial research/synthesis pass: we mined **every** past agent
session (OMP + Claude Code + the sibling `brainstorm` repo — ~176 sessions, ~1.7M signal
tokens) into durable knowledge, then built a repeatable pipeline so it can be redone cheaply.

## Summary

- Distilled the whole session history via a map-reduce (extract → per-batch digests →
  per-domain syntheses → reconcile) into `docs/references/session-history/` — the project's
  evolution + cross-session contradiction register + doc-vs-shipped drift audit.
- Productized the process as the **`mizan-knowledge-mining`** skill (`.agents/skills/…`),
  including a stdlib extraction script, so the register is refreshable, not a one-off.

## In this folder

- `01-outcomes.md` — what was produced, where it landed, and the homing decisions (why a
  derived *reference register* + a process *skill*, not new design docs); plus the open
  `[VERIFY-DOC]` follow-up handed forward.

## Produced (durable, outside this folder)

- `docs/references/session-history/README.md` + `NN-*.md` — the register + 8 domain syntheses.
- `.agents/skills/mizan-knowledge-mining/` — the repeatable pipeline (SKILL + script + refs).
- `docs/README.md` — new nav row pointing at the register.
