# Glossary

Terms-only — *what the words mean* in Mizan, one line each. This is the canonical
domain glossary (the "terms" context layer). For *why* a choice was made see
`decisions/`; for *where* code lives see `apps/web-app/AGENTS.md` (Source Map).

Deeper domain detail lives in `references/` (`akad-types`, `komite-mechanics`, `compliance`,
`required-docs-matrix`, `personas`, `sla-targets`). Terms below are one line each.

## Core entities

| Term | Meaning |
|---|---|
| **nasabah** | Borrower / financing applicant — individual or business; the named party in the akad. |
| **akad** | The syariah financing contract structure. Supported: Murabahah (fixed margin), Ijarah (lease/ujrah), Musyarakah (profit-share partnership), Mudharabah (trustee profit-share). |
| **plafond** | Proposed financing principal — `requestedPlafond` at intake, `approvedPlafond` after committee; drives DSR/LTV and disbursement. |
| **tenor** | Financing term in months (`requested`/`approved`); affects installment (DSR) and total margin. |
| **baki debet** | Outstanding debt balance per the SLIK report — tracked for applicant, directors, commissioners. |
| **review** | *(design — not built; `designs/rm-led-pipeline-redesign.md`)* Bank-initiated periodic re-assessment of a disbursed facility (cadence-flagged, default 12 months); reuses the full origination pipeline, references the source app. |
| **adendum** | *(design — not built)* Nasabah-initiated change to an existing facility's terms/akad; reuses the pipeline, references the prior app via the lineage chain. May also be the change-branch of a `review`. |
| **originType** | *(design — not built)* Per-application flag `original / review / adendum` — *why* an app started, by initiator (review = Bank, adendum = Nasabah). |
| **facility** | *(design — not built; no dedicated entity yet, deferred)* A disbursed financing + its amendment lineage (chain of `original → review/adendum` apps); "current terms" = the chain head. |
| **colek** | *(design — not built)* In-app dispatch: RM "nudges" another desk with a tracked request (requested-by/at · assignee · status `diminta → dikerjakan → selesai`) + a notification — e.g. "Minta Analisa Yuridis" to Legal & Appraisal. Deliberately small: request + notify + track, not a ticketing system. → `designs/rm-led-pipeline-redesign.md` |
| **W1** | Discovery **Workshop 1** with the Bank — the ratification checkpoint where 📝 NoEffort-proposed defaults become ✅ Bank-confirmed (config values, quorum, SLA numbers, compliance posture). "Pending W1" = decided provisionally, awaiting Bank sign-off. → `references/config-ratification-w1.md` |

## Roles & desks

| Term | Meaning |
|---|---|
| **desk** | A permission-scoped workflow unit tied to a Role; authz is server-authoritative and stage-windowed. Canonical enum: `apps/web-app/src/lib/desks.ts`. Target RBAC is **two-layer**: **desk = granular permission**, **role = composition of desks** (`decisions/0003`). |
| **RM** | Relationship Manager — borrower-facing origination owner; **folds** the former AO (intake + disbursement) and LA (feasibility + MUAP) into one role (2026.06.04 role fold). Also owns the Stage-2 **bureau data** (SLIK + Pefindo upload + Kol entry; D1 2026.06.05 / ADR-0007 moved this from the Risk Analyst). Desks `intake`, `slik`, `muap-author`, `pencairan`. |
| **LG** | Legal Officer — verifies document authenticity/completeness at Stage 2. Desk `legal`. |
| **RA** | Risk Analyst (formerly "Risk Team"/RT) — owns the Stage-4 RSK (drafts RSK + recommendation). Desk `rsk-author`. (SLIK/Kol is **no longer** an RA desk — moved to the RM, D1 2026.06.05 / ADR-0007.) |
| **CM** | Committee Member (Komite Pembiayaan) — Stage 5; one acts as Ketua (chair). Desk `komite`. |
| **DPS** | Dewan Pengawas Syariah (syariah supervisory board) — sharia oversight via the **Stage-5 `dps-review` conditional gate** (a sharia opinion). **No longer an RSK signer:** the per-RSK DPS signature was dropped when the ladder was shortened (2026.06.12, `decisions/0021-two-rung-approval-chains.md`); the former `rsk-dps` signer desk is removed. `designs/workflow-target.md`. |
| **MG** | Management — read-only observer across all stages (compliance/audit). Desk `MG`. |
| **maker-checker desks** | Signature-ladder rungs gated by `hasDesk`: `muap-tl` (MUAP ladder) and `rsk-rtl` (RSK ladder). Rules in `lib/approval-chain.ts`. Two-rung chains shipped 2026.06.12 — typecheck+unit+integration verified; live smoke pending (`decisions/0021-two-rung-approval-chains.md`); the former rungs `muap-bm`/`rsk-ro`/`rsk-cro`/`rsk-dps` are removed. |
| **admin desks** | `ADMIN-USERS`, `ADMIN-MASTER`, `ADMIN-POLICY` — user, master-data, and policy administration. |

