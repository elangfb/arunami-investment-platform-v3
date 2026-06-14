# Hijra Bank SOP Digest — process slides (WhatsApp, 2026-06-02)

- **Type:** external source (Bank evidence) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/HIJRA-BANK-SOP-DIGEST.md` (retired); transcription of 5 Hijra SOP slides (WhatsApp 2026-06-02).
- **Used by:** `workflow-detail.md`, `../designs/workflow-target.md`, `personas.md`, `sla-targets.md`. Pairs with `sources/`.
- **Review trigger:** Discovery W1 ratification (strong evidence, arrived informally).

> **Reconcile:** Bank-authored → outranks NoEffort proposals, but ratify at W1 before flipping 📝→✅. Slides in `sources/`.

> **What this is.** Five Hijra Bank-branded artifacts dropped via WhatsApp on 2026-06-02:
> four process slides + the actual document checklist. Files (read-only) in `sources/`:
> `Hijra Bank Process - 1 … 5`. This doc is the faithful transcription + a delta
> analysis against our current design docs.
>
> **Authority.** These are **Bank-authored sources** — by the README "source wins"
> rule they outrank NoEffort proposals. BUT they arrived informally (WhatsApp),
> not at Discovery W1 — and the repo rule is **nothing is Bank-confirmed until
> Discovery W1**. So: treat as **strong corroborating evidence**, cite them when
> updating 📝 items, but **do not flip 📝 → ✅** on these alone — ratify at W1.
>
> **⚠️ High-stakes surface.** Slides 1/3 touch the state machine + role model. The
> canonical homes are `../designs/workflow-target.md` (confirmed target) and
> `personas.md`; change them with the human, not as a casual edit. This digest
> records the evidence; it does not restructure.

---

## Slide 1 — "Flow Proses Pembiayaan" (swimlane)

Lanes (left→right): **Nasabah · Marketing · Legal & Appraisal · Analyst · Komite · Operasional**

Flow (boxes by lane):
1. **Nasabah** → Permohonan Pembiayaan
2. **Marketing** → Melakukan Visit dan pengecekan Dokumen
3. **Legal & Appraisal** → Analisa Yuridis · Order Penilaian Agunan · Penilaian internal / KJPP
4. **Marketing** → Pembuatan MUAP
5. **Analyst** → Risk Review
6. **Komite** → Keputusan
7. **Marketing/Legal** → Draft SP3 → Review SP3 (Legal & Appraisal) → SP3 Final (Marketing)
8. **Nasabah** → Persetujuan
9. **Legal & Appraisal** → Draft Akad & Order Notaris
10. **Nasabah** → Akad
11. **Marketing** → Checklist Pencairan
12. **Operasional** → Pencairan

**Delta vs our docs:**
- ✅ **Confirms RM-does-everything (6→4) hypothesis.** "Marketing" (= our RM) owns
  intake/visit, doc check, **Pembuatan MUAP**, Draft SP3, SP3 Final, Checklist
  Pencairan. MUAP is authored by Marketing/RM — confirms the "RM as MUAP penyusun"
  evidence in PERSONAS/WORKFLOW.
- ⚠️ **"Analyst" lane = Risk Review, not 5C+1S.** In the Bank's chart the lane
  labelled *Analyst* performs **Risk Review** — i.e. the Bank's "Analyst" is the
  risk reviewer, not a separate feasibility analyst. There is **no separate
  Loan-Analyst feasibility lane**; 5C+1S/feasibility is folded into Marketing's
  "Pembuatan MUAP." This sharpens the 6→4 model and conflicts with our current
  canonical split (LA owns Stage 3 feasibility; RT owns Stage 4 risk).
- 🆕 **"Legal & Appraisal" is one combined lane** doing Analisa Yuridis + agunan
  appraisal (internal or KJPP). Our model splits Legal (Stage 2) from appraisal
  (collateral value at Stage 3).
- 🆕 **SP3** (Surat Penawaran/Persetujuan Pembiayaan) is an explicit post-Komite
  artifact with its own **Draft → Review (Legal) → Final** loop, then customer
  **Persetujuan**, then **Akad**. Our WORKFLOW folds this into Stage 6 Pencairan
  sub-states; the Bank treats SP3 + Akad as distinct steps before Pencairan.
- 🆕 **Operasional** owns the final Pencairan (disbursement) — matches our
  "Pencairan = RM + Operations" proposal, leaning Ops-owned.

## Slide 2 — "Flow by Detail" (14 steps)

1. Dokumen Collection (`checklist_dokumen_pembiayaan`)
2. Pengajuan Analisa Yuridis (Jira)
3. Pengajuan Appraisal (Jira)
4. Penarikan data SLIK/Pefindo (Draft Doc)
5. **Summarize hasil SLIK, Pefindo dan Rek koran — bisa menggunakan "fineksi"** ← AI summarization use-case
6. Pembuatan MUAP & Checklist Dokumen (Draft MUAP & Checklist)
7. Submit MUAP untuk review Risk (Link)
8. **Prepare Jadwal Komite (sesuai jadwal komite Senin, Rabu dan Jumat)**
9. Prepare Konten Komite (contoh_format_presentasi_komite)
10. Mempersiapkan MOM hasil Komite (maks H+1) (contoh_format_mom)
11. Draft SP3 (Draft), kirim ke Legal (Jira reviewsp3)
12. Request jadwal akad (Jira)
13. Request dana disbursement ke Ops (link_request_dana_realisasi)
14. Persiapan Pencairan (dokumen NAP & memo realisasi pembiayaan, draft_transfer_dana, checklist pencairan)

**Delta vs our docs:**
- ✅ **Komite cadence = Senin / Rabu / Jumat (3×/week).** Resolves the
  OPEN-QUESTIONS "Komite session cadence" item (we had guessed daily-afternoon or
  twice-weekly). Confirm exact times at W1.
- ✅ **MOM (minutes) due max H+1** after Komite — concrete SLA for minute-taking.
- 🆕 **SLIK + Pefindo + Rek Koran summarization is an explicit AI use-case**
  ("fineksi"). Aligns with our doc-bound AI assist; widens it beyond 5C+1S to
  include bureau-data summarization. Note: **Pefindo** (private bureau) is pulled
  alongside SLIK — our docs only mention SLIK.
- 🆕 **NAP** (Nota Analisa Pembiayaan?) + **memo realisasi pembiayaan** +
  **draft_transfer_dana** are concrete Pencairan artifacts not in our model.
- 🆕 Process is **Jira-driven** today (cross-team handoffs are Jira tickets) — MIZAN
  replaces this orchestration.

## Slide 3 — "Communication Line" (hub-and-spoke, Marketing at center)

**Marketing** is the hub; every other desk communicates through it:
| Spoke | Function (per slide) |
|---|---|
| Appraisal | Penilaian Jaminan |
| Komite Pembiayaan | Keputusan Pembiayaan |
| Operational | Permohonan Dana Pencairan · proses Pencairan · penjaminan & Asuransi |
| Legal | Analisa Yuridis · Review SP3 · Order Akad & Notaris |
| **Finance** | **Permohonan Special Rate** |
| **Compliance** | **Review Sharia Compliance · Konfirmasi ketentuan** |
| **Risk Analyst** | Review Usulan Pembiayaan |
| **CS** | **DTTOT, PEP & Negative list Checking** (AML) |

**Delta vs our docs:**
- ✅ **Confirms "RM owns the relationship / all comms route via RM."** Here it's the
  internal routing rule too: every desk talks to Marketing, not to each other.
- 🆕 **THREE new actors absent from PERSONAS:**
  - **Finance** — handles **Special Rate** requests (margin/pricing exceptions).
  - **Compliance** — **Sharia compliance review** + ketentuan confirmation. This is
    distinct from the DPS (Dewan Pengawas Syariah) we have as a V2 item — Compliance
    is an operational desk in the live flow.
  - **CS** — runs **DTTOT / PEP / negative-list (AML) checking**. Our model has no
    AML/sanctions-screening step at all.
- 🆕 **Appraisal** appears as its own desk (separate from Legal), despite slide 1
  bundling them in one lane.

## Slide 4 — "Reference" + SLA notes

Reference links (placeholders): All Regulasi · Pembiayaan produktif · Ketentuan Agunan · RAC Pembiayaan Produktif.

**Working Hours 8 AM – 5 PM (Mon–Fri).** Bank-actual per-desk SLAs:
| Desk | SLA |
|---|---|
| **Risk** | 3 hari kerja (18 jam); aplikasi diproses sesuai antrian (queue) |
| **Appraisal** | internal 2 HK sejak visit; KJPP 3 HK (short report), 7–14 HK (long report) |
| **Legal — Analisa Yuridis** | 2 HK sejak dokumen lengkap |
| **Legal — Review SP3** | 2 HK sejak dokumen lengkap |
| **Legal — Order Akad** | 2 HK setelah dokumen diterima lengkap |
| **Ops — BI Checking/Pefindo** | maks 1 HK (normal server SLIK/Pefindo) |
| **Ops — Pencairan** | same-day jika dokumen lengkap maks 16:00 WIB; RTGS/Kliring ikut bank penampung |
| **CS — AML Checking** | 1 HK |

**Delta vs our docs:**
- ✅ **Replaces our 📝 per-stage SLA guesses with Bank-actual desk SLAs.** Note the
  shape differs: Bank SLAs are **per-desk/per-task**, not per-our-5-stages. A direct
  mapping requires the role reconciliation (slide 1) first.
- ✅ **Risk SLA = 3 HK** (we proposed Stage 4 = 5d). **Legal = 2 HK each** (we
  proposed Stage 2 = 5d). Bank is tighter than our defaults.
- ✅ **Business-day basis confirmed** ("Hari Kerja") + **working hours 8–17 Mon–Fri**
  — resolves the OPEN-QUESTIONS "business vs calendar days" item.
- 🆕 SLA clocks start **"sejak dokumen lengkap"** (on completeness), not on stage
  entry — affects our SLA counter-start mechanic.
- 🆕 **RAC** (Risk Acceptance Criteria) "Pembiayaan Produktif" referenced — likely
  the authoritative source for our hard-gate thresholds (DSR/LTV/Kol). Request at W1.

## Slide 5 — "Checklist Dokumen Pembiayaan Hijra Bank 2025.docx"

**Legalitas dan Keuangan**
1. Surat Permohonan Nasabah
2. Akta pendirian beserta Akta Perubahannya
3. SK Menkeh atas seluruh akta
4. NPWP, NIB atau Surat Izin Usaha lainnya
5. KTP & NPWP Pengurus dan pemegang saham
6. CV Direktur dan Komisaris
7. Struktur Organisasi
8. Laporan Keuangan 3 tahun terakhir (Inhouse/Audited)
9. Laporan Keuangan tahun berjalan
10. Rek Koran 6 bulan terakhir (seluruh rekening operasional)
11. SPT Terakhir
12. Surat Persetujuan Pembiayaan/Kredit dari Bank (apabila ada pembiayaan)
13. Daftar Hutang & Piutang Periode Berjalan (*template terlampir)
14. Daftar Supplier & Bouwheer/Klien (top 5) (**template terlampir)

**Jaminan**
1. Tanah Bangunan: Sertifikat, IMB, PBB terakhir
2. Kendaraan: BPKB, STNK, Faktur

**Dokumen Lain**
1. Rencana Anggaran Biaya (pembiayaan modal kerja/pembangunan)
2. Kontrak/SPK/PO/Invoice yg akan diajukan (pembiayaan modal kerja)
   - a. List Project yang sedang berjalan (+ soft copy kontrak) (*template terlampir)

**Delta vs REQUIRED-DOCS-MATRIX.md:**
- ✅ Confirms most **Business** docs we proposed (Akta+perubahan, SK Kemenkeh,
  NPWP/NIB, KTP pengurus, Laporan Keuangan, Rek Koran 6bln).
- 🆕 **Items we DON'T have:** SK Menkeh "atas seluruh akta" (explicit), **KTP & NPWP
  pemegang saham** (not just pengurus), **CV Direktur & Komisaris**, **Struktur
  Organisasi**, **Laporan Keuangan 3 tahun** (we said generic "Laporan Keuangan"),
  **SPT Terakhir**, **Surat Persetujuan Kredit dari Bank lain**, **Daftar Hutang &
  Piutang**, **Daftar Supplier & Bouwheer/Klien top 5**.
- 🆕 **Jaminan**: Bank requires **PBB terakhir** (we have Sertifikat + IMB) and
  **Faktur** for vehicles (we have BPKB + STNK).
- 🆕 **This checklist is Business-oriented** (PT/badan usaha — pemegang saham,
  komisaris, bouwheer). The Bank's productive-financing focus skews business; our
  matrix's Individual layer isn't covered here — confirm whether Hijra does
  individual/consumer productive financing at all.
- ⚠️ Several items ship with **Bank templates** ("template terlampir") — Daftar
  Hutang/Piutang, Daftar Supplier, List Project. MIZAN may need to host these.

---

## Cross-cutting takeaways (what changed in our understanding)

1. **Role model (biggest):** Bank's live structure is **Marketing · Legal&Appraisal
   · Analyst(=Risk) · Komite · Operasional**. Marketing/RM authors the MUAP and
   does feasibility; the "Analyst" lane is the risk reviewer. Strong corroboration
   of 6→4, but with the nuance that 5C+1S is RM work and "Analyst" means Risk. →
   **Fork for the human + app session** before touching canonical WORKFLOW/PERSONAS.
2. **New actors:** Finance (special rate), Compliance (Sharia review), CS
   (AML/DTTOT/PEP). None modelled today. The **AML screening step is a compliance
   gap** worth flagging.
3. **SLAs are Bank-actual and tighter** than our defaults, and **per-desk** not
   per-5-stage; clock starts on "dokumen lengkap." Business-day basis + 8–17 Mon–Fri
   confirmed.
4. **Komite cadence = Mon/Wed/Fri; MOM ≤ H+1.**
5. **SLIK + Pefindo** both pulled (we only modelled SLIK); bureau summarization is an
   explicit AI use-case.
6. **SP3** is a distinct post-Komite artifact (Draft→Legal review→Final→customer
   accept) preceding Akad — not the same as our Pencairan sub-states.
7. **Document checklist** is richer and business-skewed; several Bank-template
   attachments.

> **Status of folding:** ✅ **fully folded into canonical docs (2026-06-02)** per human
> direction (full fold, no app-session coordination now). Folded into PERSONAS,
> WORKFLOW, SLA, REQUIRED-DOCS-MATRIX, OPEN-QUESTIONS, COMPLIANCE; design↔build gaps
> recorded in BUILD-STATE. Confirmed facts marked **🏦** = "Bank SOP, pending only
> formal W1 ratification" (not yet ✅-confirmed). The app build still runs the prior
> 5-stage model — reconciliation with the app session is deferred, tracked in
> [BUILD-STATE.md](../CURRENT-STATE.md) §"Bank SOP fold".

## How Mizan implements this (pointers)

- Stage-2 model → **ADR-0007** (`../decisions/0007-stage2-rm-coordinated-origination.md`) — RM-coordinated; Legal & Appraisal tracked deliverables gating MUAP→Risk; RA never in Stage 2.
- Roles/desks → `lib/desks.ts` (`legal` role = "Legal & Appraisal", desks `legal` + `appraisal`).
- Doc checklist → `lib/required-docs` / `required-docs-matrix.md`.
- SLA → `lib/sla-utils.ts` + per-desk SLA (W1 config; values in Slide 4 above).
