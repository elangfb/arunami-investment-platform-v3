# ADR-0005: Rapat Komite — signed minutes (MoM) are the decision, not in-app voting

- **Status:** accepted
- **Date:** 2026.06.04
- **Supersedes:** the committee-voting assumption in ADR-0003 (per-member `castVote` + computed quorum/majority).

## Context

The as-built committee records a decision by having each `komite` member click a vote
(`castVoteAction`), with `quorumFor` (2/3 of attendees) + `calculateMajority` (strict majority)
computing the outcome, and the chair finalising via `submitDecisionAction`.

That is the committee version of the "signature theater" we deleted for MUAP/RSK (ADR-0003 maker-checker):
**the real Rapat Komite decides in the room** (online or offline) — Mizan clicking votes does not make
the decision more real, it just fabricates a record of one. The binding artifact in real banking is the
**signed notulen (Minutes of Meeting / MoM)**, due ≤ H+1 business day. So Mizan should *orchestrate the
meeting and capture the signed minutes + outcome*, not pretend to be the voting booth — the same
principle (record the signed artifact, don't fabricate the decision) already adopted for the documents.

Most of the infrastructure already exists: `KomiteMeeting` (attendees, chair, agenda, room/url,
minutes + H+1 SLA), the meeting scheduler + auto-materializer, the QR/`ApprovalStep` signature ledger
(MUAP/RSK), and MoM generation. This is largely *removing* voting and *re-centering* on the MoM.

Human decisions locked over 2026.06.04 (see `../references/session-history/03-komite.md` + git history).

## Decision

**Remove in-app voting.** Mizan handles the Rapat lifecycle and records the signed minutes:

1. **Chair sets the outcome** per application — `Approved` / `Conditional` (notes **required**) /
   `Rejected` (notes **required**); `Approved` notes optional. May be recorded live during the meeting,
   independent of MoM drafting.
2. **MoM is per-application** (one notulen per app decision), drafted manually; deck/konten is also
   **per-app**. The "Rapat" is the scheduling/agenda container grouping several per-app decisions.
3. **MoM signing is unordered attestation** (not the ordered MUAP/RSK ladder): all attending Komite
   sign in any order, reusing the `ApprovalStep` ledger with a set-membership completion rule.
4. **Routing fires when the MoM is final = every attending Komite member has QR-signed it.** Required
   signers = the attending Komite (≥ 2 to be quorate — config default, W1). Added participants attest
   but are **non-blocking** (a no-show must not freeze a financing decision).
5. **First signature freezes the MoM's decision content** (time, outcome, notes) — further edits void
   the signatures (mirrors MUAP/RSK edit-voids-signatures).
6. **Risk veto stays structural:** a risk-`Reject` app never enters the Komite queue (terminal at Risk
   Review). The queue is only frozen-RSK apps with risk recommendation ∈ {approve, conditional}.
7. **Attendance:** ≥ 2 Komite (config, W1). Optional **involved-team** participants — "select group" =
   all actors who touched this app (from assignments + the `ApprovalStep` ledger), then deselect; or
   per-person. Added participants sign as **attestation/witness** ("I attended"), not as deciders.
8. **CRO conflict-of-interest soft-flag preserved** (a CRO who signed the RSK and attends/signs the MoM
   is flagged, never blocked).
9. **Conditional** carries its conditions; the binding terms flow into SP3 (per ADR-0003 Bersyarat).

## Consequences

- Deleted: `castVoteAction`, `KomiteVoting`/`SessionVoting`, `quorumFor` (vote quorum),
  `calculateMajority`, and the vote-based decision path of `submitDecisionAction`.
- The decision's audit record is the **signed per-app MoM** + the `ApprovalStep` signature rows — no
  individual-vote records. (Banks minute attendance + signatures, not necessarily individual ballots.)
- Meeting lifecycle becomes mostly **derived**: `ongoing` = past scheduled time and not yet
  MoM-finalised; time is editable until the MoM is drafted (free), with a confirm after draft, and
  frozen once any signature lands.
- Reuses the meeting + QR-ledger infra; no new signing primitive, only an unordered completion rule.
- W1 still ratifies the finer config: Komite quorum/composition (the "min 2"), per-app vs whole-session
  finalisation granularity if a session MoM is ever wanted, and per-attendee online/offline modality
  (deferred).
