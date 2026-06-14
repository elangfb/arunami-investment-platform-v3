# ADR-0015: RM administers Rapat Komite via a separate `komite-admin` desk

- **Status:** accepted
- **Date:** 2026.06.10

## Context

In Mizan the Komite barely works inside the app: members check the dossier, the chair records the
outcome, attending members QR-sign the MoM. The person who actually *coordinates* the session —
proposes the time, fixes the agenda, lines up attendees, corrects who really showed up — is the **RM**,
who talks to the committee outside the app (the real-world flow; cf. North Star: "Mizan mencatat, tim
koordinasi informal").

Two concrete problems blocked modelling that (roadmap gaps #18/#19):

1. **Desk overload.** The single `komite` desk gated *both* session administration (schedule/confirm/
   cancel/reschedule, six `assertDesk('komite')` call sites) **and** committee membership — `committeeRoster()`
   and `momRequiredSignerIds` derive the required MoM signers. Granting `komite` to RM so they could
   administer sessions would also make RM a **required MoM signer** and chair-eligible — violating the
   integrity line that RM never records the decision and never gates the MoM.
2. **No-show deadlock.** Attendees were frozen at schedule time with no edit action. A registered Komite
   member who didn't attend stayed in `momRequiredSignerIds` forever, so the MoM could never complete.

Authority changes (who may do what) are hard to reverse and audit-relevant → an ADR. Fork §4.5 was
DECIDED 2026.06.10 as option (a): desk-based, loose ("semua pemegang `komite-admin` boleh kelola semua
sidang"; conflicts resolved outside the app, Mizan records who-did-what append-only).

## Decision

Split the desk. Introduce a cross-cutting, non-stage desk **`komite-admin`** (sekretariat sidang):

- **`komite-admin` gates session administration** — `scheduleMeetingAction`, `confirmProposedMeetingAction`,
  `cancelProposedMeetingAction`, `editMeetingTimeAction`, and the new `updateMeetingAttendeesAction`.
  Held by **RM** (added to the `relationship-manager` role bundle). It is NOT a stage owner
  (`STAGE_OF_DESK['komite-admin'] = null`), carries the inert `MG` pipeline role, and is NOT in
  `committeeRoster()` (which stays `role === 'CM'`), so a holder is **never** a required MoM signer,
  chair, or decision recorder.
- **`komite` stays pure membership** — roster, MoM signing, chair-eligibility. `setKomiteOutcomeAction`
  (chair-only) and `signMomAction` (attending members) are **unchanged**. `recordMeetingMinutesAction`
  stays `komite` + chair-only (the chair authors the notulen).
- **New `updateMeetingAttendeesAction`** lets the sekretariat correct real attendance, mirroring the
  reschedule freeze: allowed only while the meeting is proposed/upcoming, **FROZEN once any agenda app's
  MoM carries a signature** (a signed record fixes who was present), the chair must remain an attendee,
  the list can't be emptied. Quorum is not checked here — it is enforced at finalisation by `momComplete`
  (≥ `MIN_KOMITE_QUORUM` = 2). The change is audit-logged (`komite.attendees_updated`: by + before→after).

Integrity lines that do NOT move (fork §4.5): the decision is recorded **chair-only**; RM is **never** a
required MoM signer; signatures stay personal. COI (RM picks who signs) is accepted consciously, mitigated
by append-only audit and a config-raisable quorum — not by adding an approval flow.

## Consequences

- RM can run the whole session lifecycle without ever becoming a committee member or signer; the
  no-show deadlock is recoverable (drop the absentee → `momRequiredSignerIds` shrinks → MoM finalises
  while still quorate). UI affordance equals server authority (controls show for `komite-admin`).
- Pure Komite members **lose** session-management actions (by design). If a person should do both, grant
  them both desks via config — least-privilege, explicit.
- No DB migration: desks are config (TS union + role bundles, resolved in `verifySession`). Builds on
  ADR-0005 (signed-MoM-as-decision) and is orthogonal to it.
