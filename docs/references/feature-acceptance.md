# MIZAN — Feature Acceptance Register (1 sumber kebenaran + 1 kalimat acceptance)

- **Type:** living register · **Status:** Living register · **Last reviewed:** 2026.06.09
- **Provenance / owner:** Mizan engineer + product owner (Luthfi). Started 2026.06.09 to stop the
  "AI builds something that doesn't match intent" loop.
- **Used by:** every agent/human before building or reviewing a feature; the per-feature **acceptance
  sentence is the done-contract** — if you can't demo it live, the feature is not done.
- **Review / delete trigger:** review whenever a listed feature's behavior changes; an entry whose
  acceptance sentence stops matching the code is a bug in the code OR the sentence — fix one in the
  same batch.

> **Why this exists.** Mizan's knowledge is spread across 7 layers (glossary, designs, decisions,
> AGENTS, current-state, planning, references). That's good for depth but bad for *alignment*: when a
> feature's truth is scattered, AI (and humans) fill the gaps with guesses, and we ship something that
> "feels broken even when it runs" (*berasa rusak padahal jalan*). This register fixes that with two
> things per feature, and only two:
>
> 1. **1 sumber kebenaran** — ONE pointer to where the feature's real behavior lives (usually the
>    canonical code module + at most one design doc). Not a re-explanation — a *pointer*. Everything
>    else must defer to it.
> 2. **1 kalimat acceptance** — ONE observable, demoable sentence in the shape
>    **"Sebagai `<role>` di `<stage/desk>`, gw `<aksi>`, gw lihat `<hasil>`."**
>    It is the contract for "done": a human can run it and *see* it pass. If a feature needs a few
>    sub-contracts (multi-step flows), the **headline** sentence comes first, sub-acceptances below it.
>
> **Status legend:** ✅ built & wired (kode meng-implement acceptance-nya) · ⚠️ sebagian (gap dicatat) · ❌ belum dibangun.
> **Bukti (penting — cf. aturan _status claims cite proof_ di `AGENTS.md`):** acceptance = *done-contract*; bukti emasnya = **demo langsung**. `✅` cuma berarti "mestinya lolos demo" (dari kode/logika). Baris yang udah **beneran di-demo** ditandai eksplisit **"verified live"** + tanggalnya. Jadi: `✅` tanpa "verified live" = **belum di-demo langsung**, jangan dibaca sebagai sudah dibuktikan.
>
> **How to use it:** before building/changing a feature → read its row, build to the sentence. After →
> demo the sentence live (not just typecheck). When you add a feature, add its row in the same batch.

