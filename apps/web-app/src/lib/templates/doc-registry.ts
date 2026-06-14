// V3 docs-generation registry — the SINGLE source of truth for which variables Mizan fills
// into the MUAP/RSK Google Docs, and the unique human placeholder that is BOTH the resting
// state in the master AND the `replaceAllText` target. See docs/designs/document-system.md (V3),
// ADR-0013, and docs/references/document-templates.md (live IDs/tokens).
//
// Leak-proof model: the master contains ONLY these bracketed placeholders (no `{{token}}` syntax).
// Fill replaces a placeholder with its value when Mizan knows it; otherwise the placeholder stays,
// so the user always sees a value or the document's own human prompt — never a raw token.
//
// Scope = exactly what Mizan knows: facts (SeedContext) + masked AI narratives. Gating values
// (risk level, recommendation, committee verdict, approved terms) are NOT variables — they stay as
// the template's own placeholders for a human to fill (enforced by assertSafeTokens in the engine).

export type DocTemplate = 'muap' | 'rsk'

// fact         — deterministic, from SeedContext/app (formatted server-side; never AI).
// narrative    — AI-drafted prose (masked, never gating). `name` equals the generator output key.
// signing-date — filled ONLY when the approval ladder is fully signed, with the LAST signature's
//                date (not `now`, not the first signature). Resolves to null → placeholder until then.
export type DocVarKind = 'fact' | 'narrative' | 'signing-date'

// V3 fills via `replaceAllText` on a unique `[bracket]`. V3.5 (Batch 4) adds `namedRange` for slots
// the master writes as underscore blanks (`Rp ____,-`, `___ Bulan`, `______/MUAP-MKT/___/20___`) which
// `replaceAllText` can't anchor — those carry a NamedRange (created once on the master) read+filled at
// runtime (deleteContentRange+insertText). Spike-proven GO 2026.06.10 (survives files.copy + fills clean).
export type DocFillMethod = 'placeholder' | 'namedRange'

export interface DocVar {
  /** Internal token name (never shown in the doc) — the resolver key in seed.ts. */
  name: string
  /** The unique bracketed placeholder in the master — resting state + replaceAllText target.
   *  For `namedRange` vars this is just a human label (the NamedRange is the real fill target). */
  placeholder: string
  templates: DocTemplate[]
  kind: DocVarKind
  /** Fill mechanism — default 'placeholder' (V3 replaceAllText). */
  method?: DocFillMethod
  /** NamedRange name on the master (required when method='namedRange'). One range PER occurrence. */
  namedRange?: string
}

const BOTH: DocTemplate[] = ['muap', 'rsk']

// ── Facts (SeedContext + app) ───────────────────────────────────────────────────
// GROUNDED to the live masters (2026.06.10 reconciliation): each var's `templates` lists ONLY the
// template whose master actually contains its [bracket]. Vars whose bracket exists in NEITHER master
// were RETIRED — the live v2.0 masters are narrative analyst templates that express most facts
// (DSR/LTV/Kol/income/angsuran/plafond-value/tenor-value/jenis_agunan/no_aplikasi/jenis_nasabah/
// return_label) as analyst prose or NamedRange values, not [bracket] facts; that data still feeds the
// AI narrative context via SeedContext. Enforced by template-coverage/ + scripts/coverage-report.ts.
const FACT_VARS: DocVar[] = [
  // Present in BOTH masters
  { name: 'nama_perusahaan', placeholder: '[Nama Perusahaan Pemohon]', templates: BOTH, kind: 'fact' },
  { name: 'akad', placeholder: '[Jenis Akad]', templates: BOTH, kind: 'fact' },
  { name: 'plafond_terbilang', placeholder: '[Plafond Terbilang]', templates: BOTH, kind: 'fact' },
  { name: 'nomor_npwp', placeholder: '[Nomor NPWP]', templates: BOTH, kind: 'fact' },
  { name: 'nomor_nib', placeholder: '[Nomor NIB]', templates: BOTH, kind: 'fact' },
  // MUAP-only
  { name: 'nama_nasabah', placeholder: '[Nama Nasabah]', templates: ['muap'], kind: 'fact' },
  { name: 'tujuan', placeholder: '[Tujuan Pembiayaan]', templates: ['muap'], kind: 'fact' },
  { name: 'nama_rm', placeholder: '[Nama RM]', templates: ['muap'], kind: 'fact' },
  { name: 'tanggal_pengajuan', placeholder: '[Tanggal Pengajuan]', templates: ['muap'], kind: 'fact' },
  { name: 'alamat_legal', placeholder: '[Alamat Sesuai Dokumen Legalitas]', templates: ['muap'], kind: 'fact' },
  { name: 'bidang_usaha', placeholder: '[Bidang Usaha Utama]', templates: ['muap'], kind: 'fact' },
  // RSK-only (the RSK master keeps these as [bracket] facts; MUAP expresses them as prose/NamedRange)
  { name: 'plafond', placeholder: '[Plafond yang Diajukan]', templates: ['rsk'], kind: 'fact' },
  { name: 'tenor', placeholder: '[Jangka Waktu]', templates: ['rsk'], kind: 'fact' },
  { name: 'return_rate', placeholder: '[Margin/Nisbah]', templates: ['rsk'], kind: 'fact' },
  { name: 'nilai_agunan', placeholder: '[Nilai Agunan]', templates: ['rsk'], kind: 'fact' },
]

