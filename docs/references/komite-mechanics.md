# MIZAN — Komite Approval Mechanics

- **Type:** stable spec (domain) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/KOMITE.md` (retired); NoEffort interpretation (POJK 9/2024, 24/2018).
- **Used by:** Stage-5 committee build (`lib/komite.ts`), `../GLOSSARY.md`.
- **Review trigger:** Discovery W1 — obtain Hijra Pedoman Komite (size, BWMP tiers, voting rule).

> **Reconcile:** BWMP tiers + voting rule are 📝/W1 proposals, not live facts. Per-meeting composition matches the build; CM→`komite`, DPS per-deal RSK signer (see `../GLOSSARY.md`). **The in-app committee model is now `../decisions/0005-rapat-komite-signed-minutes.md`: no in-app voting — the chair records the per-app outcome and attending Komite QR-sign the per-app MoM. The "voting"/quorum sections below describe domain practice (W1), not the built mechanism.** Role names below ("LA" = MUAP author → **RM**; "Risk Team" → **RA**) are pre-fold labels; as-built in `../GLOSSARY.md`.

> Stage 5: Committee Decision. The Komite Pembiayaan holds the final, legally binding decision on every financing application. This doc covers session mechanics, voting rules, decision types, authority limits (BWMP), conditional approval paths, and post-decision flow.
>
> 📝 All content below is **NoEffort interpretation** based on Indonesian BPRS common practice (POJK 9/2024, POJK 24/2018). Sources name "Komite Pembiayaan" as Stage 5 owner but do not enumerate voting rules, quorum, or BWMP tiers. Bank confirms all parameters at Discovery W1 — Hijra's Pedoman Komite Pembiayaan is the authoritative source.

## Komite composition

| Role | Typical position | Authority |
|---|---|---|
| Ketua Komite | Direktur Utama or Direktur Pembiayaan | Chairs session; casting vote if tie (see tie-break) |
| Anggota | Senior officers (Kadiv Pembiayaan, Kabid Risk, etc.) | Full voting members |

**Size**: 3 members for small-to-mid BPRS (Hijra likely). Larger BPRS: 5. Always **odd** to structurally prevent ties — industry standard, not OJK mandate.

📝 Hijra's actual Komite size and member roster: confirm at Discovery W1. Obtain **Pedoman Komite Pembiayaan** for authoritative voting rules.

### Composition is per-meeting (📝 NoEffort)

> 📝 The per-meeting composition model below is **NoEffort design** — Bank confirms at Discovery W1. Sources describe the Komite as a standing committee but do not specify whether membership/chair are fixed or vary per meeting.

The Rapat Komite (committee meeting) composition is **per-meeting**: the members **and** the chair (`chairUserId`) vary per meeting. The chair is **freely chosen per meeting — there is no default chair**. Quorum (see [§ Quorum](#quorum)) and the chair are derived from the specific meeting, not from a fixed standing roster. The "Ketua" role in the tables below is therefore the chair *of that meeting*, designated when the meeting is composed.

---

## BWMP — Batas Wewenang Memutus Pembiayaan

The authority limits table defines who may approve at which plafond level. This is bank-specific and set by Hijra's board — not OJK-mandated.

**📝 NoEffort proposed default tiers** (confirm at Discovery W1 — Hijra's actual Rp amounts may differ):

| Plafond | Authorized approver |
|---|---|
| ≤ Rp 50 juta | Kepala Cabang / Pejabat Pembiayaan |
| Rp 50jt – Rp 200jt | Direktur Pembiayaan |
| Rp 200jt – Rp 500jt | Komite Pembiayaan |
| > Rp 500jt | Komite Pembiayaan + Dewan Komisaris |

**V1 posture**: MIZAN routes all applications through the full 5-stage pipeline including Komite. BWMP tiering — where low-plafond apps skip Komite — is a V2 enhancement: if Hijra's BWMP lets a Direktur alone approve sub-Rp 200jt applications, a significant fraction of their ~30/month volume may not need Komite, simplifying the flow for most apps. **High-priority Discovery W1 question** — confirm actual thresholds and demand before building.

---

## Session mechanics

Komite does not vote in real-time per application. They batch-vote in scheduled sessions:

1. Applications that clear Stage 4 join a **"Siap untuk Komite" queue**
2. Komite has a **scheduled session** (daily afternoon, or twice-weekly — Bank-specific)
3. LA prepares MUAP packets; Komite **pre-reads** before the session
4. Komite **votes in batch** during the session
5. Decisions are finalized; RM is notified

**MIZAN UX implication**:
- Stage 5 from LA's view: "this application is queued for the next Komite session"
- Komite members need a view showing all applications scheduled for today's session
- `komiteVotes` is append-only — members can vote at any time before finalization; they don't need to be simultaneously present

📝 Session cadence (daily / twice-weekly) and pre-read model: confirm at Discovery W1.

### Meeting venue (offline / online / hybrid)

> 📝 NoEffort design — Bank confirms at Discovery W1.

A meeting is **offline, online, or hybrid** — but the modality is **implicit**, expressed via two optional fields: `room?` (physical room) and `meetingUrl?` (join link). **At least one is required.** There is **no explicit modality chip/field**; the label is derived by a single helper `meetingVenueLabel()` (room only → offline, url only → online, both → hybrid).

---

## Voting mechanics

### Quorum

`ceil(2/3 × total committee size)`. Default for 3-member Komite: **2 of 3 must have voted** before finalization is allowed.

`submitDecision()` gates on quorum being met.

### Decision rule

**Strict majority**: winner vote count > half of votes cast. On tie or plurality, finalization is blocked until the deciding vote arrives.

### Tie-break

With an odd-numbered committee (3 or 5), a true tie is mathematically impossible — maximum is 1-1 with 1 vote pending, which resolves on the third vote. **No tie-break rule needed for 3-member Komite.**

If Bank uses an even-numbered committee: Ketua casting vote is the Indonesian industry standard. Confirm at Discovery W1.

📝 Tie-break rule (only matters under some decision rules) — see OPEN-QUESTIONS.

### Vote weights

Standard BPRS practice: equal weights. 📝 Confirm at Discovery W1 — see OPEN-QUESTIONS.

### Edit after submit

Not allowed — vote is final once submitted (legally binding for OJK audit).

📝 Bank may want an edit window before quorum closes — see OPEN-QUESTIONS.

### Voting order — Ketua votes last (with absence handling)

**Regular CM members** (non-Ketua) vote in parallel — any order, any time. No restriction.

**Ketua** has a two-phase unlock:

| Condition | Ketua state | UX |
|---|---|---|
| Non-Ketua votes in < quorum − 1 | Locked | "Kirim Suara" disabled |
| Non-Ketua votes in ≥ quorum − 1 AND all non-Ketua have voted | Unlocked — normal | Standard voting UI |
| Non-Ketua votes in ≥ quorum − 1 AND some non-Ketua have NOT voted | Unlocked — early | Warning card + explicit confirmation required |

**Unlock trigger**: `non-Ketua votes submitted ≥ quorum − 1`
- 3-member (quorum = 2): unlocks after **1** non-Ketua vote
- 5-member (quorum = 4): unlocks after **3** non-Ketua votes

**Early vote UX** (some non-Ketua absent):
Ketua sees a warning card naming the absent member(s): *"Nur Fatimah belum memberikan suara. Memberikan suara sekarang berarti Anda memutuskan sebelum semua anggota hadir."* Two buttons: **"Tunggu Anggota Lain"** (dismiss) and **"Tetap Berikan Suara"** (proceed). Ketua must explicitly confirm — no accidental early votes.

**komiteDecisionNote** is authored by **Ketua only** — regular members use `KomiteVote.comment` for individual rationale. Ketua writes the binding collective resolution after quorum + majority is determined, before clicking "Rekam Keputusan."

### Chair identity enforcement (as-built)

`setKomiteOutcomeAction` (formerly `submitDecisionAction`) — the action that records the final committee decision — asserts the actor **IS the designated meeting chair** (`actor.userId === meeting.chairUserId`). Per ADR-0005 (signed-MoM) there is no in-app per-member vote; only the chair of that specific meeting session records the outcome. Superadmin bypasses this check (for authorized impersonation only). Phase 3 ADR 0002c — closed.

### Data model

```ts
interface KomiteVote {
  userId: string        // individual accountability
  userName: string
  vote: 'approve' | 'conditional' | 'reject'
  comment?: string      // individual member's rationale (optional)
  timestamp: Date       // immutable once submitted
  isEarlyVote?: boolean // true if Ketua voted before all non-Ketua had voted
}
```

`KomiteVote.comment` = individual rationale (optional, per-member).
`komiteDecisionNote` = the binding collective resolution (Ketua only; mandatory for Conditional and Reject).
`isEarlyVote` = audit trail flag on Ketua's vote — records that Ketua explicitly chose to vote before all members were present.

Two distinct concepts, both needed: individual accountability + collective resolution.

### komiteDecisionNote enforcement — gap stands (V2)

The true rule is: a `komiteDecisionNote` is **required if any individual KomiteVote is 'conditional'**. This is **not server-enforced** — the save action stores the note if present but does not require it. The UI disables the submit buttons on a conditional/reject pending vote, but there is no service-layer guard, so an overall approve/reject decision carrying one stray conditional vote can be persisted with a blank note. **The enforcement gap stands as a V2 item** — see [OPEN-QUESTIONS.md § Komite voting](discovery-open-questions.md#komite-voting).

### Policy freeze on decision (📝 NoEffort)

The committee decision freezes the active versioned `RiskPolicy` (the DSR/LTV/Kol thresholds then in force) into the `DecisionCheckpoint`, making the decision auditable against the exact thresholds applied. The freeze mechanic is owned by [ADMIN.md § versioned config](../designs/admin-config-layer.md) (canonical); compliance framing in [COMPLIANCE.md](compliance.md). 📝 NoEffort design — Bank confirms the policy-governance model at Discovery W1.

---

## Decision types

Three possible Komite decisions:

| Decision | `komiteDecisionNote` | Next action |
|---|---|---|
| **Setuju (Approve)** | Optional | Proceed to Pencairan |
| **Setuju Bersyarat (Conditional)** | **REQUIRED** — conditions must be explicit | Depends on Flavor A or B (see below) |
| **Tolak (Reject)** | **REQUIRED** — RM needs the reason to communicate to customer; OJK audit trail must not be blank | RM notified; application closed |

UI implication: Conditional and Reject submit buttons are **disabled** until `komiteDecisionNote` is non-empty.

### Risk Team veto

OJK regulation: if Risk Team (Stage 4) recommends Reject, Komite cannot override.

| Risk recommendation | Komite can vote |
|---|---|
| Approve | Anything |
| Conditional | Approve (with conditions) or Reject |
| **Reject** | **Reject only** — no override |

This is a hard constraint, not a policy preference.

---

## Approved fields — set by Komite on decide

On Approve or Conditional, Komite sets the final financing terms (which may differ from what RM requested):

| Field | Who sets | When present |
|---|---|---|
| `approvedPlafond` | Komite | Approve and Conditional decided leaves only |
| `approvedTenorMonths` | Komite | Approve and Conditional decided leaves only |
| `approvedMarginRate` | Komite | Approve and Conditional; `null` for profit-share akad |

- `approvedMarginRate` = null for Musyarakah/Mudharabah (consistent with `marginRate` = null)
- All three fields are **absent** on Reject-decided leaves and all Stage 1–4 leaves
- Delta (approved vs requested) is auto-composed into `HistoryEntry.reason`

`akadType` is immutable end-to-end — Komite wanting a different akad = Reject + re-application, not an amendment.

---

## Conditional approval: two flavors

📝 The two-flavor split and routing rules below are NoEffort-proposed workflow design. Sources only state "Conditional" as a Komite decision option. Bank confirms at Discovery W1.

### Flavor A — Terms only (no new documents needed)

Examples: plafond reduced (Rp 2M → Rp 1.5M), shorter tenor, higher margin, personal guarantor letter (existing pengurus, no new docs).

Path:
```
Komite votes Conditional (Flavor A)
→ komiteDecisionNote states the new terms explicitly
→ RM communicates new terms to customer
→ Customer accepts → proceed to Pencairan
→ Customer rejects → application dies (no re-vote needed)
```

### Flavor B — Needs new documents

Examples: additional collateral (new land certificate), monthly reporting covenant, additional insurance.

Path:
```
Komite votes Conditional (Flavor B)
→ komiteDecisionNote states required documents/conditions
→ RM requests new documents from customer
→ Documents collected and verified during Pencairan / Verifikasi Final
   (NOT re-looped to Stage 3/4)
