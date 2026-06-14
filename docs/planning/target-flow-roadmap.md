# Mizan target flow (end-to-end) + change roadmap

- **Status:** ACTIVE (master sequence + gap register). **Batches 1–6 + 8 SHIPPED 2026.06.10** (see
  §2/§3 for per-gap proof); **Batch 7 (origination-collapse + Legal-as-review) DEFERRED** — needs user
  re-activation + an ADR. Synthesized 2026.06.10 from the full-flow walkthrough (intake → pencairan);
  ties the design notes into one target flow + the ordered change roadmap. *(The per-batch execution
  framework / autonomous-campaign prompts that used to live in §5–§6 were removed once the campaign ran
  — git history is the archive.)*
- **Owner:** app-side engineer · **Review:** at each batch close, update §4 and exit when all batches
  land or are explicitly rejected.
- **Authority:** each referenced design note states its own authority. Nothing here overrides an
  accepted ADR until the batch that amends it ships. Build against current ADRs until then.

> Sumber per-proposal (SSOT — detail di sana, bukan di sini):
> `../designs/origination-phase-legal-as-review.md` (Batch 7, deferred) ·
> `../designs/doc-fill-v3.5-namedrange.md` · `../designs/ai-assist.md` (RSK Stage-4 + read-back) ·
> `../references/feature-acceptance.md` (acceptance register) · plan file force-submit (pre-staged,
> see Batch 1).

## 1. Target flow — how Mizan SHOULD run, start to finish

One application, four phases, one accountable owner per phase. Legal/Appraisal and the signature
ladders are **sub-processes attached to the deal**, not stages. Exactly **one document editable at a
time**; everything freezes progressively, advisory AI everywhere, authoritative numbers deterministic.

### Fase 1 — Originasi (owner: RM; today stages 1–3)

1. **Intake.** RM bikin pengajuan, upload berkas wajib satu-satu. OCR (4 field: NIK/Kol/income/
   appraisal) ngisi yang kosong **dan cross-check** yang udah ada (PLANNED — register). AML
   atestasi + konfirmasi NIK.
2. **RM dispatch review-requests** ke Legal (Analisa Yuridis) & Appraisal (Penilaian) — sub-proses
   dengan lifecycle sendiri (requested → in-review → done/returned), **bukan stage**. LG lihat
   permintaannya di Beranda (pola AwaitingSignaturePanel). Selesainya **nge-gate MUAP→Risk**, bukan
   advance origination. *(Target; hari ini masih ADR-0007 stage-2 co-owner.)*
3. **RM bureau work.** SLIK upload + Kol entry + ringkasan biro advisory (window stage ≤3, shared
   predicate — shipped).
