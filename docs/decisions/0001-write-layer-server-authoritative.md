# ADR 0001 — How to make the write layer server-authoritative (Phase 3)

- **Status:** Accepted (chosen by the human: *"Split into intent actions"*).
- **Date:** 2026.05.24
- **Context phase:** Prototype → production migration, **Phase 3 (desk-based authorization)**.
- **Decision owner:** human + app-side AI; brainstorm peer
  OFFLINE → made under **Solo mode** (decide-with-the-human, record durably in-repo).

> This ADR is written in full because the human picked the recommendation *before*
> reading the option detail and asked for the alternatives to be documented. Read it
> as the canonical record of *why* the write layer is shaped the way it is.

---

## The problem

Phase 2 left a deliberate **temporary seam**: server actions received the acting
identity *from the client* (`ActorInput { userId, userName }`) and trusted it. They
also did not check **authorization** at all. The whole point of Phase 3 is to make the
server authoritative:

1. **Identity** must come from the verified Firebase session (`requireActor()`), never
   from a client argument. (Server Actions are POST-reachable — a crafted POST could
   otherwise claim any identity.)
2. **Authorization** must be enforced server-side per the **desk** model
   (`users → roles → desks`), specifically the separation the desks exist for.

The hard case is the **generic `patchApplicationAction(actor, patch, history[])`**. It
was a single action that:
- let the **client choose which fields** of the application to write (a whitelist of
  ~30 fields), and
- let the **client author the audit-trail string** that goes into the OJK history, and
- accepted **client-computed compliance numbers** (DSR/LTV, hard-gate violations, Kol).

The headline separation Phase 3 must enforce is **S2-LG (Legal) vs S2-RT-SLIK (SLIK &
Kolektibilitas)** — two *different* desks that, at stage 2, both write the **same
`documents` field** of the same application:

- **S2-LG** patches `documents[].legalVerification = 'pass'|'fail'` (legal verifies authenticity).
- **S2-RT-SLIK** patches `documents` to **upload the SLIK report**, plus `hardGates.kol`,
  `kolEntered` (risk records kolektibilitas).

Because both write `documents`, **any per-field desk map would have to allow the union**
{S1-AO, S2-LG, S2-RT-SLIK, S6-AO} to write `documents` — which means a curious or
malicious **Legal user could craft a POST that uploads a SLIK report**, and a **Risk
user could mark legal verification**. That defeats *exactly* the separation the two
desks were created for. (This was the original prototype-era reason `S2-RT-SLIK` and
`S4-RT-RSK` were split into separate desks.)

---

## Options considered

### Option A — Split the generic patch into intent-specific, desk-gated actions ✅ CHOSEN

Replace `patchApplicationAction` with ~16 purpose-named server actions, each:
- reads identity from `requireActor()` (never the client),
- asserts the **specific desk** required for that operation (`assertDesk(actor, …)` — fail closed),
- whitelists **only the fields it is allowed to touch**,
- **composes its own audit string** server-side, and
- **computes compliance numbers** (DSR/LTV/violations) server-side.

Examples of the mapping (full catalogue in ADR 0002 / the code):
`confirmNik/uploadKtp/uploadRequiredDoc → S1-AO`, `verifyDocument → S2-LG`,
`uploadSlik/confirmKol → S2-RT-SLIK`, `saveFinancials/saveAnalysis/markMuapSynced → S3-LA`,
`markRskSynced → S4-RT-RSK`, `advanceDisbursement → S6-AO`, `appendDiscussion → participant`.

- **Pros**
  - Genuinely enforces LG vs RT-SLIK (upload-SLIK and verify-document are *different
    actions with different desks* — there is no shared field to leak through).
  - The **server owns "what happened"** → the audit trail can't be forged by the client
    (critical for an OJK trail).
  - Compliance numbers (DSR/LTV/Kol violations) are recomputed server-side from inputs.
  - Each action is small, named for intent, and independently testable.
- **Cons**
  - The most work: ~16 new actions + every detail tab's call sites change.
  - Larger verification surface.
- **Why it wins:** the working agreement mandates the **strictest bar** for the
  OJK-compliance core ("a bug there is a regulatory failure"). This is the only option
  that actually enforces the separation Phase 3 exists to deliver.

### Option B — Hybrid: field-map for single-desk fields, split only the contested ops

Keep the generic patch with a per-field desk map for fields that are genuinely written
by exactly one desk (`analysis → S3-LA`, `muapSyncedAt → S3-LA`, `rskSyncedAt → S4-RT-RSK`,
disbursement → S6-AO), **but** carve out the *contested* stage-2 operations
(documents/legalVerification, SLIK upload, Kol) into desk-gated actions.

- **Pros:** less work than A; closes the LG/RT-SLIK hole.
- **Cons:** two parallel write mechanisms (generic patch *and* intent actions) — more
  confusing, harder to audit, and the generic path still lets the **client author audit
  strings**. Field-maps for shared objects like `extractionSources` remain leaky.
- **Verdict:** rejected — it keeps the worst property (client-authored audit) on half
  the writes for only a modest saving, and leaves two patterns to reason about.

### Option C — Field→desk map only (smallest change; matches the lighter handoff intent)

Keep the single generic `patchApplicationAction`; add a per-field desk map (with a
*union* of allowed desks for shared fields) and `requireActor()` for identity.

- **Pros:** smallest change; closest to the handoff's original "add `assertCanActOnDesk`"
  sketch.
- **Cons:** **does not enforce LG vs RT-SLIK** (both can write `documents`/`extractionSources`
  via the union), and **keeps the client authoring audit strings** and **client-computing
  DSR/LTV/Kol**. Acceptable only if desk separation is treated as *advisory*.
- **Verdict:** rejected — it fails the one requirement that motivated Phase 3.

---

## Decision

**Option A — split into intent-specific, desk-gated actions.** Identity from the session;
per-action desk assertions; server-composed audit; server-computed compliance numbers.

## Consequences

- `server/actions/types.ts` (`ActorInput`) is **deleted**; no action takes a client actor.
- `patchApplicationAction` is **removed**; ~16 intent actions replace it in
  `server/actions/application-data.ts`.
- DSR/LTV move to a shared pure module `lib/financials.ts` (server authoritative; client
  uses the same fn for live preview → no drift). Disbursement step-order + condition
  gating move to `lib/disbursement.ts` (server-enforced).
- Every detail tab + komite component + create page changes its call sites (Phase 3
  client work). The `useRole`/`isRole` capability gates migrate to `hasDesk` separately.
- New, follow-on hardening becomes possible and is recorded in **ADR 0002**.

## Open question — RESOLVED by the human (2026.05.24)

`submitDecisionAction` originally set the committee's `approvedPlafond /
approvedTenorMonths / approvedMarginRate` with **no server bound-check**. The human
ruled: enforce common server-side validation of the approved terms, including
**`approvedPlafond ≤ requestedPlafond`**. Implemented as the pure, unit-tested
`lib/komite-terms.ts#validateApprovedTerms` (called by `submitDecisionAction` for
APPROVE decisions): plafond positive **and ≤ requested**; tenor a positive integer;
flat-akad margin a number ≥ 0; profit-share akad margin must be null. The client
surfaces the server's rejection message via toast. (Tenor is NOT bounded ≤ requested —
not part of the ruling; committees may restructure tenor.)

Also resolved: the **chair-identity check** (was `TODO(chair)` in ADR 0002 §8) —
`submitDecisionAction` now resolves the meeting carrying the app and asserts
`actor.userId === meeting.chairUserId` (superadmin bypasses, e.g. Phase 5 impersonation).
