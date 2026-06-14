<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

# Rapat Komite & DPS — consolidated knowledge

## Core model: signed-MoM (ADR-0005, OMP Jun 3–4)

The committee model went through a full voting-body phase (brainstorm/CC early era) before being replaced wholesale by the signed-MoM model in ADR-0005. Everything in this document describes the **final OMP-era state** unless otherwise noted.

### No in-app voting

There are no `KomiteVote` records, no per-member vote captures, no quorum math, no majority calculation in the production path. Any seed data with `komiteVotes` populated is stale (session-S4: confirmed empty as of Jun 5). The voting room UI was removed; `komiteVotes` field is only a historical artifact.

### Outcome recording

The **Ketua (chair)** records the per-app decision outcome. This is a unilateral act: only `actor.userId === meeting.chairUserId` may call `submitDecisionAction`. Superadmin bypass is via impersonation only (ADR-0010; chair-bypass removed from superadmin in session-S5 Jun 5–6).

Decision values: `approve | conditional | reject` (English strings, per-codebase convention; Bahasa only in display labels).

### MoM signing chain (`chain='mom'`, unordered)

After the chair records the outcome, all **blocking Komite Pembiayaan members** QR-sign the MoM via `ApprovalStep` rows with `chain='mom'`. Order is **unordered** (no sequential unlock; any signer can sign in any order). Routing to the next stage fires when all blocking signers have signed (`completeMeetingIfAllDecided` trigger).

`qrToken` stored per `ApprovalStep`; stamped into the MoM Google Doc via `insertInlineImage` at the NamedRange anchor. QR token is unique per (signer × document version), scannable forever (not consume-on-scan). External render: goqr.me/quickchart (Google fetches PNG once; copy stored in Doc; no live dependency).

MoM template: `1NHCSqxPVHds3GpZB4_FeaWIIgIMdJhONe-fzVzky2Q4` (live master, as of Jun 8).

### Attendance model: blocking vs attesting

Two tiers of participants per meeting:

- **Komite Pembiayaan members (≥2)** = **blocking signers**: their signatures on the MoM are required; routing is held until all have signed.
- **Involved-team participants (attesting)**: present in the room, recorded, but their signatures do not block routing. Derived from `ApprovalStep` ledger + `StageAssignment` for queued apps via the "select-group shortcut."

`min-attendees` config default = **2** (W1 confirm with Hijra; from `docs/references/config-ratification-w1.md`).

### Risk veto — structural gate, not a committee decision

`riskRecommendation === 'reject'` from the Risk Analyst causes a terminal `close(risk-reject)` + notify RM. Vetoed apps **never enter the Komite queue**. The committee never sees them. This is not a committee decision — it is a pre-committee closure. Defense-in-depth: `actOnChain MUAP-request` at the MUAP→Risk transition already enforces that only `approve | conditional` risk recs advance; the Komite queue is structurally clean.

### Conditional / Reject — notes required

`komiteDecisionNote` is **required** (non-empty) when `komiteDecision === 'conditional'` or `komiteDecision === 'reject'`. Server-enforced via `validateDecisionNote` in `lib/komite-terms.ts` (added session-S1 Jun 3), wired into `submitDecisionAction`. Mirrors `validateApprovedTerms` pattern. Approve = optional.

### CRO conflict-of-interest — soft flag, not hard block

A CRO who has signed an app's RSK chain and sits in that app's Komite session is **flagged**, not blocked. Flag is visible in the Komite room for that app. `rskCroSignerUserId` is a runtime-derived field from `approvalSteps` (not a persisted DB column). Rationale: "tidak selalu ada pilihan anggota lain" — BPRS-scale constraint; audit trail satisfies OJK. (Introduced batch-19 Jun 1; confirmed OMP Jun 3.)

---

## Meeting lifecycle

### Scheduling

`KomiteMeeting` fields: `id`, `date`, `time`, `room?`, `meetingUrl?` (≥1 required; modality implicit from which is filled), `agendaAppIds[]`, `attendeeUserIds[]`, `chairUserId`, `status`.

`MeetingStatus` derived: `Dijadwalkan | Berlangsung | Selesai`.

`isOngoing` = derived from scheduled time (not a persisted state). Auto-schedule via `MeetingScheduleTemplateVersion` (pg-boss, Mon/Wed/Fri cadence; 3 weekly schedule templates). `nextMeetingId` TOCTOU race fixed in batch-10 (May 25): moved into `createMeeting` under a transaction-scoped advisory lock.

### Freeze on first MoM signature

**Reschedule is allowed until the first MoM signature arrives.** A warning is shown if the MoM has been drafted but not yet signed. Once the first `chain='mom'` `ApprovalStep` row is inserted, the meeting is frozen — no further reschedule possible.

