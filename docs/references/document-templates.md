# MIZAN — Document templates register (MUAP · RSK · MoM · SP3)

- **Type:** living register
- **Status:** Living register
- **Last reviewed:** 2026.06.08
- **Provenance / owner:** App. Operational source of truth for the four generated Google-Doc templates.
- **Used by:** `server/docs/{seed,mom-sp3,qr-stamp}.ts`, `lib/templates/doc-registry.ts`, `lib/mom-sp3-tokens.ts`, `lib/approval-desks.ts`; design `../designs/document-system.md`; decision `../decisions/0013-docs-generation-v3-replace-all-text.md`.
- **Review / delete trigger:** a master Doc is re-authored / re-pointed, a token is added/removed, or a signature slot changes.
- **Akad contract is intentionally NOT here:** akad document generation is **out of scope for V1** (`scope-v1.md`); Mizan generates only these four.

> **Why this register exists:** the live Doc IDs, token sets, and signature slots were previously duplicated
> (and drifted into conflicting values) across the design, the ADR, and the plan. This is now the **single
> place** for those volatile facts; other docs link here instead of copying IDs.

## Two families, two placeholder conventions

Both fill one-way (Mizan → Doc) via `documents.batchUpdate` `replaceAllText`, are leak-proof by construction,
and hand the Doc to the maker afterward — but they use **different placeholder conventions**:

| Family | Resting placeholder | Fill rule | Leak-proofness |
|---|---|---|---|
| **MUAP / RSK** (V3, ADR-0013) | a **unique `[bracket]`** per Mizan-known var (the bracket is the doc's own human prompt) | `replaceAllText("[Label]", value)` only when Mizan knows it; else the bracket stays | a bracket is a valid human placeholder, so nothing "leaks" — plus a residual-`{{` sweep backstop |
| **MoM / SP3** | `{{token}}` literals for Mizan-known fields; `[human placeholder]` for fields the maker fills | every `{{token}}` is replaced with its value **or `—`** → no `{{}}` survives | de-customized from the real filled refs; an authoring **denylist scan** proves no example-customer data remains |

**NamedRanges are used ONLY for QR/signature anchors** (`insertInlineImage` needs a location); all value/
narrative text goes through `replaceAllText`.

## Live masters (env-configured)

| Doc | Live master Doc ID | `.env*` key(s) |
|---|---|---|
| MUAP | `1rydh9HpZhdWUAgCWJLhMS10CCgdCMnY6fTSZji7eljg` | `GOOGLE_MASTER_MUAP_DOC_ID` (and legacy `…_MUAP_V2_DOC_ID`, same value) |
| RSK | `1f1PFM0PA1MqeMzopYWvO4IMH4wx27AyMjFHbwIR7n3c` | `GOOGLE_MASTER_RSK_DOC_ID` (and legacy `…_RSK_V2_DOC_ID`, same value) |
| MoM | `1NHCSqxPVHds3GpZB4_FeaWIIgIMdJhONe-fzVzky2Q4` | `GOOGLE_MOM_TEMPLATE_DOC_ID` |
| SP3 | `1-p1oZdNXSDasSXIJKgvhjKp_Pl3Mkg5c2HEKcV6VACw` | `GOOGLE_SP3_TEMPLATE_DOC_ID` |

- MUAP/RSK masters are the **RAW reference templates** (original `[brackets]` for every slot), authored in place.
- MoM/SP3 masters are **copies of the real filled reference docs**, then de-customized. The references are
  **preserved untouched**: MoM `1S3bWqpO6t2SY-YY-iS0iPSmHQ3PbwPNTDJT_z31sErA`, SP3 `1WAGJITf8UShf2t2apXK8-6Ymon4ZIFxFV4Cdzvl9peQ`.
- `.env.local` is gitignored — production sets these keys separately.

## Tokens / variables

- **MUAP & RSK** — the curated ~38 "Mizan-known" registry: `lib/templates/doc-registry.ts` (facts from
  `SeedContext` + masked AI narratives + signing dates). Gating fields (risk level, recommendation, committee
  verdict, approved terms) are **excluded by design** and guarded by `assertSafeTokens`. One fill map serves
  both Docs (a placeholder absent from one is a no-op).
- **SP3** — `SP3_TOKENS` (`lib/mom-sp3-tokens.ts`). Placed in the master: `sp3_{no,tanggal,plafond,tenor,imbal_hasil,sifat,akad}` + `nasabah_{nama,alamat}`.
- **MoM** — `MOM_TOKENS`. Placed in the master: `mom_{tanggal,lokasi,nasabah,muap_ref,rsk_ref,plafond,tenor,akad}`.
- The builders compute a superset; tokens with no slot in the real format (`sp3_kondisi`, `mom_{peserta,keputusan,kondisi}`) are harmless no-ops (`generateMomSp3Doc` skips absent tokens).

## Signature / QR slots (NamedRanges)

`stampSignatureQr` (`server/docs/qr-stamp.ts`, run from `approval.ts` on each rung) inserts the approval QR at
the slot named by `SIG_SLOT_OF_APPROVAL_ROLE` (`lib/approval-desks.ts`). All seven created + verified 2026.06.08:

| Doc | Slot NamedRanges |
|---|---|
| MUAP | `tanggal_ttd_rm` · `tanggal_ttd_tl_spv` · `tanggal_ttd_bm_ku` |
| RSK | `rsk_sig_analyst_tanggal` · `rsk_sig_officer_tanggal` · `rsk_sig_cro_tanggal` · `rsk_dps_tanggal` |

## V3.5 coverage audit — Mizan-fillable underscore slots (Batch 4 T0, 2026.06.10)

**Method:** live read-only `documents.get` JSON-walk of both masters (`scripts/audit-master-coverage.ts`),
inventorying `[bracket]` tokens, underscore-blank runs (`_{2,}`), and existing NamedRanges. **Verified live**
2026.06.10 (read-only; no master mutated).

**Raw counts:** MUAP = 178 `[bracket]` tokens · 192 underscore-blank lines · 3 NamedRanges (QR only).
RSK = 96 `[bracket]` tokens · **2** underscore lines · 4 NamedRanges (QR only).

**Finding (resolves gap #7 — "are plafond/tenor just examples?"):** **No — they are essentially the
COMPLETE set.** Every Mizan-known structured field already fills via a `[bracket]` token (178 of them). The
192 MUAP underscores are almost entirely **analyst-authored** (financial figures `Rp ___________` inside
tables the analyst writes, dates `20___`, `Per Desember 20___`, `___%`, `___ tahun`, narrative addresses) —
correctly left blank for the human. RSK's 2 underscores are the **DPS hand-signature/notes** (not Mizan data).

**Coverage matrix — slots Mizan KNOWS but currently can't fill (`replaceAllText` can't target underscores):**

| Doc | Slot (master text) | Mizan field | Occurrences | Fill method (target) |
|---|---|---|---|---|
| MUAP | `Rp ____________,- ([Plafond Terbilang])` | `requestedPlafond` | 2× (facility table §I + recommendation) | NamedRange (V3.5) |
| MUAP | `___ Bulan` | `requestedTenorMonths` | 1× | NamedRange (V3.5) |
| MUAP | `______/MUAP-MKT/___/20___` (doc no./date) | app-ref + date (generated) | 2× | NamedRange (V3.5) — *optional, confirm desired* |
| RSK | — | — | 0 | none needed |

**V3.5 BUILT + verified live 2026.06.10.** Spike GO → registry `method:'namedRange'` + runtime fill
(`server/docs/seed.ts`) → **7 NamedRanges created on the MUAP master** (`scripts/setup-v35-namedranges.ts`,
metadata-only — no text change). Live smoke (per-app copy): all 7 ranges survive `files.copy`; fill
produces `099/MUAP-MKT/VI/2026`, `15 Juni 2026`, `Rp 500.000.000,-`, `24 Bulan`.

| NamedRange (MUAP master) | slot | fill (registry var) | when |
|---|---|---|---|
| `muap_no_muap_cover` · `muap_no_muap_identitas` | `______/MUAP-MKT/___/20___` | `no_muap` | **at ladder-complete** (official) |
| `muap_tanggal_cover` · `muap_tanggal_identitas` | `___ ____ 20___` | `tanggal_doc` | **at ladder-complete** (last-signature date) |
| `muap_plafond_facility` · `muap_plafond_recommendation` | `Rp ____,-` (underscore run) | `plafond_value` | at creation |
| `muap_tenor` | `___ Bulan` (underscore run) | `tenor_value` | at creation |

- **No. MUAP + Tanggal fill ONLY when the MUAP ladder is fully signed** (`lastSignatureDate`) — they are
  official-when-signed (re-filled by `finalizeSignedDoc` on ladder-complete). plafond/tenor fill at creation.
- **Master backup before V3.5 setup:** `1IY1zRS3jGN23bHbVS6jOXTHQ3pkf3dRcJOe32y28skk` (drive.files.copy 2026.06.10).
- **Re-author tax:** a new MUAP master version must re-run `setup-v35-namedranges.ts` (dry-run → APPLY=1)
  to recreate these 7 ranges (they don't carry over to a hand-authored new master).

## MUAP narrative draft-assist slots (2026.06.10, ADR-0017)

Reverses the 2026.06.08 "narratives are no-ops" posture (`document-system.md`). The 8 MUAP narrative
registry vars (`MUAP_NARRATIVE_VARS` in `doc-registry.ts`) now have a matching `[bracket]` on the master, so
`generateMuapNarrative` → `seed.ts` `replaceAllText` fills them as an **editable AI first draft** the analyst
edits before freeze. Each is a labelled `📝 Draf analisa AI (sunting/lengkapi sebelum finalisasi): [bracket]`
paragraph placed (NORMAL_TEXT, shading/colour cleared) **right after the section's human-fill guidance
prompt** — NOT under the coloured section heading (those headings are band-shaded table cells; a paragraph
there would inherit the band). `place-narrative-slots.ts` anchors on the guidance-prompt text (col below) and
is self-healing (re-running relocates/restyles an existing slot in place).

| Bracket (MUAP master) | narrative var | section anchor |
|---|---|---|
| `[Ringkasan Usulan]` | `m_ringkasan_usulan` | I. TUJUAN |
| `[Analisis Character]` | `m_character` | II.C MANAJEMEN & PEMEGANG SAHAM |
| `[Analisis Condition]` | `m_condition` | III. ANALISIS INDUSTRI DAN PASAR |
| `[Analisis Capacity]` | `m_capacity` | V.A ANALISIS LABA RUGI |
| `[Analisis Capital]` | `m_capital` | V.B ANALISIS POSISI KEUANGAN (NERACA) |
| `[Narasi Tujuan Pembiayaan]` | `m_tujuan_naratif` | VI. ANALISIS KEBUTUHAN PEMBIAYAAN |
| `[Analisis Collateral]` | `m_collateral` | VII. ANALISIS AGUNAN |
| `[Analisis Aspek Syariah]` | `m_syariah` | VIII. ASPEK SYARIAH |

- **Placement script:** `scripts/place-narrative-slots.ts <masterId>` (dry-run → `APPLY=1`; backup-first,
  idempotent, self-verifying). **Verified live 2026.06.10** — per-app copy fills all 8 with masked+unmasked AI prose.
- **Master backup before narrative-slots:** `1KVa35FVpDdc8ltJ5X-nOlMfx5beTLRqEPpd0_PD5_Mo` (drive.files.copy 2026.06.10).
- **Re-author tax:** a re-authored MUAP master must re-run `place-narrative-slots.ts` (the brackets don't carry
  over). **RSK was NOT given narrative slots** — RSK narratives stay not-doc-filled (granular prompts only).

## Batch 9 coverage audit + identity fill (2026.06.10)

**Full slot↔Mizan-data audit** (vision fan-out: 44 Sonnet agents, 1/template page, read-only PNG
export via `scripts/dump-template-slots.ts` + `scripts/export-master-pdf.ts` + `pdftoppm`; synth via
`scripts/synth-coverage.ts`). 618 slot-classifications → **human 321 · ocr 149 · derive 92 · have 56**.

**Key finding:** Mizan's structured coverage is essentially complete — the ~38 bound vars already cover
the identity/terms/ratios Mizan *has*. The "derive" bucket was over-counted: most are analyst financial-
analysis tables (6.1 Financial Highlight GPM/NPM/CR/DER × years, 6.2 Arus Kas, SCCR/CEF/CEV, facility
TOTALs) that Mizan has **no source for** → really `human`. The real expansion is the **OCR set** (legal-
identity: bidang usaha, pengurus/direksi/komisaris, pemegang saham + %, akta pendirian/perubahan, izin
sektoral, tempat/tgl lahir) → runtime AI extraction + the `extractionExtras` open map, human-confirmed.

**V3 identity fill added (Batch 9 T5)** — `replaceAllText` on existing `[bracket]` tokens, zero master change:

| placeholder (MUAP) | registry var | Mizan field |
|---|---|---|
| `[Nomor NPWP]` | `nomor_npwp` | `npwp` |
| `[Nomor NIB]` | `nomor_nib` | `nib` |
| `[Alamat Sesuai Dokumen Legalitas]` | `alamat_legal` | `alamat` |
| `[Bidang Usaha Utama]` | `bidang_usaha` | `bidangUsaha` |

Sources: intake form (human_entered) OR runtime OCR→AI (`server/ai/extract-fields.ts` → `{known, extras}`,
gated on a real `OCR_PROVIDER`; regex parsers in `lib/ocr.ts` are the offline fallback). All OCR values are
`ocr_suggested` → confirmed by the intake desk in the Data tab. Coverage matrix: `.tt/template-audit/coverage-matrix.md`.

## Authoring scripts (one-time, OAuth on live Docs)

| Script | Purpose |
|---|---|
| `scripts/author-v3-raw-masters.ts` | author MUAP/RSK fact `[brackets]` onto the RAW masters (dry-run → `APPLY=1`) |
| `scripts/author-v3-sig-anchors.ts` | create the 3 MUAP signature NamedRanges |
| `scripts/author-v3-rsk-sig-anchors.ts` | create the 4 RSK §IX signature NamedRanges |
| `scripts/author-momsp3-masters.ts` | de-customize the MoM/SP3 masters (token + placeholder map + **denylist scan**) |

Run pattern: `cd apps/web-app && set -a; . .env.local; set +a; [APPLY=1] TSX_TSCONFIG_PATH=tsconfig.json node --import tsx scripts/<file>.ts`.

## Engine / fill code

- **MUAP/RSK:** `server/docs/seed.ts` (`fillApplicationDoc`, `FACT_RESOLVERS`, signing-date rule) wired into `createApplicationDocs`.
- **MoM/SP3:** `server/docs/mom-sp3.ts` (`generateMomSp3Doc`) + `lib/mom-sp3-tokens.ts` (`buildMomFill`/`buildSp3Fill`).
- **QR:** `server/docs/qr-stamp.ts` (`stampSignatureQr`).
- **Read-back (extraction):** `server/google/extract/` (`extractApplicationDocs`) reads analyst-authored fields (RSK matrix, ratios, collateral, RAC) → `ExtractedSnapshot` (persisted as `ExtractionRun`), consumed by `lib/scoring-from-extracted.ts` + AI context (`server/ai/context.ts`); the "Sinkronkan dari Dokumen" button triggers it. (`exportDocMarkdown` in `server/docs/service.ts` exists but is unwired.) See `../designs/document-system.md` §"Read-back".
