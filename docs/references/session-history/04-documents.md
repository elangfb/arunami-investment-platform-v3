<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

# Documents — consolidated knowledge

## Document catalogue and ownership

Four generated document types:

| Doc | Owner / trigger | Template source |
|-----|-----------------|-----------------|
| **MUAP** (Memorandum Usulan Analisa Pembiayaan) | RM-invoked at Stage 3 (not auto-created) | Hijra-provided master template |
| **RSK** (Risk review doc) | Auto-created when MUAP chain completes and Risk desk activates | Hijra-provided master template |
| **MoM** (Notulen / Minutes of Meeting) | Manually invoked, NOT AI-assisted | Self-authored from Hijra reference copy |
| **SP3** (Surat Persetujuan Pembiayaan) | Auto-created on Komite `approve`; RM-invoked if `conditional` | Self-authored from Hijra reference copy |
| **Akad** (financing contract) | **OUT OF SCOPE (V1)** | Mizan generates MUAP/RSK/MoM/SP3 only; the akad contract is authored/signed outside Mizan (no master template / W1 params). See `../scope-v1.md`. |

The Akad document (needed at Pencairan / Stage 6) is **out of scope for V1** (decided 2026.06.08) — Mizan generates MUAP/RSK/MoM/SP3 only; the akad contract is authored/signed outside Mizan. Not generated or tracked in any code. See `../scope-v1.md`.

---

## Generation approach — V1

**Era:** CC early, ~May 16–26.

**Mechanism:** Hybrid NamedRange + visible sentinel `${{field}}` / `${{/field}}` (Handlebars-style). NamedRange-first resolution; sentinel text fallback when NamedRange broken.

**Token convention:** `${{X}}` for simple fields (token kept visible, analyst replaces); paired `${{X}}`…`${{/X}}` for complex/bracketed fields (NamedRange over content, tokens hidden).

**Fill engine:** `buildFactMap()` + `seedApplicationDoc()`, NamedRange writers. `server/docs/seed.ts` (V1 path) + `server/docs/token-anchors.ts`.

**MUAP tokens (V1):** 12 tokens: facts `f_nasabah`, `f_akad`, `f_tujuan`, `f_plafond`, `f_tenor`; narratives `m_ringkasan`, `m_tujuan`, `m_capacity`, `m_capital`, `m_condition`, `m_collateral`, `m_syariah`. ~16 tokens total per master; later scan found ~26 distinct tokens.

**RSK tokens (V1):** 3 tokens: `f_nasabah`, `f_akad`, `f_tenor`. RSK narrative deferred in V1.

**AI narratives:** ~16 large paragraph-sized AI prose slots (V1 philosophy). AI (Gemini) authors the prose; facts come from app data. `maskPii` before every Gemini call; `unmaskPii` output before writing to Doc (real names via system substitution, never AI-authored).

**Master doc IDs (V1 live):**
- MUAP master: `1MfuT-uX2h-fFA6kkxtKNxAoeYI5lBAUG8SwUAS7Eztw` (env key `GOOGLE_MASTER_MUAP_DOC_ID`)
- RSK master: `1UVd_Wres5ZfqCIJJ2IRa34gCnoS5kUF7COEWSDHqSlU` (old master was corrupt → 500 on all writes; replaced)

**NamedRange counts (V1 masters, activated 2026-06-04):**
- MUAP: **342 NamedRanges**
- RSK: **104 NamedRanges**

**Marker placement results (verified):** 21/21 RSK matrix + 21/21 MUAP ratio + 3 collateral. `missing_anchor: 0`.

**MoM/SP3 in V1:** `{{token}}` + `replaceAllText`, filled via `buildMomFill()`/`buildSp3Fill()`. Template source = created programmatically from scratch (Hijra had no templates; reference copies discovered in later session).

---

## Generation approach — V2 (designed, never fully wired)

**Era:** CC May 26, batches 11–14.

**Philosophy shift:** from ~16 large AI-prose slots to ~640+ granular field-level tokens. AI restricted to explicit `ai_*` slots only. Non-prose fields never touch LLM → simpler PII masking, cleaner OJK audit.

**Mechanism:** NamedRange-only (no sentinels). Template shows clean `{{token}}` only. Token-writer script creates NamedRange wrapping `{{token}}` position.

**V2 token counts (final, rev 2.4):**
- MUAP: **~444 tokens** (70 existing from human upper-half tokenization + 371 new from walkthrough + 3 catch-ups)
- RSK: **~209 net-new RSK tokens**
- Combined registry: **644 entries** (339 MUAP + 210 RSK + 95 SHARED) — `src/lib/templates/tokens.ts`
- 30 MUAP renames + 4 consolidations

**Token naming conventions:**
- `snake_case` all lowercase
- `_N` suffix for positional rows (`nama_pelanggan_1`, `_2`)
- `_or_X` suffix for binary categorical (`nasabah_baru_or_lama`)
- `ai_*` prefix for ALL AI-authored narrative slots (standardized from deprecated `ain_*` and `uraian_*` in rev 2.3)
- `rsk_*` prefix for RSK overlay tokens; `ai_rsk_*` for RSK AI narratives

**Token `kind` field:** `fact-calc` (drives DSR/LTV/hard-gate recompute on sync-back) | `fact-display` (update DB only) | `narrative-ai` (update prose store only).

