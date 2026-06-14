# MIZAN — Document system (generation · signing · capture)

- **Status:** Current — V3 (2026.06.08). The accepted decision is
  [ADR-0013](../decisions/0013-docs-generation-v3-replace-all-text.md); this design is the "how it works".
- **Supersedes:** the V2 NamedRange-fill model (`muap-template-engine-v2.md` + the `*-tokenization*.md`
  walkthroughs — now historical reference only) **and** the bidirectional **fill** round-trip / lost-in-doc
  machinery (dropped — see "Dropped"; the read-back *extraction* of analyst-authored fields is **not** dropped,
  see "Read-back"). All concrete Doc IDs, token sets, and signature slots live in the register
  [`../references/document-templates.md`](../references/document-templates.md) — not copied here.
- **North Star:** the document is a **rendering of the application's data** that Mizan fills once and proves —
  it does not police the maker's editing. Records, doesn't gate (`workflow-engine.md`).

## Principles

1. **Google Docs templates.** Hijra already uses Google + GCP, so the editing surface stays Google Docs
   (no egress concern). OAuth via the dedicated Mizan account (`guides/google-docs-oauth.md`).
2. **One-way fill (write-once), then the Doc belongs to the maker.** Mizan copies a master template, fills the
   slots it can, stamps any QR, and stops; the maker edits freely in Google Docs afterward. Mizan never
   **re-reads its own filled values to keep them in sync** (no fill round-trip) — but it **does extract the
   analyst-authored fields** back (the RSK risk matrix, ratios; see "Read-back").
3. **Leak-proof by construction — a user never sees a raw machine token.** Every slot's *unfilled* state is a
   valid human placeholder, so an unknown value degrades to a prompt, never to `{{garbage}}`. Two conventions
   (see below) realise this for the two document families.
4. **NamedRanges anchor QR + extraction, never value fill.** All value/narrative *fill* goes through
   `replaceAllText`; NamedRanges (placed by `scripts/setup-template-ranges.ts`) anchor the QR signature stamp
   and mark the analyst-authored fields the extractor reads back (matrix `level`/`finding`/`mitigation`, ratios).
5. **Read-back = structured extraction of analyst-authored fields** (NamedRange + sentinel → `ExtractedSnapshot`),
   **not** a fill round-trip — see "Read-back". (A Markdown export exists but is not wired to a consumer.) The
   **PDF export** is the signed/frozen **audit** artifact.
6. **Variables only for what Mizan knows.** A slot is a variable *only* if Mizan can populate it from data we
   hold (app field / OCR / AI-from-data) or it is a signature anchor. Everything else stays the template's own
   static text the maker completes. This was the correction to V1 (too few) and V2 (too many).

## Fill mechanism — two conventions (both `replaceAllText`, both leak-proof)

| Family | Resting placeholder | Fill | Notes |
|---|---|---|---|
| **MUAP / RSK** (ADR-0013) | a **unique `[bracket]`** per Mizan-known var — the bracket is the doc's own human prompt AND the `replaceAllText` target. **No `{{}}` exists in these masters.** | `replaceAllText("[Label]", value)` only when known; else the bracket stays. Duplicate occurrences all resolve in one request. | Curated registry (`lib/templates/doc-registry.ts`, ~38 vars). Backstop: a residual-`{{` sweep (`assertNoLeftoverTokens`). |
| **MoM / SP3** | `{{token}}` literals for Mizan-known fields; `[human placeholder]` for fields the maker fills. | every `{{token}}` → its value **or `—`** (so none survive); the `[placeholders]` stay for the maker. | Masters are **de-customized copies of the real filled reference docs**; tokens `lib/mom-sp3-tokens.ts`. |

**MUAP/RSK engine** — `server/docs/seed.ts` (`fillApplicationDoc`, `FACT_RESOLVERS`), wired into
`createApplicationDocs`. `seed.ts` is the single module (V1 `buildFactMap` + the orphaned `seed-v2.ts` were
deleted at the V3 cutover). Gating fields (per-aspect risk level, recommendation, committee verdict, approved
terms) are **excluded by design** (`assertSafeTokens`) — they live on SP3/MoM, not the analysis docs.

