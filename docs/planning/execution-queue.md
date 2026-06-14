# Execution queue — satu antrean flat lintas docs/dev/penawaran

- **Status:** ACTIVE   <!-- ACTIVE only; on close: promote/digest/delete. -->
- **Started:** 2026.06.12 · **Owner:** Luthfi

## Context

Antrean prioritas tunggal pasca-merge redesign (PR #1/#2/#5, merged 2026.06.12) yang
menggabungkan maintain-docs, pending development, dan penutupan klaim penawaran.
Detail per item tetap di home masing-masing (link di tiap baris) — file ini hanya URUTAN +
status, supaya tidak ada duplikasi fakta. Urutan = kebenaran repo dulu → integritas data →
utang verifikasi sebelum demo → klaim yang akan dicek Hijra → kerjaan eksternal masuk begitu
unblocked → postur produksi paling akhir.

## Queue

- [x] **1. Docs hygiene pasca-merge** — DONE 2026.06.12. Dua lapis:
  **(a) status & link drift** — `rm-led-pipeline-build.md` di-retire (digest-then-delete; fakta durable
  sudah promoted, residual homed); README planning entry dihapus; `docs/CURRENT-STATE.md` + design-doc
  status flipped ke "merged to main"; ADR 0018/0020 "Not yet implemented" → "implemented, merged
  2026.06.12", ADR 0014/0016 "build until X ships" → "superseded"; README index table + MEMORY.md
  dibersihkan (status-only memory entry dihapus). 0 broken link ke plan yang dihapus (`git grep`).
  **(b) gating-relocation drift (REGULATORY)** — banyak doc perilaku masih menggambarkan gate intake
  (docs/OCR/NIK/AML) ada di advance Stage 1→2 padahal redesign memindahkannya ke submit MUAP→Risk
  (`muapToRiskBlockers`). Diverifikasi dulu komposisi gate aktual dari kode (2 Explore agent: `stage1To2Blockers`
  `[]`, `muapToRiskBlockers`, spine, sp3FinalReady, canEditDoc). Lalu dikoreksi: `workflow.md`,
  `references/workflow-detail.md` (§gate conditions ditulis ulang per-transition), `feature-acceptance.md`,
  `compliance.md`, `discovery-open-questions.md`, `personas.md`, `required-docs-matrix.md`,
  `designs/workflow-engine.md` + `designs/workflow-finetune.md` (header caveat), `CURRENT-STATE.md` baris AML
  lama (kontradiksi diperbaiki). Catatan: editability MUAP **tetap** stage-3-only (ADR-0018 "early" =
  affordance generate, bukan editor); session-history/sessions/ADR-0004 sengaja TIDAK diubah (catatan
  point-in-time). Bukti: typecheck-N/A (docs-only); `git grep` klaim "1→2 gate" sisa semua bawa catatan relokasi.
- [ ] **2. Ask ke Hijra: standar folder Drive + akses 2–3 folder pengajuan nyata** — non-teknis,
  long-pole eksternal; prasyarat §4.1 penawaran (`../guides/penawaran-produk-mizan.md`).
- [ ] **3. Dedup NIK + unique-index migration** — 1 grup NIK duplikat butuh keputusan record
  pemenang (human), lalu pasang partial-unique-index. Konteks: CURRENT-STATE "Customer entity
  (ADR-0020, P1) → Deferred (human-gated)".
- [ ] **4. Live-demo smoke fitur redesign** — lunasi klaim "live-demo pending": customer-first UI
  (`/nasabah`), send-back 2→1/3→1, colek, review/adendum. Playwright + klik manual; sebelum
  demo ke Hijra.
- [ ] **5. SAST gate di CI** — gap #4 di [penawaran-gap-closure.md](penawaran-gap-closure.md);
  semgrep/CodeQL, pinned major.
- [x] **6. Ukur baseline coverage** — DONE 2026.06.12. Runner = `node --test`+tsx (BUKAN vitest);
  pakai V8 coverage bawaan Node v24 (`--experimental-test-coverage`, reporter `lcov`), unit ∪ integration,
  dua-duanya hijau. Hasil (detail + tabel di [penawaran-gap-closure.md](penawaran-gap-closure.md)
  §"Coverage baseline"): **logic (lib/server) ≥71,4% whole-stack / 94,1% di file ter-exercise; FE (.tsx)
  0% — tidak ada line coverage otomatis sama sekali (134 file, 0 ter-reach)**. 708 test unit+integration.
  Temuan kunci: klaim "≥75% per stack" belum tersubstansiasi untuk FE.
- [ ] **7. C4 docs + keputusan format Gherkin** — gap #2/#3; bounded, kemungkinan dicek tim IT
  Hijra saat review penawaran.
- [ ] **8. Spike import §4.1 di data Drive nyata** — mulai begitu akses dari item 2 turun;
  **boleh menyalip item 5–7** karena gating jam 2-pekan penawaran. Bukti: discovery + ekstraksi
  jalan di folder asli Hijra; hasilnya jadi bahan usulan standar folder.
- [ ] **9. Tutup coverage ke ≥75%** — gap #1 lanjutan; scope sudah jelas pasca item 6 (dua bagian
  TERPISAH): **(a) logic** — tinggal ~5–10% lagi; reach ~78 file lib/server yang belum tersentuh (subset
  high-value lebih sedikit) → cepat. **(b) FE — keputusan dulu**: 0% hari ini, butuh jalur ter-instrumentasi
  (component test, atau Playwright dengan V8 coverage). Kalau ≥75% FE tidak realistis di window ini, **revisi
  kata-kata penawaran** (§6/§8) biar tidak overclaim — bukan diam-diam dibiarkan.
