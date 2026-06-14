# Brainstorm merge + 6→4 gate open — 2026.06.03 brainstorm-merge-and-gate

Backward record of a substantial *planning/reconciliation* session — the synthesized reasoning **is** the
record (no transcript). Decisions/terms/current facts live in their canonical layers (ADR-0003,
the new `references/` + `designs/` docs, `GLOSSARY`, CURRENT-STATE); this
folder preserves the **reasoning, the forks, and the one dissent**, and links the artifacts.

## Summary

Merged the discovery-era `../brainstorm/` knowledge base into the layered `docs/` (collaboration
retired 2026.06.05), established a **git-recency reconciliation method** to decide which source wins per topic,
and on that basis **opened the 6→4 build gate** (human override) — then ran a full-sweep tidy. The
later [`2026.06.04-design-foundation`](../2026.06.04-design-foundation/README.md) session built on the
gate this one opened.

## In this folder

- `01-merge-method.md` — why merge, the "structure is already clean → need routing, not cleanup" insight, and the plan-first decision
- `02-which-wins-recency.md` — the keystone: deciding authority **per-topic by git date × nature**, not by repo
- `03-gate-and-tidy.md` — the gate-open decision + the recorded dissent/human override; the full-sweep tidy (incl. the symlink self-correction)
- `follow-ups.md` — non-active candidates (retire brainstorm; 6→4 build; a Bahasa-companion drift)

## Canonical homes (not duplicated here)

- Decision: [`../../decisions/0003-workflow-target-and-rbac.md`](../../decisions/0003-workflow-target-and-rbac.md) (gate-open + DPS-always + scope)
- Plan + routing table: `planning/brainstorm-merge.md` (retired 2026.06.05 — see git history; outcome in [`../../CURRENT-STATE.md`](../../CURRENT-STATE.md) + [`../../references/`](../../references/))
- Target design: [`../../designs/workflow-target.md`](../../designs/workflow-target.md) · Bahasa companion [`../../guides/alur-kerja-inti.md`](../../guides/alur-kerja-inti.md)