4. **Feasibility masuk otomatis.** Saat data RM siap: auto-research **data-driven** (riset semua
   yang kita punya: perusahaan, industri, agunan, pemilik — PLANNED #1), lalu MUAP Doc dibikin dari
   master: V3 `[bracket]` fill + **V3.5 targeted NamedRange** buat slot underscore (plafond/tenor —
   spike-gated), draft AI grounded riset + **konteks lengkap** (PLANNED #2).
5. **RM nyempurnain MUAP di Google Doc** (5C+1S authored di Doc; `app.analysis` tetap seed
   non-otoritatif). MUAP = **satu-satunya doc editable** sekarang.
6. **Ladder MUAP** RM → Team Leader (dua jenjang per ADR-0021, 2026.06.12). Maker `request`
   **ikut stamp QR `tanggal_ttd_rm`** (gap fix). Checker dapet directive Beranda (shipped).
   Ladder lengkap = **gate advance ke Risk**.
7. **Advance ke Risk** ⇒ MUAP **freeze penuh**: grant Drive writer→reader (amend ADR-0014),
   **auto read-back** markdown MUAP (ExtractionRun, advisory), tombol "Sinkronkan" jadi
   **recovery-only**.

### Fase 2 — Risk (owner: RA; today stage 4)

8. **RSK dibuat SELURUHNYA saat MASUK Stage 4** — bukan cuma narasinya: **copy master + fill**
   semuanya pindah ke Stage-4 entry (DECIDED 2026.06.10; sebelumnya copy+fill di Stage-3 entry),
   grounded **MUAP final** via read-back markdown. Sebelum Stage 4 panel docs cuma punya MUAP.
   RSK gantian jadi satu-satunya doc editable. (Implikasi teknis: `DocLinkage` jadi dua langkah —
   `muapDocId` di Stage 3, `rskDocId` di Stage 4 — cek schema/panel yang assume pasangan lengkap.)
9. RA kasih rekomendasi risiko (advisory AI boleh bantu narasi; angka gate deterministik). **Ladder
   RSK** RA → Risk Team Leader (dua jenjang per ADR-0021, 2026.06.12), QR per rung — dan `request`
   ladder **di-gate `riskRecommendation` terisi** (mirror MUAP↔`legalAppraisalComplete`; nutup #13/#14). **Satu-satunya jalur advance 4→5
   = ladder lengkap** (tombol manual "Kirim ke Komite" dihapus/jadi directive). Lengkap ⇒ advance ke
   Komite ⇒ RSK freeze (downgrade grant). Send-back/`ReviseProposal` ⇒ MUAP kebuka lagi, RSK
   read-only (flip eksklusif); re-entry Stage 4 ⇒ RSK re-draft grounded MUAP revisi (#16).

### Fase 3 — Komite (owner: CM; today stage 5)

10. **RM yang ngatur rapat, Komite minim kerja di Mizan** (DECIDED 2026.06.10 — arah; sub-fork di
    §4.5). RM koordinasi sama Komite di luar app (itu kenyataannya) — jadi yang megang administrasi
    sidang di Mizan = **RM**: bikin/confirm sidang (termasuk usulan materializer), atur agenda,
    peserta, tunjuk ketua, **update kehadiran sesuai kenyataan** (nutup wrinkle no-show yang hari
    ini bisa nge-deadlock MoM). **Komite cuma sentuhan kecil**: cek materi sebelum sidang (dossier +
    preview MUAP/RSK), ketua catat hasil (tetap chair-only), hadirin QR-sign MoM. Tanpa voting
    in-app (ADR-0005, kuorum ≥2). Sejalan North Star: Mizan mencatat, tim koordinasi informal.
11. Keputusan ⇒ **freeze checkpoint WAJIB di server** (PDF MUAP+RSK + SHA + `ExploredSource[]`)
    sebagai bagian routing keputusan — bukan best-effort client (#15): app yang memutus tanpa arsip
    beku = bug audit.
12. `conditional` ⇒ branch respons nasabah; `reject` ⇒ RM komunikasikan & tutup.

### Fase 4 — Pencairan (owner: RM; today stage 6)

13. SP3/akad via token fill, checklist pencairan, status **Cair** ⇒ terminal. `closed` ⇒ keluar dari
    pipeline aktif, audit tetap utuh.

### Invarian lintas-fase (sudah berlaku, jangan dilanggar batch manapun)

- **No sync-back otoritatif** Doc→Mizan (read-back = advisory ExtractionRun doang).
- AI advisory-only; mask-in/unmask-out; angka gate deterministik; ledger append-only.
- **Tugas Anda = DO** (action atomic) vs **Alur kerja = GO** (navigasi) — jangan blur.
- Status assignment **derived dari predikat domain**, bukan "stage udah lewat" (Batch 1).
- Status claims cite proof (typecheck · test · live-demo).

## 1b. Sebelum ↔ Sesudah (ringkas, per babak — Batch 7 DEFERRED jadi 6 stage TETAP)

| Babak | SEKARANG | SESUDAH semua batch (1–6, 8) |
|---|---|---|
| **Stage 1–2 — Intake & pendukung** | OCR cuma ngisi field kosong. Kalau RM keburu advance 2→3, kartu LG **lenyap dari "Tugas Saya"** (dipaksa "submitted" palsu) padahal kerjaan ngutang; LG dianggap kelar abis legal doang (Penilaian gak kehitung) | OCR juga **cross-check** data yang udah keisi (B6). Kartu LG **bertahan di "Tugas Saya" sampai Yuridis + Penilaian dua-duanya kerekam**, di stage 2 maupun 3; status assignment gak pernah bohong (B1) |
| **Stage 3 — MUAP** | Riset auto cuma profil perusahaan; konteks drafter sempit; **plafond/tenor BLANK** di Doc (slot underscore); RM submit ladder **tanpa QR ttd RM**; pas maju ke Risk MUAP "beku" tapi **masih bisa diedit di Drive** (grant gak diturunin); RSK doc udah nongol dari sini (prematur, grounding seed mentah) | Riset **data-driven semua yang kita punya** + konteks lengkap ke drafter (B5); plafond/tenor **keisi** via NamedRange V3.5 (B4); request ladder **stamp QR ttd RM** (B2); ladder lengkap ⇒ MUAP **beku beneran** (grant writer→reader) + auto read-back markdown (B3); **RSK belum ada** — cuma MUAP yang hidup |
| **Stage 4 — RSK** | RSK doc warisan Stage-3 yang basi; **dua jalur maju ke Komite dengan gate beda** — DPS sign duluan = masuk Komite **tanpa rekomendasi RA**; tombol manual "Kirim ke Komite" dead-path; abis ReviseProposal, RSK basi nempel terus | RSK **lahir di sini** — copy + fill grounded **MUAP final** (B3); request ladder **di-gate rekomendasi RA terisi**; **satu-satunya** jalur maju = ladder lengkap; QR analis ke-stamp (B2); regress → re-entry = RSK fresh dari MUAP revisi (B3) |
| **Stage 5 — Komite** | **Komite (CM) yang jadi admin rapat**; daftar peserta terkunci sejak dibikin — anggota no-show = **MoM deadlock selamanya**; arsip beku keputusan (PDF+SHA) ditembak **dari browser, fire-and-forget** — gagal = keputusan tanpa arsip | **RM yang admin** (desk `komite-admin`): jadwal, agenda, peserta, **update kehadiran riil** (B8). Komite sentuhan kecil doang: cek materi → ketua catat keputusan simple (pilihan + catatan + angka final) → hadirin QR-sign MoM yang **Mizan generate**. Arsip beku **wajib di server** — keputusan tanpa arsip = transaksi gagal (B3) |
| **Stage 6 — Pencairan** | RM sendirian klik stepper sampai "Cair"; tanpa SLA | **TETAP single-operator (DECIDED §4.4-b)** — otorisasi = keputusan Komite ber-QR; release-conditions tetap server-gated; SLA Stage-6 = backlog kecil |
| **Lintas babak** | Status kartu Home bisa beda cerita sama cockpit; dokumen final masih hidup diam-diam | Satu sumber kebenaran: status = predikat domain; **selalu tepat satu doc editable**; jejak audit gak pernah nyatet kejadian yang gak terjadi |

## 2. Gap hari ini vs target (grounded, dari walkthrough 2026.06.09–10)

| # | Gap | Bukti | Beresin di |
|---|---|---|---|
| 1 | ~~Force-submit: advance 2→3 nge-stamp assignment LG `submitted` palsu~~ **BERES (Batch 1, 2026.06.10, typecheck+test)** — `applyDecision` exempt LG selama `!legalAppraisalComplete` | `stage-action.ts` `applyDecision` | ✅ Batch 1 |
| 2 | ~~LG `submitted` ke-set setelah legal doang; Penilaian belum dihitung~~ **BERES (Batch 1)** — `settleLgAssignment` dipanggil dari `completeLegalAction` **dan** `recordAppraisalAction`; submitted ⇔ kedua deliverable kerekam | `stage-action.ts` `settleLgAssignment` | ✅ Batch 1 |
| 3 | ~~QR maker: `request` gak stamp slot ttd maker~~ **BERES (Batch 2, 2026.06.10, typecheck+test)** — `appendApprovalStep` mint QR di `request`; `actOnChain` stamp `SIG_SLOT_OF_APPROVAL_ROLE[role]` dua chain; live-stamp belum diverifikasi | `approval.ts` (`request`+`approve`) · `repo/approval.ts` mint | ✅ Batch 2 |
| 4 | ~~MUAP BEKU masih editable di Drive~~ **BERES (Batch 3 T1+T2, 2026.06.10, typecheck+test; spike S1=GO)** — `canEditDoc` exact-stage (one-editable) + `reconcileFrozenDocGrants` turunin writer→reader existing saat advance | `canEditDoc` · `reconcileFrozenDocGrants` | ✅ Batch 3 |
| 5 | ~~RSK dibuat di Stage-3 entry (grounding basi)~~ **BERES (Batch 3 T3)** — `createApplicationDocs` MUAP-only; `ensureRskDoc`/`ensureStage4DocsOnEntry` bikin RSK di Stage-4 entry grounded MUAP final; migrasi `rskDocId` nullable | `service.ts` · `auto-draft.ts` | ✅ Batch 3 |
| 6 | **SEBAGIAN (Batch 3 T4):** auto read-back di Stage-4 entry **BERES** (`ensureStage4DocsOnEntry` → `syncExtractionFromMarkdown`). ⏸ sisa: tombol "Sinkronkan" jadi recovery-only (UI) | `auto-draft.ts` · `DocsPanel.tsx` · handoff | 🟡 Batch 3 |
| 7 | ~~Slot master gak keisi (plafond/tenor + No.MUAP/Tanggal underscore)~~ **BERES (Batch 4, 2026.06.10, VERIFIED LIVE)** — V3.5 NamedRange: 7 range di master MUAP (`setup-v35-namedranges.ts`, metadata-only); registry `method:'namedRange'` + runtime fill. Plafond/tenor keisi pas dibuat; **No.MUAP+Tanggal keisi pas ladder lengkap** (official-when-signed). Smoke: `Rp 500.000.000,-`, `24 Bulan`, `099/MUAP-MKT/VI/2026`, `15 Juni 2026` semua masuk. Backup master tercatat. | `doc-registry.ts` · `seed.ts` · `document-templates.md` | ✅ Batch 4 (LIVE) |
| 8 | ~~Riset AI sempit + konteks drafter belum lengkap~~ **BERES (Batch 5, 2026.06.10, typecheck+test)** — `planResearch` multi-angle (entity+sektor+makro, PII-guard tetap); `bureauSummary` diumpanin ke drafter. Price-ref agunan di-gate Bank-Legal (sengaja belum). Sample kualitas = review user. | `classifier.ts` · `seed-context.ts` · `narrative.ts` | ✅ Batch 5 |
| 9 | ~~OCR cuma ngisi kosong, gak verify yang ada~~ **BERES (Batch 6, 2026.06.10, typecheck+test)** — nilai ter-bless gak ditimpa; OCR beda → `mismatch` (keep/accept, auditable); NIK mismatch blok submit MUAP→Risk (dulu 1→2, dipindah RM-led redesign 2026.06.12). Exact-match (toleransi belum); verify-only field di luar scope; live belum | `extraction-registry.ts` `reconcileExtraction` · kolom `extractionMismatches` | ✅ Batch 6 |
| 10 | Legal/Appraisal setengah-stage setengah-bukan (ADR-0007 kontradiksi struktural); RM 2× klik advance artifisial | `origination-phase-legal-as-review.md` §Why | **Batch 7** |
| 11 | ~~Routing checker strict (TL/BM spesifik) belum bisa dikonfigurasi~~ **BERES 2026.06.09** — STRICT per-submitter routing + admin **RoutingTab** + seeded demo (rung tak-terkonfigurasi fallback all-holders) | `lib/approval-routing.ts` · `components/admin/RoutingTab.tsx` · `designs/admin-config-layer.md` | ✅ |
| 12 | Label "Pengaju (RM / Analis)" vestige pre-fold | `approval-desks.ts:31` | tumpangan batch mana saja (product confirm) |
| 13 | ~~Dual advance 4→5 dengan gate beda~~ **BERES (Batch 3 T5, typecheck+test)** — tombol manual "Kirim ke Komite" dihapus (band → directive ke tab RSK); satu-satunya 4→5 = ladder lengkap; RSK request di-gate rekomendasi ⇒ DPS-duluan gak bisa bawa maju tanpa rekomendasi | `makerSubmitGateError` · band RA | ✅ Batch 3 |
| 14 | ~~RSK ladder `request` gak di-gate `riskRecommendation`~~ **BERES (Batch 3 T5)** — `makerSubmitGateError('rsk')` mirror MUAP↔`legalAppraisalComplete` | `approval.ts` request gate | ✅ Batch 3 |
| 15 | ~~Freeze checkpoint Komite best-effort dari CLIENT~~ **BERES (Batch 3 T6)** — `freezeDecisionArchive` di `signMomAction` (server); gagal = error log + audit entry "GAGAL" di Riwayat; client fire-and-forget dihapus | `service.ts freezeDecisionArchive` · `KomiteVoting.tsx` | ✅ Batch 3 |
| 16 | **SEBAGIAN (Batch 3):** RSK lahir di Stage-4 entry (T3 ✅) → re-entry bikin RSK fresh (gak ada doc Stage-3 basi). ⏸ sisa: T7 redraft-on-regress (snapshot versi lama + re-fill MUAP revisi) | `auto-draft.ts ensureRskDoc` · handoff | 🟡 Batch 3 |
| 17 | ~~Pencairan tanpa four-eyes~~ — **DECIDED bukan gap (§4.4 opsi b)**: single-operator diterima sadar; otorisasi = keputusan Komite, stepper = administrasi. SLA Stage-6 sisa backlog kecil (config) | `PencairanTab.tsx` · `advanceDisbursementAction` | — (closed by decision) |
| 18 | ~~Manajemen Rapat Komite di tangan Komite (CM)~~ **BERES (Batch 8, 2026.06.10, typecheck+test; ADR-0015)** — desk `komite-admin` (dipegang RM) gantiin `assertDesk('komite')` di 4 action manajemen (schedule/confirm/cancel/edit-time); `komite` murni keanggotaan; bukan roster (`committeeRoster` tetap `role==='CM'`) → RM gak pernah wajib ttd | `komite.ts` (`komite-admin`) · `lib/desks.ts` split | ✅ Batch 8 |
| 19 | ~~No-show deadlock MoM~~ **BERES (Batch 8)** — `updateMeetingAttendeesAction` (gate `komite-admin`): RM koreksi kehadiran riil → `momRequiredSignerIds` mengecil → MoM bisa lengkap; FROZEN setelah signature pertama; ketua wajib tetap peserta; kuorum ≥2 di `momComplete` | `komite.ts updateMeetingAttendeesAction` · `lib/komite.ts attendeeUpdateError` | ✅ Batch 8 |

## 3. Roadmap — urutan batch (kecil → besar, tiap batch shippable + acceptance di register)

> Prinsip urutan: (a) kebenaran audit/trust dulu (1–3), (b) kualitas dokumen/AI (4–6), (c) redesign
> struktural paling akhir (7) — karena 1–6 semuanya tetap valid di bawah model lama MAUPUN baru,
> sedangkan 7 nyentuh engine+SLA+UI dan butuh ADR.

| Batch | Isi | Ukuran/risiko | Prasyarat |
|---|---|---|---|
| **1. Force-submit fix** ✅ **SHIPPED 2026.06.10** (typecheck+test) | `applyDecision` exempt LG selama deliverable ngutang; `settleLgAssignment` (submitted ⇔ `legalAppraisalComplete`); reopen window 2–3. Tests red→green `Batch 1/T1·T2·T4`. Live NOT yet verified. | S / medium (workflow core) | — |
| **2. QR-RM on request** ✅ **SHIPPED 2026.06.10** (typecheck+test) | `appendApprovalStep` mint QR di `request`; `actOnChain` stamp `tanggal_ttd_rm`/`rsk_sig_analyst_tanggal` saat maker `request` (best-effort). Tests red→green di `approval.itest.ts`. Live-stamp NOT verified (no creds). | S / low | — |
| **3. Per-stage doc lifecycle + integritas Risk→Komite** 🟡 **SEBAGIAN SHIPPED 2026.06.10** (typecheck+test): T0 ADR-0016, T1 one-editable exact-stage, T5 single-4→5+RSK-gate, T6 server-freeze. ⏸ **PARKED** (handoff `2026.06.10-batch3-drive-lifecycle`): S1 spike, T2 grant-downgrade, T3 RSK-at-Stage-4, T4 read-back, T7 redraft. | Amend ADR-0014: downgrade-on-advance (writer→reader), **one-editable-doc**, `canEditDoc` exact-stage, send-back flip; **RSK dibuat SELURUHNYA di Stage-4 entry** (copy master + fill, DECIDED — bukan cuma narasi) grounded MUAP-final (sekalian nutup staleness #16; `DocLinkage` jadi dua langkah); auto read-back on Stage-4 entry; tombol sync → recovery-only. **Plus integritas alur 4→5** (#13/#14/#15): satu jalur advance saja (ladder-complete), gate RSK-ladder `request` pada `riskRecommendation` terisi (mirror MUAP↔`legalAppraisalComplete`), hapus/jadikan-directive tombol manual "Kirim ke Komite", dan **pindahkan freeze checkpoint ke server** (bagian routing `signMomAction`, wajib-sukses atau tercatat gagal — bukan fire-and-forget client). ⚠️ Latency: copy+riset-readback+AI-fill yang tadinya nempel di transisi RM (Stage-3 entry) pindah ke klik approve terakhir BM (3→4 auto-advance di `actOnChain`) — pertahankan pola best-effort/never-throw + pertimbangkan fire-after-advance biar klik BM gak nunggu Drive+Gemini | M / high (ADR + Drive perms + engine hook; spike grant-downgrade dulu) | ADR amendment diratifikasi |
| **4. Doc-fill V3.5** ✅ **SHIPPED + VERIFIED LIVE 2026.06.10** | Audit → matrix; spike GO; registry `method:'namedRange'` + runtime fill; **7 NamedRanges di master MUAP** (backup tercatat); No.MUAP/Tanggal official-when-signed. Live smoke: semua slot keisi (`Rp 500.000.000,-`/`24 Bulan`/`099/MUAP-MKT/VI/2026`/`15 Juni 2026`). | S–M / medium | DONE |
| **5. Riset + konteks AI** ✅ **SHIPPED 2026.06.10** (typecheck+test; sample kualitas = review user) | `planResearch` multi-angle (entity+sektor+makro); `bureauSummary` → drafter. Price-ref agunan di-gate Bank-Legal. Tests red→green `classifier.test.ts`/`seed-context.test.ts`. | M / low (advisory-only) | — |
| **6. OCR cross-check** ✅ **SHIPPED 2026.06.10** (typecheck+test; live belum) | OCR verify field ter-bless (bukan cuma ngisi kosong); `reconcileExtraction` → mismatch; resolve keep/accept auditable; NIK mismatch blok advance; kolom DB `extractionMismatches` (migrasi additive). Tests red→green di `extraction-registry.test.ts`/`write.itest.ts`/`stage-action.test.ts`. | M / medium (PII path) | — |
| **7. Origination satu fase + Legal-as-review** — **DEFERRED 2026.06.10** ("gak perlu di-collapse dulu, biar less risk"). Model 6-stage + ADR-0007 tetap berlaku; Batch 1–6 & 8 semuanya valid tanpa ini. Revisit setelah batch lain stabil | ADR baru (supersede sebagian ADR-0007): state machine = RM-origination → Risk → Komite → Pencairan; Legal/Appraisal = review-requests (pola ladder); sub-status SLA di dalam fase originasi; kill 2 klik advance artifisial | L / high (engine+audit+SLA+UI) | DEFERRED — butuh keputusan user untuk re-aktivasi + ADR |
| **8. Rapat Komite dikelola RM** (#18/#19) ✅ **SHIPPED 2026.06.10** (typecheck+test; ADR-0015; UI typecheck-only, live belum) | **Desk split DECIDED 2026.06.10**: desk admin baru (mis. `komite-admin`, dipegang RM via config) gantiin `assertDesk('komite')` di action manajemen sidang (schedule/confirm/cancel/edit/agenda/peserta); desk `komite` jadi murni keanggotaan (roster/sign). Action **edit peserta** (update kehadiran riil — nutup no-show deadlock #19, FROZEN setelah signature MoM pertama kayak reschedule); ketua catat keputusan & Komite sign **tidak berubah** (DECIDED — keputusan = approve/conditional/reject + catatan + terms final kalau approve; MoM-nya Mizan yang generate, ketua gak ngetik dokumen) | M / medium (auth re-wire + 1 action baru + UI /komite) | **fork §4.5 DECIDED (a)** — siap di-ADR-kan & dieksekusi |

Tumpangan kecil kapan saja: #12 label rename (tunggu konfirmasi product), register backfill
(baris ⏳ di `feature-acceptance.md`).

## 4. Fork yang masih kebuka (keputusan user, sebelum batch terkait)

1. ~~Sub-status origination~~ **MOOT 2026.06.10** — Batch 7 DEFERRED ("originasi gak perlu
   di-collapse dulu, less risk"), jadi gak ada collapse = gak ada pertanyaan sub-status. Re-buka
   bersama Batch 7 nanti; rekomendasi saat itu tetap (a) sub-status formal.
2. ~~Timing Batch 3 vs 7~~ **RESOLVED 2026.06.10 by deferral** — Batch 7 DEFERRED, jadi Batch 3
   jalan standalone di model 6-stage sekarang (memang itu rekomendasinya: audit hole MUAP-BEKU-
   masih-editable gak layak nunggu redesign besar).
3. ~~**Routing strict (#11)** masuk roadmap atau backlog terpisah~~ **RESOLVED 2026.06.09** — strict
   per-submitter routing shipped independently (engine + admin RoutingTab + seeded demo); `designs/admin-config-layer.md`.
4. ~~Four-eyes pencairan (#17)~~ **DECIDED 2026.06.10 → opsi (b), single-operator TETAP**: RM
   sendirian jalanin stepper `Verifikasi Final → Proses Akad → Siap Cair → Cair`. Rasional yang
   diterima: **keputusan Komite (MoM ber-QR, kuorum) = otorisasi pencairannya**; stepper cuma
   eksekusi administratif atas keputusan yang sudah berjenjang, dan release-conditions tetap
   di-gate server (`disbursementConditionsComplete`). Catatan: rekomendasi engineer adalah (a)
   satu rung verifikasi — user memilih (b) sadar trade-off-nya; revisit kalau compliance Hijra
   meminta dual-control di titik pencairan. SLA Stage-6 tetap layak ditambah nanti (config layer,
   bukan literal) — backlog kecil, bukan batch.
5. ~~Kepemilikan sesi rapat~~ **DECIDED 2026.06.10 → opsi (a), desk-based longgar**: semua pemegang
   `komite-admin` boleh kelola semua sidang; konflik diselesaikan di luar app, Mizan mencatat
   siapa-ngapain (append-only). RM men-transkrip kesepakatan yang sudah terjadi di luar app; peserta
   dipilih dari roster Komite; tanda tangan tetap personal (daftar bohong tidak bisa menghasilkan
   keputusan — anggota yang tidak hadir tidak akan sign → MoM tidak lengkap → daftar dikoreksi).
   **COI diterima sadar** (RM memilih penanda-tangan wajib, kuorum ≥2); mitigasi ringan kalau perlu
   nanti = naikkan `MIN_KOMITE_QUORUM` via config, bukan nambah approval flow. Garis yang TIDAK
   bergeser: RM **tidak pernah** mencatat keputusan (chair-only) dan **tidak pernah** jadi
   penanda-tangan wajib MoM.
