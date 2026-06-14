# MIZAN — MUAP Template

- **Type:** stable spec (doc layout) · **Status:** Living register · **Last reviewed:** 2026.06.03
- **Provenance:** merged from `brainstorm/MUAP-TEMPLATE.md` (retired).
- **Used by:** the token engine `../designs/muap-template-engine-v2.md` (the "how"); this is the section "what".
- **Review trigger:** Discovery W1 (Hijra house template may override sections).

> **Reconcile:** section structure I–IX + per-akad tables = durable layout; engine/tokenization design is `../designs/muap-template-engine-v2.md`. Role names below (e.g. "LA"/analis) are pre-fold labels — the as-built MUAP author is **RM** (desk `muap-author`; AO+LA→RM, RT→RA); see `../GLOSSARY.md`.

> **Memorandum Usulan Analisa Pembiayaan** — the primary output of Stage 3. Submitted to Risk Review (Stage 4) and Committee Decision (Stage 5). **OJK audit-grade**: wrong format = procedural rejection, not business rejection.
>
> 📝 The section structure below is **NoEffort interpretation** based on common BPRS practice under POJK 9/2024 and POJK 24/2018. Sources (proposal, manifesto, response doc) name MUAP as a required output but do not enumerate its sections. Bank confirms the exact required format at Discovery W1 — Hijra may have a house template that overrides this.
>
> **Generation status (2026.06.08):** the structured MUAP below is generated via **V3** (ADR-0013) —
> `createApplicationDocs` fills the master's `[bracket]` slots with Mizan-known facts (`server/docs/seed.ts`);
> the free-text `muapNarrative` is no longer the mechanism. The narrative sections are the template's own
> granular human-fill prompts (filled in-app with AI assist), not stamped from the registry.

## Token engine & generation (V3)

This doc owns the **layout ("what")**; the generation **mechanism ("how")** is
[`../designs/document-system.md`](../designs/document-system.md) (decision:
[`../decisions/0013-docs-generation-v3-replace-all-text.md`](../decisions/0013-docs-generation-v3-replace-all-text.md)),
and the live Doc IDs / token sets are in [`document-templates.md`](document-templates.md). In V3 each
Mizan-known slot is a unique `[bracket]` filled via `replaceAllText` (value-or-placeholder, leak-proof); the old
V1 free-text blob and the V2 644-token NamedRange registry are both superseded — do not reference the V1 master
`1MfuT-uX2h-fFA6kkxtKNxAoeYI5lBAUG8SwUAS7Eztw` in new work.

**AI restriction (compliance):** AI is restricted to **explicit narrative tokens only**. Facts, OCR values, and
analyst-entered data are never routed through the LLM (structurally enforced via `assertSafeTokens`); narrative
tokens route through the masking pipeline + Gemini. NB (2026.06.08): the real MUAP/RSK masters carry their own
granular human-fill narrative prompts, so AI narratives are filled **in-app**, not stamped into the Doc.

**Deep research agent:** built (`server/research/*` — `agent.ts` / `worker.ts` / `job.ts` /
`searxng-firecrawl.ts`); feeds `ai_*` narrative drafting on RM-invoke. Caps: 5–12 sub-questions, wall-clock +
budget caps, PII gate before every call; **G5** — production research requires the Google Cloud DPA to cover
Vertex AI inference (confirm at Discovery W1).

**Relation to the section structure below:** Sections I–IX describe the user-facing document layout — still
valid. The registry maps individual fields within those sections to typed slots.

### 4 decisions — T1 blockers (batch for Discovery W1)

| # | Decision | Status |
|---|---|---|
| 1 | **Token reuse vs distinct** — same field appearing in multiple sections: shared token or per-section distinct tokens? | ✅ **Shared token** — DRY; if the field is the same, reuse the token |
| 2 | **Fillable vs fixed optional placeholders** | ✅ **No optional placeholders** — RM familiar with template; template already makes clear what's fillable |
| 3 | **T34 checking-method** — structured split (sumber/metode/periode as separate tokens) vs single free-text? | ✅ **Free-text** — RM writes what's relevant; no structured split needed |
| 4 | **T82 decision-value mapping** — Bahasa render vs English DB verbs | ✅ **Template is source of truth**: use Bahasa if the MUAP/RSK template uses Bahasa; otherwise default to English |

---

## Document header

```
MEMORANDUM USULAN ANALISA PEMBIAYAAN

Nomor      : [auto-generated, e.g. MUAP/2026/FOS-2026-011]
Tanggal    : [auto: today's date]
Perihal    : Permohonan Pembiayaan [akadType] atas nama [nasabahName]
```

---

## I. IDENTITAS PERMOHONAN

| Field | Value |
|---|---|
| No. Aplikasi | `applicationId` |
| Tanggal Pengajuan | `createdAt` |
| Nama Pemohon | `nasabahName` |
| NIK | `nik` (masked in external copies — see MASKING.md) |
| Jenis Nasabah | `nasabahType` (Perorangan / Badan Usaha) |
| Nama Usaha | `namaUsaha` (if business) |
| No. HP / WhatsApp | `phoneNumber` / `whatsappNumber` |