**MoM/SP3 engine** — `server/docs/mom-sp3.ts` (`generateMomSp3Doc`) + `buildMomFill`/`buildSp3Fill`. The masters
were authored by copying each real filled reference, then de-customizing: Mizan-known → `{{token}}`,
customer-specific data → `[human placeholder]`, generic legal boilerplate kept verbatim, and the per-case MoM
committee tables (deviasi / rekomendasi risk) emptied to a blank fillable grid. **Leak-safety** is enforced by a
**denylist scan** in the authoring script (`scripts/author-momsp3-masters.ts`) that fails if any example-customer
marker (names, company, address, amounts, dates, doc refs) survives.

**Signing-date rule (MUAP/RSK).** The *signing* date (`tanggal_muap` / `tanggal_rsk`) is **not** creation-time.
It resolves `null` (→ placeholder stays) until the approval ladder is **fully signed** (`chainState === 'complete'`),
then is filled with the **last (completing) signature's date** — not `now`, not the first signature. The
submission date (`tanggal_pengajuan`) is distinct and known at creation.

## Signing (QR)

- **Token:** long, **cryptographically-random, unguessable** (verification-token class, e.g. 32 bytes
  base64url), **unique per (signer × document version)**, **never reused**. It is *not* consumed on scan — a
  signed-doc QR stays verifiable for the document's life; "single-use" = one token ↔ one signature event, never
  recycled. Unguessability blocks enumeration and future-proofs a semi-public verify.
- **Payload:** the QR encodes `https://mizan.hijra.id/qr/<token>`.
- **Image:** `insertInlineImage` cannot take base64 (URI ≤ 2 kB + must be a Google-fetchable public URL), so the
  QR is rendered via a **free external QR API** Google can fetch (`api.qrserver.com`; fallback QuickChart). The
  service only ever sees the **opaque, no-PII** URL; Google fetches the PNG once and stores its own copy.
- **Verify page = internal (auth-walled)** `/qr/<token>` → resolve token → `ApprovalStep` → show signer + role ·
  timestamp · document + version · valid/superseded.
- **Anchors:** `stampSignatureQr` (`server/docs/qr-stamp.ts`, run from `approval.ts` on each rung) inserts the QR
  at the NamedRange named by `SIG_SLOT_OF_APPROVAL_ROLE` (`lib/approval-desks.ts`). All seven slots were created
  + verified 2026.06.08 (MUAP `tanggal_ttd_{rm,tl_spv,bm_ku}`, RSK `rsk_sig_{analyst,officer,cro}_tanggal` +
  `rsk_dps_tanggal`) — see the register for the list. QR = traceable internal attestation, **not** e-meterai; the
  Akad notaris instrument is the separate legally-binding act.

## Read-back (extraction) / AI analysis

- **Structured extraction — the live read-back.** The analyst authors fields that **originate in the Doc**: the
  RSK 5C+2S risk matrix (`level` / `finding` / `mitigation` — the **level is human-only** per OJK), MUAP
  financial ratios, collateral summary, RAC deviations. `extractApplicationDocs` (`server/google/extract/`)
  reads them via NamedRange + sentinel-text fallback into an `ExtractedSnapshot`, persisted as an `ExtractionRun`;
  the **"Sinkronkan dari Dokumen"** button (`components/application/docs/DocsPanel.tsx`) triggers it. The
  snapshot is **consumed**: the 5C+1S score preview (`lib/scoring-from-extracted.ts` → `ExtractionPreview`) and
  the **AI assistant prompt context** (`server/ai/context.ts` `snapshotBlock`, wired into both
  `app/api/applications/[id]/ai/route.ts` and `server/actions/ai-chat.ts`; PII-masked by the answer pipeline).
  This is the read-back that is live — it is **not** the dropped fill round-trip.
