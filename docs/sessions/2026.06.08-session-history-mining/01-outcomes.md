# Outcomes & homing decisions

## What we did
The user asked to capture "every knowledge" from past agent sessions and flag all
contradictions. Reading raw transcripts is infeasible (~hundreds of MB, megaline tool output),
so we built a map-reduce:
1. **Extract** (deterministic): parse 3 transcript formats → signal-only transcripts (USER +
   ASSISTANT text), drop trivial sessions, bin-pack into ~300K-char batches.
2. **Distill** (map): one `task` subagent per batch → a structured digest file.
3. **Reduce** (map): 8 domain-expert subagents over the concatenated digests → per-domain
   syntheses (consolidated knowledge + contradiction/evolution timeline).
4. **Reconcile** (orchestrator): the syntheses → a single register with OPEN-contradiction and
   doc-drift sections.

Scale: 183 session files discovered → 176 unique → **69 substantive** distilled (cc 57 incl. 9
brainstorm, omp 6, omp-export 6); ~1.7M signal tokens. Eras are non-overlapping (brainstorm
May 14–Jun 2; Claude Code May 16–Jun 1; OMP Jun 3–8) — the dev migrated tools.

## Homing decisions (the reasoning worth keeping)
- **Two artifacts, two homes.** The *process* is reusable across any refresh → a **skill**
  (`mizan-knowledge-mining`). The *findings* are project knowledge → a **reference register**
  (`docs/references/session-history/`). Keeping them apart stops the findings from rotting the
  skill and vice-versa.
- **Register, not new design docs.** The syntheses overlap existing `guides/`/`designs/`/
  `decisions/` on *current state* — copying them in would violate the docs anti-duplication
  rule. Their unique, non-duplicative axis is **how it evolved + where docs may be stale**,
  which `docs/README.md` Doc Rules explicitly bar from guides. So they live as a dated,
  banner-marked *derived* register, indexed once in `docs/README.md`.
- **Commit the expensive layer, not the regenerable scratch.** Syntheses + register are
  LLM-distilled (expensive) → committed. Signal transcripts, per-batch digests, and `ALL.md`
  are deterministically reproducible by the script + distill step → left in gitignored
  `.omp/exports/_extracted/` (not committed).
- **Corrected an earlier misdiagnosis:** the OMP native store is at `~/.omp/agent/sessions/`,
  not `~/.omp/sessions/` — the sandbox does not "shadow" it; the path was wrong. Baked into the
  script + `mizan-knowledge-mining/references/stores.md`.

## Open follow-up handed forward
The register's **`[VERIFY-DOC]` list** is the actionable nugget: ~10 places where session
history says something shipped/changed but a current doc may still be stale (e.g. CURRENT-STATE
should describe V3 doc-gen + AI-Studio-not-Vertex; komite docs must be signed-MoM not voting;
no `src/lib/data`/`useRole` remnants). Not reconciled this session — the curated docs were left
untouched. Next: walk that list against live `docs/`/code and fix real drift (a separate, small
batch), or hand it to the product owner.
