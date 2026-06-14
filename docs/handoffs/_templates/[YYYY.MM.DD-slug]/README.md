# Handoff — <YYYY.MM.DD> <slug>

Forward baton for the next agent on non-trivial unresolved work. Reference artifacts **by path** (don't duplicate
plans / ADRs / diffs). Retire/delete when consumed.

- **Valid until / retire when:** <condition, date, or resumed/closed signal>

<!--
Simple handoff: keep the baton sections below in this README.
Dense single-scope handoff: keep README as a cover, move details into sibling files using
`[topic].md`, and add `## In this folder` linking every sibling. Different scopes need separate
handoff folders.
-->

## State

<Where things stand right now. Link current plan/state instead of restating durable facts. If this links a session record, use `docs/sessions/<YYYY.MM.DD-slug>/README.md`.>

## Key files

- `<path>` — <why it matters>

## Blockers / open questions

<What's stuck, undecided, or risky.>

## Suggested skills

- `<skill-name>` — <why the next agent should load it>

## Next steps

1. <the very next action>

## In this folder    <!-- dense handoffs only; delete for simple handoffs -->

<!-- Link every sibling if details were split out; delete unused example bullets. -->

- `state.md` — <one-line blurb>
- `blockers.md` — <one-line blurb>
- `next-steps.md` — <one-line blurb>
- `<topic>.md` — <one-line blurb>