**RSK framework:** 5C+**2S** (not 5C+1S) per Hijra template literal §VII: Character, Capacity, Capital, Collateral, Condition, Syariah-Akad, Syariah-Halal. 21 tokens (7 dimensions × 3 fields: temuan/level/mitigasi).

**RSK 5-tier classification:** R1 (MUAP read-through, no new token) / R2 (`rsk_*` overlay) / R3 (`ai_rsk_*` narrative) / R4 (`cp_*`/`covenant_*`/`monitoring_*`/`red_flag_*` structured list rows) / R5 (presentational, skip).

**RSK row caps:** CP=10, Affirmative Covenant=8, Negative Covenant=5, Monitoring=6, Red Flags=8.

**Hijra templates are the literal source of truth (AGENTS.md rule + Pitfall 11):** Never add/remove/restructure sections. If RSK references a field MUAP lacks, RSK owns it (`rsk_*` token) — never "promote" to MUAP. 3 violations caught in sessions 11–14. Build-time assertion `assertNoInventedReuse` fails-loud on unresolved R1 MUAP claims.

**Source-of-truth model (V2 design):** Hybrid. App initializes Doc (fills at Stage 3 entry from app data + OCR + AI); after init, Doc is source of truth (analyst edits in Google Docs freely); sync-back to App via NamedRange ID resolution.

**Lost-in-doc recovery:** Store `namedRangeId` per token per app in `ApplicationDocumentFill` table. Fallback: lookup by `namedRangeId` (1st) → name (2nd, log "ID drifted") → mark `'lost-in-doc'` with last-known value (3rd). Pre-freeze gate blocks advance if any `'lost-in-doc'` unacknowledged.

**Reference text:** References Doc (`1XGLy1LyrmupcLqs3XQEf2eKqTYc0D8jj-HdvQL8HYR4` MUAP, `1Xmd2a2VjTmEEpauDjCK_U5P7Z8S2y3n7wjJgvMq-DoE` RSK) = authoritative source of original placeholder text. DB cache (`TemplateReferenceText`) = regenerable; 160 MUAP rows + 64 RSK rows cached.

**V2 infrastructure built (T1–T13):** Token registry (`tokens.ts`), reference text sync script (`sync-reference-texts.ts`), token writer script (`write-v2-tokens.ts`), NamedRange placer (`setup-v2-named-ranges.ts`), fill engine `seedApplicationDocV2` (`server/docs/seed-v2.ts`), sync-back queue + API route, cancellation UI, lost-in-doc gate. T3 coverage at session end: 224/644 (35%) cell mappings — 570 tokens in `__missing__`.

**V2 master doc IDs:**
- MUAP (old `[EMAIL REDACTED]` account): `1kw5Tf5KxzCwKlTu9BBnxz0ZNde4D9zMYbOmbXp3amI8` (abandoned)
- MUAP (dedicated Mizan account): `1aMO5dOZrFiJHebWlgRtyb-11dIm4QIx9HxAy995kUo0`
- RSK (dedicated Mizan account): `1ASR8qzBh77HFamfmNMm1OBSSXPOgcOyQIC1jY0bltwA`

**V2 was NEVER wired to production.** `createApplicationDocs` continued running V1 throughout. `seedApplicationDocV2` (`seed-v2.ts`) had exactly one commit (`f90d409`) and was never imported anywhere. Masters were migrated to `{{token}}` literals on 05-28 while creation stayed V1 → every `{{plafond}}`, `{{tenor_in_bulan}}` etc. survived unfilled in all generated docs. This was discovered in batch-23 (session S6).

**Sync-back (T8/T10) DROPPED** — decided in the **2026-06-04 design-foundation session** (decision D11; commit `d435440`). One-way fill model supersedes.

> **Provenance correction (2026.06.09):** earlier register revisions mislabeled the one-way / sync-back-drop (D11) and the MUAP auto→RM-invoke change (D13) as session `019e8ce1` / 2026-06-03. That id is the **06-03 `brainstorm-merge-and-gate`** session (whose transcript has no sync-back content); both decisions are from the **06-04 `design-foundation`** session (`2026-06-04T11-13-15.txt:3128` user-verbatim one-way directive + `:3260` MUAP RM-invoke; commit `d435440`). The same 06-03↔06-04 conflation likely affects other `019e8ce1`+D-number entries in `01-workflow.md` / `06-engine-data.md` / `08-infra-seed-process.md` (akad counter-offer reversal, command-sourced engine) — the next mining regeneration should split the two adjacent sessions.

---

## Generation approach — V3 (current/final, ADR-0013)

**Era:** OMP batch-23, session S6, 2026-06-08.

**Decision driver:** V2 was dead-code (never wired). V3 replaces with a simpler, leak-proof mechanism.

**Mechanism:** `replaceAllText("[Unique Label]", value ?? original_placeholder)` for MUAP/RSK text variables. Each variable has a unique bracketed human prompt in the template (e.g. `[Nama Perusahaan Pemohon]`, `[Plafond yang Diajukan]`). `value ?? null` = value if present, else leave the original label intact (human fills it). No `{{}}` can survive because every token is always replaced with either a value or its placeholder.

**NamedRange retained ONLY for:** QR/signature image anchors (`insertInlineImage` needs a positional anchor). Not for text fill.

**Two doc-fill conventions (explicit):**
1. **MUAP/RSK:** unique `[bracketed]` labels + `replaceAllText`; NamedRanges for QR/extraction only.
2. **MoM/SP3:** `{{token}}` + `replaceAllText`; denylist scan mandatory after de-customizing templates.

