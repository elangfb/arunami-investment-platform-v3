# Mizan flow — as-built (observed live 2026.06.05)

What the app *actually does today*, captured stage-by-stage in a headed walkthrough
(superadmin via Firebase emulator). For re-checking against code/spec. File paths
point at the live source. Companion findings (incl. user-raised corrections) live in
`README.md`; this file is descriptive (what is), not prescriptive (what should be).

> Demo data: seed apps `FOS-2026-001…043`. State-coverage apps: `035` mid-disbursement,
> `036` ready-to-release, `037` awaiting-risk-reco. Stage→app map gathered from `/pipeline`.

## Shell & navigation
- Login: **Google popup only** via Firebase Auth emulator → on success POST `/api/auth/session`
  (httpOnly cookie) → `/dashboard`. Zero-grant users route to `/awaiting-access`.
- Left nav: **Aplikasi Baru** · **Pipeline Pembiayaan** · **Semua Aplikasi** · **Rapat Komite**
  · **Portofolio** · **Dashboard Manajemen** · **Notifikasi** (live badge) · **Konsol Superadmin**.
  Footer: persona, **Bertindak sebagai…** (desk impersonation), **Keluar**.
- **Beranda Saya** (`/dashboard`): personal task board grouped **My TODO / In Progress /
  Submitted-Awaiting** (superadmin owns nothing → empty).

## Stage model
6 engine stages (`Stage` enum 1–6, `lib/types.ts`) rolled up into **4 phases** (derived
`phaseOf`, not an engine renumber). Pipeline (`/pipeline`) is **read-only, grouped by stage**;
**all transitions happen on the application detail page**. Stage 1 shows as "Fase 1 · Originasi".

| Stage | Name (UI) | Owning desk(s) → role | Advance trigger |
|---|---|---|---|
| 1 | Document Submission | `intake` → RM | RM: docs complete + NIK OCR confirmed + AML attested → **Kirim ke Legal & SLIK** |
| 2 | Legal & SLIK | `legal`→LG **+** `slik`→RA | **dual** sign-off (`completeLegalAction` + `completeSlikAction` → `advanceOnDualSignOff`) |
| 3 | Feasibility (5C+1S) | `muap-author` → RM (+ checkers `muap-tl`,`muap-bm`) | RM: 5C+1S done + MUAP chain RM→TL→BM complete → **Kirim ke Risk Review** |
| 4 | Risk Review | `rsk-author` → RA (+ checkers `rsk-ro`,`rsk-cro`,`rsk-dps`) | RA: recommendation + RSK chain RA→RO→CRO→DPS complete → **Kirim ke Komite** |
| 5 | Committee Decision | `komite` → CM (+ `dps-review`) | Chair records outcome + attending Komite QR-sign MoM (≥2 quorum, **no in-app voting**) |
| 6 | Pencairan | `pencairan` → RM | RM works disbursement sub-flow; conditions gate final Cair |

Source: `lib/desks.ts` (`DESK_FOR_STAGE`, `ROLE_OF_DESK`), `lib/stage-action.ts`.

## Detail cockpit (every application)
- **Header**: ID · SLA chip · Nasabah · `AkadBadge` · Owner(s) · Plafond/Tenor(/Margin).
  Stage-6 header also shows committee-adjusted terms with the original struck through.
- **TUGAS ANDA**: actionable cards for the viewer's owning desk(s) only; lists explicit
  **blockers** before the primary action enables. Stage 2 renders as **"· 2 Peran"** (two roles).
- Section nav: a **`Bagian:` dropdown** + a **`Proses` stepper** (Legal & SLIK → Analisa →
  MUAP → RSK → Komite → Pencairan, each tagged with its desk; completed steps ✓, current ●).
- Dossier sections (`?view=`): Ringkasan · Identitas · **Data** (OCR confirm) · Dokumen ·
  Analisa · MUAP · RSK · Pencairan · Diskusi · Riwayat. Plus **Indikator Hard Gate** + ScoreOverview.
