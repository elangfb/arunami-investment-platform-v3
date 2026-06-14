@WORKING-AGREEMENT.md

## Doc-writing norm (standing)
Write every doc for a **less-capable reader**: a smaller/open-source AI agent or a human skimming without conversation context. Concretely: define or link every term of art on first use (no conversation-relative shorthand — a fork/decision code like "A1" must point to the table that decodes it); prefer full sentences over fragments; one unambiguous home per fact with explicit relative-path links (never "see above"/"as discussed"); state what is BUILT vs DESIGNED vs PROPOSED explicitly on any claim a reader might act on. If a doc needs the reader to have been in the room, it is not done.

## Build posture (current — 2026.06.11, revisit)
Early-dev. **Prefer change-for-better over preserving prior decisions** — an accepted ADR is the *current contract*, not an immovable constraint; if it blocks the better design, **slate it for revision** (note it + supersede on build) rather than work around it silently. **PII/compliance is parked as a forward design constraint** (not deleted): build the happy path; the masking seam stays wired as a config-flag no-op (`PII_MASK_ENABLED`, default off) and **re-enables at OJK W1 ratification**. Scope + rationale: `docs/designs/rm-led-pipeline-redesign.md`.

## Delegation / pi workers
For safety-critical Mizan work, use at least medium-tier pi: hard-gates, OJK/audit behavior, finance calculations, auth/session boundaries, OCR/PII masking, generated/build artifacts, and deletion/refactors with unclear blast radius.

## Adaptive learning
Treat docs as part of the work. When a non-trivial change creates a durable convention, fixes a non-obvious bug, or reveals a gotcha, update the relevant knowledge surface in the same batch.

- Root `AGENTS.md` — universal repo rules and anti-patterns.
- App-local `AGENTS.md` files — app-specific commands, conventions, file maps, and gotchas.
- Relevant skills — `.agents/skills/<skill>/SKILL.md` and references.
- Guides/plans — durable guides in `docs/guides/`; active plans in `docs/planning/`.
- In-repo memory — `docs/MEMORY.md` — slim, one line per entry: cross-cutting reusable learnings/gotchas (exception list; not completed-work history/status).
- `.pi/FEEDBACK.md` — pi-worker output that missed the bar.

Prefer correcting or condensing existing guidance over adding duplicates. If a documented fact becomes wrong, fix it.

## Project knowledge

Where to read and write durable context. Update the right layer in the same batch as any change that touches it. Use `YYYY.MM.DD` for dates in docs.

| Layer | Answers | Home |
|---|---|---|
| Acceptance | what "done" means per feature — 1 sumber kebenaran + 1 demoable kalimat acceptance; **read before building/reviewing a feature** | `docs/references/feature-acceptance.md` |
| Current state | live facts/limitations true now; not roadmap/backlog | `docs/CURRENT-STATE.md` |
| Glossary | what the words mean | `docs/GLOSSARY.md` |
| Decisions | accepted/superseded rationale for hard-to-reverse choices | `docs/decisions/` · `_templates/` = ADR shape |
| Map | where code lives | `AGENTS.md` (this file) |
| In-flight | what's being worked on now | `docs/planning/` (active-only, see `README.md`) · `_templates/` |
| Reference | standing consulted material / living registers with owner/review | `docs/references/` · `_templates/` |
| Design specs | durable system blueprints and conventions | `docs/designs/` · `_templates/` |
| Guides | human-facing how-tos / how-it-works docs | `docs/guides/` · `_templates/` |
| Session record | backward: substantial thinking/research/planning, not task logs | `docs/sessions/<YYYY.MM.DD-slug>/README.md` · `_templates/` |
| Handoff | forward: non-trivial unresolved continuation baton; retire when consumed | `docs/handoffs/<YYYY.MM.DD-slug>/README.md` · `_templates/` |
| Standing memory | slim one-line-per-entry catch-all for cross-cutting reusable learnings/gotchas; not history/status | `docs/MEMORY.md` |

**In-flight is active-only.** A plan exits in its closing batch — promote durable facts/rationale/design to the right layer, digest-then-delete, or delete. Abandoned work only touches memory if it leaves a cross-cutting lesson. A plan whose body says BUILT/DONE while still in `docs/planning/` is a visible bug.

**Session vs handoff:** create a session record only for substantial thinking sessions (design/research/planning), not routine progress logs. Create a handoff only for non-trivial unresolved continuation work; retire/delete it when consumed. Neither is created every session.

## Universal rules
- Read app-local `AGENTS.md` files before changing app code.
- Verify before done: run the relevant checks, and for UI work include a Playwright smoke when feasible.
- **Status claims cite proof.** Any "done/built/shipped/works" claim — in docs, commits, or a status line — must state its verification level: **typecheck · test · live-demo**. An unverified "done" is a bug; write the honest state instead ("built, typecheck-only", "wired, not yet run"). Before trusting a doc's status, check it against the code — claims drift (a plan reading "code not started" while half is shipped is the failure this rule prevents).
- Highest-stakes areas get the strictest bar: data masking, audit trail, OJK compliance, MUAP/RSK templating, auth/session boundaries, finance calculations, and stage/hard-gate behavior.
- GitHub Actions: pin every `uses:` to the latest major version of the action.
