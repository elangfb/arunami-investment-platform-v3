# MUAP/RSK tokenization playbook — methodology for deriving tokens from a template

> ⚠️ **SUPERSEDED by V3 (2026.06.08)** — the production fill mechanism is now ADR-0013 / [`document-system.md`](./document-system.md) (`[bracket]` placeholders + `replaceAllText`, not `{{token}}` NamedRanges); live facts in [`../references/document-templates.md`](../references/document-templates.md). Kept as the methodology record for deriving tokens from a template, should a future template need it.

**Audience**: future AI session (or human) who needs to:
- Re-tokenize the MUAP v2 template after upstream changes
- Tokenize the RSK template (same engine, separate token catalog)
- Tokenize any new MUAP-like template from a Google Docs reference
- Verify an existing tokenization

This doc captures the **HOW** (process). For **WHAT** (the actual rev-2.2 tokens), see [muap-v2-tokenization.md](./muap-v2-tokenization.md).

## TL;DR — the protocol

```
1. SCAN the template Doc to extract every placeholder position
2. VISUAL inspection of the Doc as PDF for section semantics
3. CATEGORIZE every cell using A/B/C/D/E/F framework
4. NAME tokens following the conventions (snake_case + suffixes + `ai_` prefix)
5. CROSS-CHECK every PDF bracket against proposed tokens (TWO passes minimum)
6. CAPTURE corrections + renames + consolidations in errata
7. HUMAN review at each pass; surface decisions when ambiguous
```

Single-pass tokenization is almost always wrong. Expect 2-3 recheck passes.

## Step 1 — SCAN

**Tool**: `apps/web-app/scripts/scan-muap-braces.ts`

**Run**:
```bash
pnpm --filter web-app exec tsx scripts/scan-muap-braces.ts <docIdOrUrl>
```

**What it captures** (per cell with `[T# r# c#]` location):
- `{{token}}` — already-tokenized fill literal
- `${{token}}` / `${{/token}}` — legacy extraction sentinels (live MUAP only — v2 has none)
- `[Bracketed guidance]` — human author hints, fillable placeholder
- `____` — blank-underscore fillable placeholder

**Auto-converts .docx → Google Doc** if needed (via Drive `files.copy` with `mimeType: 'application/vnd.google-apps.document'`).

**Gotcha** (learned the hard way): the bracket regex MUST be lazy and unbounded — `/\[(.{3,}?)\]/g`. The previous bounded version `/\[([^\[\]\n]{3,200})\]/g` silently dropped narrative guidance blocks >200 chars and we missed 11 tokens. **Never reintroduce an upper bound** without considering this.

## Step 2 — VISUAL inspection (PDF)

