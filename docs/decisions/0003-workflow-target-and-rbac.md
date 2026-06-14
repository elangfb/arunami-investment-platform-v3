# ADR-0003: Workflow target — SOP-anchored maker-checker, granular desks, scope boundary

- **Status:** accepted
- **Date:** 2026.06.03
- **Supersedes:** the 2026.05.30 internal "4-stage, RM absorbs all desks" sketch (never an ADR;
  recorded here as superseded rationale).
- **Superseded in part (2026.06.12):** §Decision.2 chain definitions are superseded by
  [ADR-0021](0021-two-rung-approval-chains.md) — **MUAP `RM → Team Leader`** and **RSK
  `Risk Analyst → Risk Team Leader`** (the BM/KU, Risk Officer, CRO, and DPS-as-RSK-signer rungs are
  removed; DPS keeps only the Stage-5 `dps-review` sharia gate). The rest of this ADR stands. The
  two-rung chains are shipped 2026.06.12 — typecheck+unit+integration verified; live smoke pending.

## Context

The as-built app is a 6-stage assembly line (AO · LG · RT-SLIK · LA · RT-RSK · CM). On 2026.05.30 we
decided to restructure it into a 4-stage RM-led maker-checker model, and on 2026.06.01 evidence
("at Hijra, AO = Analis = RM") led us to assume **one RM role absorbs AO + Legal + SLIK + Loan-Analyst**.

On **2026.06.02** Hijra's actual SOP slides arrived (5 slides, transcribed in
`references/hijra-bank-sop-digest.md` + `references/sources/`). They are Bank-authored — the strongest
evidence we have — and contradicted the "absorb everything" assumption:

- A **16-step linear flow** (slide 1/2) with separate lanes: Nasabah · **Marketing (RM)** ·
  **Legal & Appraisal** · **Analyst (Risk)** · **Komite** · **Operasional**.
- A **communication hub** (slide 3): every desk talks **through RM**; spokes include Finance
  (Special Rate), Compliance (Sharia review), CS (AML), Risk Analyst, Appraisal, Ops, Legal.
- **Per-desk SLAs** (slide 4).

The gate was **opened 2026.06.03** (human override accepting the SOP evidence; W1 still ratifies the
numeric values). Forces in tension: fidelity to the Bank's real process vs. build simplicity;
granular RBAC vs. monolithic roles; what belongs **inside** MIZAN vs. tracked-but-**external**.

## Decision

1. **Target = the SOP-anchored 16-step flow**, grouped into 4 maker-checker gate phases. SSOT =
   `designs/workflow-target.md`; Bahasa confirmation companion = `guides/alur-kerja-inti.md`. **RM
   (Marketing) is the hub**; **only feasibility/5C+1S (Loan-Analyst) folds into RM.** **Legal &
   Appraisal** stay in-system desks that RM orchestrates.

2. **Two maker-checker ladders are real gates** (a document must be FINAL before it advances):
   - **MUAP**: RM → TL/SPV → BM/KU — all signed → MUAP frozen → may reach Risk.
   - **RSK**: Risk Analyst → Risk Officer → CRO → **DPS** — all signed → RSK frozen → enters the
     committee queue. **DPS signs every RSK (per-deal)**; a reject routes back to the maker (before freeze).
   - Hard-gate override (DSR/LTV/Kol) = **self-service**: a recorded/auditable reason, no separate approval.

3. **RBAC is two layers.** **Desk = granular permission (atomic, `hasDesk`).** **Role = a composition
   of desks.** Prefer keeping desks granular; move work between people by **recomposing roles**, not by
   changing the flow. **Legal & Appraisal = two desks (`legal`, `appraisal`) bundled in one role.**
   Committee-support tasks (8a Jadwal · 8b Konten/Deck · 8c MOM) are **system-initialized + desk-confirmed**
   and bundled to RM.

4. **Scope boundary — out of the Mizan system:** **Ops** (SLIK/Pefindo acquisition, Pencairan
   execution), **AML/CS**, **Finance** (Special Rate), **Compliance** (Sharia review). MIZAN at most
   **records info** (it only knows "RM holds the bureau data") or tracks an **RM-maintained checklist**
   (Pencairan); it does **not** orchestrate these. DPS is in-scope (RSK signer); Compliance ≠ DPS.

## Consequences

- **Easy:** one append-only `ApprovalStep` ledger + a parameterized chain serves **both** ladders;
  reassigning duties is role config, not a flow change; the build has a clear "do not build" list
  (Ops/AML/Finance/Compliance orchestration).
- **Hard / ruled out:** no monolithic "RM does everything" role; MIZAN cannot drive Ops/AML/Finance/
  Compliance (they live outside); numeric values (per-desk SLA, hard-gate thresholds, BWMP) still need
  W1 ratification + config (tracked as a pre-build verify task in the plan).
- **Reversibility:** granular desks make role recomposition cheap, but the SOP-anchored desk catalog +
  scope boundary is load-bearing for the build — hence this ADR.
- **Open at W1 (non-blocking, see `designs/workflow-target.md` §W1):** DPS review scope (process-only,
  no app impact — same RSK is signed either way); Legal & Appraisal one-team-vs-two (role config only);
  Bersyarat written-vs-informal (low, likely covered by the SP3 signature).
