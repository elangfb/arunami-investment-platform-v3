# Workflow Guide

> Status: Current (**as-built**)
> Last reviewed: 2026.06.04
> Source of truth for: origination stages, desk ownership, and workflow invariants
>
> ⚠️ **Shipped 2026.06.04 on this 6-stage engine:** the RM-led role/desk fold (AO+LA→RM, RT→RA;
> desk codes renamed to functional names), the **two-rung maker-checker ladders** (MUAP `RM→Team Leader`,
> RSK `RA→Risk Team Leader` — shortened from the original three/five-rung chains; shipped 2026.06.12 —
> typecheck+unit+integration verified; live smoke pending — [`../decisions/0021-two-rung-approval-chains.md`](../decisions/0021-two-rung-approval-chains.md)), and **Rapat Komite** (chair outcome + Komite-signed MoM, **no in-app voting** —
> `../decisions/0005-rapat-komite-signed-minutes.md`). The 4-phase grouping is a *derived* view; the
> engine **stays 6 stages** (the 6→4 *renumber* is the only deferred slice). Authoritative ladder/Rapat
> mechanics: `../designs/workflow-target.md` + `../designs/workflow-engine.md`; long-form domain detail (SP3→Akad
> chain, send-back mechanics, hard gates): `../references/workflow-detail.md`. The desk/routing sections
> below reflect the as-built stages; consult the design SSOTs for the full ladder detail.

## Invariants

- The workflow is a six-stage financing origination pipeline, plus a terminal `closed` state for applications that end without disbursement.
- Each stage has one or more owning desks. Work permissions are desk-based, not role-string based.
- Stage handoffs must close prior-stage assignments, open target-stage assignments, and append audit history.
- **Risk recommendation (Stage 4, RA):** `approve` AND `conditional` both forward to the committee (Stage 5) — `conditional` = "recommend approve WITH conditions", a forward verdict, not rework. `reject` routes back to RM (Stage 1). Rework is the always-available send-back to Stage 3 (RM).
- **Stage 2 `slik` desk (RM):** the SLIK/Pefindo bureau-data handoff is **forward-only** — there is **no decline-to-RM** (`slik` is RM-owned and the RM is the originator). RM may upload SLIK/Pefindo + enter Kol early from Stage 1 (optional; never gates 1→2); only the formal "Kirim SLIK ke Feasibility" handoff is Stage-2-only and advances 2→3. Legal send-back to RM lives on the Documents tab. A hard-gate violation (e.g. Kol above threshold) is a signal, not an automatic block — it does not by itself stop the handoff.
- **Committee decision routing:** `approve` → Stage 6 (disbursement). `conditional` → RM follow-up (Stage 1) where RM records the nasabah's response: **accept** advances to Stage 6 (decision stays `conditional` for audit, `conditionalResponse='accepted'`); **decline** closes the application (`closeReason='nasabah-decline'`). `reject` → RM follow-up; after notifying the nasabah, RM closes it (`closeReason='committee-reject'`).
- **Terminal state:** `applicationStatus='closed'` (+ `closeReason` + `closedAt`) is terminal — no further workflow action. Closed apps leave the active pipeline board but remain on the detail page (audit-first); `slaState` treats closed as done.
- `disbursementOpen(app)` is the single shared predicate for "reaches Pencairan" (`approve` OR accepted-`conditional`) — used by the action band, the disbursement actions, and the Pencairan tab; never re-derived.
- Navigation may be audit-visible, but actions are always server-gated.

## Stage Flow

> ℹ️ The RM-led pipeline redesign (ADRs 0018–0020) **shipped and merged to `main` 2026.06.12.** The intake hard-gates
> (docs-completeness / intake-OCR / NIK / AML-attestation) **no longer gate the Stage 1→2 advance** — they relocated to
> the **MUAP→Risk** handoff (`muapToRiskBlockers`, `lib/stage-action.ts`). Stages 1–3 are the **Inisiasi** segment and flow
> free of those gates. The six engine stages below are unchanged (`stage` Int); the redesign added a 5-segment display
> **spine** over them (Inisiasi → Analisis Risiko → Keputusan Komite → SP3 → Pencairan — `lib/pipeline-spine.ts`). See
> [`../CURRENT-STATE.md`](../CURRENT-STATE.md) and [`../designs/rm-led-pipeline-redesign.md`](../designs/rm-led-pipeline-redesign.md).

```txt
1 Pengajuan Dokumen (intake)
  -> 2 Legal, Agunan & Biro (legal + appraisal + slik)
  -> 3 Feasibility / MUAP (muap-author)
  -> 4 Risk / RSK (rsk-author)
  -> 5 Committee (komite)
  -> 6 Pencairan (pencairan)
```

