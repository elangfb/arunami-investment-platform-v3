# MIZAN — Business Workflow

- **Type:** stable spec (domain detail) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/WORKFLOW.md` (retired); discovery 5-stage + Stage-6 detail + Bank SOP overlay.
- **Used by:** complements `../guides/workflow.md` (as-built canonical) and `../designs/workflow-target.md` (confirmed target).
- **Review trigger:** Discovery W1; prune once `../guides/workflow.md` absorbs the still-relevant detail.

> **Reconcile:** **as-built behavior** lives in `../guides/workflow.md`; the **confirmed go-forward target** (RM-led 6→4, SP3 chain, signature ladders — two-rung: MUAP `RM → Team Leader` / RSK `Risk Analyst → Risk Team Leader`, per `../decisions/0021-two-rung-approval-chains.md`) in `../designs/workflow-target.md`. This page is the long-form domain detail behind both.

> The 5-stage financing pipeline + Stage 6 Pencairan (disbursement). **Source: Manifesto Slide 6** for the 5 origination stages. **The 5 stage names below are canonical** — use them throughout the product (UI, data model, audit trail, dashboards). Don't propagate the Sprint 2 contract shorthand "Draft / Review / Approval". Stage 6 Pencairan and its sub-state machine are 📝 NoEffort design (see [§ Stage 6 Pencairan](#stage-6-pencairan-disbursement-sub-state-machine)).

## Pre-MIZAN: where the loan application starts

Customer (UMKM, individual, business) walks into a Hijra Bank branch, meets the **Relationship Manager (RM)**. RM gathers customer needs and collects initial docs (KTP, akta, SIUP, financial statements).

## The 5 stages

| # | Stage | Owner | Supporting desks (🏦 SOP) | What happens | Output |
|---|---|---|---|---|---|
| 1 | **Pengajuan Dokumen** | **RM** 🏦 | CS (AML) | RM creates loan application in MIZAN, uploads docs, picks akad type + plafond, system checks completeness. CS runs DTTOT/PEP/negative-list screening. | Verified intake |
| 2 | **Legal, Agunan & Biro** | **RM** 🏦 *(coordinates)* | Legal, Appraisal, Ops/Bureau | RM pulls SLIK+Pefindo (via Ops), Legal does Analisa Yuridis, Appraisal values agunan. *V1: SLIK = manual upload, not API* | Legal opinion + SLIK/Pefindo + appraisal |
| 3 | **Review Kelayakan / MUAP** | **RM** 🏦 | Compliance, Finance | **5C+1S analysis** — AI drafts all 6 aspects, RM reviews/refines. Calculates DSR, LTV, margin. Drafts MUAP. Compliance checks Sharia; Finance approves any special rate. | Draft MUAP + risk flags |
| 4 | **Risk Review / RSK** | **Risk Analyst (RA)** 🏦 *(SOP "Analyst" lane)* | — | Reviews findings via risk-appetite framework, checks concentration / industry / macro risk | **Risk Recommendation**: Approve / Conditional / Reject |
| 5 | **Committee Decision** | **Komite Pembiayaan** | — | Reads MUAP + Risk Recommendation; **chair records the outcome + attending Komite sign the MoM** (ADR-0005), minutes auto-recorded | Final decision (legally binding) |

After Stage 5 approval, the **SP3 → Akad → Pencairan** post-Komite chain runs — see [§ Post-Komite: SP3, Akad & Pencairan](#post-komite-sp3-akad--pencairan).

Per-stage SLA targets and the cumulative target live in [SLA.md](sla-targets.md) (owns the day-numbers).

> **Source-of-truth note**: stage names are verbatim from Manifesto Slide 6 (canonical). 🏦 **Stage 1–3 owner = RM, Stage 4 owner = Risk** are confirmed by Hijra's own SOP slides (2026-06-02 — Marketing lane owns intake→MUAP; the SOP "Analyst" lane is Risk). The standalone Loan-Analyst owner is dissolved into RM. Bank ratifies at Discovery W1. See [HIJRA-BANK-SOP-DIGEST.md](hijra-bank-sop-digest.md).
>
> 🏦 **Supporting desks act through RM** (the SOP "Communication Line" hub rule) — never desk-to-desk. Finance/Compliance/CS are conditional (trigger on special-rate / Sharia-question / AML); Legal/Appraisal/Ops are mainline supports. See [PERSONAS.md](personas.md) §"Supporting desks".

## Stage 1 detail: what "verified" means

> 📝 NoEffort interpretation — Bank confirms at Discovery W1 (see [OPEN-QUESTIONS.md](discovery-open-questions.md)).

At Stage 1, a document marked **`verified`** means the **RM confirms it is the correct document type and legible** — a completeness / intake check. It does **not** mean legal authenticity.

**Legal-authenticity verification** (akta notaris, SIUP, NIB are genuine and valid) happens at **Stage 2 Legal Review** — never at Stage 1. So Stage 1 must not block on authenticity; the gate to advance is intake completeness only.

## 🏦 AML / sanctions screening (CS desk)

> 🏦 **Bank SOP (2026-06-02).** The "Communication Line" slide assigns **CS** the job of **DTTOT, PEP & negative-list checking** (SLA 1 HK) — an AML/sanctions screening step the prior model had **no** equivalent for.

- **DTTOT** = Daftar Terduga Teroris dan Organisasi Teroris (terrorist watchlist, PPATK/Bank Indonesia).
- **PEP** = Politically Exposed Persons screening.
- **Negative list** = internal/blacklist check.

**MIZAN V1 decision — RM attestation, screening external.** The actual AML check (DTTOT/PEP/negative-list, incl. any deep-dive) is performed **outside MIZAN** by CS/Compliance. MIZAN does **not** run screening, hold lists, or integrate an AML API in V1. Instead:

- At Stage 1 (inside the application), the RM must tick a mandatory attestation: **"Initial AML checking telah dilakukan dan PASSED"** (DTTOT/PEP/negative-list). The wording is deliberately **"initial"**, not deep-dive — it makes the RM accountable for confirming the screening happened, without making the RM the authoritative AML clearer (that stays with CS, externally).
- The attestation is part of the **MUAP→Risk submit gate** (`muapToRiskBlockers` — see [§ Stage-advance gate conditions](#stage-advance-gate-conditions)). It is settable across the whole Inisiasi phase (stages 1–3) and the deal cannot reach Risk Review until it is ticked. (Pre-2026.06.12 it was a Stage 1→2 gate; the RM-led redesign relocated it.)
- The attestation is **written to the audit trail** with RM identity + timestamp — the OJK-facing record that initial AML was confirmed before the file moved on.

This keeps MIZAN doc-bound and within the segregation-of-duties principle: RM attests *initial* awareness; the deep-dive control + any hard block (DTTOT match → reject + PPATK report) lives with CS outside the system. W1 only needs to confirm the Bank accepts attestation-only in V1. See [COMPLIANCE.md](compliance.md).

## Stage-advance gate conditions

> ℹ️ The RM-led pipeline redesign (ADRs 0018–0020) **shipped and merged to `main` 2026.06.12.** This section is rewritten to match. The headline change: the **intake hard-gates** (required docs · intake-OCR/NIK · NIK-mismatch · Initial-AML attestation) **no longer gate the Stage 1→2 advance** (`stage1To2Blockers` now returns `[]`). They relocated to the **MUAP→Risk submit** (`muapToRiskBlockers`, enforced when the RM *requests* the MUAP approval ladder — `server/actions/approval.ts`). Stages 1–3 = the **Inisiasi** segment and flow free of those gates. Source of truth: `lib/stage-action.ts`, `lib/workflow-engine.ts`, `server/actions/approval.ts`.

Forward stage-advance blockers are **per-transition** (backward / return-to-stage actions are **never** blocked). All blockers for a given advance surface as a single checklist under the advance button.

**Stage 1 → 2 — free.** `stage1To2Blockers()` returns `[]`. No gate (`lib/stage-action.ts`).

**Stage 2 → 3 — RM bureau-data handoff** (not a manual transition; a direct 2→3 transition is rejected — it must fire via the SLIK handoff). `completeSlikAction` requires: SLIK uploaded · Kol entered · `slik`-desk OCR confirmed. Legal & Appraisal run in parallel and do **not** gate 2→3 (ADR-0007); they gate the MUAP→Risk submit instead.

**Stage 3 → 4 — RM "Kirim ke Risk Review".** Four blockers (one merged list):
1. 5C+1S analysis complete (`analysisComplete`)
2. Financial assessment committed (`financialsAssessed === true`) — RM commits DSR/LTV in `AnalysisTab.save()`, even if OCR pre-filled the inputs
3. `muap-author`-desk OCR confirmed (`netMonthlyIncome`, `collateralAppraisedValue` no longer `'ocr_suggested'`)
4. MUAP approval ladder complete (RM → Team Leader signed, `isChainComplete('muap')`)

**MUAP→Risk submit gate (the relocated intake gates).** Opening the MUAP ladder *request* (RM "Ajukan" in the MUAP tab) is blocked by `muapToRiskBlockers` until ALL of:
- Required **intake** docs uploaded (RM-owned; SLIK excluded — it's Stage-2 bureau data, not intake)
- **Intake**-desk OCR confirmed (the `nik` field)
- No unresolved **NIK mismatch** (`extractionMismatches.nik`)
- **Initial-AML attestation** ticked — RM ticks **"Initial AML checking telah dilakukan dan PASSED"** (DTTOT/PEP/negative-list). Screening is external (CS); MIZAN only records the attestation + audit entry (RM identity + timestamp), and the attestation is settable across the whole Inisiasi phase (stages 1–3). See [§ AML / sanctions screening](#-aml--sanctions-screening-cs-desk). Re-attest after a send-back per the standard reset pattern.
- **Legal & Appraisal** deliverables complete (`legalAppraisalComplete`: Analisa Yuridis verified + Penilaian path recorded + required non-SLIK docs legal-verified). A *tidak-layak* legal opinion does **not** block — completion gates the handoff, the verdict does not.

Because the 3→4 advance requires a complete MUAP ladder (blocker #4) and the ladder cannot be opened until `muapToRiskBlockers` clears, the intake gates effectively block entry to Risk Review — even though they are enforced on the ladder *request*, not on the stage transition itself.

**OCR confirmation is desk-scoped** — a field blocks only the handoff its owning desk drives:

| Field | Set by OCR at | Owning desk | Blocks |
|---|---|---|---|
| `nik` | KTP upload (Stage 1, DocumentsTab) | `intake` | MUAP→Risk submit (`muapToRiskBlockers`) |
| `hardGates.kol` | SLIK upload (Stage 2, DocumentsTab) → confirm in DataTab | `slik` | Stage 2 → 3 handoff |
| `financialInputs.netMonthlyIncome` | Auto-fill on Stage 3 entry | `muap-author` | Stage 3 → 4 |
| `financialInputs.collateralAppraisedValue` | Auto-fill on Stage 3 entry | `muap-author` | Stage 3 → 4 |

`nik` is absent at creation and is not in the creation form — it is OCR-extracted from the KTP upload (individual: KTP Pemohon; business: KTP Pengurus). Resolution = clicking the "OCR input — belum dikonfirmasi" mark (→ `'ocr_confirmed'`) or editing the value (→ `'ocr_overridden'`). The field value is usable within the stage immediately; only the gated handoff waits.

## Stage 2 detail: 2 parallel sub-tasks

Stage 2 isn't a single check — two reviews run in parallel; **both must pass**:

| Sub-task | Owner | What |
|---|---|---|
| **Bureau data (SLIK/Pefindo)** | RM (Marketing) | RM pulls SLIK + Pefindo (Ops runs the server pull) → check kolektibilitas (Kol 1 ideal) |
| **Legal Review** | Legal officer | Validate document authenticity (akta notaris, SIUP, NIB) |

> 🏦 **Stage 2 is RM-coordinated (ADR-0007 — supersedes the dual-sign-off described historically below).**
> The "Marketing" lane owns Stage 2: **RM** collects docs, **pulls + summarizes SLIK/Pefindo/Rek-Koran**
> (RM's own data work; Ops runs the BI-Checking/Pefindo server pull, SLA 1 HK; AI-assisted summary), and
> **dispatches** to **Legal & Appraisal** (one role): **Analisa Yuridis** (Legal, SLA 2 HK from docs-complete)
> and **Penilaian internal/KJPP** (Appraisal, internal 2 HK / KJPP 3 HK short / 7–14 HK long). RM then builds
> the MUAP. **Risk Analyst never participates in Stage 2** — it only reviews the MUAP (Risk Review). AML
> (DTTOT/PEP/negative-list) is **CS's** check, recorded (1 HK).
>
> 🏦 **Pefindo** is pulled alongside SLIK; both feed the bureau-data summary.

**SLIK document (`slik_report`)**: **RM** (`slik` desk) uploads the SLIK report PDF (`docType: 'slik_report'`,
name "Laporan SLIK") at Stage 2 via the **Documents tab** (`required: true`, owned by desk `slik` = **RM**).
It is not in `buildRequiredDocuments()` (RM-collected intake docs only), so it is **excluded from the intake-doc
gate** (`muapToRiskBlockers`); SLIK has its own requirement on the Stage-2 SLIK→Feasibility handoff (gates 2→3). On
upload, OCR suggests `hardGates.kol`; RM confirms/overrides via the Kol control in the **Data tab**.

**Stage-2 gating (ADR-0007)**: there is **no Legal-sign gate on 2→3** — RM proceeds to MUAP-prep when its own
data (docs + SLIK/Kol) is in. Legal & Appraisal are **tracked deliverables** (SLA + audit), **not** a 2→3
sign-off. The real prerequisite sits at the **MUAP→Risk** boundary: the MUAP cannot be submitted to Risk
(advance to RSK) until **both Analisa Yuridis and Penilaian are complete** (they feed the MUAP). Enforced
server-side with a clear blocker reason.

**Re-verify on doc change**: replacing a verified document resets its per-doc legal verification, so the
Analisa-Yuridis-complete signal flips false until re-verified (the input changed).

**No SLIK decline-to-RM**: SLIK is RM-owned (RM is the originator), so there is no "decline SLIK to RM" — the
Stage-2 SLIK card is forward-only. A Kol hard-gate violation is a **signal**, not an auto-block. (The legacy
"Tolak SLIK & Kembalikan ke RM" + RA-owned-SLIK dual-sign-off model is **retired** — see ADR-0007.)

## Tenor, margin & monthly installment

> 📝 Placement and the flat-margin formula below are **NoEffort design** — sources don't specify where tenor/margin are captured or the installment math. Bank confirms the margin convention at Discovery W1.

**Two-pattern model — requested vs approved:**

| Field | Entered by | Stage | Notes |
|---|---|---|---|
| `requestedPlafond` | RM | **Stage 1** | Customer's ask — immutable after creation |
| `requestedTenorMonths` | RM | **Stage 1** | Customer's ask — immutable after creation |
| `marginRate` | Analyst | **Stage 3** | Analyst's draft margin — `null` at stages 1–2, `number` at 3–5 for flat akad, `null` always for profit-share |
| `approvedPlafond` | Komite | **Stage 5 decided** | Final Komite decision — present only on approve/conditional decided leaves |
| `approvedTenorMonths` | Komite | **Stage 5 decided** | Final Komite decision — present only on approve/conditional decided leaves |
| `approvedMarginRate` | Komite | **Stage 5 decided** | `number` for flat akad, `null` for profit-share — reuses the same flat/profit-share split as `marginRate` |

`akadType` is immutable end-to-end — Komite wanting a different akad = reject + re-application, not an amendment.

Approved fields are **absent** on reject-decided leaves and all Stage 1–4 / voting leaves. The delta (approved vs requested) is captured in the Stage 5 HistoryEntry `reason` field, auto-composed by the UI.

**`monthlyInstallment` — clean only for Murabahah & Ijarah (use approved values post-decision):**

```
totalMargin        = approvedPlafond × approvedMarginRate × (approvedTenorMonths / 12)
totalObligation    = approvedPlafond + totalMargin
monthlyInstallment = totalObligation / approvedTenorMonths
```

Pre-decision (Stage 3–4 estimate): substitute `requestedPlafond`, `requestedTenorMonths`, `marginRate`.

Flat-rate Murabahah (margin applied to original principal, not declining balance). **Ijarah** uses the same form if ujrah is expressed as a rate.

⚠️ **Musyarakah & Mudharabah have no fixed installment** — profit-sharing akad, payment is a share of actual business revenue (variable). DSR for these uses a *projected* monthly profit-share, entered manually by the Analyst. The full per-akad installment matrix awaits the Akad-types deep-dive.

## Stage 4 detail: decision routing

Three distinct paths from Stage 4:

| Action | Meaning | Routes to |
|---|---|---|
| **Approve** | Clean recommendation | Stage 5 (Committee) |
| **Conditional** | Recommend approve WITH conditions | Stage 5 (Committee) — forward verdict, not rework |
| **Reject** | Hard reject (OJK veto) | Stage 1 (RM) — pre-Komite close; RM notifies customer |
| **Kembalikan ke Analis** | Rework request | Stage 3 — always available, independent of any verdict |

`conditional` at Stage 4 is a forward signal: "I recommend approval, but Komite should enforce these conditions." The analysis is complete; the app advances to Komite. Conditions are surfaced in Komite or handled in Pencairan — not resolved by re-running Stage 3.

`reject` at Stage 4 is the OJK veto — app closes pre-Komite. Routes to Stage 1 so RM can notify the customer (see [§ Reject path](#reject-path-always-communicated-via-ao)).

`Kembalikan ke Analis` is a rework send-back (→ Stage 3), separate from the formal recommendation verdict. Risk may request additional analysis without issuing a rejection.

## Reject path: always communicated via RM

Whenever a loan application gets rejected at **any** stage (Stage 2 SLIK fail, Stage 4 Risk reject, Stage 5 Komite reject), customer-facing communication **always** flows back through RM:

- Reject → RM notified as action-owner → RM calls customer, logs communication
- Legal / Risk / Komite get notified **for-awareness-only**, never call customer directly

RM owns the relationship. Others only owe the analysis or the decision.

## Conditional approval: two flavors

> 📝 The Flavor A/B distinction and routing rules below are **NoEffort-proposed workflow design** — sources only state "Conditional" as a Komite decision option, not the two-flavor split or the "always route through Komite first" principle. Bank confirms at Discovery W1.

**Flavor A — Terms only** (no new documents needed)
- Examples: plafond turun (2M → 1.5M) · tenor lebih pendek (36 → 24 bulan) · margin naik 1% · personal guarantor letter only (existing pengurus, no new docs)
- Path: condition stated → Komite decides the conditional terms → if approved → RM communicates new terms → customer accept/reject → Pencairan or deal dies

**Flavor B — Needs new documents**
- Examples: tambah collateral (sertifikat tanah baru) · monthly reporting covenant · asuransi tambahan
- Path: condition stated → Komite decision → if approved → RM requests new docs from customer → docs uploaded → conditions verified during **Pencairan / Verifikasi Final** (not re-looped to Stage 3-4)

> **Design principle (📝 NoEffort)**: all conditional approvals route through Komite first. Document collection happens during Pencairan, not as a workflow re-loop. Reduces ping-pong.

## Komite decision mechanics (signed MoM — ADR-0005)

> **Superseded (ADR-0005, 2026.06.04):** there is **no in-app voting**. The chair records each app's outcome and attending Komite QR-sign the per-app MoM (≥2 Komite). The table below is the retired pre-ADR-0005 vote-model proposal, kept only as W1 domain reference. See `../decisions/0005-rapat-komite-signed-minutes.md`.

| Aspect | Spec |
|---|---|
| Vote storage | **One row per committee member** — name, vote, timestamp, optional comment. 📝 NoEffort data-model proposal. |
| Decision rule | **Default: Majority** (>50% of quorum present). 📝 NoEffort proposed; Bank confirms at Discovery W1. Admin-configurable (majority / unanimous / weighted). |
| Quorum | **Default: 2/3 of total Komite members**. 📝 NoEffort proposed; Bank confirms. Admin-configurable. |
| Edit after submit | **Not allowed** — vote is final once submitted (legal binding for OJK audit). 📝 NoEffort proposed; Bank confirms whether an edit window before quorum-close is acceptable. |

> Defaults based on Indonesian BPRS common practice (POJK 9/2024 + POJK 24/2018 — no OJK-mandated voting rule; set by Bank bylaws). See [OPEN-QUESTIONS.md](discovery-open-questions.md) for remaining Komite items to confirm (size, tiering, BWMP table).

## Decision messages: when required

> 📝 The matrix below is **NoEffort UX design**, not from sources. Applies to both Risk Review (Stage 4 `riskNote`) and Committee Decision (Stage 5 `komiteDecisionNote`). Bank may override at Discovery W1.

| Decision | Message field |
|---|---|
| **Approve** | Optional (boleh kosong; recommended for internal notes) |
| **Conditional** | **REQUIRED** — conditions must be explicit, otherwise meaningless |
| **Reject** | **REQUIRED** — RM needs the reason to communicate to the customer; OJK audit trail must not be blank on rejection |

UI implication: the **Conditional** and **Reject** submit buttons are **disabled** until the message field is non-empty.

## Komite session queue

> 🏦 **Bank SOP (2026-06-02): Komite sessions run Senin / Rabu / Jumat (Mon/Wed/Fri).** The MUAP must be submitted for Risk review and the Komite content (`contoh_format_presentasi_komite`) prepared ahead of the next session. **MOM (minutes / `contoh_format_mom`) is due maks H+1** after the session. The "pre-read + batch-vote" model is consistent with this. The exact session time is a W1 item.

The Manifesto's *"3 applications ready for the afternoon Komite"* refers to:
- Komite has **scheduled sessions Mon/Wed/Fri** 🏦
- Apps that cleared Stage 4 sit at Stage 5 **queued for the next session**
- Komite **pre-reads** MUAPs ahead of session, **votes in batch** during the session
- After the session, RM prepares the **MOM within H+1** 🏦

MIZAN UX implication: Komite should see "queue for next session" with the Mon/Wed/Fri calendar; RM should see "this app is in next Komite session" and an MOM-due (H+1) reminder.

## Committee decision routing

| Decision | Routes to | Data model |
|---|---|---|
| **Approve** | Stage 6 (Pencairan) immediately | — |
| **Conditional** | Stage 1 — RM records nasabah response | accept → Stage 6 (`conditionalResponse='accepted'`); decline → closed (`closeReason='nasabah-decline'`) |
| **Reject** | Stage 1 — RM notifies customer, then closes | `closeReason='committee-reject'` |

**`disbursementOpen(app)`** — built predicate: `approve OR (conditional AND conditionalResponse === 'accepted')`. Pencairan entry requires this to be true.

Conditional routing governs *where the app goes* — all Komite conditional outcomes route via RM → nasabah response first, regardless of Flavor A/B. Flavor A/B governs *what the conditions are* (terms-only vs. new docs); see [§ Conditional approval](#conditional-approval-two-flavors).

## Post-Komite: SP3, Akad & Pencairan

> 🏦 **Bank SOP (2026-06-02).** Between Komite approval and disbursement, Hijra runs an explicit **SP3 (Surat Penawaran/Persetujuan Pembiayaan)** chain that the prior model folded silently into Stage 6. The SOP order is:

| # | Step | Owner (🏦) | SLA (🏦) |
|---|---|---|---|
| 1 | **Draft SP3** | RM | — |
| 2 | **Review SP3** | Legal | 2 HK |
| 3 | **SP3 Final** | RM | — |
| 4 | **Persetujuan** (customer accepts the offer terms) | Nasabah (via RM) | — |
| 5 | **Draft Akad & Order Notaris** | Legal | Order Akad 2 HK |
| 6 | **Akad** (signing) | Nasabah (via RM) | — |
| 7 | **Checklist Pencairan** | RM | — |
| 8 | **Pencairan** (disbursement) | Operasional | same-day if docs complete ≤16:00 WIB |

Pencairan artifacts the SOP names: **NAP** (Nota Analisa Pembiayaan), **memo realisasi pembiayaan**, **draft_transfer_dana**, **checklist pencairan**. RM requests disbursement funds from Ops (`link_request_dana_realisasi`).

> **Reconciliation with the built Stage 6 sub-state machine (below):** the app's `DisbursementStatus` states (Verifikasi Final → Proses Akad → Menunggu Dokumen → Siap Cair → Cair) overlap but don't name the SP3 sub-loop. SP3 customer-acceptance (the offer the customer signs *before* akad) and akad-as-a-distinct-signing-step are **out of scope for V1** (decided 2026.06.08) — the build treats akad as the first signing event. See [scope-v1.md](scope-v1.md) (and [CURRENT-STATE.md](../CURRENT-STATE.md)).

## Stage 6: Pencairan (disbursement) sub-state machine

> 📝 Stage 6 Pencairan and its `DisbursementStatus` sub-state machine below are **NoEffort-proposed design** — sources mention Pencairan only as "fund disbursement" without enumerating states. Hijra's actual Pencairan SOP may differ. Confirm at Discovery W1.
>
> **App-confirmed enum values today: `Verifikasi Final` (entry) and `Cair` (terminal).** The three intermediate steps below are the intended checklist (carried from the prior Pencairan design) — their exact code enum values are not yet confirmed against the build.

Pencairan is a real **Stage 6**, not just a post-approval checklist. On Komite approval, the system sets `disbursementStatus = 'Verifikasi Final'` and transitions the application into **Stage 6 'Pencairan'**. Within Stage 6, a `DisbursementStatus` sub-state machine drives the steps to the terminal state **'Cair'** (disbursed); on reaching 'Cair' the application moves to portfolio (see [§ Post-disbursement: Portfolio Monitoring](#post-disbursement-portfolio-monitoring)).

`DisbursementStatus` sub-states:

1. **Verifikasi Final** — customer provides original signed docs; bank verifies authenticity (entry state, set on Komite approval)
2. **Proses Akad** — akad signing ceremony (notaris involved if needed); collateral docs finalized
3. **Menunggu Dokumen** — wait for collateral certificate, insurance, etc
4. **Siap Cair** — checklist complete ✅
5. **Cair** (terminal) — *MIZAN does NOT transfer funds in V1.* RM manually triggers transfer in core banking; MIZAN only tracks status. On 'Cair' the application moves to portfolio.

**`disbursementConditions`** tracks conditional-disbursement items — the document/term conditions attached to "approve with conditions" outcomes (Flavor B docs collected here, per [§ Conditional approval](#conditional-approval-two-flavors)). Each item is verified during Stage 6 rather than re-looped to Stage 3–4.

**Akad document (intended; not yet built).** The design intent is that Stage 6 generates the **Akad document** — the legal contract bound to the approved* values (`approvedPlafond` / `approvedTenorMonths` / `approvedMarginRate`) and signed during Pencairan (at **Proses Akad**). This document is **📝 NoEffort design and NOT yet built** — see [BUILD-STATE.md](../CURRENT-STATE.md) for current build status.

## Post-disbursement: Portfolio Monitoring

| Metric | Source | Threshold |
|---|---|---|
| **Kolektibilitas** (BI standard) | Updated periodically | 1–5 scale (see [GLOSSARY.md](../GLOSSARY.md)); slips trigger watch/NPL flags below |
| **Outstanding** vs **Plafond** | Customer drawdown history | Outstanding ≠ Plafond — track actual exposure |
| **Watch list** | Auto-flag when Kol slips to 2 📝 | Triggers risk review |
| **NPL flag** | Auto-flag when Kol ≥ 4 📝 | Collections team notified |

> 📝 Auto-flag triggers (Watch at Kol→2, NPL at Kol≥4) are NoEffort default rules — Bank may use different thresholds for internal early-warning. Confirm at Discovery W1.

## ⚠️ The send-back loop is the workflow's main pattern, not an exception

> 📝 The send-back-as-main-pattern characterization and the "2–4× bounces" estimate are **NoEffort empirical observation**, not in sources. The data-model implications below are NoEffort design proposals. Bank confirms at Discovery W1 whether send-back frequency matches their actual experience.

Stages are **not strictly sequential** — they form a **review loop**:

- Risk (Stage 4) finds an issue → sends back to Analyst (Stage 3) with a reason ("DSR needs recalc", "collateral value disputed")
- Analyst (Stage 3) finds a document problem → sends back to **RM (Stage 1)** ("akta page missing") — always to RM, not to Legal directly. RM re-collects from customer. Doc completeness, KOL, and LG-verification of docs (plus Appraisal + AML) all compose at the **MUAP→Risk submit** gate (`muapToRiskBlockers` — see [§ Stage-advance gate conditions](#stage-advance-gate-conditions)), so the deal cannot reach Risk Review with unverified docs. (Pre-redesign this was framed as a Stage 2→3 guarantee; since the RM-led redesign the Inisiasi desks run in parallel and these checks gate the MUAP→Risk submit, not the 2→3 advance.)
- Same loan application may bounce 2–4× between Analyst ↔ Risk before clean enough for Komite

**Implication for the data model**:
- Track **why** something was sent back (reason text, not just a state transition)
- Audit-log every transition — forward AND backward
- Don't conflate "current stage" with "highest stage reached"

## ⚠️ Risk Analyst (RA) has veto power over Komite

OJK regulation: if the **Risk Analyst (RA)** recommends **Reject**, Komite cannot override — they can only Reject or Conditional-approve with mitigation. So:

| Analyst recommends | Risk says | Komite may decide |
|---|---|---|
| Approve | Approve | Anything |
| Approve | Conditional | Approve (with conditions) or Reject |
| Approve | **Reject** | **Reject only** (no override) |

## 3 hard gates (auto-flag if violated, can kill apps before Komite)

Threshold definitions + numbers live in [GLOSSARY.md](../GLOSSARY.md) (DSR, LTV, Kol). This table owns only the **if-violated** action.

| Metric | If violated |
|---|---|
| **DSR** (Debt Service Ratio) 📝 | Borrower over-leveraged → likely reject |
| **LTV** (Loan-to-Value) 📝 | Risky collateral coverage → reject or require more collateral |
| **SLIK Kolektibilitas** 📝 | Customer has problems elsewhere → likely killed at Stage 2 |

Most apps that violate these never reach Komite.

## What an Analyst's day looks like (Manifesto vision)

- 08:00 — open MIZAN, glance at Kanban
- 08:15 — AI has drafted last night's analyses
- 09:00 — review, refine, send to Risk
- 10:00 — MUAP auto-generated, ready for afternoon Komite
- 11:30 — 3 loan applications queued for committee

(Pre-MIZAN: 1 loan application = full day.)