## Pipeline (6 stages)

| Term | Meaning |
|---|---|
| **Stage 1 — Pengajuan Dokumen** | RM intake of application + required documents. |
| **Stage 2 — Legal, Agunan & Biro** | RM-coordinated Legal & Appraisal support: LG records Analisa Yuridis + Penilaian agunan; RM uploads SLIK/Pefindo and inputs Kol. 2→3 advances on RM bureau handoff; Legal/Appraisal gate MUAP→Risk. |
| **Stage 3 — Feasibility / MUAP** | RM performs the 5C+1S analysis ("Studi Kelayakan") and drafts the MUAP. |
| **Stage 4 — Risk Review** | RA drafts the RSK and recommends approve / conditional / reject. |
| **Stage 5 — Committee Decision** | Komite decides via a **signed MoM** — the chair records the outcome and attending Komite QR-sign the per-app MoM → Approve / Conditional / Reject (no in-app voting; `decisions/0005-rapat-komite-signed-minutes.md`). |
| **Stage 6 — Pencairan** | RM executes disbursement after an approve or accepted-conditional decision. |
| **Komite / Rapat Komite** | The committee meeting event (Stage 5): the chair records each app's outcome and attending Komite QR-sign its per-app MoM — **no in-app voting** (`decisions/0005-rapat-komite-signed-minutes.md`); ≥2 Komite signatures required to route. |

## Documents

| Term | Meaning |
|---|---|
| **MUAP** | *Memorandum Usulan Analisa Pembiayaan* — the financing-proposal document authored by the analyst; frozen to PDF (SeaweedFS) at committee decision. |
| **RSK** | *Risk Summary Komite* — the risk assessment authored by **RA** at Stage 4; frozen to PDF at decision. |
| **SLIK** | *Sistem Layanan Informasi Keuangan* — OJK's credit-information system; **RM** uploads its report at Stage 2 (moved from RA, D1 2026.06.05 / ADR-0007). |

## Risk & finance

| Term | Meaning |
|---|---|
| **kol / kolektibilitas** | OJK credit-collectability grade (1 = current … 5 = bad debt); extracted from SLIK. |
| **DSR** | Debt Service Ratio — installment ÷ net monthly income; hard-gate (default ≤ 40%). |
| **LTV** | Loan-to-Value — plafond ÷ collateral appraised value; hard-gate (default ≤ 70%). |
| **hard gate** | An OJK risk threshold (DSR / LTV / Kol) that flags a blocker when exceeded; computed live from active policy, never literals (`lib/hardGates.ts`). |
| **5C + 1S** | Analysis framework: Character, Capacity, Capital, Condition, Collateral + Syariah compliance; scored per aspect, weighted to a recommendation (`lib/scoring.ts`). |

## Decision verbs

| Term | Meaning |
|---|---|
| **Approve / Conditional / Reject** | Committee verdicts (rendered in English by deliberate exception). `Conditional` = "approve with conditions" — a *forward* verdict, not rework; branches on the nasabah's accept/decline response. |
| **closed** | Terminal application status (`+ closeReason + closedAt`) — drops from the active board but stays on the detail page (audit-first). |

## Roles & desks — Bank SOP / target lanes

> The RM-led restructure **shipped 2026.06.04** (maker-checker ladders + Rapat Komite; the engine stays
> 6-stage — `designs/workflow-target.md`, `CURRENT-STATE.md`). The maker-checker rungs below are now
> RBAC desks; the remaining SOP org lanes (CS/Ops/Appraisal/Finance/Compliance) are **org context, not
> RBAC desks**. Full detail in `references/personas.md`.