**Advantages over V2:** Duplicate-token occurrences filled for free (`replaceAllText` hits all occurrences; V2 NamedRange only hit the first — 30 MUAP / 2 RSK tokens had dups). No fragile setup script. No per-doc authoring. Missed fill = clean human label (not unfilled `{{}}`). Leak-proof by construction.

**V3 registry (~38–44 text vars):**
- Group A (16 deterministic facts from `SeedContext`): `nama_perusahaan`, `jenis_nasabah`, `akad`, `plafond`, `tenor`, `tujuan`, `return_label`, `return_rate`, `angsuran`, `dsr`, `ltv`, `kol`, `jenis_agunan`, `nilai_agunan`, `pendapatan_bersih`, `kewajiban_existing`
- Group B (6 additions): `no_aplikasi`, `nama_rm`, `tanggal_pengajuan`, `tanggal_muap`, `plafond_terbilang`, `nama_nasabah`
- Group C (8 MUAP AI narratives): `ringkasan_usulan`, `tujuan_naratif`, `analisa_{character,capacity,capital,condition,collateral,syariah}`
- Group D (14 RSK AI narratives): `{character,capacity,capital,condition,collateral,sharia_compliance,sharia_structuring}` × `{finding, mitigation}`
- Group E (excluded — human-only): per-aspect risk levels, recommendation, committee decision/verdict, approved terms. `assertSafeTokens`-guarded.
- Group F (NamedRange only): MUAP `sig_{rm,tl_spv,bm_ku}`, RSK `rsk_sig_{analyst,officer,cro}_tanggal` + `rsk_dps_tanggal`

**`assertSafeTokens`:** gating tokens (`kol`, `dsr`, `ltv`) never AI-written — compliance invariant, preserved across all versions.

**`assertNoLeftoverTokens`:** post-fill residual sweep guards against unresolved `{{` leaks.

**Signing-date rule (`tanggal_muap` / `tanggal`):** stays as placeholder until approval ladder fully signed (`chainState === 'complete'`), then filled with last (completing) signature's date — NOT `now`, NOT first sig. Resolves to null until complete.

**`terbilang` util:** Indonesian number-to-words, needed for `plafond_terbilang` (`plafond_terbilang` = "lima ratus juta" for Rp 500.000.000).

**V3 master doc IDs (current, from `.env.local`):**
- MUAP RAW: `1rydh9HpZhdWUAgCWJLhMS10CCgdCMnY6fTSZji7eljg` (env key `GOOGLE_MASTER_MUAP_DOC_ID`)
- RSK RAW: `1f1PFM0PA1MqeMzopYWvO4IMH4wx27AyMjFHbwIR7n3c` (env key `GOOGLE_MASTER_RSK_DOC_ID`)
- MoM master: `1NHCSqxPVHds3GpZB4_FeaWIIgIMdJhONe-fzVzky2Q4` (env key `GOOGLE_MOM_TEMPLATE_DOC_ID`)
- SP3 master: `1-p1oZdNXSDasSXIJKgvhjKp_Pl3Mkg5c2HEKcV6VACw` (env key `GOOGLE_SP3_TEMPLATE_DOC_ID`)

Note: env key is `GOOGLE_MASTER_MUAP_DOC_ID` (not `_V2_`). Both `_DOC_ID` and `_V2_DOC_ID` previously pointed to the same V2 master; `_V2_` variant is vestigial (only referenced in two one-time setup scripts that are now obsolete).

**Files deleted in V3 cutover:** `buildFactMap`, V1 fallback narratives, V1 `seedApplicationDoc` (NamedRange writer), `seed-v2.ts`, `templates/fill.ts`, `templates/fill.test.ts`, `scripts/verify-seed-e2e.ts`, `scripts/inventory-master-tokens.ts`, `package.json` `inventory:tokens` script.

**Fill engine:** `fillApplicationDoc(opts)` in `server/docs/seed.ts` — single module. `seed.ts` is the single fill module.

**Module:** `doc-registry.ts` — `DocVar[]` registry per template, `docVarsFor(template)` accessor.

**V3 cutover commit:** `9538bef`. V1 code deleted: `d8dfed7` + `d53eda6`.

---

## QR anchors & QR stamp

**Purpose:** Each maker-checker approval (RM, TL/SPV, BM/KU for MUAP; RA, RO, CRO, DPS for RSK) gets a QR code stamped into the document at the signature slot NamedRange.

**Mechanism:** `insertInlineImage` at `endIndex - 1` of the NamedRange (wired in `approval.ts:97` via `stampSignatureQr`).

**QR generation:** External render API (no key required):
- Primary: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=<urlencoded>` (goqr.me)
- Fallback: quickchart.io

**Why external API:** `insertInlineImage` requires a publicly-fetchable URL. `data:` base64 URIs are rejected (2KB limit); VPN-internal deployments mean Google cannot fetch internal URLs. Google fetches the PNG once at insert and stores a copy inside the Doc → no live dependency after insertion.

**QR token:** crypto-random, long, unique per (signer × document version). Scannable forever (not single-use). Stored on `ApprovalStep` record.

**Verify page:** `https://mizan.hijra.id/qr/<qrToken>` — auth-walled internal page. Shows: who + role, when, doc + version, valid/superseded.

**MUAP signature NamedRange anchors (7 total, all verified):**
- `tanggal_ttd_rm`, `tanggal_ttd_tl_spv`, `tanggal_ttd_bm_ku` — at `Tanggal: ___` cells in RM/TL/BM order

