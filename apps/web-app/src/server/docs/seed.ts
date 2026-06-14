// Deterministic seeding of a freshly-created MUAP/RSK Google Doc. This module owns the curated
// narrative TOKEN SET and the deterministic FACT resolvers — authoritative numbers (plafond, ratios,
// collateral …) are formatted here and written straight to the Doc; they never pass through the model
// (the compliance separation invariant). `assertSafeTokens` blocks any gating field (risk level /
// recommendation / verdict) from ever being written, even on a caller bug.
//
// Fill mechanism = V3 (ADR-0013 · docs/designs/document-system.md): `fillApplicationDoc` runs one pass
// over the doc registry (lib/templates/doc-registry.ts), `replaceAllText`-ing each var's UNIQUE
// placeholder with its value when Mizan knows it and leaving the placeholder otherwise — so a raw
// token can never reach the user, and one fact map serves both MUAP and RSK (an absent placeholder is
// a no-op). Re-running at the QR/finalize pass fills the signing date and no-ops already-filled vars.
// NamedRanges are NOT the fill primitive; they remain only for QR signature anchors and the
// extraction / risk-matrix sentinels placed by scripts/setup-template-ranges.ts.

import type { docs_v1 } from 'googleapis'
import type { LoanApplication } from '../../lib/types'
import type { SeedContext } from '../../lib/seed-context'
import { akadConfig } from '../../lib/akad-config'
import { formatRupiah, formatTanggal } from '../../lib/sla-utils'
import { withRetry } from '../retry'
import { docVarsFor, type DocTemplate, type DocVar } from '../../lib/templates/doc-registry'
import { terbilang } from '../../lib/terbilang'
import { chainState, currentCycleSteps, type ApprovalChain } from '../../lib/approval-chain'

// ── Token set (single source of truth; the setup script + narrative schema key off these) ──
export const MUAP_NARRATIVE_TOKENS = [
  'm_ringkasan_usulan', 'm_tujuan_naratif',
  'm_character', 'm_capacity', 'm_capital', 'm_condition', 'm_collateral', 'm_syariah',
] as const

// Per-aspect RSK narrative tokens — each maps directly to a matrix-cell NamedRange
// created by the structural locator in setup-template-ranges.ts (`<aspect>_finding`,
// `<aspect>_mitigation`). The `_level` slot is intentionally absent (risk level is
// human-only). Order is stable for tests + UI.
export const RSK_ASPECT_KEYS = [
  'character', 'capacity', 'capital', 'condition', 'collateral',
  'sharia_compliance', 'sharia_structuring',
] as const
export const RSK_NARRATIVE_TOKENS = RSK_ASPECT_KEYS.flatMap(
  (k) => [`${k}_finding`, `${k}_mitigation`] as const,
)

export type MuapNarrativeToken = (typeof MUAP_NARRATIVE_TOKENS)[number]
export type RskAspect = (typeof RSK_ASPECT_KEYS)[number]
export type RskNarrativeToken = `${RskAspect}_finding` | `${RskAspect}_mitigation`

// Defence-in-depth: no token we ever write may name a gating field. The risk-matrix
// LEVELS (`<asp>_level` — physically present as NamedRanges, since the matrix locator
// creates them for extraction) and the decision RECOMMENDATION are human-only (RT/
// Komite per OJK) — assertSafeTokens guards the fill key set so the writer cannot
// touch them even if a caller bug includes one.
const FORBIDDEN_KEY = /level|recommend|rekomendasi|disetujui|ditolak|keputusan|verdict|memenuhi|setuju|tolak/i

export function assertSafeTokens(keys: readonly string[]): void {
  const bad = keys.filter((k) => FORBIDDEN_KEY.test(k))
  if (bad.length) throw new Error(`Refusing to seed forbidden token(s): ${bad.join(', ')}`)
}

// ── Deterministic fact map (no AI) ──────────────────────────────────────────────
// The bank's return per akad family: a rate (margin/ujrah) for flat akad, or a
// nisbah split for profit-share akad.
function returnRate(ctx: SeedContext): string {
  const cfg = akadConfig(ctx.akadType)
  if (cfg.usesNisbah) {
    const b = ctx.nisbahBankPercent ?? ctx.financialInputs.nisbahBankPercent
    const c = ctx.nisbahCustomerPercent ?? ctx.financialInputs.nisbahCustomerPercent
    if (b != null && c != null) return `${b} : ${c} (Bank : Nasabah)`
    return 'sesuai nisbah bagi hasil yang disepakati'
  }
  return ctx.marginRate != null ? `${ctx.marginRate}% per tahun` : '—'
}