// ── Signing date (filled at ladder-complete, with the last signature's date) ──────
// tanggal_muap retired: the MUAP master has no [Tanggal MUAP] bracket — the MUAP date fills via the
// V3.5 NamedRange (tanggal_doc). RSK keeps its [Tanggal RSK] bracket.
const SIGNING_DATE_VARS: DocVar[] = [
  { name: 'tanggal_rsk', placeholder: '[Tanggal RSK]', templates: ['rsk'], kind: 'signing-date' },
]

// ── AI narratives — MUAP (name = generator output key from server/ai/narrative.ts) ─
// These [brackets] now live on the MUAP master (placed 2026.06.10, ADR-0017 — scripts/place-narrative-slots.ts),
// so they FILL as an editable AI draft under each analysis section. (Pre-2026.06.10 they were no-ops — absent
// from the master.) RSK narratives below remain not-doc-filled (no slots on the RSK master).
const MUAP_NARRATIVE_VARS: DocVar[] = [
  { name: 'm_ringkasan_usulan', placeholder: '[Ringkasan Usulan]', templates: ['muap'], kind: 'narrative' },
  { name: 'm_tujuan_naratif', placeholder: '[Narasi Tujuan Pembiayaan]', templates: ['muap'], kind: 'narrative' },
  { name: 'm_character', placeholder: '[Analisis Character]', templates: ['muap'], kind: 'narrative' },
  { name: 'm_capacity', placeholder: '[Analisis Capacity]', templates: ['muap'], kind: 'narrative' },
  { name: 'm_capital', placeholder: '[Analisis Capital]', templates: ['muap'], kind: 'narrative' },
  { name: 'm_condition', placeholder: '[Analisis Condition]', templates: ['muap'], kind: 'narrative' },
  { name: 'm_collateral', placeholder: '[Analisis Collateral]', templates: ['muap'], kind: 'narrative' },
  { name: 'm_syariah', placeholder: '[Analisis Aspek Syariah]', templates: ['muap'], kind: 'narrative' },
]

// ── AI narratives — RSK (7 aspects × finding/mitigation; name = generator output key) ─
const RSK_ASPECT_LABEL: Record<string, string> = {
  character: 'Character',
  capacity: 'Capacity',
  capital: 'Capital',
  condition: 'Condition',
  collateral: 'Collateral',
  sharia_compliance: 'Kepatuhan Syariah',
  sharia_structuring: 'Struktur Syariah',
}
const RSK_NARRATIVE_VARS: DocVar[] = Object.entries(RSK_ASPECT_LABEL).flatMap(([key, label]) => [
  { name: `${key}_finding`, placeholder: `[Temuan ${label}]`, templates: ['rsk'] as DocTemplate[], kind: 'narrative' as const },
  { name: `${key}_mitigation`, placeholder: `[Mitigasi ${label}]`, templates: ['rsk'] as DocTemplate[], kind: 'narrative' as const },
])

// ── V3.5 NamedRange fills — MUAP underscore slots (Batch 4) ─────────────────────────
// Slots the master writes as underscore blanks (no `[bracket]` anchor). Each OCCURRENCE gets a
// distinct NamedRange (created on the master by scripts/setup-v35-namedranges.ts). Resolver keys
// (name) map to V35_RESOLVERS in seed.ts. plafond/tenor ranges cover only the underscore run (the
// `Rp `/`,-`/` Bulan` literals stay); No MUAP / Tanggal ranges cover the whole composite blank.
const V35_NAMEDRANGE_VARS: DocVar[] = [
  { name: 'no_muap', placeholder: '(No. MUAP — cover)', templates: ['muap'], kind: 'fact', method: 'namedRange', namedRange: 'muap_no_muap_cover' },
  { name: 'no_muap', placeholder: '(No. MUAP — identitas)', templates: ['muap'], kind: 'fact', method: 'namedRange', namedRange: 'muap_no_muap_identitas' },
  { name: 'tanggal_doc', placeholder: '(Tanggal — cover)', templates: ['muap'], kind: 'fact', method: 'namedRange', namedRange: 'muap_tanggal_cover' },
  { name: 'tanggal_doc', placeholder: '(Tanggal — identitas)', templates: ['muap'], kind: 'fact', method: 'namedRange', namedRange: 'muap_tanggal_identitas' },
  { name: 'plafond_value', placeholder: '(Plafond — fasilitas)', templates: ['muap'], kind: 'fact', method: 'namedRange', namedRange: 'muap_plafond_facility' },
  { name: 'plafond_value', placeholder: '(Plafond — rekomendasi)', templates: ['muap'], kind: 'fact', method: 'namedRange', namedRange: 'muap_plafond_recommendation' },
  { name: 'tenor_value', placeholder: '(Tenor)', templates: ['muap'], kind: 'fact', method: 'namedRange', namedRange: 'muap_tenor' },
]

export const DOC_VARS: DocVar[] = [
  ...FACT_VARS,
  ...SIGNING_DATE_VARS,
  ...MUAP_NARRATIVE_VARS,
  ...RSK_NARRATIVE_VARS,
  ...V35_NAMEDRANGE_VARS,
]

export function docVarsFor(template: DocTemplate): DocVar[] {
  return DOC_VARS.filter((v) => v.templates.includes(template))
}