### MoM SLA

MoM must be recorded ≤H+1 business day after the meeting. `meetingMomSlaState` computed on `KomiteMeeting`. `recordMeetingMinutesAction` is **chair-only**. `mom` is a `NotificationCategory`; `buildMeetingNotifications` wired into notifications page + sidebar badge.

---

## Post-decision routing

### Approve
→ Stage 6 Pencairan. `disbursementStatus = 'Verifikasi Final'`. `approvedPlafond` / `approvedTenorMonths` / `approvedMarginRate` set (null for profit-share akad). Constraint: `approvedPlafond ≤ requestedPlafond` (server-enforced, `validateApprovedTerms`).

### Conditional
→ RM notified; `conditionalResponse` field awaits nasabah response.
- Nasabah setuju → Stage 6 (`conditionalResponse = 'accepted'`). `komiteDecision` stays `'conditional'` even after acceptance (audit invariant).
- Nasabah tidak setuju → terminal `closed` (`closeReason = 'nasabah-decline'`).

### Reject
→ RM notified. `closeReason = 'committee-reject'`. Terminal.

`disbursementOpen(app)` predicate = `approve OR accepted-conditional`.

---

## DPS model

### Final position (OMP, Jun 3–4)

**DPS always signs every RSK** — per-deal, unconditional. DPS is the **final signer** in the RSK approval ladder after CRO. The RSK chain: `rsk-author (RA) → rsk-approve-officer (RO) → rsk-approve-cro (CRO) → rsk-sign-dps (DPS)`. DPS reject sends back to Risk Analyst (chain restart, not terminal close).

`rsk-dps` desk exists in the desk catalog. `S5-DPS-REVIEW` as a Komite-stage desk was raised in batch-12/13 for cases where `rekomendasi_dps_or_tidak = yes` in the MUAP → conditional gate; current implementation has DPS in the RSK ladder regardless.

This supersedes all earlier positions (see contradictions section).

---

## Komite support tasks (8a/8b/8c)

Three RM-coordinated tasks initialized by the system, gated by desk permissions:

- **8a** Jadwal: schedule the meeting / manage meeting template.
- **8b** Konten/deck: prepare the committee presentation deck per app.
- **8c** MoM: record meeting minutes (chair-only action on `recordMeetingMinutesAction`).

Final owner: **RM** (desk permissions separate; assignable at W1). Source: Hijra SOP slide 2 = RM's checklist items 8/9/10. This was reversed twice during design (see contradictions).

---

## Removed artifacts

The following from the brainstorm/CC early era are **absent from current code**:

- `komiteVotes: KomiteVote[]` — removed (ADR-0005).
- `quorumFor()` / `calculateMajority()` — removed (ADR-0005; replaced by MoM signing).
- `MEMBERS` / `KETUA` constants — removed (per-meeting composition).
- `isEarlyVote` flag on KomiteVote — removed with KomiteVote.
- `castMemberVote()`, "Kirim Suara", "Rekam Keputusan" UI — removed.
- Quorum-progress display in KomiteSeamCard — removed.
- `conditionalFlavor: 'terms' | 'documents'` — deferred to V2, never built.
- `MEMBERS[0]` as static Ketua — per-meeting `chairUserId` replaced it.

---

## Seed data (current, session-S4 Jun 5)

`MEETINGS` in `src/lib/seed-data/meetings.ts`: 3 meetings — 2 upcoming + 1 completed/signed (`MTG-2026-003`). `approvalSteps` array: 39 `chain='mom'` rows, 141 unique `qrToken`s across all chains. `komiteVotes` is empty in all apps.

---

# Rapat Komite & DPS — contradictions, reversals & evolution

## 1. Voting body → signed-MoM model [RESOLVED]

**BRAINSTORM era (May 14 – May 18):** Full voting body. Per-member `KomiteVote` records. `KomiteVote.timestamp`, `KomiteVote.isEarlyVote`. Quorum = `ceil(2/3 × total_members)`. Majority = strict >50% of votes cast. Vote options: `Setuju | Tolak | Bersyarat`. Ketua-last unlock: non-Ketua votes ≥ quorum-1 before Ketua unlocks. "Kirim Suara" per-member persist; "Rekam Keputusan" Ketua-only finalization.

Sessions: `d9ebd10f` (May 18) — full Komite deep-dive committed to `KOMITE.md` (`a8aa8de`). Per-meeting composition introduced in `96c42472` (May 22). `calculateMajority`/`quorumFor` from meeting. Static `MEMBERS` → per-meeting `attendeeUserIds`.

**CC early (May 22 – May 30):** Voting model further refined. `lib/komite.ts` declared single-source-of-truth for all voting rules. `MeetingStatus` enum introduced. KomiteSeamCard surfaces lifecycle in detail page. `submitDecisionAction` asserts `actor.userId === meeting.chairUserId`.

