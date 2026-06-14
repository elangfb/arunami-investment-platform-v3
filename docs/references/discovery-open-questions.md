# MIZAN — Open Questions for Discovery (W1)

- **Type:** living register (W1 checklist) · **Status:** Living register · **Last reviewed:** 2026.06.04
- **Provenance:** merged from `brainstorm/OPEN-QUESTIONS.md` (retired).
- **Used by:** Discovery W1 PRD; cross-cuts most reference docs + `../references/config-ratification-w1.md`.
- **Review / delete trigger:** tick items as Discovery W1 resolves them; retire when all closed.

> **Reconcile:** the 6→4 build gate was opened by human override 2026.06.03, but W1 still ratifies the 📝 values (BWMP, SLA numbers, hard-gate thresholds, DPS scope).

> Checklist of things that need confirmation at kickoff. Each shapes the PRD.
>
> **Tags**:
> - 🔴 **must-answer-by-PRD** (blocker)
> - 🟡 needed for sprint planning
> - 🟢 nice to clarify
> - 📝 **NoEffort proposed default** — Bank confirms or overrides at Discovery W1
> - 🏦 **Answered by Hijra's own SOP slides** (2026-06-02; [HIJRA-BANK-SOP-DIGEST.md](hijra-bank-sop-digest.md)) — strong Bank evidence, formal W1 ratification still pending
> - ⏸ deferred this iteration

> **W1 source-mining (2026-06-04):** read the Hijra/NoEffort proposal-family sources (the commercial
> proposal / Bank-response / tanggapan / exec-summary are work-contract, kept out of the build repo; manifesto + FOS mockup in `sources/`).
> **CONFIRMED by source:** volume **~30 pembiayaan/bln**; **4 akad** (Murabahah/Musyarakah/Ijarah/Mudharabah);
> stack (Node/TS tunggal · Postgres tunggal · Prisma Migrate · Nx monorepo · Firebase Auth email+password,
> SSO LDAP/AD/Keycloak opsional); test **≥75%** + Gherkin + integration(service-to-DB) + E2E(BE+FE); AI in-region
> + masking wajib (POJK 34/2025 §27(5)/§32(1)); UU PDP §56 + DPA; **core-banking di luar scope → manual upload**;
> akses **VPN-internal** saja; realtime notif **DITUNDA — V1 polling** (desain SSE + PG `LISTEN/NOTIFY` di [`../planning/realtime-notifications-sse.md`](../planning/realtime-notifications-sse.md); Firebase RTDB & WS ditolak); e-sign dulu "placeholder" → kini **QR Mizan-generate**.
> **MASIH UNKNOWN (tak ada di sumber mana pun — butuh RAC Pembiayaan Produktif + Pedoman Komite Hijra):**
> ambang **DSR/LTV/Kol** · tier **BWMP** (Rp) · komposisi/kuorum/voting **Komite** · param produk akad
> (nisbah/ujrah/margin) · scope review **DPS** · kebijakan **eskalasi SLA-breach**.
> **NB:** dokumen proposal **mendahului** slide SOP (Apr vs 02-Jun 2026) — slide SOP otoritatif untuk model proses/peran.

## Workflow & roles

