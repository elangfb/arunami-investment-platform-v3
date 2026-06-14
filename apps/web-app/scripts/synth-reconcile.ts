/* eslint-disable @typescript-eslint/no-explicit-any -- scratch synthesis */
// Synthesize the reconcile fan-out into a GROUNDED re-point plan + register classifications.
// Re-point: for each registry var currently ABSENT from the master, the verified map decision gives
// the real master token to repoint its placeholder to — but ONLY if that token exists in the committed
// snapshot (grounding) and the var↔slot mapping is 1:1-clean (flag conflicts for human review).
//   pnpm exec tsx scripts/synth-reconcile.ts <reconcile-raw.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOC_VARS } from '../src/lib/templates/doc-registry'

const here = dirname(fileURLToPath(import.meta.url))
const COV = join(here, '..', 'template-coverage')
const data = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const decisions: any[] = (data.result?.decisions ?? data.decisions ?? []).filter((d: any) => d.ok)

for (const template of ['muap', 'rsk'] as const) {
  const snapshot = new Set<string>(JSON.parse(readFileSync(join(COV, `${template}-slots.json`), 'utf8')).map((s: any) => s.slot))
  const vars = DOC_VARS.filter((v) => v.method !== 'namedRange' && v.templates.includes(template))
  const absent = new Set(vars.filter((v) => !snapshot.has(v.placeholder)).map((v) => v.name))
  const ds = decisions.filter((d) => d.template === template)

  // map: var -> set of proposed slot texts (grounded only)
  const byVar = new Map<string, Set<string>>()
  const slotToVars = new Map<string, Set<string>>()
  for (const d of ds.filter((d) => d.disposition === 'map' && d.registryVar)) {
    if (!snapshot.has(d.slot)) continue // ungrounded — slot text not in master snapshot
    if (!byVar.has(d.registryVar)) byVar.set(d.registryVar, new Set())
    byVar.get(d.registryVar)!.add(d.slot)
    if (!slotToVars.has(d.slot)) slotToVars.set(d.slot, new Set())
    slotToVars.get(d.slot)!.add(d.registryVar)
  }

  console.log(`\n========== ${template.toUpperCase()} ==========`)
  console.log(`absent vars needing re-point: ${absent.size}`)
  const clean: { var: string; slot: string }[] = []
  const conflicts: string[] = []
  for (const name of absent) {
    const slots = [...(byVar.get(name) ?? [])]
    const v = vars.find((x) => x.name === name)!
    if (slots.length === 0) { console.log(`  ✗ ${name} (${v.placeholder}): NO grounded map → retire/needs-namedrange`); continue }
    if (slots.length === 1 && (slotToVars.get(slots[0])?.size ?? 0) === 1) { clean.push({ var: name, slot: slots[0] }); console.log(`  ✓ ${name}: re-point → "${slots[0].slice(0, 70)}"`); continue }
    conflicts.push(name); console.log(`  ⚠ ${name}: ${slots.length} candidates / shared → ${slots.map((s) => `"${s.slice(0, 40)}"`).join(' , ')}`)
  }
  console.log(`  CLEAN re-points: ${clean.length} | conflicts: ${conflicts.length}`)

  // register classifications for non-map dispositions (grounded)
  const reg: Record<string, { class: string; source?: string }> = {}
  const classMap: Record<string, string> = { derive: 'derive', ocr: 'ocr', narrative_new: 'narrative', needs_namedrange: 'needs_namedrange', human: 'human' }
  for (const d of ds) {
    if (d.disposition === 'map' || !snapshot.has(d.slot)) continue
    const cls = classMap[d.disposition]
    if (cls && !reg[d.slot]) reg[d.slot] = { class: cls, source: d.source || undefined }
  }
  // emit the re-point plan + register delta
  writeFileSync(join(COV, `repoint.${template}.json`), JSON.stringify({ clean, conflicts: [...conflicts] }, null, 2))
  writeFileSync(join(COV, `classify.${template}.json`), JSON.stringify(reg, null, 2))
  console.log(`  wrote repoint.${template}.json (${clean.length}) + classify.${template}.json (${Object.keys(reg).length})`)
}