Stage 2 is **RM-coordinated**. RM owns the bureau-data handoff (`slik`: SLIK + Pefindo upload + Kol entry); that handoff advances 2→3. Both SLIK and the advisory Pefindo are **RM-owned** and may be uploaded early from Stage 1 (optional — they never gate the 1→2 advance); SLIK is required for the 2→3 handoff, Pefindo stays optional throughout. Legal & Appraisal (`legal` + `appraisal`) record Analisa Yuridis and the agunan valuation path in parallel, remain editable through MUAP prep, and gate the MUAP→Risk submit — they do **not** control the 2→3 advance.

## Desk Model

| Desk | Owns |
| --- | --- |
| `intake` | Intake and conditional/reject follow-up (RM) |
| `legal` | Analisa Yuridis / legal document verification (LG) |
| `appraisal` | Penilaian agunan internal/KJPP path (LG) |
| `slik` | SLIK/Pefindo bureau data and Kol input (RM) |
| `muap-author` | Financials, feasibility analysis, MUAP (RM) |
| `rsk-author` | RSK and risk recommendation (RA) |
| `komite` | Committee scheduling, MoM-signing, decision flow (CM) |
| `pencairan` | Final disbursement (RM) |
| `MG` | Management observer |
| `ADMIN-*` | Admin console functions only, not workflow participation |
| `muap-tl` `rsk-rtl` | Maker-checker ladder rungs (single checker per chain: Team Leader freezes MUAP, Risk Team Leader freezes RSK) — see `../designs/workflow-target.md` and `../decisions/0021-two-rung-approval-chains.md` |

## Server Gates

- Use intent-specific server actions for writes.
- Use `assertDesk`, `assertCanActOnStage`, `assertCanWorkDesk`, or `assertCanParticipate` according to the operation.
- Keep stage-2 LG and `slik` (RM) writes separate; they intentionally cannot write each other's data.
- Stage-2 data writes are not handoffs: legal doc verification, SLIK upload, and Kol input prepare the desk's work; explicit LG (Legal) / RM (SLIK) "Kirim ke Feasibility" actions perform the formal handoff.
- A failed legal document verification must carry a human-readable fail reason; passing verification clears the reason.
- Supporting docs are owned by the current stage owner; required intake docs are owned by RM (`intake`) unless a specific action says otherwise.
- Upload implementation should share internals (byte storage, extraction/OCR, re-verification reset, audit) even when public server actions differ for checklist, SLIK, and supporting-document creation semantics.
- The Data navigation badge is an attention badge: count unconfirmed OCR suggestions plus conservative required-but-empty data for the relevant desk/stage; do not count optional blanks.
- Decision freezing includes the exact `ExploredSource[]` available at committee decision time in `DecisionCheckpoint`; never recompute research during freeze. The frozen MUAP/RSK PDFs are stored in **SeaweedFS** (`muapStorageKey`/`rskStorageKey`), not inline in Postgres; the inline `muapPdf`/`rskPdf` Bytes columns are legacy/nullable and only serve pre-SeaweedFS checkpoints via `checkpointPdf`'s fallback. The live editable doc stays in Google Docs; only the immutable snapshot lives in SeaweedFS.
- Closing an application is server-gated to the RM desks (`recordConditionalResponseAction` / `closeRejectedApplicationAction`, `intake ∪ pencairan`), idempotent, and audited; `'closed'` is terminal.

## Verified Correct

- Stage handoffs and send-back reset policies are implemented and audited.
- Committee chair decision and approved-terms validation are server-side.
- Disbursement step order and release conditions are server-side.
- AI and narrative paths are masked/audited according to the accepted compliance posture.
- Resolved audit findings are recorded in ADRs and previous test history; do not reintroduce generic client-authored patch writes.

## Key Files

- `src/lib/desks.ts`
- `src/lib/auth/can.ts`
- `src/lib/stage-action.ts`
- `src/lib/proses-steps.ts`
- `src/server/actions/application-*.ts`
- `src/server/actions/komite.ts`
- `src/server/actions/application-data.ts` (disbursement: `advanceDisbursementAction`; predicate `disbursementOpen` in `src/lib/stage-action.ts`)

## Change Checklist

- Confirm which desk owns the operation.
- Add the server assertion before mutating state.
- Keep audit history server-composed.
- Verify role/desk UI through superadmin impersonation when browser testing is needed.
- Stage-5 proposed agenda auto-assign selects eligible Stage-5 apps by template routing filter/capacity and records per-app routing reasons; CM must confirm/cancel proposed meetings before the committee records outcomes / signs the MoM (no in-app voting — ADR-0005). P3 chair/attendee rotation waits for explicit policy rules.
- Keep ops/legal/live gates tracked in `docs/guides/launch-gates.md` as launch blockers rather than hidden app-code TODOs.