**RSK signature NamedRange anchors:**
- `rsk_sig_analyst_tanggal` (r1c0 Disusun/Risk Analyst), `rsk_sig_officer_tanggal` (r1c1 Diperiksa/Risk Officer), `rsk_sig_cro_tanggal` (r1c2 Disetujui/CRO), `rsk_dps_tanggal` — at `Nama DPS:` label cell (unique; loose `/review DPS/i` matcher hit a risk-matrix mitigation cell — fixed to `Nama DPS:` label).

All 7 anchors verified against `SIG_SLOT_OF_APPROVAL_ROLE` name map. Commits `60f230e` (MUAP) + `f104b2b` (RSK).

---

## Document versioning (ADR-0006 → ADR-0008)

**Google Docs native revision API limitations (verified):**
- `keepForever` flag is binary-files-only (NOT for Docs)
- Revisions purged after ~30 days / ~100 revisions
- No API restore/revert for Docs
- Cannot back durable, no-loss rollbacks

**ADR-0006 (2026-06-05):** Retired `RollbackDocument`/`DocumentVersion` as Mizan commands. Lean on Google Docs native history + frozen checkpoints + `RegenerateMuap`. *This was superseded the same day.*

**ADR-0008 (2026-06-05, supersedes ADR-0006):** `DocumentVersion` ledger (append-only; `document_version_snapshots` table, no FK to Application, mirrors `DocLinkage` pattern). Each version = a read-only `files.copy` snapshot. Snapshot at milestones only:
- Stage transition
- `RegenerateMuap`
- `ReviseProposal`
- freeze (`rollback_current`)
- manual

**Rollback = snapshot-current-first, then copy-checkpoint-to-new-current** (re-points `DocLinkage`). "Riwayat versi" in DocsPanel with rollback button (desk-gated by kind; pre-Komite only). `files.copy` from master template preserves NamedRanges and sentinels. In-place re-seed via `replaceNamedRangeContent` cannot restore deleted NamedRanges or wipe out-of-range free edits.

**`RegenerateMuap`:** `regenerateApplicationDocs(appId, actor)` — force-recreate path. Snapshots before replacing (no version lost). Route + client + hook + UI ("Buat ulang" button in DocsPanel). Commit `c715b2b`.

**`ApplicationDocumentFill` audit rows:** Were designed for V2 sync-back. Dropped in V3 one-way fill (not needed).

---

## Frozen PDF / DecisionCheckpoint

**Purpose:** At committee decision (Stage 5), MUAP and RSK are exported to PDF, SHA-256 hashed, and frozen for OJK audit-trail. The PDF is the artifact that went to Rapat Komite.

**Storage history:**
- Early design: in Postgres as Bytes columns (`muapPdf`, `rskPdf` Bytes) on `DecisionCheckpoint`
- Batch-15, session 8fc2db20 (2026-05-29): **moved from Postgres to SeaweedFS** (`muapStorageKey`/`rskStorageKey` + sha256 + size). Backward-compat read-fallback to old Bytes cols for existing checkpoints.

**Mechanism:** `freezeDecisionDocs` in `server/docs/service.ts:153-184`. Stores via `putDocument()`. `checkpointPdf` reads from SeaweedFS with fallback.

**`DecisionCheckpoint` also freezes the applied risk policy version** (DSR/LTV/Kol thresholds at time of decision): `riskPolicyVersionId`, `frozenDsrLimit`, `frozenLtvLimit`, `frozenKolLimit`.

**`ExploredSource[]` NOT frozen into `DecisionCheckpoint`** — `service.ts:153-184` freeze omits it. `schema.prisma:83` comment and §7 of workflow-finetune.md were both false at time of audit (batch-15). Deferred until web research goes live.

---

## Baca-balik / read-back

**Markdown export:** `drive.files.export({mimeType: 'text/markdown'})` → 38.7KB faithful from MUAP master (verified). Table structure preserved (pipe tables). `exportDocMarkdown` built but **unwired** in production — only referenced in `docs-export.itest.ts`. No production caller.

**Structured extraction (`Sinkronkan dari Dokumen`):** IS live and consumed. `extractApplicationDocs` → `ExtractedSnapshot`. Used for:
1. **Scoring:** `scoresFromSnapshot` / `hasMatrixSignal` → recommendation from extracted 5C+2S matrix
2. **AI assistant prompt injection:** `buildPrompt` → `snapshotBlock` injects snapshot as "DATA DOKUMEN (MUAP/RSK)" context

**Why extraction must be live:** RSK risk levels are human-authored in the Doc (OJK rule: AI never authors risk levels). Structured extraction is Mizan's only source for them.

**What V3 dropped:** the *bidirectional fill round-trip* (Doc→Mizan field sync-back). Read-extraction is a separate, still-live flow. The "Dropped: sync-back" claim in `document-system.md` was overly broad; corrected in session S6.

**`setup-template-ranges.ts`:** NOT deleted. Alive for extraction/matrix/QR NamedRanges. An earlier AGENTS.md entry incorrectly said it was deleted — corrected in session S6 knowledge tidy.

---

## MoM / SP3 specifics

