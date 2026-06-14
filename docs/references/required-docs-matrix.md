# Stage 1 — Required Documents Specification Matrix

- **Type:** stable spec (domain) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/REQUIRED-DOCS-MATRIX.md` (retired); NoEffort defaults × Hijra 2025 checklist (🏦).
- **Used by:** the implemented checklist builder `lib/required-docs.ts`.
- **Review trigger:** Discovery W1 (ratify lists; individual layer; Bank-template hosting).

> **Reconcile:** this is the spec the builder implements; 🏦 rows = Bank checklist, 📝 rows = NoEffort defaults pending W1.

**Mizan Financing Origination System · Document Submission stage**

> **Status:** Layers below are NoEffort-proposed defaults **cross-checked against Hijra's actual checklist** ("Checklist Dokumen Pembiayaan Hijra Bank 2025", Bank SOP 2026-06-02 — see [HIJRA-BANK-SOP-DIGEST.md](hijra-bank-sop-digest.md)). Items confirmed/added from that checklist are marked 🏦. The Bank's checklist is **business/PT-oriented** (productive financing) — the Individual layer is still NoEffort-proposed. The *mechanism* is built and verified in the app; final lists ratified at Discovery W1.

## 1. Purpose

At Stage 1 (Document Submission), the Relationship Manager must know exactly which documents a financing application requires. Mizan derives that list automatically from four inputs the RM enters when creating the application:

- **Customer type** — Individual or Business
- **Akad type** — Murabahah, Musyarakah, Ijarah, or Mudharabah
- **Collateral type** — None, Property/Land, Vehicle, or Personal Guarantee
- **Customer attributes** — marital status, income source (for individuals)

The required-document list is the merge of four layers:

> **Required documents = Base + Customer-Type layer + Akad-Type layer + Conditional documents**

## 2. Layer A — Base documents (every application)

| Document | Applies to |
|---|---|
| KTP Pemohon | All applications |
| NPWP | All applications |
| Formulir Permohonan Pembiayaan | All applications |

## 3. Layer B — Customer-type documents

| Document | Individual | Business |
|---|:--:|:--:|
| Kartu Keluarga | ✓ | — |
| Buku Nikah | ✓ * | — |
| Surat Persetujuan Pasangan | ✓ * | — |
| Slip Gaji **or** Laporan Usaha | ✓ * | — |
| Rekening Koran 3 Bulan Terakhir | ✓ | — |
| KTP Pengurus | — | ✓ |
| KTP & NPWP Pemegang Saham 🏦 | — | ✓ |
| Akta Pendirian & Perubahan 🏦 | — | ✓ |
| SK Kemenkumham (atas seluruh akta) 🏦 | — | ✓ |
| NIB / SIUP / Izin Usaha lainnya 🏦 | — | ✓ |
| CV Direktur & Komisaris 🏦 | — | ✓ |
| Struktur Organisasi 🏦 | — | ✓ |
| Laporan Keuangan 3 Tahun Terakhir (Inhouse/Audited) 🏦 | — | ✓ |
| Laporan Keuangan Tahun Berjalan 🏦 | — | ✓ |
| Rekening Koran 6 Bulan Terakhir (seluruh rek operasional) 🏦 | — | ✓ |
| SPT Terakhir 🏦 | — | ✓ |
| Surat Persetujuan Pembiayaan/Kredit dari Bank lain 🏦 † | — | ✓ |
| Daftar Hutang & Piutang Periode Berjalan 🏦 ‡ | — | ✓ |
| Daftar Supplier & Bouwheer/Klien (top 5) 🏦 ‡ | — | ✓ |

\* Conditional — included only when the trigger in Section 5 matches.
† Only "apabila ada pembiayaan" (if the customer has existing financing).
‡ Bank provides a **template** ("template terlampir") — MIZAN may need to host these.

## 4. Layer C — Akad-type documents

| Document | Murabahah | Musyarakah | Ijarah | Mudharabah |
|---|:--:|:--:|:--:|:--:|
| Quotation / Invoice Objek Pembiayaan | ✓ | — | — | — |
| Spesifikasi Barang | ✓ | — | — | — |
| Spesifikasi Objek Sewa | — | — | ✓ | — |
| Business Plan | — | ✓ | — | ✓ |
| Proyeksi Arus Kas | — | ✓ | — | ✓ |
| RAB Penggunaan Dana | — | — | — | ✓ |

## 5. Layer D — Conditional documents

These are added only when the application's attributes match the trigger.

| Document | Trigger condition |
|---|---|
| Buku Nikah | Customer is married |
| Surat Persetujuan Pasangan | Customer is married **and** financing is secured (any collateral) |
| Slip Gaji | Income source = Karyawan (employee) |
| Laporan Usaha | Income source = Wiraswasta (self-employed) |
| Sertifikat Agunan (SHM / SHGB) | Collateral = Property / Land |
| IMB / PBG | Collateral = Property / Land |
| PBB Terakhir 🏦 | Collateral = Property / Land |
| BPKB | Collateral = Vehicle |
| STNK | Collateral = Vehicle |
| Faktur Kendaraan 🏦 | Collateral = Vehicle |
| Dokumen Appraisal Agunan | Collateral = Property / Land **or** Vehicle |
| Bukti Asuransi Agunan | Collateral = Property / Land **or** Vehicle |
| Surat Pernyataan Penjamin (Jaminan Perorangan) | Collateral = Personal Guarantee |
| KTP Penjamin | Collateral = Personal Guarantee |

## 6. Worked examples

| Scenario | Required documents | Total |
|---|---|--:|
| Individual · Murabahah · no collateral · employee · unmarried | KTP, NPWP, Formulir, Kartu Keluarga, Slip Gaji, Rekening Koran, Quotation/Invoice, Spesifikasi Barang | 8 |
| Business · Mudharabah · vehicle collateral | KTP, NPWP, Formulir, KTP Pengurus, Akta Pendirian & Perubahan, SK Pengesahan Kemenkumham, NIB, SIUP/Izin Usaha, Laporan Keuangan, Rekening Koran Perusahaan, Business Plan, Proyeksi Arus Kas, RAB Penggunaan Dana, BPKB, STNK, Dokumen Appraisal Agunan, Bukti Asuransi Agunan | 17 |
| Individual · Ijarah · personal guarantee · self-employed · married | KTP, NPWP, Formulir, Kartu Keluarga, Buku Nikah, Surat Persetujuan Pasangan, Laporan Usaha, Rekening Koran, Spesifikasi Objek Sewa, Surat Pernyataan Penjamin, KTP Penjamin | 11 |

## 7. How it works in the app

1. The RM fills the new-application form (customer type, akad, collateral, marital status, income source).
2. Mizan computes the required-document checklist from the matrix above and **snapshots** it onto the application — a later change to this matrix never retroactively alters an in-flight application.
3. The Documents tab shows the checklist with a progress count and per-document status (missing → awaiting RM check → verified).
4. Every RM-intake required document must be uploaded before the deal can leave **Inisiasi** for Risk Review. Since the RM-led redesign (2026.06.12) this is gated at the **MUAP→Risk submit** (`muapToRiskBlockers`), **not** at the Stage 1→2 advance — Stages 1–3 flow free (`stage1To2Blockers` returns `[]`). SLIK/Pefindo are **RM bureau-data rows** (RM-owned `slik` desk); the RM may upload them early from Stage 1, but they are **optional** as intake docs and never block the Inisiasi advances. The formal SLIK→Feasibility handoff is Stage 2 (gates 2→3).

## 8. Notes & open points for Discovery W1

- 🏦 **Bank-checklist "Dokumen Lain" is purpose-based, not akad-based.** Hijra's checklist adds, for **modal kerja / pembangunan** financing: **RAB (Rencana Anggaran Biaya)** and **Kontrak/SPK/PO/Invoice yang akan diajukan** + **List Project yang sedang berjalan** (with soft-copy kontrak, template terlampir). MIZAN's Layer C keys off `akadType`; the Bank also keys off **financing purpose** (modal kerja vs investasi vs pembangunan). Add a *purpose* dimension to the matrix or fold into conditional triggers — W1 decision.
- 🏦 **Bank checklist is business/PT-oriented** (pemegang saham, komisaris, bouwheer). Confirm at W1 whether Hijra does **individual/consumer productive financing** at all; if not, the Individual layer may be moot for V1.
- 🏦 **Bank-template attachments** — Daftar Hutang & Piutang, Daftar Supplier & Bouwheer/Klien, List Project all ship with Bank templates. MIZAN likely needs to host/generate these.
- **The lists are NoEffort proposals** unless marked 🏦. Hijra Bank to confirm or amend each layer.
- **"Verified" at Stage 1** means the RM has confirmed the document is the correct type and legible — an intake/completeness check, **not** legal authenticity. Authenticity verification (akta notaris, SIUP, NIB) is Stage 2 (Legal). To be confirmed by the Bank.
- **SLIK & Pefindo are intentionally excluded** from this Stage 1 *required* list — they are **RM bureau-data pulls** (RM-owned `slik` desk, "Biro Data & Kolektibilitas"), not customer intake submissions (D1 2026.06.05 / ADR-0007 moved this work from the Risk Analyst to the RM). The RM may upload them early **from Stage 1** but they stay **optional** (they never gate the 1→2 advance). The SLIK report (`docType: 'slik_report'`, **required** for the Stage-2 SLIK→Feasibility handoff) and the advisory Pefindo report (`docType: 'pefindo_report'`, **optional**) are appended to `app.documents` outside this builder. See WORKFLOW.md §"Stage 2 detail" for the full shape.
- Hard-gate parameters (DSR, LTV, Kolektibilitas) are **not** part of Stage 1 document completeness — their inputs are produced later in the pipeline.

---

*The implementing mechanism (template, condition predicates, in-app gate) is built — see [BUILD-STATE.md](../CURRENT-STATE.md) Stage 1. The Bank-confirmation item lives in [OPEN-QUESTIONS.md](discovery-open-questions.md).*