---

## II. DATA PERMOHONAN

| Field | Value |
|---|---|
| Plafond Diminta | `requestedPlafond` |
| Tenor | `requestedTenorMonths` bulan |
| Jenis Akad | `akadType` |
| Tujuan Pembiayaan | `purpose` |
| Jenis Agunan | `collateralType` |
| Sumber Pendapatan | `incomeSource` |
| Status Pernikahan | `isMarried` |

---

## III. ANALISIS 5C+1S

> Inti dokumen. LA menulis berdasarkan AI draft + penelitian manual eksternal (Google, LinkedIn, kunjungan lapangan, pengecekan perdagangan). AI bersifat doc-bound di V1 — data eksternal ditambahkan manual oleh LA.

### Character (Karakter)
Penilaian integritas dan rekam jejak nasabah. Sumber: dokumen yang dikumpulkan RM, verifikasi legal Stage 2, kunjungan lapangan LA (manual).

*Pertanyaan kunci*: Apakah nasabah memiliki rekam jejak yang dapat dipercaya? Adakah riwayat wanprestasi atau masalah hukum?

### Capacity (Kapasitas)
Kemampuan nasabah membayar kewajiban. Sumber: financial inputs (income, obligations, DSR computation).

*Flat akad*: DSR = `(existingMonthlyObligations + proposedMonthlyInstallment) / netMonthlyIncome`. Objektif — cukup sajikan angka dan bandingkan dengan threshold 40%.

*Profit-share akad (Musyarakah/Mudharabah)*: DSR = `(existingMonthlyObligations + projectedMonthlyProfitShare) / netMonthlyIncome`. **Bersifat judgmental** — LA wajib mendokumentasikan dasar proyeksi: historis pendapatan usaha, proyeksi pertumbuhan, perbandingan usaha sejenis. Narasi Capacity harus membenarkan proyeksi secara eksplisit.

### Capital (Modal)
Posisi keuangan nasabah saat ini. Sumber: laporan keuangan, rekening koran, neraca usaha (dari dokumen Stage 1). LA menambahkan temuan dari analisis laporan keuangan manual.

*Pertanyaan kunci*: Berapa modal sendiri yang dimiliki? Berapa rasio utang terhadap ekuitas? Apakah ada aset likuid?

### Condition (Kondisi)
Kondisi industri, pasar, dan makroekonomi yang relevan. Sumber: **penelitian manual LA** (Google, berita industri, data BI, laporan OJK) — AI tidak melakukan web search di V1.

*Pertanyaan kunci*: Bagaimana prospek industri nasabah? Apakah ada risiko regulasi atau musiman? Bagaimana kondisi persaingan?

### Collateral (Agunan)
Kecukupan dan likuiditas agunan. Sumber: dokumen agunan (sertifikat, BPKB, dll.), nilai appraisal (`collateralAppraisedValue`), LTV computation.

LTV = `requestedPlafond / collateralAppraisedValue`. Threshold: LTV > 70% = ⚠️ flagged.