- [x] 🏦 **Stage 2 ownership** — **Answered by SOP**: Stage 2 is **RM-coordinated** (Marketing lane) — RM pulls SLIK+Pefindo, Legal does yuridis, Appraisal values agunan, Ops runs the bureau pull; not a two-desk gate. The app's dual-sign-off (LG+RT) is a build artifact to reconcile to the 6→4 Origination model. **Remaining**: formal W1 ratification + build reconciliation.
- [ ] 📝 **Pencairan 5-step checklist** — NoEffort proposes: **Verifikasi Final → Proses Akad → Menunggu Dokumen → Siap Cair → Pencairan**. Hijra's actual Pencairan SOP may differ. Bank confirms.
- [ ] 📝 **Conditional-approval routing** — NoEffort proposes **two flavors**: Flavor A (terms-only) loops RM ↔ customer ↔ Pencairan; Flavor B (needs new docs) verifies at Pencairan, never re-loops to Stage 3/4. All conditional approvals route through Komite first. Bank confirms.
- [ ] 📝 **Decision message rules** — NoEffort proposes: Approve = optional, Conditional = **REQUIRED**, Reject = optional-but-recommended. Bank may want Reject also REQUIRED.
- [x] 🏦 **Komite session cadence** — **Answered by SOP**: sessions run **Senin / Rabu / Jumat (Mon/Wed/Fri)**; MOM due **maks H+1**. Remaining: exact session time, W1 ratification.
- [~] 🏦 **Stage 1 required-documents spec** — **Bank's actual checklist now exists** ("Checklist Dokumen Pembiayaan Hijra Bank 2025") and is folded into [REQUIRED-DOCS-MATRIX.md](required-docs-matrix.md) (🏦 rows). **Remaining**: (a) checklist is business/PT-oriented — confirm whether Hijra does individual/consumer productive financing; (b) Bank adds a **purpose dimension** (modal kerja/pembangunan → RAB, Kontrak/SPK/PO) beyond MIZAN's akad-based layer; (c) host Bank-template attachments; (d) confirm the Stage 1 **"verified"** scope (correct+legible vs authenticity).
- [ ] 🟡 SLIK pull frequency — once at intake only, or refresh if app sits long?
- [ ] 🟢 Send-back loop — any limit (max bounces) before app auto-rejected for stalling?
- [ ] 🟡 **Akad change mid-flow** — confirmed (per human, 2026-06-04) the bank can counter-offer a different akad/amount pre-Komite; modelled as a **mutable proposal** frozen at Komite (see `../designs/workflow-engine.md`). W1: confirm this matches Hijra practice + whether any akad change needs explicit customer re-consent before SP3.
- [ ] 🟡 **Audit expectation for proposal revisions** — every pre-Komite revision (akad/plafond/terms) is logged to history; confirm the granularity/retention OJK expects for the negotiation trail.

## 🏦 New surfaces from Bank SOP (2026-06-02)

> Surfaced by Hijra's own SOP slides — these are **new to the MIZAN model** and need design + W1 confirmation.

- [~] 🟡 **AML / sanctions screening (CS desk)** — **DECIDED (V1, 2026-06-02)**: actual DTTOT/PEP/negative-list screening is done **outside MIZAN** by CS. In-system = a mandatory **RM "Initial AML checking PASSED" attestation** (settable across Inisiasi, stages 1–3), part of the **MUAP→Risk submit gate** since the RM-led redesign (2026.06.12; formerly a Stage 1→2 gate), written to the audit trail. MIZAN runs no screening / holds no lists in V1. See [WORKFLOW.md](workflow-detail.md) §AML + [COMPLIANCE.md](compliance.md). **W1 confirm**: Bank accepts attestation-only for V1 (vs wanting in-system screening later).
- [ ] 🟡 **Finance — Special Rate flow** — SOP shows Finance approving margin/pricing exceptions. How is a special-rate request raised, routed, and recorded? Does it gate Komite/SP3?
- [ ] 🟡 **Compliance — Sharia review desk** — distinct from DPS (V2). When in the flow does Compliance review Sharia compliance + "konfirmasi ketentuan"? Is it a blocking sign-off?
- [ ] 🟡 **SP3 (Surat Penawaran/Persetujuan Pembiayaan)** — explicit post-Komite artifact: Draft (RM) → Review (Legal, 2 HK) → Final → customer **Persetujuan** → Akad. Customer accepts the *offer* before akad. How does this map into the built Stage 6 sub-state machine? (Build gap.)
- [ ] 🟡 **Pefindo pulled alongside SLIK** — model only tracked SLIK. Add Pefindo to the bureau-data surface + the AI summarization use-case ("fineksi": summarize SLIK + Pefindo + Rek Koran).
- [ ] 🟡 **New-desk RBAC** — Legal, Appraisal, Finance, Compliance, CS, Ops are new roles vs the prior 5-role model. Confirm RBAC scope + which are conditional vs mainline.
- [ ] 🟡 **Appraisal: internal vs KJPP routing** — what triggers a KJPP (external) appraisal vs internal? (Affects SLA: 2 HK vs 3/7–14 HK.)
- [ ] 🟡 **RAC Pembiayaan Produktif** — SOP references this as a reference doc; likely the authoritative source for hard-gate thresholds (DSR/LTV/Kol). Obtain at W1.
- [ ] 🟢 **Pencairan artifacts** — NAP (Nota Analisa Pembiayaan), memo realisasi pembiayaan, draft transfer dana, checklist pencairan. Confirm which MIZAN generates vs tracks.