```

**Design principle**: all conditional approvals route through Komite first. Document collection happens during Pencairan, not as a workflow re-loop. Reduces ping-pong.

Open questions on Conditional (verification ownership, expiry, customer-rejects-terms): see OPEN-QUESTIONS.md § Conditional approvals.

---

## Post-decision: Stage 6 Pencairan

On Approve or Conditional-accepted, the system sets `disbursementStatus = 'Verifikasi Final'` and the application moves to **Stage 6 'Pencairan'**. Flavor B conditions carry into Pencairan, tracked in `disbursementConditions` and verified there (not re-looped to Stage 3/4). **[WORKFLOW.md § Stage 6 Pencairan](workflow-detail.md#stage-6-pencairan-disbursement-sub-state-machine) is the canonical owner** of the `DisbursementStatus` sub-state machine and its terminal 'Cair' state.

📝 Stage 6 is NoEffort-proposed (sources mention Pencairan only as "fund disbursement"). Confirm at Discovery W1.

**⚠️ MIZAN does NOT transfer funds in V1.** Fund disbursement = RM action in core banking. MIZAN records the status transition.

---

## Reject path: always via RM

Whenever an application is rejected — at Stage 2 (SLIK fail), Stage 4 (Risk reject), or Stage 5 (Komite reject) — customer-facing communication always flows through RM:

- Reject → RM notified as action-owner → RM calls customer, logs communication
- LA / Risk / Komite get for-awareness-only notifications; they never contact the customer directly

RM owns the customer relationship end-to-end.

---

## Open questions for Discovery W1

All Komite W1 questions (BWMP table, Komite size/tiering, session cadence, tie-break, edit window, vote weights, conditional verification/expiry, customer-rejects-terms, the `komiteDecisionNote` enforcement gap, and obtaining the Pedoman Komite Pembiayaan) live in the canonical checklist — see [OPEN-QUESTIONS.md § Komite voting](discovery-open-questions.md#komite-voting) and § Conditional approvals.