| Term | Meaning |
|---|---|
| **RM** | Relationship Manager (SOP "Marketing" lane) — origination owner (intake, SLIK/Pefindo pull, 5C+1S, MUAP, SP3 draft) + comms hub. **As-built since the 2026.06.04 fold, RM owns this** — the former AO (intake/disbursement) + LA (feasibility/MUAP) folded into RM. |
| **CS** | Customer Service (📝 expansion, W1) — runs the **external** AML screening (DTTOT/PEP/negative-list), SLA 1 HK; MIZAN records only the RM attestation, performs no screening. |
| **Ops / Operasional** | Bureau pull (SLIK/Pefindo "BI Checking"), Pencairan, penjaminan & asuransi — **outside the Mizan system** (MIZAN records the RM-held bureau info + an RM-maintained Pencairan checklist; does not orchestrate Ops). `decisions/0003`. |
| **Legal** | Analisa Yuridis, Review SP3, Order Akad & Notaris. |
| **Appraisal** | Penilaian Jaminan — internal or via KJPP. |
| **Finance** | Special-rate (pricing-exception) approval. |
| **Compliance** | Sharia-compliance review + konfirmasi ketentuan (operational desk; ≠ DPS). |
| **TL/SPV** | Team Leader / Supervisor — origination maker-checker reviewer; the **final MUAP signer** (MUAP freezes after TL/SPV signs). |
| **RTL** | Risk Team Leader — risk-side maker-checker reviewer; the **final RSK signer** (RSK freezes after RTL signs); the risk-side analogue of MUAP's Team Leader. Desk `rsk-rtl` (`decisions/0021-two-rung-approval-chains.md`). |
| **BM/KU** | Branch Manager / Kepala Unit — senior branch authority; **no longer a MUAP signer** since the ladder was shortened (2026.06.12) — MUAP now freezes at the Team Leader. May still sit on Komite via the `komite` desk. |
| **CRO** | Chief Risk Officer — senior risk authority; **no longer an RSK signer** since the ladder was shortened (2026.06.12) — RSK now freezes at the Risk Team Leader. May sit on Komite via the `komite` desk (the former RSK-signer COI flag is retired). |
| **maker-checker** | Approval pattern (built 2026.06.04): a *maker* authors a doc, then sequential *checkers* sign; the doc must be FINAL (all signed) before it advances. Ladders (shortened 2026.06.12, `decisions/0021-two-rung-approval-chains.md`): MUAP (RM → Team Leader), RSK (Risk Analyst → Risk Team Leader). `designs/workflow-target.md`. |
| **role (vs desk)** | A job = a **composition of desks**. Two-layer RBAC: desk = granular permission, role = bundle; reassign work by recomposing roles, not by changing the flow. `decisions/0003`. |
| **QR signing (Hijra)** | Target signature form: an **internal Hijra QR**, unique per **(signer × document version)**, scannable → who signed + when (basic traceable signing, **not** e-meterai/external digital cert). **Token, identity & verify are Mizan-owned** (long unguessable `qrToken` on the `ApprovalStep` ledger; auth-walled `/qr/<token>` verify) — no external signing authority. The QR **image** is rendered by an external QR-render API that only ever sees the opaque, no-PII verify URL (`insertInlineImage` can't take base64). Fills MUAP `§sig` / RSK `§IX` + SP3/MOM. Akad (step 14) stays a separate notarial instrument. SSOT: `designs/document-system.md` §Signing. |

## Regulatory & compliance

| Term | Meaning |
|---|---|
| **OJK** | Otoritas Jasa Keuangan — Indonesia's financial-services regulator; MIZAN's compliance lens. |
| **POJK** | Peraturan OJK; MIZAN must satisfy **POJK 34/2025** (BPR/BPRS IT). |
| **UU PDP** | UU 27/2022, Personal Data Protection Law; **§56** governs cross-border data transfer. |
| **DPA** | Data Processing Agreement — UU PDP §56(b) basis for cross-border AI inference (Google Cloud / Vertex). |
| **AML / APU-PPT** | Anti-money-laundering & terrorism-financing prevention; at Hijra runs as the external CS check. |
| **DTTOT** | Daftar Terduga Teroris dan Organisasi Teroris — terror/sanctions watchlist; a name match is a hard block. |
| **PEP** | Politically Exposed Persons — triggers enhanced due diligence (not auto-reject). |
| **RAC** | Risk Acceptance Criteria ("RAC Pembiayaan Produktif") — Bank ruleset; likely authoritative for hard-gate thresholds (obtain at W1). |
| **Audit Trail** | Immutable who/when/what/why log of every consequential action; OJK-required. |
| **BPRS** | Bank Pembiayaan Rakyat Syariah — Indonesia's tier-2 Islamic micro-finance category; Hijra = PT BPRS Hijra Alami. |

## Credit & finance (extended)

| Term | Meaning |
|---|---|
| **Pefindo** | Indonesia's main **private** credit bureau; pulled alongside SLIK, feeds the bureau summary. |
| **Outstanding** | Amount actually drawn / still owed — ≠ plafond; portfolio monitoring tracks this. |
| **NPL** | Non-Performing Loan — Kol ≥ 4; auto-flagged in portfolio monitoring. |
| **Hapus Buku** | Loan write-off (Kol 5); removed from active books to off-balance. |
| **Restrukturisasi** | Restructuring a struggling loan (extend tenor / lower installment / modify margin) to avoid default. |
| **Kol scale** | 1 Lancar (0d) · 2 Dalam Perhatian Khusus (31–90d) · 3 Diragukan (91–120d) · 4 Macet (121–180d) · 5 Loss/Hapus Buku (>180d). Source: SLIK. |
| **Syariah (+1S)** | Islamic-law compliance — the "1S" in 5C+1S; akad must be compliant, business non-haram. |

## Documents & process (extended)

| Term | Meaning |
|---|---|
| **SP3** | Surat Penawaran/Persetujuan Pembiayaan — formal offer letter after Komite approval: RM draft → Legal review (2 HK) → Final → customer Persetujuan → Akad (confirmed target; `designs/workflow-target.md`). |
| **MOM** | Minutes of Meeting — Komite session minutes, due ≤ H+1 business day. |
| **NAP** | Nota Analisa Pembiayaan — disbursement-stage analysis note (Persiapan Pencairan). |
| **KJPP** | Kantor Jasa Penilai Publik — licensed external appraiser for collateral valuation. |

## Document & legal-entity abbreviations

| Term | Meaning |
|---|---|
| **KTP** | Kartu Tanda Penduduk — national ID. |
| **KK** | Kartu Keluarga — family card. |
| **NPWP** | Nomor Pokok Wajib Pajak — tax ID. |
| **NIB** | Nomor Induk Berusaha — business registration number. |
| **SIUP** | Surat Izin Usaha Perdagangan — trade licence. |
| **SPT** | Surat Pemberitahuan (Tahunan) — (annual) tax return. |
| **SK** | Surat Keputusan — decree (e.g. SK Kemenkumham legalising an akta). |
| **Akta** | Akta Pendirian/Perubahan — deed of establishment/amendment (PT). |
| **SHM / SHGB** | Sertifikat Hak Milik / Guna Bangunan — land titles (freehold / right-to-build). |
| **IMB / PBG** | Izin Mendirikan Bangunan / Persetujuan Bangunan Gedung — building permit (PBG = post-2021 successor). |
| **PBB** | Pajak Bumi dan Bangunan — land & building tax receipt. |
| **BPKB** | Buku Pemilik Kendaraan Bermotor — vehicle ownership book. |
| **STNK** | Surat Tanda Nomor Kendaraan — vehicle registration. |
| **RAB** | Rencana Anggaran Biaya — cost/budget plan (modal kerja / pembangunan). |
| **SPK / PO** | Surat Perintah Kerja / Purchase Order — project-financing work/purchase order. |
| **BWMP** | Batas Wewenang Memutus Pembiayaan — financing-approval authority limits per approver tier. |

## Workflow engine (architecture)

| Term | Meaning |
|---|---|
| **command-sourced engine** | Mizan's workflow model: every mutation is a typed command through **one** pure guarded reducer (`decide`); no scattered field writes. `decisions/0004`, `designs/workflow-engine.md`. |
| **append-only ledger** | A physically insert-only table (never updated/deleted): `ApprovalStep`, `HistoryEntry`, `DocumentVersion` — the regulated, audited facts; re-handling appends rows. (Today `saveApplication` delete+recreates them — the foundation fix.) |
| **snapshot-authoritative** | The named `WorkflowSnapshot` (phase/step, not a bare integer) is the operational truth for board/queue/guards — written only through the command seam, atomically with the ledger inserts; rebuildable, not a second SSOT. **⚠️ Target state — NOT yet built:** today `WorkflowSnapshot` is a *derived* projection (`deriveWorkflowSnapshot`) and `stage` (Int) is the authoritative cursor; persisting it is **pending** (`decisions/0004`, `planning/workflow-snapshot-persistence.md`). |
| **event sourcing** | Pattern where an append-only event log is the single source of truth and state is a pure projection (fold). Considered and **rejected** for Mizan V1 (over-engineered at this scale; split-truth trap). `decisions/0004`. |
| **split-truth trap** | The failure mode of *partial* event sourcing — an event log, a snapshot, and the working documents become three competing truths that disagree exactly on the regulated edge cases (re-upload, send-back, mid-ladder rework). Why Mizan keeps facts in append-only ledgers, not a generic event log. `decisions/0004`. |
| **proposal (vs workflow)** | The mutable deal data RM revises freely pre-Komite — akad, plafond, tenor, margin/nisbah, collateral, purpose. Each revision is `+HistoryEntry`, **not** a workflow transition; negotiation loops live here so the state machine stays small. Frozen at the Komite decision. `designs/workflow-engine.md`. |
| **two-axis RBAC** | Mizan's access model: **read = open** (any authenticated staff views any application, V1) but **action = desk-scoped** (write/sign/decide needs the desk). Visibility is pull (never gates collaboration); tasking is push (scoped). `designs/workflow-engine.md`. |
| **@mention** | Tagging a role/person in a per-application comment thread → a notification (polling V1) + the comment, captured in the audit trail. The optional, ungated in-app collaboration surface. |
| **document versioning / rollback** | MUAP/RSK/SP3 + proposal are versioned via the append-only `DocumentVersion` ledger; every important step auto-captured. `RollbackDocument` restores a prior version as a **new** current version (nothing destroyed); any two versions compare/diff. |
