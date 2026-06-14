# ADR-0021: MUAP & RSK approval ladders shorten to two-rung maker-checker

- **Status:** accepted
- **Date:** 2026.06.12
- **Supersedes:** [ADR-0003](0003-workflow-target-and-rbac.md) **§Decision.2 only** (the chain
  definitions). The rest of ADR-0003 (SOP-anchored flow, two-layer RBAC, scope boundary) stands.

## Context

ADR-0003 set the ladders from the Bank SOP: MUAP `RM → TL/SPV → BM/KU`, RSK
`Risk Analyst → Risk Officer → CRO → DPS` (DPS signing every RSK per-deal). On 2026.06.12 the
business owner decided both ladders collapse to a single maker → single checker, and the offering
draft was updated to state the new chains. "Risk Team Leader" (RTL) is a new position — the
risk-side analogue of MUAP's Team Leader.

## Decision

1. **MUAP**: `Relationship Manager → Team Leader/SPV`. The TL approval completes the chain and
   freezes the MUAP.
2. **RSK**: `Risk Analyst → Risk Team Leader` (new role `risk-team-leader`, desk `rsk-rtl`,
   approval role `rsk-approve-rtl`). The RTL approval completes the chain and freezes the RSK.
3. The dropped signer desks/roles are **removed entirely** (no inert config): desks `muap-bm`,
   `rsk-ro`, `rsk-cro`, `rsk-dps`; roles `branch-manager`, `risk-officer`, `cro`, `dps`. BM/CRO/DPS
   as bank positions still sit on Komite via the separate `komite` desk.
4. **DPS no longer signs each RSK.** ⚠️ Sharia-governance consequence (BPRS, regulatory-critical),
   stated honestly: the removed `rsk-sign-dps` rung was the **only ENFORCED** DPS control — no RSK
   could freeze or reach Komite without a DPS signature. Its intended replacement — a Stage-5
   `dps-review` conditional gate (trigger: MUAP `rekomendasi_dps_or_tidak`) — is **DESIGNED, NOT
   BUILT**: `dps-review` exists only as a desk-catalog entry (`lib/desks.ts`) with **no enforcement
   code anywhere** and, after this migration, **no role or seeded holder**. So **the system currently
   enforces zero DPS oversight** — a deal that needs sharia review flows RA→RTL→Komite→Pencairan with
   no DPS touchpoint or warning. This gap is flagged to Legal/Compliance and **must be closed before
   OJK W1** — either build + seed the `dps-review` gate, or restore an enforced DPS control. Tracked
   as an open compliance gap, not a silent code detail.
5. The Komite conflict-of-interest soft-flag (`rskCroSignerUserId`) is **retired** — its rationale
   (a CRO who signed the RSK then votes at Komite) no longer exists.
6. The RTL QR signature slot (`rsk_sig_rtl_tanggal`) is a best-effort anchor until the template
   owner updates the RSK master's signature block (the masters are owned and updated by the human
   template owner; an absent slot stamps nothing — safe no-op).

## Consequences

- **No Prisma migration**: `ApprovalStep` is an append-only ledger whose `role` is a free string;
  historical rows stay valid audit. A seeded ladder mid-old-chain reads complete under the
  1-checker definition — acceptable in early-dev; demo data is reseeded.
- All stage gates (`CHAIN_COMPLETE_ADVANCE`, MUAP→Risk / RSK→Komite) key off the generic
  `isChainComplete()` and adapt with no edit.
- Four-eyes is preserved per chain (RM≠TL, RA≠RTL) by the unchanged reducer rules.
- Migration record: `docs/planning/approval-chain-shorten.md` (retired on ship; git is the archive).
