# Output templates — digest + synthesis shapes

Exact shapes the subagents must produce. Consistency here is what makes the reduce step (and
later diffing across refreshes) work.

## Step 2 output — per-batch digest (`digests/batch-NN.md`)
One block PER SESSION in the batch, then a batch rollup. Dense; every line a fact; exact
identifiers; short verbatim quotes for any contradiction.
```markdown
## batch-NN — <store>, <date range>

### [<id8>] <title or topic> (<YYYY.MM.DD>)
- **Decisions:** <what was decided + why>
- **Durable facts / conventions / architecture:** <data model, enums, roles/desks, stages,
  file/dir conventions, naming, APIs, symbol names, file paths>
- **Gotchas / pitfalls:** <non-obvious bugs, footguns, "must do X or Y breaks">
- **Open / deferred:** <unresolved, punted, W1-gated>
- **Reversals within session:** <X stated then changed to ¬X; final state>

### [<id8>] … (repeat per session)

### Batch rollup
- Cross-session reversals/themes within this batch; anything that looks superseded by later
  work. One line per pure ops/noise session (e.g. "[abcd1234] fix-CI — no durable knowledge").
```

## Step 3 output — per-domain synthesis (`synthesis/NN-<domain>.md`)
Exactly two sections.
```markdown
# <Domain> — consolidated knowledge
## <sub-topic>
- <dense, deduplicated facts; state the CURRENT/FINAL position; favor the most-recent/OMP-era
  digests when eras disagree; exact symbols/paths/enums/numbers/rationale>
…

# <Domain> — contradictions, reversals & evolution
## Timeline
**N. <topic>**
- **EARLY (<era>, <id8>):** <position> "<short quote>"
- **INTERMEDIATE (<id8>):** <change>
- **FINAL (<id8>):** <position>
- **Status:** RESOLVED | OPEN | AMBIGUOUS
- **[VERIFY-DOC]:** <candidate current-doc drift to confirm against docs/>
```

## Step 4 output — KNOWLEDGE-MAP.md (orchestrator)
Sections, in order:
1. **Sources mined** — table (store · location · sessions · used) + total signal size.
2. **Timeline / eras** — date ranges per store; note overlaps/migrations.
3. **North Star** — the project's decision filter (Mizan: "menimbang & mengingat — tidak
   menyetir"; trustworthy memory + accountability, not control).
4. **Canonical current facts** — one screen: stages, roles, desks, maker-checker, engine,
   documents, AI/PII, storage. The "if you read one thing" summary.
5. **OPEN contradictions / unresolved** — numbered; the live items that are NOT settled.
6. **`[VERIFY-DOC]` drift** — numbered; candidate stale docs vs what sessions show shipped.
   This is the actionable audit — the highest-value output.
7. **Resolved reversals** — bulleted evolution history (so the *why-it-changed* survives even
   though current docs only show the end state).
8. **Reusable engineering gotchas** — cross-cutting footguns worth a memory note.

## Quality bar
- A digest/synthesis line that could be true of any project is noise — cut it. Keep only
  Mizan-specific, identifier-bearing facts.
- Always cite the session id for a claim, especially contradictions.
- Mark inference vs observed: if the corpus is silent, say nothing (don't infer current state).
- Prefer the most recent era as authority for *current* facts; cite older eras for *why/when*.