> ℹ️ The RM-led pipeline redesign (ADRs 0018–0020) **shipped and merged to `main` 2026.06.12.** Two effects on the rows below:
> (1) the **intake hard-gates** (required docs · intake-OCR/NIK · NIK-mismatch · Initial-AML attestation) **moved off the Stage 1→2 advance** to the **MUAP→Risk submit** (`muapToRiskBlockers` in `lib/stage-action.ts`, enforced at the MUAP ladder *request* in `server/actions/approval.ts`); `stage1To2Blockers` now returns `[]`. (2) **doc-access is unchanged** — MUAP stays editable at Stage 3 only, RSK at Stage 4 only (ADR-0018's "MUAP editable early" applies to the *generation* affordance, not the editor). The "Integritas Risk→Komite" rows remain as-built; the OCR cross-check NIK-blocker row (below) is updated to cite the relocated gate.

---

## Approval Berjenjang (maker-checker signature ladder)

- **Sumber kebenaran (kode):** `apps/web-app/src/lib/approval-chain.ts` — the **pure reducer** that
  defines the chains, order, four-eyes, and state. Server gates: `server/actions/approval.ts`. UI:
  `components/application/ApprovalLadder.tsx`. Desks/labels: `lib/approval-desks.ts`.
- **Sumber kebenaran (design):** `docs/designs/workflow-engine.md` (§ladder trace) +
  `docs/designs/workflow-target.md` (steps 6–7). Routing config (engine + admin RoutingTab shipped
  2026.06.09; production map W1): `docs/designs/admin-config-layer.md`. Keputusan rantai 2-jenjang:
  [ADR-0021](../decisions/0021-two-rung-approval-chains.md).
- **Chains:** MUAP `RM/Analis → Team Leader` · RSK `Risk Analyst → Risk Team Leader (RTL)`. Same
  machinery, two ordered lists. (Dipersingkat dari rantai lama RM→TL→BM / RA→RO→CRO→DPS per
  ADR-0021 — shipped 2026.06.12 — typecheck+unit+integration verified; live smoke pending. DPS
  tetap punya gate kondisional `dps-review` di Stage 5; cuma peran DPS sebagai penandatangan RSK
  yang dihapus.)

**Headline acceptance:**
> **Sebagai Team Leader di MUAP, gw kasih tandatangan terakhir, gw lihat dokumen MUAP langsung BEKU,
> QR ter-stamp, dan pengajuan otomatis maju ke Risk Review** — dan rung maker sebelumnya cuma bisa
> ditandatangani orang yang beda, sesuai urutan (RM → TL).

**Sub-acceptance (per rung / state):**

| # | Kalimat acceptance | Status |
|---|---|---|
| 1 | Sebagai **RM** di MUAP, setelah Legal & Appraisal beres, gw klik **"Ajukan Persetujuan"**, gw lihat ladder kebuka & status jadi **"Menunggu Team Leader"**. | ✅ (live-verified di rantai lama; rantai 2-rung: typecheck+unit+integration verified, live smoke pending) |
| 2 | Sebagai **RM** dengan MUAP yang masih langgar hard-gate (DSR/LTV/Kol), gw **wajib isi alasan override** dulu sebelum bisa ngajuin; tanpa itu tombolnya nolak. | ✅ |
| 3 | Sebagai **Team Leader**, pas RM ngajuin MUAP buat gw setujui, gw lihat tugasnya **nongol di Beranda (panel "Menunggu tanda tangan Anda") + sidebar badge + `/notifications`**, tanpa buka pengajuan satu-satu. | ✅ (2026.06.09) — sidebar badge + `/notifications` ternyata **sudah** ada; yang ditambah = panel directive di Beranda (`components/kanban/AwaitingSignaturePanel.tsx`), derive dari `listAwaitingApprovalNotices` yang **sama** (Home/badge/notif gak akan beda). **Verified live:** TL Teguh → FOS-005/011/014, nol console error. |
| 4 | Sebagai **Team Leader** di MUAP, gw klik **"Setujui"**, gw lihat **MUAP langsung BEKU** (TL = rung terakhir), dan gw **gak bisa** nandatangin rung maker juga (four-eyes). | ✅ shipped 2026.06.12 — typecheck+unit+integration verified; live smoke pending |
| 5 | Sebagai **checker**, gw klik **"Kembalikan ke Pengaju"** dengan **alasan wajib**, gw lihat ladder reset ke pengaju & alasan gw kebaca sama RM. | ✅ |
| 6 | Sebagai **checker (TL / RTL)**, tiap tandatangan gw punya **QR** yang kalau di-scan buka `/qr/<token>` dan nunjukin siapa-kapan-rung-apa. | ✅ (stamp ke Doc best-effort; ledger + `/qr` selalu otoritatif) — slot QR RTL `rsk_sig_rtl_tanggal` stamp sebagai safe no-op sampai pemilik template update blok tanda tangan master RSK |
| 7 | Sebagai **admin**, gw arahin pengajuan si Budi ke **TL Sari spesifik**, gw lihat cuma dia yang boleh tandatangan rung itu. | ✅ **2026.06.09** — STRICT per-submitter routing: engine (`lib/approval-routing.ts` + `server/config/approval-routing.ts`) + admin **RoutingTab** (`components/admin/RoutingTab.tsx`) buat bikin rule per-pengaju + seeded demo routing (demoable). Cuma akun ter-route yang boleh ttd rung terkonfigurasi; rung tak-terkonfigurasi → fallback semua pemegang desk (by design). Production map = W1. (`designs/admin-config-layer.md`) |
| 8 | Untuk **RSK**, semua di atas berlaku sama persis dengan rantai **RA → Risk Team Leader (RTL)**; tanda tangan RTL mem-BEKU RSK. (DPS bukan lagi penandatangan RSK — DPS tinggal gate `dps-review` kondisional di Stage 5.) | ✅ shipped 2026.06.12 — typecheck+unit+integration verified; live smoke pending · notif/Beranda #3 nyakup RSK juga (resolver `awaitingApprovalNotices` cover dua chain) |
| 9 | Sebagai **RM (Pengaju)**, pas gw submit MUAP (`Ajukan Persetujuan`), **tanda tangan QR gw ke-stamp** di slot `tanggal_ttd_rm` — sama kayak TL. (RSK: maker RA → `rsk_sig_analyst_tanggal`.) | ✅ **BERES (Batch 2, 2026.06.10, typecheck+test)** — `appendApprovalStep` mint qrToken di aksi **`request`** (maker) selain `approve`; `actOnChain` stamp slot `SIG_SLOT_OF_APPROVAL_ROLE[role]` buat dua chain; `reject` gak mint (bukan ttd). Best-effort ke Doc (ledger + `/qr` tetap otoritatif). **Live-stamp NOT verified** (butuh kredensial Google). |

**Verdict (update 2026.06.12):** engine ✅ dengan rantai 2-rung per [ADR-0021](../decisions/0021-two-rung-approval-chains.md) — shipped 2026.06.12 — typecheck+unit+integration verified; live smoke pending. Gap **#3 (checker gak dinotif) → DITUTUP** (verified live, pra-ADR-0021). Gap
**#9 (QR maker gak ke-stamp) → DITUTUP** (Batch 2, typecheck+test; live-stamp belum). Gap **#7 (strict routing) → DITUTUP** 2026.06.09 — engine (`lib/approval-routing.ts`) + admin **RoutingTab** +
seeded demo routing; rung tak-terkonfigurasi tetap fallback "semua pemegang desk" (by design), production map W1. **Semua acceptance ladder di atas ✅.**

---

## Kartu LG ikut deliverable, bukan stage advance (Batch 1, ADR-0007)

- **1 sumber kebenaran:** `apps/web-app/src/lib/stage-action.ts` (`applyDecision` LG-exempt + `settleLgAssignment` + `reopenStage2Role`); dispatch dari `completeLegalAction` & `recordAppraisalAction`. Design: `docs/designs/origination-phase-legal-as-review.md` §Why.
- **Kalimat acceptance:** *Sebagai **LG**, kalau RM advance ke Stage 3 sebelum gw selesai, kartu gw tetap di "Tugas Saya" sampai Yuridis + Penilaian dua-duanya kerekam.*
- **Status:** ✅ (2026.06.10) — typecheck + unit (red→green: `Batch 1 / T1·T2·T4` di `stage-action.test.ts`) + integration hijau. **Live NOT yet verified** (butuh emu seed + agent-browser smoke).

---

## Rapat Komite dikelola RM (desk `komite-admin`, Batch 8 / ADR-0015)

- **1 sumber kebenaran:** `apps/web-app/src/server/actions/komite.ts` (4 management actions + `updateMeetingAttendeesAction` di desk `komite-admin`), `lib/komite.ts` (`attendeeUpdateError`, `committeeRoster`), `lib/desks.ts` (desk split). Decision: `docs/decisions/0015-komite-admin-desk-rm-managed-sessions.md`.
- **Kalimat acceptance:** *Sebagai RM, gw yang bikin & atur sidang komite (termasuk koreksi kehadiran sebelum MoM ditandatangani); sebagai anggota Komite gw cuma cek materi, (ketua) catat keputusan, dan tanda tangan.*
- **Status:** ✅ (2026.06.10) — typecheck + unit (desk split di `can.test.ts`; no-show recovery + freeze guards di `komite.test.ts`) + integration hijau. UI di-gate ke `komite-admin` (typecheck-only). **Live NOT yet verified** (butuh emu + agent-browser smoke 2 persona).

---

## Integritas Risk→Komite + lifecycle dokumen (Batch 3, ADR-0016 — SEBAGIAN 2026.06.10)

- **1 sumber kebenaran:** `lib/auth/doc-access.ts` (`canEditDoc` exact-stage), `lib/stage-action.ts` (`makerSubmitGateError` + band RA), `server/actions/approval.ts` (RSK request gate), `server/docs/service.ts` (`freezeDecisionArchive`). ADR: `docs/decisions/0016-…`.
- **Kalimat acceptance (yang SUDAH dibangun, typecheck+test):**
  1. *Di tiap tahap, tepat satu dari {MUAP, RSK} yang editable* — MUAP cuma Stage 3, RSK cuma Stage 4 (sampai disubmit). ✅
  2. *RSK gak bisa diajukan ke Komite tanpa rekomendasi RA, dan satu-satunya jalur 4→5 = ladder RSK lengkap* (ladder sekarang RA → RTL per [ADR-0021](../decisions/0021-two-rung-approval-chains.md)). ✅
  3. *Tiap keputusan Komite PASTI punya arsip beku, atau kegagalannya tercatat keras di Riwayat* (bukan fire-and-forget client). ✅
- **PARKED (handoff `docs/handoffs/2026.06.10-batch3-drive-lifecycle/`):** downgrade grant Drive existing (T2, gate spike S1), RSK-dibuat-di-Stage-4 (T3), auto read-back (T4), send-back redraft (T7). **Live NOT verified** untuk yang shipped.

---

## OCR Cross-Check — verifikasi data vs dokumen (Batch 6 — MEKANISME DIBANGUN 2026.06.10)

- **Status:** ✅ **mekanisme dibangun (Batch 6, typecheck+test)** untuk 4 field registry (NIK, Kol, penghasilan, appraisal). **Live NOT verified** + **dependency provider asli** tetap berlaku: cuma bermakna di bawah `documentai`/`gemini`; di `stub` nilai dikarang dari data app → selalu **cocok** (`match`), jadi gak ada teater mismatch (terselesaikan by construction). **Refinement belum dibangun:** (row 1) banding angka masih **exact**, belum ±toleransi; (row 4) field **verify-only** (nama vs KTP, NIB/akta, NPWP) di luar scope batch ini.
- **Sumber kebenaran:** `lib/extraction-registry.ts` (`reconcileExtraction`/`planMismatchResolution`), `server/actions/application-data.ts` (`applyExtractionCandidate` ingestion + `confirmExtractedFieldAction(…, resolution)`), `lib/types.ts` `ExtractionMismatch` + kolom DB `extractionMismatches`, UI `components/application/OcrSuggestionControls.tsx` (`OcrFieldRow` chip + keep/accept).
- **Beda dari OCR sebelumnya:** dulu OCR **nimpa/ngisi** nilai. Sekarang: nilai yang **sudah di-bless** (human/confirmed/overridden) **tidak pernah ditimpa** — OCR yang beda dicatat sebagai `mismatch`; manusia resolve (keep/accept).

**Headline acceptance:**
> **Sebagai RM di tab Data, pas gw upload dokumen yang angkanya beda dari yang sudah keinput di Mizan, gw lihat badge ⚠ "Beda dari dokumen — dokumen: X · Mizan: Y" di field itu**, dan gw bisa resolve (pakai nilai dokumen / pertahankan) — dua-duanya keaudit.

| # | Acceptance | Status |
|---|---|---|
| 1 | NIK & Kol dibanding **exact**; Rupiah dibanding **toleransi** (±%/pembulatan). | ⚠️ **sebagian** — exact untuk semua (`extractionValuesEqual` numeric-exact); ±toleransi belum. |
| 2 | Mismatch **non-identitas** = advisory (gak ngeblok); **NIK beda dari KTP = ngeblok progres**. | ✅ **dibangun** — pasca-redesign (2026.06.12) NIK mismatch (`extractionMismatches.nik`) memblok **submit MUAP→Risk** via `muapToRiskBlockers` (dulu `stage1To2Blockers`, sekarang `[]`); mismatch non-identitas tetap advisory. |
| 3 | Resolve (pakai dokumen / pertahankan Mizan) **kecatet di Riwayat**. | ✅ **dibangun** — `confirmExtractedFieldAction(…, 'keep'\|'accept')` + audit (NIK PII tidak ditulis ke ledger). |
| 4 | Field **verify-only** (nama vs KTP, NIB/akta, NPWP). | ❌ **di luar scope Batch 6** (cuma 4 field isi). |
| 5 | Di bawah `stub`, badge verifikasi gak teater. | ✅ by construction — stub karang dari app → `match`, gak ada mismatch. |

**Scope field:** mode-isi = 4 field (NIK, Kol, penghasilan, appraisal). Mode-verify ≥ itu (boleh nambah verify-only). Cuma field yang ada dokumen pendukungnya yang bisa diverifikasi. Bangun ini dengan care tinggi (integritas data + audit) — pi medium-tier kalau didelegasikan.

---

## Riset AI data-driven — riset semua yang relevan, bukan cuma profil perusahaan (PLAN — belum dibangun)

> ✅ **SEBAGIAN dibangun (Batch 5, 2026.06.10, typecheck+test).**

- **Status:** 🟡 **multi-angle dibangun** — entity + **sektor** + **makro** (BPS/news), business-only, PII-guard tetap. ⏸ **belum:** referensi harga agunan/aset (butuh allowlist expansion + review Bank-Legal — sengaja TIDAK di-auto-egress).
- **Sumber kebenaran (seam):** `lib/research/classifier.ts` (`planResearch` — query builder), `server/research/agent.ts` (tree-exploration POC, scaffolded), `designs/ai-assist.md` (deep-research agent + cek-harga/agunan).
- **Sebelumnya:** classifier cuma **4 query profil perusahaan**. **Sekarang:** + sektor (bound entity) + makro industri generik (no entity). Allowlist domain TIDAK ditambah (price refs di-gate).

**Headline acceptance (TARGET — belum dibangun):**
> **Sebagai RM/analis di Stage 3, pas auto-riset jalan, gw lihat sumber yang dikumpulin bukan cuma profil perusahaan** — tapi juga sektor/industri, referensi nilai agunan, dan harga aset yang dibiayai — semuanya diturunkan dari data pengajuan, tanpa gw ketik ulang.

**Rambu (invariant — wajib dijaga saat dibangun):**
- **PII tetap haram egress** — business-only, gak pernah nama orang/pengurus (PDP Law).
- **Allowlist diperluas hati-hati** — referensi harga properti/kendaraan butuh review Bank-Legal dulu.
- **Murah = auto · dalam = invoke** — riset entry tetap ringan; deep multi-source = on-demand (mahal).

---

## Konteks lengkap untuk drafter MUAP — supply semua context relevan (PLAN — belum dibangun)

> ✅ **SEBAGIAN dibangun (Batch 5, 2026.06.10, typecheck+test).**

- **Status:** 🟡 **Ringkasan Biro sekarang diumpanin ke drafter** (`bureauSummary` → `SeedContext` → `narrative.ts`, lewat jalur masking yang sama). Data sektor masuk via `exploredSources` (riset #1). Referensi agunan masih nunggu #1 (price-ref di-gate Bank-Legal).
- **Sumber kebenaran (seam):** `lib/seed-context.ts` (`buildSeedContext` / `SeedContext`), `server/ai/narrative.ts` (prompt assembly + masking).
- **Sebelumnya:** `SeedContext` = identitas/term, hard-gate, `financialInputs`, `analysis`, `documentTexts`, `exploredSources` — **Ringkasan Biro TIDAK diumpanin**. **Sekarang:** + `bureauSummary`. ⚠️ sample kualitas draft = **review user** (judgment, bukan test).

**Headline acceptance (TARGET — belum dibangun):**
> **Sebagai analis di MUAP, draft AI udah ngerujuk konteks lengkap yang kita punya** (biro + sektor + agunan + dokumen), bukan cuma sebagian — jadi narasinya nyambung sama fakta pengajuan tanpa gw suapin manual.

**Rambu (invariant — wajib dijaga saat dibangun):**
- **Kurasi, bukan dump** — konteks gak relevan dibuang (hindari garbage-in yang ngencerin narasi).
- **Masking ikut naik seiring volume egress** — full-OCR udah egress nama/alamat *unmasked* (accepted residual), apalagi **Vertex `global` = egress US**. Pertimbangin `PII_RESIDUAL_BLOCK=1` buat data asli **sebelum** gedein volume context.
- **AI tetap cuma nulis narasi** — angka gate (DSR/LTV/Kol) tetap deterministik, gak dikarang AI.

---

## Daftar fitur (backlog — belum diisi)

Diisi satu per satu, pakai format yang sama. Urut dari yang paling kerasa "engga beres" dulu.

| Fitur | Sumber kebenaran | Status entry |
|---|---|---|
| **Approval berjenjang** | `lib/approval-chain.ts` | ✅ diisi (atas) |
| **OCR cross-check (verifikasi)** | `lib/extraction-registry.ts` | 🆕 acceptance dicatat — PLANNED (atas) |
| **Riset AI data-driven (enhancement)** | `lib/research/classifier.ts` | 🆕 plan dicatat — PLANNED (atas) |
| **Konteks lengkap drafter MUAP (enhancement)** | `lib/seed-context.ts` | 🆕 plan dicatat — PLANNED (atas) |
| OCR field extraction (isi, current) | `lib/extraction-registry.ts` · `server/ocr/*` | ⏳ belum diisi |
| Riset web (grounded, current) | `server/research/pipeline.ts` · `designs/ai-assist.md` | ⏳ belum diisi |
| Auto-draft MUAP Stage-3 (current) | `server/docs/auto-draft.ts` · `designs/ai-assist.md` | ⏳ belum diisi |
| Hard-gate (DSR/LTV/Kol) | `lib/hardGates.ts` · `designs/workflow-engine.md` | ⏳ belum diisi |
| Rapat Komite + signed MoM | `decisions/0005-…` · `lib/approval-chain.ts` (`mom`) | ⏳ belum diisi |
| SP3 (offer letter) | `server/docs/*` · `designs/document-system.md` | ⏳ belum diisi |
| Stage engine (6-stage) | `designs/workflow-engine.md` | ⏳ belum diisi |
| PII masking (AI egress) | `server/ai/narrative.ts` | ⏳ belum diisi |
| Audit trail (history) | `server/repo/*` `appendHistory` | ⏳ belum diisi |