// Test/smoke guard: assert a doc's body text has no leftover fill `{{token}}`
// literals — i.e. nothing left behind by an aborted legacy migration. The
// negative lookbehind ignores the extraction sentinels `${{…}}` (hidden 1pt
// white, legitimately present in the doc).
export function assertNoLeftoverTokens(text: string): void {
  const m = text.match(/(?<!\$)\{\{[a-z][a-z0-9_]*\}\}/g)
  if (m?.length) throw new Error(`Unfilled tokens remain: ${[...new Set(m)].join(', ')}`)
}

// ── V3 fill engine (registry-driven replaceAllText) ──────────────────────────────
// One pass over the registry: replaceAllText each var's UNIQUE placeholder with its value when
// Mizan knows it; leave the placeholder otherwise. Value-or-original-placeholder, so a raw token
// can never reach the user; duplicate placeholder occurrences all resolve in one request.
// Idempotent: re-running at the finalize/QR pass fills the signing-date (its placeholder is still
// present), while already-filled facts/narratives are no-ops (their placeholders are gone).

export interface DocFillContext {
  app: LoanApplication
  seed: SeedContext
  /** Masked AI narrative prose keyed by registry var name (generator output); {} on AI-off/failure. */
  narratives: Record<string, string>
  /** Acting RM display name for the signature block; null leaves the placeholder. */
  rmName: string | null
}

const ROMAN_MONTH = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
/** Bare thousands-grouped number (no "Rp", no ",-") — the value for the `Rp ____,-` underscore slot. */
function formatAngka(n: number): string {
  return Math.round(n).toLocaleString('id-ID')
}
/** A best-effort MUAP document number from the app id + draft date: `<seq>/MUAP-MKT/<roman>/<year>`.
 *  seq = the numeric tail of the app id (e.g. FOS-2026-001 → 001). Refine once Mizan tracks a real seq. */
function noMuap(appId: string, now: Date): string {
  const seq = (appId.match(/(\d+)\s*$/)?.[1] ?? '001').padStart(3, '0')
  return `${seq}/MUAP-MKT/${ROMAN_MONTH[now.getMonth()]}/${now.getFullYear()}`
}

// Deterministic fact resolvers, keyed by registry var name. null → Mizan doesn't know it (the
// placeholder stays). Money/ratio facts always resolve (the value is always defined on the app).
const FACT_RESOLVERS: Record<string, (c: DocFillContext) => string | null> = {
  // Facts grounded to a real master [bracket] (retired vars removed — see doc-registry.ts FACT_VARS).
  nama_perusahaan: (c) => c.seed.namaUsaha || c.seed.nasabahName,
  nama_nasabah: (c) => c.seed.nasabahName,
  akad: (c) => c.seed.akadType,
  plafond: (c) => formatRupiah(c.seed.requestedPlafond),
  plafond_terbilang: (c) => `${terbilang(c.seed.requestedPlafond)} rupiah`,
  tenor: (c) => `${c.seed.requestedTenorMonths} bulan`,
  tujuan: (c) => c.seed.purpose,
  return_rate: (c) => returnRate(c.seed),
  nilai_agunan: (c) => formatRupiah(c.seed.financialInputs.collateralAppraisedValue),
  nama_rm: (c) => c.rmName,
  tanggal_pengajuan: (c) => {
    const ts = c.app.history?.length ? new Date(Math.min(...c.app.history.map((h) => +h.timestamp))) : null
    return ts ? formatTanggal(ts) : null
  },
  // ── MUAP IDENTITAS HUKUM — legal-identity facts (null when absent → placeholder stays, leak-proof) ──
  nomor_npwp: (c) => c.seed.npwp ?? null,
  nomor_nib: (c) => c.seed.nib ?? null,
  alamat_legal: (c) => c.seed.alamat ?? null,
  bidang_usaha: (c) => c.seed.bidangUsaha ?? null,
  // ── V3.5 NamedRange slots (Batch 4) — values for the master's underscore blanks ──
  // No. MUAP + Tanggal are OFFICIAL only once the MUAP ladder is fully signed → null until then (the
  // NamedRange stays intact, filled at the finalize re-fill with the LAST signature's date). plafond/
  // tenor are known immediately, so they fill at creation.
  no_muap: (c) => { const d = lastSignatureDate(c.app, 'muap'); return d ? noMuap(c.app.id, d) : null },
  tanggal_doc: (c) => signingDate(c.app, 'muap'),
  plafond_value: (c) => formatAngka(c.seed.requestedPlafond), // bare number → `Rp <here>,-`
  tenor_value: (c) => String(c.seed.requestedTenorMonths), // bare number → `<here> Bulan`
}

const SIGNING_DATE_CHAIN: Record<string, ApprovalChain> = { tanggal_rsk: 'rsk' }