## Komite voting

- [ ] 📝 **Decision rule** — NoEffort proposes: **Majority (>50% of quorum present)**. Based on Indonesian BPRS common practice; not OJK-mandated. Bank confirms at Discovery W1.
- [ ] 📝 **Quorum** — NoEffort proposes: **2/3 of total Komite members**. Industry standard. Bank confirms.
- [ ] 📝 **Vote storage model** — NoEffort proposes: **one row per committee member** (name, vote, timestamp, optional comment). Bank confirms acceptable for OJK audit format.
- [ ] 📝 **Edit after submit** — NoEffort proposes: **not allowed** (vote final on submit, legally binding). Bank may want an edit window until quorum closes — confirm.
- [ ] 🟡 Komite size — typical 3 (small BPRS) to 5 (medium). What size for Hijra?
- [ ] 🟡 Komite tiering — single Komite Pusat or multi-tier (Cabang / Pusat / Komisaris) per plafond? Hijra likely single-tier given scale.
- [ ] 🟡 Tie-break rule if even votes (only matters under some decision rules)
- [ ] 🟢 Vote weights — Direktur Utama same as others, or weighted higher?
- [ ] 🟢 Obtain **Hijra's Pedoman Komite Pembiayaan** at Discovery W1 — authoritative source to validate all proposals above
- [ ] 🟡 **komiteDecisionNote enforcement gap (V2)** — V1 Zod schema uses `komiteDecision === 'conditional'` as a proxy for "note required". The true rule is "note required if ANY individual vote is conditional" — array-content, not union-expressible. Known gap: an overall approve/reject decision with one stray conditional vote won't be forced to carry a note. This gap is intentional in V1; add service-layer validation (in the komite save action, before persisting) in V2.

## Conditional approvals

- [ ] 🟡 Who verifies conditions are met during Pencairan? RM? Operations? LA?
- [ ] 🟡 Expiry: if condition not met within X days, does approval expire?
- [ ] 🟢 Customer rejects the conditional terms — does it return to Komite for re-vote, or just dies?

## Authority limits (BWMP — Batas Wewenang Memutus Pembiayaan)

- [ ] 🟡 **BWMP table** — actual amounts (Rp X juta) per approver tier. Not OJK-mandated; each BPRS sets own. **Required input from Hijra at Discovery W1.**

## Risk thresholds (hard gates)

- [ ] 📝 **DSR hard-gate** — NoEffort proposes: **> 40% = block / require mitigation**. Common BPRS practice. Bank's actual underwriting cutoff confirmed.
- [ ] 📝 **LTV hard-gate** — NoEffort proposes: **> 70% = block / require more collateral**. Bank confirms.
- [ ] 📝 **SLIK Kolektibilitas hard-gate** — NoEffort proposes: **must be Kol 1** for new financing (i.e., > Kol 1 blocks). Bank confirms.
- [ ] 📝 **Watch-list auto-flag** — NoEffort proposes: trigger when an existing loan slips to **Kol 2**. Bank may want earlier (e.g., days-overdue-only trigger).
- [ ] 📝 **NPL auto-flag** — NoEffort proposes: trigger at **Kol ≥ 4**. Standard NPL definition; confirm matches Hijra's internal classification.

## Kanban model

- [ ] 📝 **Two-view structure** — NoEffort proposes: **Pipeline Kanban (read-only, action-button transitions)** + **Personal Kanban (drag-drop TODO/In-Progress)**. This reframes the Manifesto's "drag-drop between stages" framing for audit + validation reasons. Bank confirms model is acceptable.

## SLA