**OMP Jun 3–4 (ADR-0005):** All in-app voting **removed**. No KomiteVote. Chair records outcome directly. Komite QR-sign MoM (chain='mom', unordered). Routing fires on all signed. ADR-0003 committee-voting assumption explicitly overturned. Commit: session-S2/batch-20 large build (~80 commits Jun 4).

→ **RESOLVED**: signed-MoM model is current.

---

## 2. Conditional/Reject note requirement [RESOLVED]

**EARLY (fa02e261, May 14 brainstorm):** "Conditional decisions require message (REQUIRED); Approve = optional; Reject = optional-but-strongly-recommended."

**REVERSAL (af54c0d9, May 16):** "Reject decisions require notes (REVERSED from session fa02e261): both `riskNote` when `riskRecommendation === 'reject'` AND `komiteDecisionNote` when `komiteDecision === 'reject'` are REQUIRED." Conditional = REQUIRED, Reject = REQUIRED, Approve = optional.

**CC early (batch-01 May 18, `47f43b9b`):** `komiteDecisionNote` enforcement: already correctly uses `hasConditional` (any individual `KomiteVote` is 'conditional'), NOT `komiteDecision === 'conditional'`. Brainstorm KOMITE.md had incorrectly described this as a "V2 gap" — corrected.

**Gap confirmed (batch-07 May 24, batch-18 May 21):** `komiteDecisionNote` conditional enforcement not server-enforced — action stores note if present but does not require it. Gap noted multiple times.

**RESOLVED (session-S1 Jun 3):** `validateDecisionNote` pure validator extracted to `komite-terms.ts`, wired into `submitDecisionAction`. Server-enforced for conditional/reject. Unit tests added (`komite-terms.test.ts`).

→ **RESOLVED**: server-enforced since Jun 3.

---

## 3. DPS model [RESOLVED — three positions]

**BRAINSTORM earliest (fa02e261, May 14):** "DPS: not a voter; sampling audit afterwards (~3 nasabah/produk/bulan)." DPS entirely outside the Komite loop.

**INTERMEDIATE (~May 30 – Jun 1):** GLOSSARY and `planning/workflow-rm-maker-checker.md` described DPS as "conditional Stage-5 sign-off" — only when flagged.

**FINAL (brainstorm commits Jun 3, accepted in session-S2 Jun 4):** "DPS always signs RSK per-deal, every app" — unconditional. DPS is the final signer in the RSK chain after CRO. Authority: "brainstorm 06-03 revised DPS; per-topic recency rule: brainstorm 06-03 wins." Applied to GLOSSARY + CURRENT-STATE + plan. `rsk-sign-dps` desk exists.

→ **RESOLVED**: DPS always signs RSK.

---

## 4. Komite support tasks 8a/8b/8c ownership [RESOLVED — double reversal]

**Session batch-20 Jun 3, initial assignment:** "Komite support (8a jadwal, 8b konten, 8c MOM) assigned to Risk Analyst" — because "who else?"

**First reversal (user):** "jadwal dan kontennya juga disamain, dihandle sama Risk Analyst juga" — user initially agreed.

**Second reversal (user):** "yang tadi soal Komite itu, kayaknya gw agree deh buat nyimpen desknya di RM, karena ngapain kan Risk Analyst disuruh ngatur jadwal."

**FINAL (session-S2 Jun 4):** RM owns 8a/8b/8c. Source confirmation: Hijra SOP slide 2 = items 8/9/10 are RM's checklist. W1 confirm still pending.

→ **RESOLVED**: RM ownership.

---

## 5. Risk veto — pre-committee gate [RESOLVED, consistent]

**BRAINSTORM (fa02e261, May 14):** "Risk Team has veto over Komite — OJK rule; if Risk rejects, Komite cannot approve. Enforced in design."

**CC early (d9ebd10f May 18):** "if riskRecommendation==='reject', entire voting UI replaced by 'Tidak Perlu Sidang Komite' card; defense-in-depth: disabled buttons + castVote() guard."

**OMP ADR-0005 (Jun 3–4):** "Risk veto stays structural (rejected apps never enter Komite queue)." Risk Analyst has two distinct actions: `RejectRisk` (terminal close, `risk-reject`) and `ReturnToRm` (send-back, MUAP re-ladder). These must NOT be conflated.

→ **RESOLVED, CONSISTENT** throughout all eras. Never changed.

---

## 6. Attendance/quorum model [RESOLVED — evolved]

**BRAINSTORM/CC early:** Single `attendeeUserIds[]` list; quorum = `ceil(2/3 × attendees.length)`. All attendees = potential voters. Per-meeting composition introduced May 22 (`96c42472`). Static `MEMBERS` constant eliminated.