**MoM (Notulen Rapat Komite):**
- Cadence: Mon/Wed/Fri; SLA ≤ H+1 business day after meeting
- NOT AI-assisted — manually invoked by chair
- Chair-only action: `recordMeetingMinutesAction`
- Attendance model: Komite Pembiayaan (≥2, blocking signers) + involved team (attesting, non-blocking)
- MoM per-app; deck per-app
- Template: self-authored from Hijra reference doc `1S3bWqpO6t2SY-YY-iS0iPSmHQ3PbwPNTDJT_z31sErA` (filled example, PT Pramudya Tata Laksana customer data). De-customized: Mizan-known → `{{token}}`, customer-specific → `[human placeholder]`, per-case deviation tables emptied to fillable grid.
- 8 tokens via `buildMomFill()`. Zero builder change — existing token names already matched.
- MoM/SP3 SLA gate: `meetingMomSlaState` on `KomiteMeeting`.

**SP3 (Surat Persetujuan Pembiayaan):**
- Trigger: auto-created if Komite `approve`; RM-invoked if Komite `conditional`
- Draft SP3 → Legal review → Final SP3 → nasabah agreement → Akad (chain, stages 9–14)
- Template: self-authored from Hijra reference doc `1WAGJITf8UShf2t2apXK8-6Ymon4ZIFxFV4Cdzvl9peQ` (filled example, same Pramudya data).
- 9 tokens via `buildSp3Fill()`.
- **Critical gotcha:** 4 of 6 company name occurrences in the MoM reference doc had stray `U+E907` Private-Use glyph between `PT ` and `Pramudya` (icon-font artifact). Full-string match only matched 2×, silently missing 4 → potential customer data leak. Fixed by adding the glyph-variant pattern explicitly. Always denylist-scan de-customized legal templates after `replaceAllText`.

**`generateMomSp3Doc`:** no-ops on absent tokens (template uses a subset of the full token set).

**Original Hijra Komite docs (format examples, not templates):**
- MoM original: `10XN9YnweIJO3k0LRIghJGXQ-jxcPkWKPNJSiUIkXHCM` (workflow/SOP links to this — valid reference)
- SP3 original: `10jrneQ0gH-06aKiBSLJGar3OZ3yJ77_9Q6bR7sEfe10`
- These have 0 NamedRanges, 0 `{{token}}` — raw filled examples, not templates.

---

## OAuth / Drive authentication

**History:**
1. `[EMAIL REDACTED]` — original OAuth account (fully purged, zero trace in repo by batch-14)
2. Service Account attempt — tried to avoid personal-Gmail dependency. **Reverted:** SA has zero Drive storage quota → `files.copy` returns 403 ("quota exceeded"). SA cannot own Docs.
3. **Final/current:** Dedicated Google account for Mizan (`mizan.app.docs@gmail.com`-style), OAuth flow via `pnpm google:auth`. Scopes: `documents` + `drive` (full, not whitelist-only). Token in `apps/web-app/.env.local`.

**`drive.file` OAuth scope:** whitelist-only (only files app created or picker-shared). Hand-created templates return 403/404. V2 migration required `drive.readonly` addition + re-consent. V3 uses full `drive`.

**Runtime critical paths:** `createApplicationDocs`, `freezeDecisionDocs`, `checkpointPdf`, `extractApplicationDocs`, `sync-v2`, `approval` (QR-stamp), `mom-sp3`, `ai-chat`. OAuth is NOT script-only — it is runtime-critical across all document generation routes and actions.