- Severity is shape-coded (octagon danger / triangle warning / circle info), e.g. NIK ⚠️, LTV ⚠️.

## Stage 1 — Document Submission (RM / `intake`)
*Tugas Anda*: "Lengkapi berkas, lalu kirim ke Legal & SLIK". Sub-tasks:
- **Atestasi Initial AML**: RM checkbox + "Konfirmasi atestasi AML". DTTOT/PEP/negative-list
  screening is **external (CS/Compliance); Mizan does NOT screen** — RM only attests it was done.
- **Required documents** (`Dokumen` section): e.g. Laporan Keuangan, Dokumen Appraisal Agunan,
  Bukti Asuransi Agunan. Stage-1 `docBlockers` counts only RM-owned (`intake`) required docs.
- **OCR confirm** (`Data` section): identity + finance fields; NIK flagged ⚠️ until confirmed.
- Then **Kirim ke Legal & SLIK** (enables only when blockers clear).
- New application is *created* at this stage via **Aplikasi Baru** (`/applications/new`,
  RM-led): Identitas Nasabah (Individu/Bisnis, name, phone, WA, income source, marital status;
  Bisnis adds Nama Usaha) · Detail Pembiayaan (Jenis Akad, Plafond, Tenor 12–60, Tujuan) ·
  Agunan (Jenis Agunan) → **Buat Aplikasi** → lands on `/pipeline` with a success toast.

## Stage 2 — Legal & SLIK (dual handoff: LG + RA-slik)
*Tugas Anda · 2 Peran* — two independent desks, both must sign off:
- **LEGAL OFFICER** (`legal`/LG): "Verifikasi dokumen, lalu kirim Review Legal ke Feasibility"
  — **Buka Verifikasi Dokumen** / **Kembalikan ke RM**. Legal verification lives in **Dokumen**
  (`legalDocs`/`legalUnverified`; e.g. "0 dari 23 dokumen terverifikasi"); optional Pefindo upload.
- **RISK ANALYST** (`slik`/RA): "Input SLIK/Kolektibilitas, lalu kirim SLIK ke Feasibility"
  — **Buka Input SLIK** / **Tolak SLIK & Kembalikan ke RM**. SLIK + Kol live in **Data**.
  ⚠️ **User correction pending** — SLIK should move to RM (see README finding **D1**).
- Stage 2 has **no** "Legal & SLIK" tab. Dual sign-off advances 2→3; bare Kol data entry
  (`confirmKolAction`) does **not** advance.

## Stage 3 — Feasibility 5C+1S + MUAP (RM / `muap-author`; checkers TL, BM)
*Tugas Anda*: "Lengkapi analisa 5C+1S, lalu kirim ke Risk Review" (blockers: OCR confirms;
MUAP chain TL→BM incomplete).
- **Analisa 5C+1S** (`Analisa`): `ScoreOverview` donut /100 + verdict (≥80 Direkomendasikan /
  60–79 Bersyarat / <60 Tidak Direkomendasikan), per-aspect bars (Karakter, Kapasitas, Modal,
  Kondisi, Agunan, Syariah) + DSR/LTV/Kol chips. **Score is deterministic** (see AI provenance).
- **MUAP** (`MUAP`): Memorandum Usulan Analisa Pembiayaan, source **Google Docs** (read-only
  preview; "Buat Dokumen dari Template" when none). AI-drafted prose, flagged when stale.
  - **Rantai Persetujuan MUAP** (maker-checker): 1. Pengaju (RM/Analis) → 2. Team Leader/SPV
    (**QR-signed** "Disetujui") → 3. Branch Manager/Kepala Unit (→ freezes MUAP). Four-eyes,
    send-back to Pengaju available.

## Stage 4 — Risk Review / RSK (RA / `rsk-author`; checkers RO, CRO, DPS)
*Tugas Anda*: "Tinjau risiko & beri rekomendasi" → once set, "Rekomendasi: <verb> — kirim ke
Komite" (blocker: "Tanda tangan RSK (Officer → CRO → DPS) belum lengkap").
- **RSK** (`RSK`): **Kajian Risiko — Rekomendasi** = Approve/Conditional/Reject + notes →
  **Simpan Rekomendasi** (persists `riskRecommendation`). Source Google Docs (same as MUAP).