// The LAST signature's Date, ONLY once the ladder is fully signed (else null). NOT `now`, NOT the
// first signature (per the 2026.06.08 rule). The doc becomes OFFICIAL at this instant.
function lastSignatureDate(app: LoanApplication, chain: ApprovalChain): Date | null {
  const ledger = app.approvalSteps ?? []
  if (chainState(chain, ledger).status !== 'complete') return null
  const approvals = currentCycleSteps(chain, ledger).filter((e) => e.action === 'approve')
  const last = approvals[approvals.length - 1]
  return last ? new Date(last.createdAt) : null
}
function signingDate(app: LoanApplication, chain: ApprovalChain): string | null {
  const d = lastSignatureDate(app, chain)
  return d ? formatTanggal(d) : null
}

// Resolve a single registry var to its value, or null (→ leave the placeholder). Exported as a
// test seam so the resolver chain is unit-tested without the Docs API.
export function resolveDocVar(v: DocVar, c: DocFillContext): string | null {
  if (v.kind === 'fact') return FACT_RESOLVERS[v.name]?.(c) ?? null
  if (v.kind === 'narrative') {
    const prose = c.narratives[v.name]
    return prose && prose.trim() ? prose.trim() : null
  }
  const chain = SIGNING_DATE_CHAIN[v.name]
  return chain ? signingDate(c.app, chain) : null
}

export async function fillApplicationDoc(
  docs: docs_v1.Docs,
  documentId: string,
  template: DocTemplate,
  ctx: DocFillContext,
): Promise<{ filled: number; skipped: number }> {
  const vars = docVarsFor(template)
  assertSafeTokens(vars.map((v) => v.name)) // defence-in-depth: no gating var is ever a token

  // PASS 1 — V3 placeholder fills (one batched replaceAllText pass; duplicate placeholders all resolve).
  const requests: docs_v1.Schema$Request[] = []
  for (const v of vars) {
    if (v.method === 'namedRange') continue
    const value = resolveDocVar(v, ctx)
    if (value === null || !value.trim()) continue // leave the placeholder (value-or-placeholder)
    requests.push({ replaceAllText: { containsText: { text: v.placeholder, matchCase: true }, replaceText: value } })
  }
  if (requests.length) {
    await withRetry(
      () => docs.documents.batchUpdate({ documentId, requestBody: { requests } }),
      { label: 'docs.batchUpdate.fill' },
    )
  }

  // PASS 2 — V3.5 NamedRange fills (Batch 4). Run AFTER the replaceAllText pass so text-shift can't
  // invalidate the range indices. Per slot: re-read the range (fresh indices), deleteContentRange +
  // insertText, then READ-BACK VERIFY (fail-loud — never a silent miss). A range absent from the doc
  // (master not yet set up) is skipped gracefully, exactly like the QR-stamp pattern.
  let nrFilled = 0
  const namedRangeVars = vars.filter((v) => v.method === 'namedRange' && v.namedRange)
  for (const v of namedRangeVars) {
    const value = resolveDocVar(v, ctx)
    if (value === null || !value.trim()) continue
    const doc = await withRetry(() => docs.documents.get({ documentId, fields: 'namedRanges' }), { label: 'docs.get.namedRanges.v35' })
    const range = doc.data.namedRanges?.[v.namedRange!]?.namedRanges?.[0]?.ranges?.[0]
    if (!range || range.startIndex == null || range.endIndex == null) continue // master not set up → skip
    const { startIndex, endIndex } = range
    await withRetry(
      () => docs.documents.batchUpdate({ documentId, requestBody: { requests: [
        { deleteContentRange: { range: { startIndex, endIndex } } },
        { insertText: { location: { index: startIndex }, text: value } },
      ] } }),
      { label: `docs.batchUpdate.namedRange.${v.name}` },
    )
    const after = await withRetry(() => docs.documents.get({ documentId, fields: 'body' }), { label: 'docs.get.body.v35verify' })
    if (!docPlainText(after.data).includes(value)) {
      throw new Error(`V3.5 NamedRange fill verify failed: "${v.namedRange}" (${v.name}) — value not found after fill`)
    }
    nrFilled++
  }

  return { filled: requests.length + nrFilled, skipped: vars.length - requests.length - nrFilled }
}

// Flatten a Docs document body to plain text (incl. table cells) for the V3.5 read-back verify.
function docPlainText(doc: docs_v1.Schema$Document): string {
  const out: string[] = []
  const walk = (content: docs_v1.Schema$StructuralElement[] | undefined) => {
    for (const el of content ?? []) {
      for (const pe of el.paragraph?.elements ?? []) if (pe.textRun?.content) out.push(pe.textRun.content)
      for (const row of el.table?.tableRows ?? []) for (const cell of row.tableCells ?? []) walk(cell.content)
    }
  }
  walk(doc.body?.content)
  return out.join('')
}