Perlakuan agunan per akad: lihat [AKAD-TYPES.md § Collateral (5C+1S impact)](akad-types.md#akad-type-impact-on-analysis-5c1s). **MUAP-specific**: untuk Musyarakah/Mudharabah, dokumentasikan kecukupan agunan secara eksplisit di narasi (agunan sulit diperoleh karena joint venture).

### Syariah (+1S)
Kesesuaian akad dengan prinsip syariah untuk transaksi ini. DPS tidak mereview per-deal di V1 — ini adalah penilaian LA.

Poin verifikasi syariah per akad: lihat [AKAD-TYPES.md § Syariah (+1S)](akad-types.md#akad-type-impact-on-analysis-5c1s). **MUAP-specific**: dokumentasikan hasil verifikasi syariah per akad secara lengkap dalam narasi — untuk Mudharabah (penilaian paling ketat, bank menanggung 100% risiko modal) dokumentasi harus paling rinci.

---

## IV. ANALISIS KEUANGAN

### Flat akad (Murabahah / Ijarah)

| Item | Nilai |
|---|---|
| Plafond Diminta | `requestedPlafond` |
| Tingkat Margin / Ujrah | `marginRate` × 100% per tahun |
| Tenor | `requestedTenorMonths` bulan |
| Total Margin / Ujrah | `plafond × marginRate × tenor/12` |
| Total Kewajiban | `plafond + totalMargin` |
| Angsuran per Bulan | `totalObligation / tenorMonths` |
| DSR | `(existingObligations + installment) / netMonthlyIncome` × 100% |
| LTV | `plafond / collateralAppraisedValue` × 100% |
| Kolektibilitas SLIK | Kol `kol` — [Lancar / Dalam Perhatian Khusus / dst] |

> Terminologi: gunakan **"margin"** untuk Murabahah, **"ujrah"** untuk Ijarah.

### Profit-share akad (Musyarakah / Mudharabah)

| Item | Nilai |
|---|---|
| Plafond Diminta | `requestedPlafond` |
| Kontribusi Modal Bank | `requestedPlafond` |
| Kontribusi Modal Nasabah | [dicatat manual oleh LA] |
| Nisbah Bagi Hasil | [bank]% : [nasabah]% |
| Proyeksi Profit Share per Bulan | `projectedMonthlyProfitShare` |
| Dasar Proyeksi | [narasi LA — wajib diisi] |
| DSR | `(existingObligations + projectedProfitShare) / netMonthlyIncome` × 100% |
| LTV | `plafond / collateralAppraisedValue` × 100% |
| Kolektibilitas SLIK | Kol `kol` — [Lancar / dst] |

> ⚠️ DSR untuk akad bagi hasil bersifat **proyeksi** — LA wajib mendokumentasikan basis proyeksi. Angka DSR lebih bersifat indikatif dibanding flat akad.

---

## V. HARD GATE SUMMARY

> Nilai DSR/LTV dihitung dengan formula di [§ IV ANALISIS KEUANGAN](#iv-analisis-keuangan) — tabel ini hanya merangkum hasil terhadap threshold.

| Metrik | Nilai | Threshold | Status |
|---|---|---|---|
| DSR | X% | ≤ 40% | ✅ Aman / ⚠️ Melebihi |
| LTV | X% | ≤ 70% | ✅ Aman / ⚠️ Melebihi |
| Kolektibilitas SLIK | Kol X | Kol 1 | ✅ Lancar / ⚠️ Bermasalah |

> Pelanggaran hard gate bukan otomatis penolakan — Risk dan Komite membuat keputusan final. LA wajib mendokumentasikan mitigasi yang diusulkan jika ada gate yang dilanggar.

---

## VI. REKOMENDASI ANALIS

**Usulan keputusan**: Setuju / Setuju Bersyarat / Tolak

| Field | Nilai |
|---|---|
| Plafond Diusulkan | `requestedPlafond` (atau lebih rendah jika LA merekomendasikan penyesuaian) |
| Tenor Diusulkan | `requestedTenorMonths` bulan |
| Tingkat Margin / Ujrah / Nisbah | `marginRate` / nisbah |
| Catatan Syarat (jika Bersyarat) | [wajib diisi jika rekomendasi Bersyarat] |
| Alasan (jika Tolak) | [wajib diisi jika rekomendasi Tolak] |

> Catatan: rekomendasi LA adalah masukan untuk Risk dan Komite — bukan keputusan final. Risk memiliki hak veto; Komite memegang keputusan akhir yang mengikat.

---

## VII. CATATAN ANALIS

Ruang bebas untuk hal-hal yang tidak masuk kategori di atas: temuan lapangan, konteks tambahan, pertimbangan khusus, rekomendasi mitigasi untuk hard gate violations.

*Ini adalah field `muapNarrative` yang sudah diimplementasi di app (MUAPTab "V. CATATAN ANALIS").*

---

## VIII. STATUS LEGAL & SLIK (dari Stage 2)

| Item | Status |
|---|---|
| Legal review (LG) | Selesai / Belum |
| Semua dokumen terverifikasi | Ya / Tidak |
| SLIK diunggah | Ya / Tidak |
| Kolektibilitas SLIK | Kol X |
| KOL dikonfirmasi RT | Ya / Tidak |

> Section ini diisi otomatis dari data Stage 2 — bukan input manual LA.

---

## IX. TANDA TANGAN & PERSETUJUAN

| Peran | Nama | Tanggal | Tanda Tangan |
|---|---|---|---|
| Analis Pembiayaan | `LA userName` | `submittedAt` | [e-signature placeholder V1] |

> E-signature adalah placeholder di V1. Implementasi digital signature yang sah untuk OJK adalah V2+ scope.

---

## Open questions untuk Discovery W1

- [ ] 🔴 **Format MUAP Hijra** — apakah Hijra punya house template MUAP yang harus diikuti? Jika ya, struktur di atas harus disesuaikan. Template ini adalah interpretasi NoEffort.
- [ ] 🟡 **Nomor MUAP** — format penomoran resmi (misal: MUAP/YYYY/MM/NNN)?
- [ ] 🟡 **Rekomendasi analis** — apakah LA merekomendasikan plafond spesifik, atau hanya approve/reject?
- [ ] 🟡 **Hard gate violations** — apakah LA wajib mengisi mitigasi, atau cukup mencatat?
- [ ] 🟡 **E-signature** — apakah V1 cukup dengan digital timestamp + nama, atau butuh qualified e-signature (seperti PrivyID)?
- [ ] 🟢 **Nisbah ranges** — apakah ada standar nisbah minimum/maksimum di Hijra untuk Musyarakah/Mudharabah?
- [ ] 🟢 **DPS review** — apakah DPS perlu melihat MUAP sebelum Komite? (Diasumsikan tidak di V1 — DPS review akad framework, bukan per-deal.)