- **Saran AI**: an *advisory* hint — labelled "advisory · bukan keputusan", "tidak ditulis ke
  dokumen RSK". This is the ONE path where the model may assert a verdict (see AI provenance).
- **Rantai Persetujuan RSK** (maker-checker): 1. Pengaju (Analis Risiko) → 2. Risk
  Officer/Manager → 3. Chief Risk Officer → 4. Dewan Pengawas Syariah (→ freezes RSK). Shape-coded
  status chips (Menunggu ⏰ / Belum giliran). **Setuju** / **Kembalikan ke Pengaju**.

## Stage 5 — Committee Decision / Rapat Komite (CM / `komite`, `dps-review`)
*Tugas Anda*: "Putuskan & tanda tangani MoM di Ruang Komite" (date/venue) → **Buka Ruang Komite**.
Owners = the committee members; **no in-app voting (ADR-0005)** — the chair (`meeting.chairUserId`)
records each app's outcome and attending Komite **QR-sign the per-app MoM** (routing needs all
attending signed, ≥`MIN_KOMITE_QUORUM`=2).
- **Rapat Komite hub** (`/komite`): tabs **Jadwal** (meeting cards: date, venue, MoM id, agenda
  apps, ANGGOTA KOMITE with **Ketua/chair**, outcome summary; statuses Selesai / Berlangsung) ·
  **Agenda Sidang** · **Keputusan** (decision register). **Jadwalkan Rapat** schedules a session.
- **Keputusan** register: ID · Debitur · Plafond · Tgl Rapat · **KEPUTUSAN** (`DecisionChip`:
  Approve ●success / Conditional ▲warning / Reject ⯃danger, English verbs) · Catatan (rationale,
  e.g. Conditional "plafond diturunkan + wajib rekening koran 6 bulan").

## Stage 6 — Pencairan (RM / `pencairan`)
*Tugas Anda*: "Disetujui Komite — proses pencairan fasilitas" → **Buka Pencairan**.
- Header reflects committee-adjusted plafond/tenor/margin (original struck through).
- **Alur Pencairan** 4-step: 1. Verifikasi Final (cek kelengkapan akhir) → 2. Proses Akad
  (penandatanganan akad) → 3. Siap Cair (menunggu rilis dana) → 4. Cair (dana ditransfer).
  **Majukan ke Siap Cair** advances.
- **Syarat Pencairan**: committee conditions checklist ("x/4 syarat"); all must clear before
  status can reach Cair (e.g. "Plafond disesuaikan…" ✓, "Rekening koran 6 bulan diterima" ○).
- `applicationStatus='closed'` is terminal (drops from active pipeline). `disbursementOpen(app)`
  is the shared Pencairan-open predicate. SLA notifications skip terminal apps.

## AI provenance — where scoring & recommendation come from
The product owner asked specifically where AI scoring/recommendation get their data.

