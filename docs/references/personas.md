# MIZAN — Users & UX

- **Type:** stable spec (domain/UX) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/PERSONAS.md` (retired); 🏦 Bank SOP role lanes + NoEffort UX.
- **Used by:** RBAC/desk design, `../GLOSSARY.md`, `../designs/workflow-target.md`.
- **Review trigger:** Discovery W1 (new-desk RBAC scope).

> **Reconcile:** RM-led model = confirmed go-forward target (gate open); as-built code is still 6-stage/desk per `../GLOSSARY.md` until the restructure ships.

> All users below are **internal Hijra Bank staff**. MIZAN is B2B-internal, not customer-facing. Volume context: **~30 financings / month** (BPRS scale).
>
> **🏦 marker = confirmed by Hijra's own SOP slides** (`Hijra Bank Process - 1…5`, WhatsApp 2026-06-02; transcribed in [HIJRA-BANK-SOP-DIGEST.md](hijra-bank-sop-digest.md)). Stronger than 📝 NoEffort-proposed; pending only formal ratification at Discovery W1.
>
> 🏦 **Role model (Bank SOP 2026-06-02).** Hijra's live org lanes are **Marketing · Legal & Appraisal · Analyst · Komite · Operasional**. The mapping to MIZAN roles:
> - **Marketing = RM** — front-line owner of origination: intake/visit, document collection, SLIK+Pefindo pull, **MUAP authoring (incl. 5C+1S feasibility)**, SP3 drafting, Pencairan checklist. **The communication hub** — every other desk talks through Marketing.
> - **"Analyst" lane = Risk** — the SOP's *Analyst* lane performs **Risk Review** ("Review Usulan Pembiayaan"); it is **not** a separate feasibility analyst. There is no standalone Loan-Analyst desk: 5C+1S is RM work inside the MUAP.
> - **Legal & Appraisal · Komite · Operasional** map to Legal/Appraisal desks, Komite Pembiayaan, and Ops (see new desks below).
>
> This confirms the prior "📝 updated understanding": the separate **AO/Analis split is dissolved** — one **RM** owns Stages 1–3. The standalone **Loan Analyst (LA)** persona below is retained only as a historical note (merged into RM).

## The five users

> 📝 Persona "Wants / MIZAN gives" mappings below are **NoEffort interpretation** based on Manifesto Slide 8 persona snippets — sources don't enumerate persona pain points or feature lists in detail. Bank stakeholders (especially LA lead + CM chair at Discovery W1) confirm whether these match their reality.

### 🤝 RM — Relationship Manager (Marketing) *(owns Stages 1–3 🏦)*
- **Reality**: front-line role — meets customers at branch, gathers needs, collects docs, pulls SLIK+Pefindo, runs feasibility, drafts MUAP, drafts SP3, prepares Komite content + schedule + MOM, runs the Pencairan checklist.
- **Wants**: simple intake form, AI-drafted analysis, single place to track all open files, one-click MUAP.
- **MIZAN gives**: Stage 1 form, document upload module, SLIK/Pefindo summarization assist, AI-assisted 5C+1S drafts, MUAP generation, pipeline visibility.
- 🏦 **Bank SOP (2026-06-02)**: confirmed as the "Marketing" lane — one person owns Stage 1 (intake), Stage 2 (SLIK/Pefindo + coordinating Legal/Appraisal/CS), and Stage 3 (5C+1S, MUAP). RM is the **communication hub**: every supporting desk (Legal, Appraisal, Risk, Finance, Compliance, CS, Ops, Komite) routes through Marketing. The AO/LA split is dissolved into this single RM role; the 6→4 stage restructuring (gated in app build) is the correct model.

### 🧑‍💼 LA — Loan Analyst (Analis Pembiayaan) *(🏦 merged into RM — historical note)*
- 🏦 **Bank SOP (2026-06-02)**: there is **no standalone Loan-Analyst desk** at Hijra. The 5C+1S feasibility work lives inside the RM's MUAP authoring; the SOP's "Analyst" lane is **Risk** (see RT below). This persona is kept only to explain the dissolved split. The capabilities below now belong to **RM**.
- **The work (now RM's)**: juggles parallel loan applications; was drowning in admin (re-keying data, chasing documents, formatting MUAP).
- **MIZAN gives**: Kanban pipeline, AI-assisted analysis drafts (with masking), AI Chat for follow-ups, MUAP generation.
- **External research stays manual**: AI is **doc-bound** in V1 (compliance + hallucination risk); RM still does Google, LinkedIn, trade checking, site visits — adds findings to MUAP manually.

### 🛡️ RT — Risk Team (the SOP "Analyst" lane) *(owns Stage 4 — has VETO power)*
- 🏦 **Bank SOP (2026-06-02)**: this is the lane the Bank labels **"Analyst"** — it performs **Review Usulan Pembiayaan** (Risk Review), distinct from RM's feasibility. SLA 3 hari kerja (18 jam), processed by queue.
- **Reality**: needs cross-portfolio visibility; calibrates risk frameworks against historical outcomes.
- **Wants**: portfolio dashboards, framework consistency, historical lookback.
- **MIZAN gives**: portfolio dashboards, risk-flag rules, decision archive.
- **⚠️ Risk's "Reject" cannot be overridden by Komite** (OJK rule). Risk is the real gate; Komite formalizes.

### 🧑‍⚖️ CM — Komite Pembiayaan *(owns Stage 5)*
- **Reality**: reviews packets in meetings; voting + minutes are paper-heavy.
- **Wants**: trustworthy MUAP, digital voting, audit-ready records.
- **MIZAN gives**: committee workspace, approval workflow, e-signature placeholder (V1), auto-minuted decisions.

### 📊 MG — Management *(observer)*
- **Reality**: waits for monthly reports; can't see SLA breaches in time.
- **Wants**: real-time pipeline volume, SLA health, NPL trends.
- **MIZAN gives**: live management dashboard with drill-downs.
- **Discussion**: read-only observer — cannot post to the application discussion thread. Enforced server-side (`assertCanParticipate` gate).

## 🏦 Supporting desks (Bank SOP 2026-06-02)

The SOP's "Communication Line" slide shows Marketing at the hub with these supporting desks. They were **not in the original persona roster**; all communicate **through RM**, never desk-to-desk. RBAC scope for each is an Discovery-W1 item ([OPEN-QUESTIONS.md](discovery-open-questions.md)).

| Desk | Function (per SOP) | When in the flow |
|---|---|---|
| **Legal** | Analisa Yuridis · Review SP3 · Order Akad & Notaris | Stage 2 (yuridis); post-Komite (SP3 review, akad) |
| **Appraisal** | Penilaian Jaminan — internal or KJPP | Stage 2/3 (collateral valuation) |
| **Finance** | **Permohonan Special Rate** (margin/pricing exception) | On-demand, before Komite/SP3 |
| **Compliance** | **Review Sharia Compliance · Konfirmasi ketentuan** | Around MUAP/akad — operational desk, distinct from **DPS** (Dewan Pengawas Syariah — the Stage-5 sharia-opinion gate; **no longer an RSK signer** since the ladder was shortened 2026.06.12 — see [GLOSSARY.md](../GLOSSARY.md) / [WORKFLOW-TARGET.md](../designs/workflow-target.md)) |
| **CS** | **AML: DTTOT, PEP & negative-list checking** | Early/intake (sanctions screening), SLA 1 HK |
| **Operasional (Ops)** | BI Checking/Pefindo · Pencairan · penjaminan & asuransi | Stage 2 (bureau pull) + Stage 6 (disbursement) |

> ⚠️ **AML (CS desk)** is a new compliance surface. **V1 decision (2026-06-02)**: the actual DTTOT/PEP/negative-list screening is done **outside MIZAN** by CS; in-system, the **RM ticks a mandatory "Initial AML checking PASSED" attestation** during Inisiasi (part of the MUAP→Risk submit gate since the RM-led redesign 2026.06.12; formerly a Stage 1→2 gate; audit-logged). RM attests *initial* awareness only — deep-dive + hard block stay with CS externally. See [WORKFLOW.md](workflow-detail.md) §AML and [COMPLIANCE.md](compliance.md).
>
> **Finance / Compliance / CS are conditional support desks**, not every-deal mainline owners — they act when triggered (special rate requested, Sharia question, AML hit). **Legal · Appraisal · Ops** are mainline supporting desks on most productive-financing deals.

## Approval chain roles (📝 pending Bank confirmation at Discovery W1)

Identified from MUAP and RSK document signatures. Both ladders are **two-rung maker-checker chains, built** (shipped 2026.06.12 — typecheck+unit+integration verified; live smoke pending). Decision record: [ADR-0021](../decisions/0021-two-rung-approval-chains.md).

| Role | Chain | Function |
|---|---|---|
| **TL/SPV** | Origination (MUAP) | Reviews RM's completed work, then **final MUAP signer** — MUAP is frozen after TL/SPV signs (MUAP ladder = RM → Team Leader) |
| **Risk Analyst** | Risk Analysis (RSK) | Maker for the formal risk review — same domain as current RT persona |
| **Risk Team Leader** | Risk Analysis (RSK) | Authority sign-off on RSK doc; RSK frozen after Risk Team Leader signs (RSK ladder = Risk Analyst → Risk Team Leader). The risk-side analogue of MUAP's Team Leader — desk `rsk-rtl`, role `risk-team-leader`, seeded demo persona **u-demo-rtl "Rini Tania Lestari"** |

## Owner per stage (anchor for permissions & UX)

| Stage | Owner | Supporting desks (Bank SOP) | Persona |
|---|---|---|---|
| 1 · Pengajuan Dokumen | RM 🏦 | CS (AML screening) | RM |
| 2 · Legal, Agunan & Biro | RM 🏦 *(coordinates; not RA-owned)* | Legal (yuridis), Appraisal (agunan), Ops/bureau data (SLIK/Pefindo pull) | RM + LG support |
| 3 · Feasibility / MUAP (5C+1S) | RM 🏦 | Compliance (Sharia), Finance (special rate, if any) | RM |
| 4 · Risk Review / RSK | Risk Team (**veto**) 🏦 *(SOP "Analyst" lane)* | — | RA |
| 5 · Committee Decision | Komite | — | CM |
| Post-Komite · SP3 + Akad | RM (drafts SP3) 🏦 | Legal (Review SP3, Order Akad & Notaris) | RM |
| Pencairan (disbursement) | Operasional 🏦 *(RM prepares checklist)* | Ops (transfer), Legal (akad) | RM, Ops |
| Portfolio Monitoring | Risk + Management 📝 | — | RT, MG |

> 🏦 Stage 1+2+3 ownership confirmed by Bank SOP (2026-06-02): all three handled by the same RM ("Marketing" lane). The 6→4 stage restructuring collapses these into a single Origination stage. Supporting desks act through RM.
>
> 🏦 Pencairan is **Ops-owned** (SOP "Operasional" lane); RM only prepares the checklist + requests funds. SP3 (Surat Penawaran/Persetujuan Pembiayaan) is an explicit post-Komite artifact — see [WORKFLOW.md](workflow-detail.md).
>
> 📝 Portfolio Monitoring owner attribution remains a NoEffort proposal — not in the SOP slides. Bank confirms at Discovery W1.

## Send-back between stages is normal

The Stage 3 ↔ 4 send-back loop is the workflow's main pattern (see [WORKFLOW.md](workflow-detail.md) for mechanics + bounce frequency). UI must make "send back with reason" a first-class action — not buried.

## Who-asks-what (anchors feature priority)

| Question | Persona | Where MIZAN answers it |
|---|---|---|
| "What's on my plate this week?" | RM | Kanban pipeline |
| "Did I forget to upload anything?" | RM | Stage 1 doc checklist |
| "Where is loan application #1234 stuck?" | RM, RT, MG | Application timeline |
| "Is this akad Syariah-compliant?" | RM, CM, Compliance | 5C+1S panel (Syariah lens) |
| "Why did the AI flag this case?" | RM | AI Chat — open the AI's reasoning |
| "Should I block this app on concentration risk?" | RT | Risk-flag rules + portfolio view |
| "Did the committee approve and on what terms?" | CM, audit | Committee workspace + minutes |
| "Are we meeting SLA this month?" | MG | Live dashboard |

## Non-personas (do NOT design for)

- **End customers** — MIZAN is internal-only; consumer side belongs to a separate Hijra app.
- **IT admins** — not a workflow participant, but the Admin role is now a real **config layer**, not a minimal UI: three admin desks (ADMIN-USERS / ADMIN-MASTER / ADMIN-POLICY) plus a **superadmin** who alone may grant admin-desk access. Governs the rules the pipeline runs under (SLA targets, risk-policy thresholds), not applications. 📝 NoEffort design — see [ADMIN.md](../designs/admin-config-layer.md). Still not a *primary day-to-day* persona.
- **External regulators** — they consume audit reports, not the live UI.

## UX principles

> 📝 UX principles below are **NoEffort design proposals** synthesizing the Manifesto's usability slide (Slide 9) — sources don't list these five rules verbatim. Bank may add/override at Discovery W1. (Principle 3 "AI drafts, humans decide" is the only one explicitly mirrored in Manifesto Slide 7.)

1. **"If you need a manual, the design isn't finished."** Every screen self-explains.
2. **One primary action per screen.** Inform, never confuse.
3. **AI drafts, humans decide.** Always show *why* the AI suggested something. Never auto-approve.
4. **Audit-visible.** Every consequential action shows who/when/why on hover.
5. **Cross-team in one space.** No email handoffs — RM, Risk, Komite see the same record.
