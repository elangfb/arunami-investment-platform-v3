/* eslint-disable @typescript-eslint/no-explicit-any -- scratch synthesis over the audit JSON */
// Synthesize the coverage-audit rows into an actionable matrix: dedup, split by class, and (for
// have/derive) flag which fields are ALREADY bound in doc-registry vs NET-NEW work. No app imports.
//   pnpm exec tsx scripts/synth-coverage.ts <auditRaw.json> <outDir>
import { readFileSync, writeFileSync } from 'node:fs'

const [auditPath, outDir = '.tt/template-audit'] = process.argv.slice(2)
const data = JSON.parse(readFileSync(auditPath, 'utf8'))
const rows: any[] = data.result?.rows ?? []

// Fields already filled by doc-registry.ts today (normalized, lowercased core tokens).
const BOUND = new Set([
  'applicationid', 'namausaha', 'nasabahname', 'nasabahtype', 'akadtype', 'requestedplafond',
  'plafond_terbilang', 'requestedtenormonths', 'purpose', 'marginrate', 'nisbahbankpercent',
  'nisbahcustomerpercent', 'proposedmonthlyinstallment', 'hardgates.dsr', 'hardgates.ltv',
  'hardgates.kol', 'collateraltype', 'collateralappraisedvalue', 'netmonthlyincome',
  'existingmonthlyobligations', 'rm name', 'tanggal_pengajuan', 'no. muap', 'tanggal muap/rsk',
  'tanggal muap', 'tanggal rsk', 'nik', 'npwp', 'nib', 'alamat',
])
const normField = (mf: string): string => (mf || '').split(' (')[0].trim().toLowerCase()
const isBound = (mf: string): boolean => {
  const n = normField(mf)
  if (!n) return false
  if (BOUND.has(n)) return true
  if (n.includes('narrative') || n.includes('analisis') || n.includes('analysis')) return true // AI narrative vars
  return [...BOUND].some((b) => n.includes(b) || b.includes(n))
}

const have = rows.filter((r) => r.class === 'have')
const derive = rows.filter((r) => r.class === 'derive')
const ocr = rows.filter((r) => r.class === 'ocr')
const human = rows.filter((r) => r.class === 'human')

// Group have+derive by field; mark bound vs new.
const fillable = [...have, ...derive]
const byField = new Map<string, { field: string; bound: boolean; rows: any[] }>()
for (const r of fillable) {
  const key = normField(r.mizanField) || `(${r.context})`
  if (!byField.has(key)) byField.set(key, { field: r.mizanField || r.context, bound: isBound(r.mizanField), rows: [] })
  byField.get(key)!.rows.push(r)
}
const newBindable = [...byField.values()].filter((g) => !g.bound).sort((a, b) => b.rows.length - a.rows.length)
const alreadyBound = [...byField.values()].filter((g) => g.bound)

// Group OCR by a normalized context label.
const ocrByField = new Map<string, any[]>()
for (const r of ocr) {
  const key = (r.context || r.slot).toLowerCase().split('—')[0].split('/')[0].trim().slice(0, 40)
  if (!ocrByField.has(key)) ocrByField.set(key, [])
  ocrByField.get(key)!.push(r)
}
const ocrGroups = [...ocrByField.entries()].sort((a, b) => b[1].length - a[1].length)

const md: string[] = []
md.push('# MUAP/RSK template coverage matrix (Batch 9 audit, vision fan-out)\n')
md.push(`Source: ${rows.length} slot-classifications by 44 Sonnet agents (1/page). Read-only.\n`)
md.push(`**Counts:** have ${have.length} · derive ${derive.length} · ocr ${ocr.length} · human ${human.length}\n`)
md.push(`Fillable fields (have+derive): ${byField.size} distinct — **${alreadyBound.length} already bound**, **${newBindable.length} NET-NEW**.\n`)

md.push('\n## NET-NEW bindable (have/derive not yet in doc-registry) — the T5 work\n')
md.push('| field | slots | example slot | example context | conf |')
md.push('|---|---|---|---|---|')
for (const g of newBindable) {
  const ex = g.rows[0]
  const conf = (g.rows.reduce((s, r) => s + (r.confidence || 0), 0) / g.rows.length).toFixed(2)
  md.push(`| ${g.field} | ${g.rows.length} | \`${(ex.slot || '').slice(0, 40)}\` | ${(ex.context || '').slice(0, 50)} | ${conf} |`)
}

md.push('\n## OCR targets (extractable → human-confirm; new registry fields / extras)\n')
md.push('| field (context) | count | example slot |')
md.push('|---|---|---|')
for (const [k, rs] of ocrGroups) md.push(`| ${k} | ${rs.length} | \`${(rs[0].slot || '').slice(0, 40)}\` |`)

md.push('\n## Already bound (sanity — confirms existing coverage)\n')
md.push(alreadyBound.map((g) => `${g.field} (${g.rows.length})`).join(' · ') + '\n')

writeFileSync(`${outDir}/coverage-matrix.md`, md.join('\n'))
console.log(`[synth] wrote ${outDir}/coverage-matrix.md`)
console.log(`\nNET-NEW bindable fields (${newBindable.length}):`)
for (const g of newBindable) console.log(`  - ${g.field}  [${g.rows.length} slots]  e.g. "${(g.rows[0].context || g.rows[0].slot).slice(0, 55)}"`)
console.log(`\nOCR target groups (${ocrGroups.length}):`)
for (const [k, rs] of ocrGroups.slice(0, 25)) console.log(`  - ${k}  [${rs.length}]`)
