# Pipeline — map-reduce method + ready-to-use subagent prompts

The full recipe. Steps 1, 4, 5 are orchestrator work; steps 2–3 fan out to `task` subagents.
Copy the prompt scaffolds below; they are what produced the current register.

## Step 1 — Extract (deterministic)
Run the script (see SKILL.md). Outputs `<out>/batches/batch-NN.txt` + `manifest.json`.
Sanity-check the `--list` table: each store should report a non-zero substantive count, and
the era spread should look right (Mizan: brainstorm May 14–Jun 2, Claude Code May 16–Jun 1,
OMP Jun 3–8 — non-overlapping; the dev migrated tools).

**Incremental refresh** (cheaper than full re-mine): read the register's "Last reviewed" date,
then mine only newer sessions — filter `manifest.json` entries by `session.start > <date>`, or
raise `--min-chars`, and only distill those batches; merge into the existing syntheses.

## Step 2 — Distill (map: one `task` subagent per batch)
Dispatch in waves of ~12 tasks per `task` tool call. Shared `context` once; per-task
`assignment` names the batch file. **Each subagent writes its digest to a file** and returns a
3-line confirmation (return-inline gets truncated).

`context` (shared):
```
# Goal
Distill a batch of prior agent-session transcripts from the Mizan project (OJK-regulated
Indonesian Sharia financing-origination app: RM-led origination, MUAP/RSK docs, Rapat Komite,
maker-checker, hard-gates, PII masking, Google Docs gen). We mine the ENTIRE history for
durable knowledge AND all contradictions/reversals; the orchestrator reconciles against
current docs.
# Era context (assignment says which)
cc = Claude Code early (May), foundational, later reorganized. br = brainstorm repo (design
predecessor). omp/omp-export = recent (June), closest to shipped + most authoritative.
# What a batch file is
.omp/exports/_extracted/batches/batch-NN.txt — signal-only transcripts (USER + ASSISTANT
text; tools/thinking stripped), sessions delimited by `# SESSION / # TITLE` banners.
# Method
1. Read the WHOLE file via consecutive ranged reads (:1-1500, :1500-3000, … to EOF). Do NOT
   stop after the first chunk.
2. Distill as you go, keyed per session id.
3. WRITE the digest to .omp/exports/_extracted/digests/batch-NN.md. Return only a 3-line
   confirmation (path, bytes, # decisions).
# Constraints
MAY read .omp/exports/_extracted/** and docs/. MAY WRITE ONLY your digests/batch-NN.md. No
source edits, no gates. Be concrete + dense (exact paths/symbols/enums/roles/dates, short
verbatim quotes for contradictions). Preserve reversals (X then ¬X → both + final). Flag pure
ops/noise sessions in one line.
# Digest structure — see references/output-templates.md (per-session blocks + batch rollup).
```
Per-task `assignment`: `Batch file: .../batch-NN.txt (~NNN K, <store>, <session list>). Follow
the shared-context method. Write to .../digests/batch-NN.md.` Re-dispatch any digest that
returns thin (<~8 KB for a multi-session batch).

## Step 3 — Reduce (map: one `task` subagent per domain)
Concatenate digests chronologically (brainstorm → cc → omp → omp-export) into
`digests/ALL.md`. Dispatch ~8 domain experts. Domains used (adjust to the project):
`workflow · roles-desks · komite · documents · ai-pii-compliance · engine-data · uiux ·
infra-seed-process`.

`context` (shared): "You are a domain expert doing the REDUCE step. Read the WHOLE
`.omp/exports/_extracted/digests/ALL.md` (~145K tokens; ranged reads to EOF). Write a
synthesis for YOUR domain only, to `.omp/exports/_extracted/synthesis/NN-<domain>.md`, with
exactly two sections: (A) `<Domain> — consolidated knowledge` (dense, dedup, state the FINAL
position, favor OMP/most-recent when eras disagree); (B) `<Domain> — contradictions, reversals
& evolution` (timeline: EARLY position+cite → change → FINAL+cite, RESOLVED vs OPEN; flag
candidate current-doc drift as `[VERIFY-DOC]`). MAY read `.omp/exports/_extracted/**` + `docs/`
(minimal). MAY WRITE ONLY your synthesis file. Cite session ids; short verbatim quotes for
contradictions; every line a fact."
Per-task `assignment`: name the domain + its scope keywords (give it the vocabulary so it
catches everything — e.g. for workflow: stage model 6-vs-4, transitions, send-backs,
SP3/Akad/Pencairan, SLA/Jakarta-clock).

## Step 4 — Reconcile (orchestrator, in your own context)
Read the 8 syntheses (~60K tokens total — fits). Write `KNOWLEDGE-MAP.md`:
1. Sources mined (table) + era timeline. 2. North Star / decision filter. 3. One-screen
canonical current facts. 4. **OPEN contradictions** register (the live, unresolved items).
5. **`[VERIFY-DOC]`** drift list (candidate doc-vs-shipped staleness — the actionable nugget).
6. Resolved-reversal history (evolution, so the *why* survives). 7. Reusable engineering
gotchas.

## Step 5 — Promote (durable)
Copy `KNOWLEDGE-MAP.md` + `synthesis/` into `docs/references/session-history/` with a dated
"derived artifact" banner (so readers don't mistake evolution-history for current truth);
refresh one row in `docs/README.md`. Keep `batches/`, `ALL.md`, `digests/` in gitignored
scratch (the script regenerates them). Drop a slim `docs/sessions/<date>-slug/README.md` if it
was a substantial pass. If `[VERIFY-DOC]` items are real drift, reconcile the actual docs (or
hand the list to the user) — don't let it rot.

## Pitfalls (all hit on the first run)
- Subagent returns digest inline → truncated, knowledge lost. → write-to-file + confirm.
- Reading raw `.jsonl`/`.html` via the `read` tool → megaline garbage. → always via the script.
- `eval`/`bash` can't see `~/.omp/sessions` → wrong path; it's `~/.omp/agent/sessions`.
- Offloading distillation to `explore`/`quick_task` → shallow + can't write. → `task` only.
- One giant session (>cap) becomes its own batch — fine; tell that subagent it's one big file.
