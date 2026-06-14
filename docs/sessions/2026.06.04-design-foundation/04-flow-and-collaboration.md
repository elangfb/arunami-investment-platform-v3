# Flow detail + the collaboration philosophy

The interaction spec, the philosophy that emerged from it, and two reversals. Captured durably in
`../../designs/workflow-engine.md` (§Design principles, §Interaction spec) and the North Star banner.

## The interaction spec

Built a per-step **user-action → system-effect** spec for all 16 steps + branches, then detailed it to
the **desk-work mechanic** level (grounded in real code fields: `legalVerification` pass/fail+reason,
`analysis` 5C+1S, `financialInputs`→`hardGates`, `extractionSources` OCR-confirm, `komiteVotes`,
`disbursementConditions`). Later moved the OCR detail *into* the spec so it reads top-to-bottom in one
place (the user wanted a single linear read, not cross-references).

## The philosophy that emerged

It crystallized from the user's question: *"how does Mizan not bottleneck a team that already works
closely and is ~90% aligned by the time a deal reaches Komite?"* The answer became the design spine:

- **Mizan records, doesn't gate.** It is a system of record + audit, not a straitjacket for the team's
  collaboration. If it slows them down, it has failed.
- **Two-axis RBAC** — open read visibility (anyone authenticated can view, incl. draft MUAP) but
  desk-scoped action. Visibility is pull; tasking is push. (Lets Risk *preview* a draft + be @mentioned
  without being *tasked* with every draft — an alternative path, not the main one.)
- **Proposal vs workflow** — the deal's data (akad, plafond, terms) is a mutable proposal RM revises
  freely pre-Komite; the state machine tracks only formal milestones. Negotiation loops are edits, not
  state edges → no state explosion.
- **Parallel-by-default Phase A** + desks re-open on input change; pre-submit = total freedom.
- **Gates are confirmatory, not deliberative** — fast one-click + QR, since alignment happened informally.

## The North Star it produced

**Mizan = neraca tepercaya (ميزان).** It *weighs and remembers* a human financing process — it does not
*drive* it. Value = trustworthy memory + accountability, not control. Enshrined at the top of
`../../README.md` and `../../designs/workflow-engine.md` as the decision filter: *"more trustworthy /
frictionless ledger → do it; controller / bottleneck → reject."*

## Two reversals in this area

- **Akad: immutable → mutable.** I had documented "akad set at intake, immutable." The user corrected:
  the bank can **counter-offer a different akad** ("bisa segini tapi akad B"), and pre-Komite is loopy.
  Reversed to **akad = a mutable proposal parameter, frozen at the Komite decision**, formalized at SP3.
  (Updated `workflow-target.md` + `akad-types.md`.)
- **Risk reject: dropped → restored.** I leaned on our own (unverified) diagram and wrongly recommended
  removing the terminal `risk-reject`. The user clarified Risk Analyst has **both**: (a) **reject** (too
  risky) → closes the app + notifies RM, who informs the customer off-system; (b) **send-back** for a
  MUAP edit → back to step 6, not a reject. Restored both; added the invariant that **editing a signed
  document voids its signatures → the ladder restarts**.
