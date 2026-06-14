---
name: mizan-knowledge-mining
description: >-
  Repeatable pipeline for mining ALL past agent sessions (OMP / oh-my-pi + Claude Code, this
  repo + the sibling brainstorm repo) into durable Mizan knowledge. Load this whenever the
  user wants to "capture everything we know", "mine/distill the session history", "what did we
  decide across all sessions", "find contradictions across sessions", "refresh the
  session-history register / KNOWLEDGE-MAP", "audit the docs against what actually shipped", or
  whenever you must reconstruct decisions/rationale/reversals that live only in old chat
  transcripts and not in docs/. It carries the discovery+extraction script AND the
  map-reduce method (distill -> reduce -> reconcile) so the next agent does it correctly and
  cheaply instead of re-deriving the parsers and re-burning ~1.5M tokens by reading raw logs.
---

# Mizan knowledge mining

Agent sessions are where decisions, rationale, and reversals are actually made — but chat is
ephemeral and the transcripts are huge (the Mizan history is **~176 sessions / ~1.7M signal
tokens** across two tools and two repos). This skill turns that firehose into a small set of
durable, navigable artifacts **without** reading raw logs into your own context.

This skill is the **how**. The deterministic extraction lives in
[`scripts/mine_sessions.py`](scripts/mine_sessions.py). The findings it produced last time
live in `docs/references/session-history/` (the register + per-domain syntheses) — read those
before re-mining; you are usually *refreshing*, not starting cold.

> **Living baseline, not a ceiling.** The thresholds, batch sizes, and domain cuts below are
> the current best-known recipe — improve them when the work reveals better, and update this
> skill + `references/` in the same batch.

## When to use / not use
- **Use** to build or refresh the session-history register, hunt cross-session contradictions,
  audit doc-vs-shipped drift, or recover rationale that never made it into `docs/`.
- **Don't** use for a single known session (just `read` it) or for current-state questions
  (those are answered by `docs/CURRENT-STATE.md`, `guides/`, `decisions/` — read those first).

## Hard rules (learned the expensive way)
1. **Never read raw transcripts into the orchestrator.** They are ~MBs each with megaline
   tool-output. Always go through the script's signal-only extraction, then subagents.
2. **Subagents WRITE their digest to a file**, then return a 3-line confirmation. Returning a
   long digest inline gets truncated — the first run lost two whole digests this way.
3. **Distillation is reasoning — never offload it to `quick_task`/`explore`.** Use `task`
   subagents (full capability). Read-only agents can't write the digest file anyway.
4. **The current docs are the authority on *current state*; sessions are the authority on
   *how it changed and why*.** Guides deliberately omit history (see `docs/README.md` Doc
   Rules), so the mining output's unique value is the evolution + drift axis. Do not paste
   session findings over current-state docs — surface drift as `[VERIFY-DOC]` and reconcile
   deliberately.

## The pipeline (map-reduce)
Full detail + exact subagent prompts in [`references/pipeline.md`](references/pipeline.md).

### 1. Extract (deterministic — the script)
```bash
# profile only (writes nothing) — always do this first to sanity-check discovery
python3 .agents/skills/mizan-knowledge-mining/scripts/mine_sessions.py \
    --list --include-brainstorm --current-session <THIS_SESSION_ID_8CHARS>
# then write batches + manifest.json into the scratch dir
python3 .agents/skills/mizan-knowledge-mining/scripts/mine_sessions.py \
    --include-brainstorm --current-session <THIS_SESSION_ID_8CHARS>
```
It discovers the three stores (`references/stores.md`), parses the three transcript
formats (`references/transcript-formats.md`), drops trivial sessions (`--min-chars`, default
20000), and bin-packs the rest into `<out>/batches/batch-NN.txt` (+ `manifest.json`), each
≤ `--cap` chars (default 300K = subagent-sized). Default `--out` is `.omp/exports/_extracted`
(gitignored scratch — these are reproducible, do **not** commit them).
> Find `<THIS_SESSION_ID>`: the 8 hex chars after the date in this session's own filename
> under `~/.omp/agent/sessions/<slug>/` — exclude it so you don't mine yourself.

> **Another agent (Cursor / Aider / Codex / Cline / …)?** The pipeline is agent-agnostic — only
> extraction is agent-specific. Add a store + parser per
> [`references/extending-to-other-agents.md`](references/extending-to-other-agents.md) (reuse the
> built-in generic OpenAI-style JSONL/JSON parser; bespoke for Aider Markdown / Cursor SQLite),
> register it in the script's `# 4. OTHER AGENTS` hook, and steps 2–5 below are unchanged.

### 2. Distill (map — one `task` subagent per batch)
Dispatch one `task` subagent per `batch-NN.txt`. Each reads its whole batch via consecutive
ranged reads, writes a structured digest to `<out>/digests/batch-NN.md`
(format in [`references/output-templates.md`](references/output-templates.md)), returns a
3-line confirmation. Run in waves (~12 per `task` call). Re-dispatch any digest that comes
back thin.

### 3. Reduce (one `task` subagent per domain)
Concatenate digests chronologically into `digests/ALL.md`. Dispatch ~8 domain-expert
subagents (workflow · roles/desks · komite · documents · ai-pii · engine-data · uiux ·
infra-seed-process). Each reads `ALL.md` and writes `synthesis/NN-<domain>.md` with two
sections: **consolidated knowledge** + **contradictions/reversals/evolution timeline**
(cite session ids; flag doc drift as `[VERIFY-DOC]`).

### 4. Reconcile (you, the orchestrator)
Read the 8 syntheses and write `KNOWLEDGE-MAP.md`: sources mined, era timeline, one-screen
canonical facts, the **OPEN contradictions** register, the **`[VERIFY-DOC]` drift** list, and
the resolved-reversal history. This is the only step you do in your own context.

### 5. Promote (durable output)
Copy the refined layer — `KNOWLEDGE-MAP.md` + `synthesis/` — into
`docs/references/session-history/` with a dated "derived artifact" banner, and add/refresh one
index row in `docs/README.md`. Leave `batches/`/`ALL.md`/`digests/` in scratch (regenerable).
If the mining was a substantial thinking pass, drop a slim `docs/sessions/<date>-slug/README.md`.

## Cost & scale notes
- Extraction: seconds, stdlib only, ~free.
- Distill+reduce: ~1.5M tokens of subagent work for the full Mizan history. Re-running from
  scratch is expensive — prefer incremental: `--min-chars` higher, or mine only sessions newer
  than the register's last-reviewed date (filter `manifest.json` by `start`).
- The register's `[VERIFY-DOC]` list is the highest-value output: it's the actionable
  doc-vs-shipped audit. Act on it (or hand it to the user) rather than letting it rot.

## Verify before "done"
- `python3 scripts/mine_sessions.py --list` runs clean and the session count looks sane
  (no store silently returning 0 — that means a path/slug mismatch; see
  `references/stores.md`).
- Every `batch-NN.txt` has a matching `digests/batch-NN.md`; every domain has a `synthesis/`.
- The promoted `docs/references/session-history/` files carry the dated banner and are linked
  from `docs/README.md`.