- **Markdown export — built but unwired.** `exportDocMarkdown` (`server/docs/service.ts`) exports a linked Doc to
  markdown (integration-tested in `docs-export.itest.ts`); **no production consumer yet** — a candidate to
  replace sentinel parsing for the AI-analysis path later.
- **PDF export** at the committee-decision freeze → SeaweedFS + `decisionCheckpoint` (id + SHA-256). The signed
  PDF is the audit artifact; the QR lives on it (and on the Doc).

## Four documents — status (2026.06.08)

| Doc | Convention | Status |
|---|---|---|
| **MUAP** | `[bracket]` (V3) | wired — core facts authored on the RAW master; QR anchors created. AI 5C+1S narrative now seeds an **editable draft** under each analysis section (8 slots placed on master 2026.06.10, ADR-0017 — see note). |
| **RSK** | `[bracket]` (V3) | wired — facts authored; §IX QR anchors created. |
| **MoM** | `{{token}}` | rebuilt from the real reference doc; de-customized + denylist-clean; smoke-tested. |
| **SP3** | `{{token}}` | rebuilt from the real reference doc; de-customized + denylist-clean; smoke-tested. |

> **Creation triggers** (who/when + AI-assist) → [`ai-assist.md`](ai-assist.md) §"Document creation triggers":
> MUAP **RM-invoke** · RSK **auto** on Risk-desk entry · SP3 **approved→auto / conditional→RM-invoke** · MoM **invoke** (no AI).

> **Narrative note — REVISED 2026.06.10 (ADR-0017), supersedes the 2026.06.08 posture below.** The **MUAP**
> master now carries the 8 consolidated 5C+1S narrative slots (`[Ringkasan Usulan]`, `[Analisis Character/
> Capacity/Capital/Condition/Collateral/Aspek Syariah]`, `[Narasi Tujuan Pembiayaan]`), each placed as a
> labelled **"📝 Draf analisa AI (sunting/lengkapi sebelum finalisasi)"** paragraph under its analysis section
> (`scripts/place-narrative-slots.ts`). `generateMuapNarrative` → `seed.ts` `replaceAllText` now fills them, so
> the AI seeds an **editable first draft** the analyst owns and edits before freeze (the analyst remains author
> of record; the granular human prompts stay alongside as guidance). Live IDs/backup: `document-templates.md`.
>
> *Prior posture (2026.06.08, now superseded):* the templates carried no 5C+1S narrative slots — only granular
> human-fill prompts — so AI narratives were not doc-filled and the registry tokens were harmless no-ops. **RSK
> narratives remain not-doc-filled** (only MUAP got the slots); RSK keeps its granular prompts.

## Dropped (do not build)

- **Bidirectional fill round-trip + lost-in-doc machinery** — writing Mizan→Doc then re-syncing Doc→Mizan to keep the *fill* in sync. Irrelevant once fill is one-way and the Doc belongs to the maker. **NB:** this is **not** the structured read-back extraction of analyst-authored fields (matrix/ratios), which is **live** — see "Read-back".
- **Tokenize-every-blank / the 644-token NamedRange registry** — replaced by the curated value-or-placeholder model.
- The V2 walkthroughs (`muap-v2-tokenization.md` / `rsk-v2-tokenization.md` / `muap-template-engine-v2.md`) remain
  as **historical reference** for the section layout only; their fill mechanism is superseded.

## Pointers

- Decision: [`../decisions/0013-docs-generation-v3-replace-all-text.md`](../decisions/0013-docs-generation-v3-replace-all-text.md).
- Operational register (IDs · tokens · scripts · QR slots): [`../references/document-templates.md`](../references/document-templates.md).
- MUAP layout ("what"): [`../references/muap-template.md`](../references/muap-template.md). Engine in workflow: `workflow-engine.md`.
- OAuth: `../guides/google-docs-oauth.md`. OCR: `../guides/document-ai-ocr.md`.