**Three separate Google credential systems (documented):**
1. Docs/Drive: OAuth refresh-token (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`) — runtime-critical, not replaceable by SA
2. LLM: `GEMINI_API_KEY` (AI Studio) or `VERTEX_CREDENTIALS`/`GOOGLE_CLOUD_PROJECT` (Vertex)
3. Firebase Auth: `FIREBASE_SERVICE_ACCOUNT`

---

## PII handling in documents

**Mask-in/unmask-out pattern (all AI doc-gen paths):**
1. `maskPii()` applied to entire prompt before every Gemini call (replaces name/NIK/phone/business name with `[NASABAH]`/`[USAHA]`/`[NIK]` etc.)
2. AI only sees masked version
3. `unmaskPii(maskedOutput, mapping)` substitutes placeholders back with real values after AI output
4. Real names in MUAP/RSK are **system-originated** substitutions, never AI-authored

**AI never authors:**
- Risk levels (SEDANG/TINGGI/RENDAH)
- Recommendation (DISETUJUI/BERSYARAT/DITOLAK)
- Gating values (DSR, LTV, Kol)
- Committee decision/verdict
- Approved terms

**`assertSafeTokens`** in fill engine: gating tokens (`kol`, `dsr`, `ltv`) are excluded from AI fill. `scrubNarrative` drops any field smuggling verdict/level.

**Narrative audit:** `runNarrative` (MUAP/RSK drafter) calls `recordAiInteraction` with `auditUserId` for every Gemini call (fixed in batch-15, session d24cf23f — prior to that fix, the highest-stakes AI path had no audit row).

---

## OCR / Document AI

**Scope:** Google Document AI Enterprise Document OCR, region `asia-southeast1` (Singapore).
- Project: `hijra-mizan`
- Processor ID: `99f6b5ee16dec8b2`
- Provider abstraction: `OCR_PROVIDER` env var (default `stub`; `documentai` = production; `gemini` = interim)

**OCR triggers:** Every document upload (any stage), best-effort, never blocks upload.

**Full-text OCR:** `Document.extractedText` (nullable) stored per document. Feeds narrative prompt `KONTEKS DOKUMEN` block. Masked by existing `maskPii` before Gemini call.

**Gate-input extraction:** `parseGateValueFromText()` in `lib/ocr.ts` — conservative parser; extracts Kol (SLIK), income (slip_gaji, laporan_keuangan), collateralAppraisedValue (appraisal). Falls back to `human_entered` when not confidently found.

**Upgrade path documented (2c):** Form Parser → Custom Extractor if regex-over-OCR field accuracy poor on real scanned docs. Trigger: `ocr.documentai_low_confidence` < 0.7. Not built.

**KTP Identity processor:** No pre-trained Indonesian KTP Identity processor exists in Document AI — US-only. Custom Extractor with training data required for typed KTP fields.

**Cross-border PII note:** Document AI runs in Singapore = cross-border PII. Same G5-class DPA gate as Gemini. Accepted for dev with dummy data; production gated by DPA sign-off (17 Dec 2026 in-region deadline).

---

## Scanning & tooling

**`scan-muap-braces.ts`:** Scans any Google Doc for `{{…}}` and `[bracket]` patterns.
- Final bracket regex: `const BRACKET_RE = /\[(.{3,}?)\]/g` (lazy, unbounded — NEVER reintroduce upper bound; 200-char cap silently missed 11 narrative tokens in rev 1)

**`export-doc-pdf.ts`:** `Drive.files.export({mimeType: 'application/pdf'}) + pdftotext -layout`. Preferred over Playwright for Doc visual inspection (no auth flow). Caught T43↔T45 Neraca/Laba Rugi swap, T21 column ordering, 11 narrative tokens with >200-char brackets.

**`scripts/author-v3-raw-masters.ts`:** Index-based replacement (char-offset from Docs API) for V3 RAW template authoring. Not global `replaceAllText` — avoids collision with duplicate bracket labels.

**`scripts/author-momsp3-masters.ts`:** MoM/SP3 de-customization script. Kept (not deleted).

---

## MUAP structure (reference)

9 sections from OJK convention (NoEffort + discovery, not fully Bank-confirmed at V1 design time):
I. Identitas Permohonan, II. Data Permohonan, III. Analisis 5C+1S, IV. Analisis Keuangan (per-akad), V. Hard Gate Summary, VI. Rekomendasi Analis, VII. Catatan Analis, VIII. Informasi Legal & SLIK, IX. Persetujuan (signature slots).

**MUAP body uses `requestedPlafond`** (not `approvedPlafond`): MUAP is the analysis document Komite reviewed to make the decision — retroactively changing it = audit falsification. Post-decision banner shown visually above MUAP body (not inside it).

**10 MUAP table identification bugs caught during V2 walkthrough (historical reference):**
- T21: c2=Baki Debet (not Plafond), c3=Kol, c4=Lembaga
- T34/T35/T36: Pelanggan Utama / Pekerjaan Selesai / Upcoming (NOT Pelanggan/Supplier/Aset)
- T38: Supplier/Vendor/Pemasok (NOT Utang-Piutang)
- T43: Laba Rugi (9 rows); T45: Neraca (13 rows) — swapped in rev 1
- T47: 42 tokens (13 ratios × 3 periods), NOT just period headers
- T61/T63: polarity bugs (`persen_halal_income` not `persen_non_halal_income`; `gharar_riba_maysir_*` not `hilah_*`)
- T70: `biaya_administrasi_pembiayaan_flat` (NOT `total_angsuran_flat`)
- T87: `kategori_fasilitas` 3-value (Baru/Perpanjangan/Tambahan), not boolean

---

## Auto-create timing (current)

| Doc | Trigger | Who |
|-----|---------|-----|
| MUAP | RM-invoked (not auto) | RM at Stage 3 |
| RSK | Auto when MUAP chain completes, entering Risk desk | System |
| SP3 | Auto if Komite `approve`; RM-invoked if `conditional` | System / RM |
| MoM | Manually invoked | Chair |
| Akad | **OUT OF SCOPE (V1)** | — |

`ensureStage3DocsOnEntry()` in `server/docs/auto-draft.ts`: built, idempotent, never-throws, wired in `transitionAction` + `completeLegalAction`. Best-effort.

**Note on earlier design:** Earlier CC-era sessions (batch-11/12) designed MUAP as auto-created on Stage 3 advance. The **2026-06-04 design-foundation session** (decision D13) corrected this to RM-invoked. Current SSOT: `docs/designs/ai-assist.md`.

---

## Canonical references

| Artifact | Location |
|----------|----------|
| V3 doc-system design | `docs/designs/document-system.md` |
| ADR-0013 (V3 supersedes V2) | `docs/decisions/0013-docs-generation-v3-replace-all-text.md` |
| ADR-0008 (snapshot versioning) | `docs/decisions/0008-document-versioning-snapshot-copies.md` |
| ADR-0006 (superseded) | `docs/decisions/0006-document-versioning-google-native.md` |
| Live master IDs + token sets | `docs/references/document-templates.md` |
| AI-assist design + triggers | `docs/designs/ai-assist.md` |
| MUAP template content reference | `docs/references/muap-template.md` |
| V2 tokenization docs (bannered superseded) | `docs/designs/muap-v2-tokenization.md`, `muap-template-engine-v2.md`, `rsk-v2-tokenization.md` |

---

# Documents — contradictions, reversals & evolution

## 1. Generation approach V1 → V2 → V3

**Early position [CC batch-02, session 1ef0b06b, 2026-05-22]:** Hybrid sentinel (`${{x}}…${{/x}}`) + NamedRange approach. ~12 MUAP tokens + 3 RSK tokens. Sentinel text as durable fallback when NamedRange breaks.

**Intermediate [CC batches 11–14, 2026-05-26]:** V2 design: 644-token granular NamedRange registry (444 MUAP + 209 RSK + 95 shared). Bidirectional source-of-truth (App init → Doc takes over → sync-back). `${{x}}` sentinels dropped entirely. Masters migrated to `{{token}}` on 05-28.

**Problem discovered [OMP batch-23, session S6, 2026-06-08]:** V2 fill engine (`seed-v2.ts`) had one commit and was never imported. `createApplicationDocs` ran V1 throughout. CURRENT-STATE.md falsely claimed "shipped 2026.06.04 … one-way NamedRange fill activated" based on a manual throwaway-copy OAuth test, not the production path.

**Final position [OMP batch-23, 2026-06-08]:** V3: `replaceAllText("[Unique Label]", value)` for text variables; NamedRanges only for QR/signature image anchors. ~38–44 text vars. V1 code deleted. RESOLVED.

---

## 2. Bidirectional sync / sync-back (T8/T10)

**Early [CC batch-11, session 59463e0a]:** Hybrid source-of-truth proposed. Doc wins post-init; sync-back to App via NamedRange IDs. `ApplicationDocumentFill` table, `'lost-in-doc'` status, `headRevisionId` pre-check. T8 (sync-back queue) + T10 (sync-back API route) built.

**Reversal [OMP 2026-06-04 design-foundation session, D11; commit `d435440`]:** Sync-back (T8/T10) **formally DROPPED**. One-way fill model: system fills Doc once; after fill, Doc is maker's. Read-back only via MD export or structured extraction.

**Note:** "Read-back" (structured extraction for scoring + AI context) remains live — what was dropped is the bidirectional *fill round-trip* (Doc→Mizan field sync). The `document-system.md` rewrite initially said "Dropped: sync-back" too broadly, causing confusion. Corrected in session S6. RESOLVED.

---

## 3. `${{x}}` sentinel approach → NamedRange-only → `replaceAllText`

**V1 [CC batch-02]:** `${{field}}` / `${{/field}}` visible sentinels as durable fallback.

**V2 [CC batch-11]:** NamedRange-only, no sentinels. Template stays WYSIWYG. `D4 — NamedRange-only, no sentinels` explicit decision.

**V3 [OMP batch-23]:** Neither sentinels nor NamedRanges for text fill. `replaceAllText("[Label]", value)`. NamedRange only for QR anchors. RESOLVED.

---

## 4. MUAP auto-create timing

**Early [CC batch-11/12, 2026-05-26]:** MUAP auto-created on Stage 3 advance (`ensureStage3DocsOnEntry`, already built).

**Later [OMP 2026-06-04 design-foundation session, D13]:** MUAP = **RM-invoked** (not auto). RSK = auto when entering Risk desk. This distinction matters for UX: RM clicks "Buat MUAP" deliberately; RSK is seamless.

**Note:** `ensureStage3DocsOnEntry()` is still built and wired — it handles RSK auto-creation and the web research pre-step. The distinction is MUAP specifically is RM-invoked not system-triggered. RESOLVED.

---

## 5. Document versioning ADR-0006 → ADR-0008

**ADR-0006 [2026-06-05, same session]:** `RollbackDocument`/`DocumentVersion` retired as Mizan commands. Lean on Google Docs native history + frozen checkpoints + `RegenerateMuap`.

**ADR-0008 [2026-06-05, same session, reversal]:** `workflow-engine.md` §240-242 re-read confirmed `RollbackDocument`/`DocumentVersion` is a genuinely designed feature. Google native revision API inadequate (30-day purge, no restore/revert API for Docs, `keepForever` binary-files-only). ADR-0008 = `DocumentVersion` ledger + `files.copy` snapshots at milestones. ADR-0006 marked superseded. RESOLVED.

---

## 6. Frozen PDF storage (Postgres → SeaweedFS)

**Early [CC era through batch-15]:** `DecisionCheckpoint.muapPdf`/`rskPdf` stored as Bytes in Postgres. Widespread assumption in docs that "MUAP/RSK stored in Drive" — this was **incorrect**.

**Reversal [batch-15, session 8fc2db20, 2026-05-29, Batch D]:** Moved from Postgres to SeaweedFS (`muapStorageKey`/`rskStorageKey` + sha256 + size). Backward-compat read-fallback for existing checkpoints. Live Google Doc authoring stays in Drive; PDF freeze goes to on-prem SeaweedFS. RESOLVED.

---

## 7. OAuth account: `[EMAIL REDACTED]` → SA → dedicated Mizan Gmail

**Early [CC batch-02 through batch-13]:** `[EMAIL REDACTED]` as the OAuth account.

**SA attempt [CC batch-13, mid-session]:** Migrated to Service Account to avoid personal-Gmail dependency. Committed. **Reverted** same session: SA has zero Drive storage quota → `files.copy` returns 403.

**Purge [CC batch-13, commit `28d73e6`]:** `[EMAIL REDACTED]` fully removed from all repo traces (explicit user directive: "Make sure there's no any trace left of Aixel in this whole repo").

**Final [CC batch-13]:** Dedicated Google account for Mizan with OAuth. Scopes: `documents` + `drive` (full). OAuth `drive.file` (whitelist-only) was too restrictive for hand-created templates; `drive.readonly` also insufficient (was in grant but not in refresh token, causing 404s). Full `drive` scope adopted. RESOLVED.

---

## 8. Token prefix `ain_` / `uraian_` → `ai_`

**Early V2 [batch-11, rev 1 of tokenization]:** Human's manual upper-half tokenization used `ain_keterangan_tujuan_pembiayaan`, `ain_kesimpulan_analisis_yuridis`, `uraian_profil_perusahaan`.

**Normalized [batch-12, MUAP rev 2.3, commit `9302167`]:** All AI narrative slots standardized to `ai_*` prefix. `ain_*` and `uraian_*` are dead prefixes; any code/doc using them is pre-rev2.3. RESOLVED.

---

## 9. RSK 5C+1S vs 5C+2S

**Agent proposal [CC batches 11–14, multiple instances]:** Agent proposed 5C+1S based on academic web research / general convention.

**User correction [each time, 3+ instances]:** Hijra RSK template §VII literally writes "kerangka 5C + 2S (Syariah)". Template = literal source of truth. **Rule:** Template wins over academic norm. 7 dimensions: Character, Capacity, Capital, Collateral, Condition, Syariah-Akad, Syariah-Halal. RESOLVED.

---

## 10. NamedRange V2 coverage gap (35% → production-ready)

**At V2 T3 build end [batch-13/14]:** Only 224/644 (35%) cell mappings. ~570 tokens in `__missing__`. Second alfa extraction pass with T#/r/c coordinates could lift to ~95%.

**Superseded:** V3 removed the dependency on cell coordinates entirely. `replaceAllText("[Label]", value)` targets unique label text, not position. Coverage gap was moot. RESOLVED.

---

## 11. `ain_*` prefix in RSK naming: `risk_*` → `rsk_*`

**Early V2 [batch-12 initial]:** RSK tokens initially used `risk_*` prefix.

**User correction [batch-12, commit `ce83c28`]:** `risk_*` → `rsk_*`. User preference; accepted. Any code/doc using `risk_*` for RSK tokens is pre-this-commit. RESOLVED.

---

## 12. Template "promotions" (cross-template violations)

**Pattern [recurring in CC batches 11–14]:** Agent repeatedly tried to "promote" RSK-only fields into MUAP (3 separate instances: T44 Cashflow + T43 revenue expansion; ~20 RSK rev 2 "promotions"; §VI.2 Cashflow + §VI.4 Revenue Stream).

**Rule established:** Pitfall 11 in tokenization playbook + AGENTS.md rule. If RSK references a field MUAP lacks, RSK owns it (`rsk_*`, R2/R3 tier). Build-time `assertNoInventedReuse` in token registry fails-loud on unresolved R1 MUAP claims. Template is source of truth; never invent additions. RESOLVED (ongoing rule).

---

## 13. MoM/SP3 template origin

**Early [through CC batch-12]:** MoM and SP3 templates created programmatically from scratch. Hijra's example links (`10XN9Y…`, `10jrne…`) treated as format references only.

**Correction [OMP batch-23, session S6]:** Hijra's reference docs contain filled examples (PT Pramudya Tata Laksana data). Better approach: copy reference docs → de-customize (Mizan-known → `{{token}}`, customer-specific → `[human placeholder]`). Applied; clean denylist scan confirmed. New masters created. RESOLVED.

---

## 14. MUAP V2 "shipped" overstatement

**CURRENT-STATE.md (stale, 2026-06-04):** "MUAP/RSK docs — done — auto-seed on create" and "Document system — shipped 2026.06.04 … one-way NamedRange fill activated."

**Reality (discovered OMP batch-23, 2026-06-08):** The "activated + verified" commit (`0b456d1`) was a manual throwaway-copy OAuth test, not the production path. `createApplicationDocs` never switched to V2. CURRENT-STATE.md corrected to "V2 orphaned" then "V3 wired" during session S6. RESOLVED.

---

## 15. `ExploredSource[]` frozen into `DecisionCheckpoint` [OPEN/ambiguous]

**Design intent [CC batch-10, batch-11]:** Web research `ExploredSource[]` should be frozen into `DecisionCheckpoint` at committee decision (§7 of workflow-finetune.md, `schema.prisma:83` comment).

**Reality [batch-15, session d24cf23f audit]:** `service.ts:153-184` freeze omits it. Schema comment and §7 were both false. Deferred until web research goes live in production.

**Status: OPEN** — design intent exists but implementation lags. `[VERIFY-DOC]` applies to whether `document-system.md` now accurately describes this gap.

---

## 16. `setup-template-ranges.ts` deletion claim

**AGENTS.md entry (stale):** Said `setup-template-ranges.ts` was deleted during V1 cleanup.

**Reality [session S6]:** File is alive. It sets up extraction/matrix/QR NamedRanges — all three of which are still active in V3. Corrected during session S6 knowledge tidy. RESOLVED.

---

## 17. Akad document generation — OUT OF SCOPE (V1)

**Throughout all eras:** "Akad document generation (S6 gap)" noted from brainstorm era through OMP S6. `AkadBadge` is a presentation-only colored pill; no `generateAkad` action exists.

**Status: OUT OF SCOPE (V1)** (decided 2026.06.08) — Mizan generates MUAP/RSK/MoM/SP3 only; the akad contract is authored/signed outside Mizan. Previously tracked as blocked on master templates + OAuth + W1 akad params; now an explicit scope exclusion, not pending. See `../scope-v1.md`.
