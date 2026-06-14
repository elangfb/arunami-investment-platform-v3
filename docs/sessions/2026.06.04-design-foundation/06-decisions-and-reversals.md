# Decision ledger + the reversals

The decisions made this session (linked to their canonical home) and — the high-value part — the
**reversals**: where we changed our mind and why. Reasoning lives in the linked artifacts; this is the index.

## Decisions (→ canonical home)

| Decision | Home |
|---|---|
| Workflow target = SOP-anchored 16-step; RM-hub; two-layer desk/role; scope boundary | `../../decisions/0003-workflow-target-and-rbac.md`, `../../designs/workflow-target.md` |
| Engine = command-sourced, ledger-backed, snapshot-authoritative (NOT event-sourced) | `../../decisions/0004-workflow-engine-command-sourced.md`, `../../designs/workflow-engine.md` |
| QR signing = Mizan-generated, long single-use token, insertInlineImage via external QR API, internal verify | `../../designs/document-system.md` §Signing |
| Document system = one-way NamedRange fill + Markdown read-back; sync-back/lost-in-doc dropped; tokens re-targeted | `../../designs/document-system.md` |
| AI-assist = advisory-only invariant + recommendation points + counter-offer + doc-creation triggers | `../../designs/ai-assist.md` |
| Mizan records-not-gates · two-axis RBAC · proposal-vs-workflow · parallel Phase A | `../../designs/workflow-engine.md` §Design principles |
| North Star = neraca tepercaya | `../../README.md`, `../../designs/workflow-engine.md` (banner) |
| SLA-breach = projection+notify (V1); cutover = reset/reseed (no prod data); realtime = polling V1 | `../../designs/workflow-target.md`, `../../planning/realtime-notifications-sse.md` |
| Bersyarat = SP3 written; informal nasabah confirm out-of-system; RM closes nasabah-decline | `../../designs/workflow-target.md` |
| W1 source-mining (confirmed vs still-unknown) | `../../references/discovery-open-questions.md` |

## Reversals — where we changed our mind (and the trigger)

These are the moments worth remembering; each is a case of *not* anchoring on the first answer.

1. **Full event-sourcing → command-sourced.** Trigger: oracle second-opinion surfaced the split-truth
   trap; ES was over-engineered for the domain (gate facts are documents, not transitions).
2. **Akad immutable → mutable pre-Komite.** Trigger: user domain knowledge — the bank can counter-offer
   a different akad; pre-Komite is iterative.
3. **Risk `risk-reject` dropped → restored.** Trigger: I had leaned on an unverified diagram; user
   clarified Risk has both a terminal reject and a (separate) MUAP-edit send-back.
4. **Document v2 bidirectional → one-way.** Trigger: user critique — the variable target was wrong, and
   the fragility was entirely from bidirectional sync; one-way + Markdown read-back removes it.
5. **Realtime SSE-now → polling V1 (SSE deferred).** Trigger: user call — don't over-build; transport is
   non-load-bearing behind `Decision.effects: Notify`.
6. **QR PDF-stamp → insertInlineImage + external QR API.** Trigger: user preference; verified base64 is
   impossible (2 kB URI cap), so an external render API is the path.
7. **"Cek harga" placed at RM → at the Appraisal desk.** Trigger: re-verifying that Appraisal ≠ RM.

## Honesty notes

- The reject/send-back/terminal layer in the workflow diagram is **our inference**, not slide-sourced —
  flagged for W1.
- A documentation checkpoint near the end fixed gaps: a stale CURRENT-STATE doc line, the iteration task
  list, and inline DROPPED markers on the superseded v2 tasks (T8/T10).
