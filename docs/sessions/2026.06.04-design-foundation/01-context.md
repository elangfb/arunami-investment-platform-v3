# Context & frame

Where the session started, what it was for, and how we worked.

## Starting point

Picked up from a prior handoff: the brainstorm→mizan knowledge merge was committed, and ADR-0003
(workflow target + RBAC) was being drafted. The repo had an as-built 6-stage pipeline; the Hijra SOP
slides (arrived 2026-06-02) had just revealed the real process, which differed from our earlier model.

## The goal evolved across the session

1. First: **mature/finalize all design before the build phase** — make sure the knowledge layer was
   complete and self-consistent before handing to an implementing agent.
2. Then reframed by the user to **demo-first**: "Mizan jadi dulu, rough edges OK — but the work stays
   correct, not sloppy." Build the demoable happy path correctly; defer edge polish.
3. Then: **verify the flow is technically correct before gas-ing implementation** — which drove the
   from-scratch rethinks (engine, document system) rather than building on shaky foundations.

## Working mode

The user explicitly set the relationship: **"act as my lead developer and co-pilot."** Operating
contract adopted: hold the map (CURRENT-STATE = the one page), drive execution, decide-small /
surface-big, protect the safety-critical areas, checkpoint in small verified batches. The user felt the
project was large/overwhelming; the response was to compress scope into a legible 5-step road and carry
the load.

## Constraints that shaped everything

- **Highly regulated domain** (OJK-supervised Islamic financing) → audit-first, append-only, masking,
  in-region. Docs are part of the work.
- **Low volume** (~30 applications/month, confirmed from Hijra proposal docs) → optimize for
  **correctness + auditability + maintainability**, not throughput. This justified rejecting heavier
  architectures.

## Tooling caveats (for the next reader)

`web_search` and the `task`/`explore` subagents intermittently failed with a "long context beta"
subscription error mid-session. The `oracle` consult worked once (it drove the engine decision). W1
source-mining and the kocek study were therefore done manually via the `read` tool.