- [ ] **10. Build penuh §4.1 (Drive import) + §4.2 (Sheets)** — komitmen 2-pekan penawaran;
  mulai setelah spike (item 8) membuktikan jalur.
- [ ] **11. Routing admin UI + config-and-admin extensions** — gap #8 + plan
  [config-and-admin.md](config-and-admin.md); satu batch (sama-sama admin POLICY desk).
- [ ] **12. P2 parity-deletion path NamedRange dormant** — **unblocked**: creds Google-Doc live
  ada di `apps/web-app/.env.local` (file lokal, gitignored). Parity-check dulu, baru hapus
  (`extractApplicationDocs`/`syncApplicationDocs`, `server/google/extract/*`).
- [ ] **13. Batch postur produksi** — gap #5/#6/#7 sekaligus saat deployment-prep: pin region
  `asia-southeast1`, `PII_MASK_ENABLED=1` + `PII_RESIDUAL_BLOCK=1`, revisit audit fail-open.
  Terikat "sebelum data nasabah nyata" — jangan dicicil sekarang.

## Sengaja TIDAK dikerjakan (deferred — jangan ditarik ke queue tanpa keputusan baru)

Phase 3b inversi otoritas `stage` ([workflow-snapshot-persistence.md](workflow-snapshot-persistence.md)) ·
SSE realtime ([realtime-notifications-sse.md](realtime-notifications-sse.md)) ·
Batch 7 origination-collapse ([target-flow-roadmap.md](target-flow-roadmap.md)) ·
W1 items (group/domain swap Drive, BWMP tiers, per-desk SLA values) ·
Counter-offer §5.3 (baru janji roadmap di penawaran).

## Verification

Tiap item dicentang hanya dengan bukti di home-nya (commit/test/live-demo sesuai aturan
"status claims cite proof"). Item 5–7 delegatable ke pi pool dan boleh paralel.

## Exit criteria

Queue ini retire saat semua item tercentang atau dipindah resmi ke plan/keputusan lain.
Item yang descope → catat alasannya di home masing-masing, jangan dihapus diam-diam.