The scan gives you cell positions but NOT semantic labels (because Google Docs paragraphs in the MUAP template don't use proper HEADING_N style — section names are formatted text, not heading style). You CAN'T derive semantic token names from scan alone.

**Tool**: `apps/web-app/scripts/export-doc-pdf.ts`

**Run**:
```bash
pnpm --filter web-app exec tsx scripts/export-doc-pdf.ts <docId> /tmp/output.pdf
pdftotext -layout /tmp/output.pdf /tmp/output.txt
```

**Why PDF + pdftotext** (not Playwright):
- No browser auth flow needed (Drive export uses OAuth API)
- pdftotext preserves table column alignment via `-layout`
- Output is plain text — easy to grep, easy for AI to read
- Tested on References Doc: produces ~1000 lines of structured text

**What you do with PDF text**:
- Map scan-reported `[T# r# c#]` to actual column headers + row labels
- Resolve ambiguities (e.g. "T43 is Neraca or Laba Rugi?" — rev-2 had them swapped)
- Identify section names (HEADING_N replacement)
- Spot patterns scan missed (composite cells, fixed-text presentational labels, etc.)

**Gotcha**: scan-table-index (T#) DOES NOT always match doc-order. Tables may have hidden rows or be visually merged. Trust PDF for semantics; trust scan for cell coordinates.

## Step 3 — CATEGORIZE every cell

Use this framework. Apply ONE category per atom (sub-cell):

| Cat | Description | Token convention | Examples |
|---|---|---|---|
| **A** | Fact — single data point | `{{name}}` | `{{plafond}}`, `{{tanggal}}`, `{{no_npwp}}` |
| **B** | Categorical — pick one from enum | `{{name_or_X}}` if binary; `{{name}}` (with `enum` registry field) if ≥3 | `{{nasabah_baru_or_lama}}` (binary); `{{kehalalan_usaha}}` (Halal/Halal Bersyarat/Perlu Klarifikasi) |
| **C** | Narrative — AI-authored prose (1+ sentences) | `{{ai_name}}` | `{{ai_industri_overview}}`, `{{ai_pefindo_narrative}}` |
| **D** | Composite — multiple fields in one cell | Decompose to multiple tokens | `SHM/SHGB ___ a.n. ___ di [Lokasi]` → 4 separate tokens |
| **E** | Presentational — static label/header/divider | NOT a variable, leave alone | Column headers, "TOTAL", `Per Desember`, `Rp`, `%`, fixed labels |
| **F** | Pseudo-blank — `-`, `—` ambiguous | Case-by-case judgment | "-" in optional column = could be A with default `-` OR E |

### How to categorize tricky cases

**Composite cells (D)** like `[Jenis Agunan] — SHM/SHGB ___ a.n. ___ di [Lokasi]`:
- Identify each variable part: jenis (categorical), no_sertifikat (fact), atas_nama (fact), lokasi (fact)
- Create one token per variable part
- Fixed connectors ("—", "a.n.", "di") are E

**Categorical hints in `[brackets]`** like `[Modal Kerja / Investasi]`:
- "/" inside brackets = pick-one (B)
- For binary, encode in name with `_or_X` suffix: `{{modal_kerja_or_investasi_1}}`
- For 3+ options, plain name + `enum` registry: `{{kehalalan_usaha}}` with values `['Halal', 'Halal Bersyarat', 'Perlu Klarifikasi']`

**Narrative cells (C)**: look for cue words `[Uraikan…]`, `[Jelaskan…]`, `[Tuliskan…]`, `[Berikan narasi…]`, `[Cantumkan catatan…]`, `[Deskripsikan…]`, `[Pastikan…]`, `[Analisis…]`. These ALWAYS get `ai_` prefix.

**Long bracketed text spanning multiple lines** in PDF — these are narrative cells, not multi-field. Single `ai_*` token.

**Em-dash `—` (F)**: usually means "not applicable here" in a column where other rows have values. Treat as E (presentational dash) unless context shows analyst can fill.

**Fixed labels misread as variables**: phrases like "Direktur / Komisaris" in the Jabatan column of T17 are NOT categorical placeholders — they're column-position descriptors (r1 = direktur slot, r2 = komisaris slot). The token VALUE goes in the cell.

## Step 4 — NAME tokens

### Hard rules

1. **`snake_case`** lowercase. No abbreviations unless established (`no`, `nib`, `npwp`, `kbli`, `slik`, `ojk`, `ahu`, `kap`, `rab`, `sccr`, `ltv`, `dsr`, `dscri`, `gpm`, `npm`, `roa`, `roe`).
2. **`ai_` prefix** ONLY for narrative cells (kind=`narrative-ai`). Engine routes these through masking pipeline.
3. **`_N` suffix** for fixed-row table positions: `nama_pelanggan_1`, `kota_pelanggan_2`. Numbered from 1.
4. **`_or_X` suffix** for binary categoricals — encode both options in name: `nasabah_baru_or_lama`, `sesuai_or_tidak_dengan_riil`.
5. **Reuse existing tokens** when same value appears in multiple places (don't create `nama_perusahaan_t21`; just reuse `nama_perusahaan`).

### Soft rules (style)

- Token name should match PDF column header / row label (not the placeholder hint inside brackets)
- Avoid generic names like `keterangan_1` — be specific: `keterangan_pelanggan_1`, `keterangan_perubahan`, `keterangan_supplier_1`
- For percentages: `persen_X` (not `pct_X` or `percentage_X`)
- For currency: `nilai_X` or domain-specific (`plafond_X`, `baki_debet_X`, `harga_X`)
- For dates: `tanggal_X` (specific date) or `periode_X` (period/range)
- For multi-row tables, decide naming style:
  - Field-first + `_N` suffix: `nama_pelanggan_1`, `kota_pelanggan_1`
  - NOT: position-first `pelanggan_1_nama` (inconsistent with T7 existing pattern)

### Common naming mistakes (from rev 2.x reviews)

| Mistake | Fix |
|---|---|
| Naming by placeholder hint instead of column label | Read PDF column header carefully. `nama_kontrak_selesai_1` (wrong) vs `bouwheer_selesai_1` because PDF column is "Bouwheer / Pelanggan" |
| Wrong polarity | "Proporsi Pendapatan Halal" → `persen_halal_income` (not `persen_non_halal_income`) |
| Wrong concept | "Biaya Administrasi Pembiayaan flat" → `biaya_administrasi_pembiayaan_flat` (not `total_angsuran_flat`) |
| Wrong column ordering | T21: PDF columns are c1=Nama, c2=Baki Debet, c3=Kol, c4=Lembaga, c5=Keterangan. Trust PDF, not scan-coord assumption |
| Boolean instead of categorical | Form usulan: 3 checkboxes (Baru/Perpanjangan/Tambahan) → `kategori_fasilitas` (3-value), NOT `is_tambahan_line_facility` (boolean) |
| Putting concept in wrong row | "Gharar / Riba / Maysir" belongs in T61 r5 (Akad Pembiayaan), NOT T63 r4 (Aspek Syariah, which is Pelanggaran Syariah) |
| Adding `ai_` prefix to short fact text | T31 day-buckets `[Hari ke-1]` = short fact, drop `ai_` prefix |

## Step 5 — CROSS-CHECK (multiple passes)

Single-pass tokenization will miss 5-10% of variables and have 10-20% naming errors. Run AT LEAST 2 recheck passes.

### Pass 1 (after initial walkthrough)

Cross-check:
- Every section in PDF has a matching section in walkthrough
- Every PDF cell with a `[...]` or `___` has a proposed token
- Every proposed token has correct category (A/B/C/D)
- No duplicate token names
- Existing tokens (from upstream) properly reused, not recreated

Tool:
```bash
grep -c "\[" /tmp/muap-references.txt
# vs count of tokens in walkthrough
```

### Pass 2 (semantic verification)

For EVERY proposed token, ask:
- Does the token name match the PDF row label / column header?
- Is the polarity correct (halal vs non-halal, audited vs inhouse)?
- Is the column ordering correct (c1 = first column not nth)?
- Is the section name correct (e.g. T70 is "BIAYA-BIAYA" not "Total Angsuran")?
- Are similar concepts in different sections truly distinct, or should they reuse a single token?

### Pass 3 (only if domain complexity warrants)

Walk through walkthrough WITH human, surface every section heading + token, ask "this token in this position — is this correct?"

### Verification methodology (recommended for any pass)

1. Dump all bracket-lines: `grep -n "\[" /tmp/output.txt > /tmp/all-brackets.txt`
2. Count them: `wc -l /tmp/all-brackets.txt` (e.g. 115 for MUAP References)
3. For each line, find the proposed token in walkthrough doc
4. Tick off each. Anything unaccounted = miss to add.
5. For each ticked token, verify name semantically matches PDF context.

## Step 6 — CAPTURE corrections

Every recheck pass that finds corrections gets an **errata section** at top of walkthrough doc, named "Rev X.Y" with date.

**Errata sections must include**:
- What was found (with PDF line refs)
- Whether it's NEW token, RENAME, CONSOLIDATION, or POSITION FIX
- Why it was missed (so future passes don't repeat the mistake)
- Updated final count

**Don't rewrite affected sections inline** — leave the original mistake visible AND add the correction in errata. This creates an audit trail.

Example errata structure (from rev-2.1):
```markdown
## Rev 2.1 recheck findings (cell-by-cell PDF verification)

### A. New tokens that were missed entirely
[table]

### B. Token name corrections
[table with old → new]

### C. Position correction
[detail]
```

## Step 7 — HUMAN review

Some decisions cannot be made from PDF + scan alone. Surface as numbered open-questions list.

**Decisions that need human input**:
- Whether a "—" cell is fillable (F category resolution)
- Whether to use binary `_or_X` naming for 3+ option categoricals
- English vs Bahasa enum values (e.g. T82 `SETUJU` vs `Approve`)
- Strict reuse vs distinct per-section (T83 redundancy)
- Whether an optional column should be tokenized (e.g. T36 status: pre-determined by row position OR per-row analyst entry)
- Whether to fix typos in existing tokens or preserve them
- Naming style for positional rows (field-first `_N` vs position-first prefix)

**How to surface**: numbered list at end of walkthrough, with default proposal + recommendation reasoning.

## Common pitfalls (consolidated from rev 2.x reviews)

### Pitfall 1 — Trust scan blindly
Scan misses content the bracket regex couldn't capture (long narratives), and reports merged-cell positions that don't map cleanly to PDF row/col. Always cross-reference PDF.

### Pitfall 2 — Skip the post-table narrative blocks
Every table is followed by 1-2 narrative blocks (between sections). Easy to miss because they're not in tables. Search for `[Uraikan…]`, `[Jelaskan…]`, `[Tuliskan…]`, `[Berikan…]`, `[Cantumkan…]`, `[Analisis…]`, `[Pastikan…]` in PDF.

### Pitfall 3 — Assume one narrative per section
Some sections have TWO narratives: one between sub-sections + one at the end. Example: VIII. ASPEK SYARIAH has `ai_syariah_opini_narratif` (post-T61, before T63) AND `ai_kehalalan_pendapatan_pastikan` (post-T63).

### Pitfall 4 — Misidentify section tables
T-indices from scan don't tell you the table's purpose. Always verify table identity from PDF before proposing token names:
- T35 was misidentified as "Supplier" — actually "Pekerjaan/Kontrak Selesai"
- T36 was misidentified as "Aset" — actually "Progress & Upcoming Pekerjaan"
- T38 was misidentified as "Utang-Piutang" — actually "Supplier/Vendor/Pemasok Utama"
- T43/T45 were SWAPPED — T43 is Laba Rugi (9 rows), T45 is Neraca (13 rows)
- T70 was misidentified as "Total Angsuran" — actually "BIAYA-BIAYA"

### Pitfall 5 — Treat sample rows as Example/E
Rev-2 treated T86 r1 as "sample" (E) because reference text says `[Contoh: SLIK Pengurus]`. Actually r1 IS real data — the bracket text is just a hint about what to write. Same trap for other "Contoh:" prefixes. Read the FULL bracket text, not just the prefix.

### Pitfall 6 — Boolean vs 3-value categorical
Form usulan checkboxes "☐ Baru ☐ Perpanjangan ☐ Tambahan" = THREE checkboxes, not one. Token must be 3-value categorical, not boolean.

### Pitfall 7 — Skip rows because scan didn't capture them
T47 (Rasio Keuangan) scan only showed the header row because data cells use a styling that bracket regex doesn't catch. PDF inspection revealed 13 rasio rows that all need tokens. Setup script will need to WRITE `{{token}}` text into empty cells (not just wrap existing).

### Pitfall 8 — Cross-section duplicate concepts
Plafond, tenor, equivalent% appear in multiple sections (T6, T66, T68, T83). Decide consolidation policy:
- Strict reuse (RECOMMENDED): one canonical token, fill once, render in multiple Doc positions via duplicate NamedRange. Saves ~4-10 tokens. Risk: app must know which section a NamedRange refers to.
- Distinct per-section: simpler per-cell mapping but redundant fills. More sync risk.

### Pitfall 9 — Position-bound rows
T17 (shareholders): r1 is hardcoded to Direktur slot, r2 to Komisaris slot. Tokens `nama_jabatan_direktur` / `nama_jabatan_komisaris` are correct as long as rows are position-bound. If template later allows arbitrary order, naming becomes misleading.

### Pitfall 10 — Trend column ↑/↓
T43, T45, T47 have a "Tren" column with ↑/↓ symbols. These are visual indicators, possibly auto-derived from periode values. Treat as E unless analyst explicitly fills them.

### Pitfall 11 — Inventing cross-template "promotions" to satisfy reads (CRITICAL)
**The most-repeated mistake** — three occurrences caught in RSK rev 1.1, rev 2, rev 2.1. When a cross-template walkthrough (e.g. RSK) claims `[muap]` reuse for a field, the natural temptation when the cited MUAP token doesn't exist is to "promote" the concept to MUAP. **DO NOT DO THIS.** Templates are the literal source of truth; if MUAP template doesn't contain the field, MUAP doesn't get the token. The cross-template walkthrough owns the field instead (e.g. `rsk_*` R2/R3 token on the RSK side).

The pattern that triggers this pitfall:
1. RSK §X cell references something like "Cashflow Operasional" or "Status Pajak"
2. Walkthrough author writes "reuse MUAP `cfo_*` / `status_pajak_or`" (wishful naming)
3. Audit grep'ing MUAP rev 2.2 finds the token doesn't exist
4. Lazy fix: "OK let's promote it to MUAP rev N+1"
5. **WRONG** — go back to the MUAP TEMPLATE (not the walkthrough) and verify the concept actually exists there
6. If it doesn't exist in MUAP template → it's NOT a MUAP field → reclassify as cross-template-owned (e.g. RSK-owned `rsk_*`)
7. If it DOES exist in MUAP template but rev 2.2 walkthrough missed it → that's a legitimate walkthrough catch-up (rare; verify with grep before claiming)

Concrete checks before proposing any "MUAP rev N promotion":
- `grep -in "<concept keyword>" /tmp/muap-ref.txt` — must hit a bracket/blank cell, not just narrative mention
- "Narrative mention" ≠ "tokenizable cell". MUAP `[Berikan narasi DSCRi…]` describes cashflow CONTENT but is one narrative slot, not a structured table
- "Sig-block role" ≠ "named field". `PENGUSUL (RM)` is a sign-off role, not a fillable `nama_ao` cell

Build-time enforcement: T1 token registry script MUST fail-loud on any R1 [muap] claim that doesn't resolve to an existing MUAP token. This is the safety net for when human review misses an invented promotion in a walkthrough.

## Tooling reference

| Tool | Purpose | Path |
|---|---|---|
| Scan diagnostic | Extract placeholder positions from any Doc | `apps/web-app/scripts/scan-muap-braces.ts` |
| PDF export | Doc → PDF for visual inspection | `apps/web-app/scripts/export-doc-pdf.ts` |
| pdftotext (external) | PDF → plain text with layout preserved | `pdftotext -layout` |
| Token registry (planned) | TS source of truth for tokens | `apps/web-app/src/lib/templates/muap-tokens.ts` |
| Token writer (built as apply-token-spec.ts) | Apply walkthrough to live Doc | `apps/web-app/scripts/apply-token-spec.ts` |
| Setup NamedRanges (planned) | Wrap `{{token}}` in NamedRanges | `apps/web-app/scripts/setup-template-ranges.ts` |
| Reference text sync (planned) | Walk Refs Doc → DB cache | `apps/web-app/scripts/sync-reference-texts.ts` |

## Replay protocol for RSK or future templates

To tokenize a new template from scratch following this playbook:

1. **Get the source Doc IDs**: master template + a "references" version with bracket+blank originals (if separate) OR use single Doc that has both placeholders and final structure.
2. **Run scan** → `/tmp/<template>-scan.txt`
3. **Export to PDF** → `/tmp/<template>.pdf` → pdftotext → `/tmp/<template>.txt`
4. **Create walkthrough doc**: `docs/planning/<template>-tokenization.md`
   - Source artifact IDs + OAuth user
   - Categorization legend (copy from this playbook)
   - Naming conventions (copy + adapt if needed)
   - Section by section: scan structure + PDF semantics + proposed tokens
   - Open questions for human
5. **Pass 1 recheck**: cross-check every PDF bracket against proposed token
6. **Pass 2 recheck** (after human feedback): semantic verification
7. **Errata sections** added per pass
8. **Update next-steps doc**: link the new template's walkthrough into the build sequence
9. **Update memory**: add new memory entry pointing to walkthrough + next-steps for that template

## Coverage gate — the mechanical authority

The rev-N walkthrough (Steps 4–7) is advisory. **The coverage gate is authoritative.**

The scanner emits per-cell slot lists where each slot is a `{{token}}`, `[bracket]`, or `____` blank. A **RED slot** is a bracket or blank with no enclosing `{{token}}` literal — it will leak visible junk into filled Docs because `replaceNamedRangeContent` only replaces what's inside a NamedRange. A clean master Doc has **zero RED slots** (excepting a small allow-list of presentational signature blanks).

```bash
pnpm --filter web-app exec tsx scripts/scan-muap-braces.ts <docIdOrUrl>
# look for the "RED slots" report at the bottom — must be 0 for a v2-ready master
```

**Why the gate exists.** Rev 1 → rev 2.4 of MUAP and rev 1 → rev 2.1 of RSK were done top-down by humans reading scanner output table-by-table. Each pass missed cells in headers, footers, and busy multi-slot cells. The walkthrough revisions never converged because there was no mechanical "did I miss anything?" check. The gate converts that question into a tool call.

**Applying a tokenization spec to a Doc.** Once rev-N specifies every token, use `apps/web-app/scripts/apply-token-spec.ts`:

```bash
# 1. Make a Drive copy of the master (safety)
pnpm --filter web-app exec tsx scripts/apply-token-spec.ts copy <masterId>

# 2. Dry-run apply against the copy
pnpm --filter web-app exec tsx scripts/apply-token-spec.ts apply <reconcileFile.md> <copyId>

# 3. Real apply against the copy
pnpm --filter web-app exec tsx scripts/apply-token-spec.ts apply <reconcileFile.md> <copyId> --apply

# 4. Verify zero RED on the copy
pnpm --filter web-app exec tsx scripts/scan-muap-braces.ts <copyId>

# 5. Human inspects copy. When approved, run against real master:
APPLY_TO_MASTER_CONFIRMED=yes pnpm --filter web-app exec tsx scripts/apply-token-spec.ts \
  apply <reconcileFile.md> <masterId> --apply --target-master
```

The `reconcileFile.md` is a per-row map of RED slots → tokens, produced once from the rev-N walkthroughs. Multi-instance same-text slots in one cell are disambiguated by **appearance order**: the i-th reconcile row for `(cell, slotText)` maps to the i-th live hit of that pattern.

**Composite cells.** Some cells have multiple tokens fused inside one bracket (e.g. `[Apakah perlu eskalasi ke DPS?]` → `rekomendasi_dps_or_tidak + ai_rekomendasi_dps_alasan`). The bulk `apply` skips these as `composite-deferred` and a separate `composite` subcommand handles them with whole-cell text replacement using a curated JSON spec.

**Presentational allow-list.** Some `____` blanks are visually meaningful signature lines, not data slots (e.g. MUAP T87 r3 "Tanda Tangan", RSK T33 last `____`). These stay as `____` in the master; the rev doc marks them PRESENTATIONAL and the reconcile carries that classification through. The gate's zero-RED target excludes these.

## Failure modes — when this protocol breaks

| Scenario | Mitigation |
|---|---|
| Template uses HEADING_N styles | Scan will pick them up automatically; PDF inspection becomes less critical |
| Template structure changes mid-tokenization | Re-run scan; compare positions; merge changes |
| Template has dynamic rows (analyst adds rows) | Tokenize the fixed slots; flag dynamic rows as MVP-deferred |
| Two narratives between same two tables | Surface both with distinct names; rev-2 missed one and called the other by wrong position |
| Bank wants to change a token name after build | Token-writer + reference-text-sync scripts must handle renames idempotently; capture in walkthrough errata before applying |
| Reference Doc lost or unavailable | Reference text must be embedded in registry as fallback (not just DB cache) |

## Final mantras

- **TWO recheck passes minimum.** Single-pass is always incomplete.
- **PDF is truth for semantics. Scan is truth for cell coordinates. Walkthrough is truth for design intent.**
- **Trust column header > placeholder hint > bracket text > scan position.**
- **`ai_` prefix is a kind contract, not decoration. Use it only for narrative cells the LLM authors.**
- **Reuse existing tokens. Don't duplicate. Same value across sections = single token, multiple NamedRanges.**
- **Human review at every recheck pass. Surface decisions, don't guess on ambiguity.**
- **Errata sections are an audit trail. Never delete prior mistakes; add corrections on top.**