**OMP ADR-0005 (Jun 3–4):** Bifurcated into (1) **blocking signers** (Komite Pembiayaan ≥2, required for routing) and (2) **attesting participants** (involved team, non-blocking). `min-attendees = 2` config default (W1 confirm). Quorum math removed entirely; replaced by all-signed gate.

→ **RESOLVED**: blocking/attesting split is current model.

---

## 7. CRO COI soft-flag [RESOLVED]

**BRAINSTORM/CC early:** Not explicitly modeled.

**batch-19 (Jun 1):** "CRO COI = soft flag, not block (conscious design decision): CRO signs RSK (as Risk Analysis approver) then may sit in Komite — inherent BPRS-scale conflict of interest. MIZAN flags it but doesn't hard-block because 'tidak selalu ada pilihan anggota lain.' Must be visible in audit trail for OJK explanation."

**OMP (Jun 3–4):** Confirmed: `rskCroSignerUserId` stored on application (runtime-derived from `approvalSteps`), not a Prisma-writable field. Flagged in Komite room.

→ **RESOLVED**: soft flag is intentional design.

---

## 8. komiteDecisionNote enforcement gap [RESOLVED]

**CC early (batch-02 May 21, `d6396b01`):** "komiteDecisionNote enforcement: gap STILL stands — not server-enforced (action stores note if present but does not require it)." KOMITE.md had incorrectly said "no gap" twice; corrected.

**CC early (batch-07 May 24):** "komiteDecisionNote conditional rule: stored if present, never enforced — still a gap."

**RESOLVED (session-S1 Jun 3):** `validateDecisionNote` added, server-enforced. Gap closed.

---

## 9. `KomiteSeamCard` lifespan [RESOLVED, UI archaeology only]

**CC early (May 22):** `KomiteSeamCard` added as additive component between ActionBand and DetailTabs, surfacing meeting lifecycle.

**CC batch-05 (May 24):** `KomiteSeamCard` **deleted**; merged into ActionBand (subtitle) + RingkasanView (`KomiteDecisionSummary`).

→ UI component removed; functionality absorbed.

---

## 10. Stage-5 conditional routing change [RESOLVED]

**CC early (batch-02 May 21, `96b5d932`):** "At Stage 5 Komite: only `approve` advances (→ Stage 6); conditional/reject both route back to AO."

**CC batch-15 (May 29, session `b2a03ad3`):** `alur-kerja-inti.md` documented with old behavior (Bersyarat stops at Stage 4).

**CC batch-15 (May 29, session `8fc2db20`, Batch C):** "Stage-5 committee-conditional → nasabah response branch. Two outcomes: (1) nasabah setuju → Stage 6; (2) nasabah tidak setuju → terminal `closed` (`closeReason='nasabah-decline'`). `komiteDecision` deliberately stays `'conditional'` even after nasabah accepts — preserves audit trail."

→ **RESOLVED**: conditional leads to nasabah-response branch, not direct AO send-back.

---

## 11. Meeting venue model [RESOLVED]

**CC batch-05 (May 24):** `room?` + `meetingUrl?`, ≥1 required. Room made nullable (Prisma migration). No explicit modality enum — modality implicit from which fields are filled. `meetingVenueLabel()` shared helper.

**OMP:** Confirmed in ADR-0005; no change.

---

## 12. `approvedPlafond` bounds constraint [RESOLVED]

**CC batch-05 (May 24):** "approvedPlafond ≤ requestedPlafond enforced server-side. Committee may approve same or less, never more. `approvedTenorMonths` must be positive integer; flat akad → margin ≥ 0; profit-share → margin must be null. Tenor deliberately NOT bounded ≤ requested (user didn't rule on it)."

→ **RESOLVED**: `validateApprovedTerms` in `lib/komite-terms.ts`.

---

## 13. `[VERIFY-DOC]` candidates

- `docs/references/komite-mechanics.md` was imported from brainstorm in session-S2 (Jun 4). It may describe the old voting model if not updated. **`[VERIFY-DOC]`**: confirm it reflects ADR-0005 signed-MoM, not quorum/voting.
- `docs/designs/workflow-engine.md` §"Interaction spec" covers Komite step 8 — should show chair records outcome + MoM signing chain. **`[VERIFY-DOC]`**: check it does not reference `KomiteVote` or quorum.
- `apps/web-app/src/lib/komite.ts` was the "single source of truth" for all voting rules in CC era; in OMP era it was reorganized to `lib/approval-chain.ts` + `komite-terms.ts`. **`[VERIFY-DOC]`**: confirm `quorumFor`/`calculateMajority`/`castMemberVote` are removed or only in test stubs.