### 5C+1S score — DETERMINISTIC, not AI (`lib/scoring.ts`)
- The numeric **score is a deterministic V1 formula, NOT an LLM** (file comment: "Not a real
  LLM — prototype"). `generateAspectScores(app)` derives aspects from the app's own data:
  - **Character ← Kolektibilitas (SLIK)**: `kolEntered && kol>1 ? 56 : 87` + jitter.
  - **Capacity ← DSR**: `financialsAssessed ? 100-(dsr-15)*1.4 : 72+jitter`.
  - **Collateral ← LTV**: `financialsAssessed ? 100-(ltv-30) : 75+jitter`.
  - **Capital / Condition / Syariah**: baseline (80/78/90) + jitter (not yet data-driven).
  - "jitter" is a **stable per-`app.id` seed** (deterministic, not random) for the non-objective
    aspects. `totalScore` = weighted by `ASPECT_WEIGHTS` (sum 100); verdict by
    `recommendationFromTotal` (≥80/60–79/<60).
- So the score moves with real hard gates (DSR/LTV/Kol) but is **computed in code, not inferred**.
  ⚠️ The `ScoreOverview` subtitle "AI menyusun draf skor dari data aplikasi" is **misleading**
  (see README finding **F5**) — AI drafts the *narrative*, not the number. Stage-3's "skor tetap
  deterministik" copy is the correct framing.

### AI narrative & advisory — real LLM via a swappable provider boundary
- **Provider** (`server/ai/provider.ts`): `inferenceProvider()` selected by env
  `INFERENCE_PROVIDER` (**default `gemini`**; `stub` offline for dev/test/CI). In-region targets
  `nova` (Amazon Bedrock Jakarta) + `vllm` (self-host) are planned behind the same interface
  (text-in → text/JSON-out; **OCR egress is a separate `OCR_PROVIDER` boundary**).
- **MUAP/RSK narrative** ("Disusun AI", `server/ai/narrative.ts`): ONE structured-output call per
  doc, keyed by narrative tokens, **prose only** — authoritative numbers are filled
  deterministically in `server/docs/seed.ts`. Schema has **no level/recommendation field**; the
  system prompt forbids them; `scrubNarrative()` drops any smuggled risk level/verdict; on any
  failure it falls back to deterministic narrative. Per-token guidance is bank-authored (static).
- **Advisory recommendation** ("Saran AI", Stage 4, `server/ai/advisory-rec.ts`): the ONE path
  allowed to assert a verdict, gated by (a) structured schema `{recommendation, rationale}` with
  no rating field, (b) persisted to **`aiRiskAdvisory` only — never `riskRecommendation`**, never
  frozen into RSK, (c) desk-gated UI shown as advisory. RT must still choose explicitly.
- **Input data** (what the model sees): built from the app's persisted facts + financials, e.g.
  nasabah (name/usaha, type), akad, plafond, tenor, purpose, return (margin/nisbah), hard gates
  **DSR/LTV/Kol** + violations, net monthly income, existing obligations, collateral appraised
  value, and (advisory) the analyst's prior 5C+1S analysis text as reference. Assistant chat
  (`server/ai/context.ts`) additionally grounds on the **Doc-extracted snapshot** (5C+2S risk
  matrix, MUAP financial ratios, collateral values, RAC deviations) loaded server-side.
- **PII handling** (`server/ai/redact.ts`): mask-in on egress (known-fields + regex; NER-ready
  seam), unmask-out on reply, re-mask for the audit copy. `detectResidualPii` backstop is
  policy-configurable (**default fail-OPEN**; `PII_RESIDUAL_BLOCK=1` to fail closed). Every call
  audited via `recordAiInteraction` (surface `advisory`/`narrative`/`assistant`), storing masked
  prompt+reply + model id — never raw PII, never the unmasked rationale.

### Riset Web — grounded web research (third egress source, workflow-finetune §7)
Stage 3 MUAP (and S4 RSK) expose a **Riset Web** card ("grounded · ada kutipan URL") that
pulls **business-entity facts only** (akta/legalitas, NIB/izin, sektor, berita usaha) from
authoritative domains (AHU/Kemenkumham, OJK, IDX, tier-1 press).
- **Provider** (`server/research/provider.ts`+`index.ts`): `WEB_RESEARCH_PROVIDER` env —
  **default `stub`** (deterministic, no network, dev/CI); prod `searxng-firecrawl` = self-hosted
  **SearXNG** meta-search + **Firecrawl OSS** page extract (`SEARXNG_URL`/`FIRECRAWL_URL`;
  repo config `ops/searxng/settings.yml`). Same swappable-boundary pattern as INFERENCE/OCR.
- **Pipeline** (`server/research/pipeline.ts`): deterministic, NO agent/tool-loop — plan
  (classifier) → search (business-only queries) → fetch (allowlisted URLs) → synthesize (LLM,
  **structured citations enforced; hallucinated URLs dropped**). Result persists as
  `exploredSources[]` (url/title/claim) and the MUAP narrative grounder feeds them (masked) into
  the next draft. Synthesis prompt = `research_synthesis` (admin-configurable).
- **Egress classifier** (`lib/research/classifier.ts`): the single seam every research path funnels
  through — **refuses any query naming an individual / NIK / phone / email / address**. Web
  research is allowed for **badan usaha only**; for nasabah perorangan it is blocked (UU PDP).
  So only the **business name** ever egresses — never personal identifiers.

## Automation & walkthrough — which tool for what (read before building either)
There are TWO browser-driving artifacts with **different jobs**; don't conflate them, and
don't rebuild the demo into a test (or vice-versa).

| | `scripts/walkthrough.sh` | `apps/web-app-e2e/` |
|---|---|---|
| Job | headed, narrated, **human demo / dogfood** | headless, asserted, **regression gate** |
| Engine | agent-browser + Helium | **Playwright + Cucumber (BDD)** |
| Login | Google emulator popup (real dev env) | fixture endpoint, no popup |
| Verdict | screenshots "look right" | real `expect()` pass/fail |
| Re-run safety | depends on seed apps + label selectors | spawns its own fixtures |

**`apps/web-app-e2e/` is the canonical automation home for correctness.** It already covers the
flow-critical paths: `features/{maker-checker-ladder,mom-signing,conditional-outcome,create-application,detail-action-band,auth-smoke}.feature`.
Key patterns to reuse (do NOT reinvent):
- **Login without the Google popup**: `support/auth.ts` `signInAs(world, persona)` POSTs the
  guarded `/api/test-fixture/login` (mints a session server-side via `emulatorSignInWithGoogle`).
  Enabled only under `E2E_MODE=1` + a `mizan_e2e` DB (404 in dev/prod). Role switch = one call.
- **Stage/meeting fixtures**: `support/factories.ts` `applicationAt(stage)` and `meetingFor(...)`
  build a clean app at any stage / a committee meeting — so tests never depend on which seed app
  sits at which rung.
- **Selectors are semantic, not `data-testid`**: steps drive via `getByRole`/`getByText`/
  `getByPlaceholder` on the Bahasa labels (Gherkin readability + a11y coverage). Keep this
  convention; reach for `data-testid` only for elements with no stable accessible name or
  duplicate labels that must be disambiguated.

**Decision (2026.06.05):** keep both. For a CI regression gate, **extend the Cucumber suite** —
do not grow `walkthrough.sh` into a test. If a *narrated demo* is ever needed in CI, prefer a
Playwright `test.step` + `--headed --slowMo` spec that reuses `signInAs`/`applicationAt` (free
trace/video), which could eventually retire the bash script. The bash demo's only real
fragility is the popup login + a few label selectors; if it starts breaking, point it at the
e2e env and reuse `/api/test-fixture/login` to drop the popup/logout dance entirely.

## Re-check pointers (code anchors)
- Desks/roles/stages: `lib/desks.ts`, `lib/types.ts` (`Stage`, `STAGE_NAMES`).
- Routing/owners/blockers/Tugas-Anda: `lib/stage-action.ts`; doc owners `lib/required-docs.ts`.
- Score: `lib/scoring.ts`; hard gates: `lib/hardGates.ts` + `lib/financials.ts`.
- AI: `server/ai/{provider,narrative,advisory-rec,context,redact,audit}.ts`; prompts admin-
  configurable via `server/config/ai-prompts.ts` (`getActivePrompt`).
- Committee: `server/repo/meetings.ts`, `lib/komite.ts`; decisions `DecisionChip`/`DecisionResult`.
- Automation: e2e `apps/web-app-e2e/` (`support/{auth,factories,world}.ts`, `features/*.feature`);
  fixtures `app/api/test-fixture/{,login,meeting}/route.ts`; demo `scripts/walkthrough.sh`.
- Design SSOT: `docs/designs/workflow-target.md` + `workflow-engine.md`; Bahasa companion
  `docs/guides/alur-kerja-inti.md`; AI detail `docs/designs/workflow-finetune.md`.