- [x] 🏦 **Business days vs calendar days** — **Answered by SOP**: **hari kerja (business days)**, working hours **8 AM–5 PM Mon–Fri**.
- [x] 🏦 **Per-desk SLA targets** — **Answered by SOP** (Bank-actual, per desk): Risk 3 HK · Legal 2 HK/task · Appraisal 2 HK internal (KJPP 3/7–14 HK) · Ops BI Checking 1 HK · Ops Pencairan same-day ≤16:00 · CS AML 1 HK. See [SLA.md](sla-targets.md). **Remaining**: per-our-stage rollup targets (Stage 1/3 have no SOP number) + clock-start = "dokumen lengkap" reconciliation.
- [ ] 📝 **At-Risk threshold** — NoEffort proposes: **< 1 day remaining** triggers yellow chip + notification. Bank confirms.
- [ ] 📝 **Escalation tiers** — NoEffort proposes: At Risk → owner; Overdue → owner + direct manager; Overdue > 2× SLA → owner + manager + division head. Bank confirms tier routing matches Hijra orgchart.
- [ ] 🟡 Holiday calendar — Indonesian national holidays only, or also Bank-specific operational days off?

## AI Chat & analysis

- [ ] 📝 **AI Chat rolling window** — NoEffort proposes: **rolling 10 turns** kept in context. Bank confirms (longer window = higher token cost + more PII surface).
- [ ] 🟢 V1 confirmed **doc-bound** (no web search). V2+: would Hijra want internal-DB tool calling?
- [ ] 🟡 AI Chat conversation retention — how long (audit requirement)?
- [ ] 🟢 Per-loan-application AI cost cap (to avoid runaway token usage)?

## DPS (Dewan Pengawas Syariah)

- [~] 🏦 **DPS in V1 — signs every RSK** (revised 2026-06-03). Earlier assumption (DPS framework-only / V2, doesn't vote per deal) is **overturned**: Hijra's **RSK template has a DPS signature field**, so DPS is the **final signer in the RSK ladder** (after CRO) on every deal — RSK can't be scheduled to Komite until DPS signs; DPS reject → Risk Analyst. Folded into [WORKFLOW-TARGET.md](../designs/workflow-target.md) + [GLOSSARY.md](../GLOSSARY.md). **W1 confirm**: (a) DPS truly signs per-deal (not just sampling/framework); (b) what DPS reviews (full RSK vs Sharia-aspects only); (c) DPS-reject handling (rework-and-re-sign vs close).

## Integrations (V2+ roadmap)

- [ ] 🟡 Core banking system — T24 Temenos, IBSS, USSI, custom? When fund automation?
- [ ] 🟢 SLIK API direct integration timing — V2 or later?
- [ ] 🟢 WhatsApp integration timing — V1 or V2?

## Authentication

- [ ] 🟡 Future SSO with Hijra IdP — what system? **LDAP / AD / Keycloak**?
- [ ] 🟡 Session policy — timeout duration, force-logout on role change, MFA?
- [ ] 🟡 **Visibility scope** — V1 = **open read to all authenticated staff** (any staff sees any application incl. draft MUAP; action stays desk-scoped — `../designs/workflow-engine.md` §"Design principles"). W1: at larger scale, does Hijra want **branch / need-to-know** read-scoping?

## Data & reporting

- [ ] 🟡 OJK report templates — which formats does Hijra need to export?
- [ ] 🟡 Historical data — any pre-MIZAN records to migrate (≤10k OK)?
- [ ] 🟢 Internal dashboards — KPIs management wants beyond SLA + NPL%?

## Compliance & ops

- [ ] 🟡 **Google Cloud DPA scope** — confirm Hijra's existing GCP DPA covers Vertex AI (Gemini) generative inference + Document AI for Bank data; who at Hijra Legal owns it. (Downgraded from 🔴 — Hijra is already a GCP customer.)
- [~] ⏸ **17 Dec 2026 in-region inference — DEFERRED** — Bedrock Nova plan dropped; V1 runs Gemini on Vertex AI (`asia-southeast1`, Singapore) under §56(b) DPA + masking. Gemini is **not** served from Indonesia (Jakarta `asia-southeast2`), so §27(5) is postponed, not met. Bank decides posture by the deadline: accept Singapore + DPA / move to an Indonesia-region provider / seek exemption. See [COMPLIANCE.md](compliance.md).
- [ ] 🟡 Audit log retention — 5 years? 7? Per OJK guidance?
- [ ] 🟢 MIZAN-specific backup beyond Bank standard?

## UX & training

- [ ] 🟢 Training format — RM + Analis separate sessions or combined?
- [ ] 🟢 New user onboarding — 1:1 walkthrough, or self-serve in-product docs?

---

**Add to this list as new questions surface.** 📝 items have proposed defaults; 🔴 items are blockers.
