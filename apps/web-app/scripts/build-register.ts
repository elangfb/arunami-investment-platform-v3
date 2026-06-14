/* eslint-disable @typescript-eslint/no-explicit-any -- scratch foundation tool */
// Seed the coverage REGISTER from the committed slot snapshots + the live DOC_VARS registry.
// Each DISTINCT slot text per template is classified:
//   bound     — its [placeholder] is a non-namedRange DOC_VAR (fact/signing) → fills via replaceAllText
//   narrative — its [placeholder] is a narrative DOC_VAR → AI-drafted
//   unclassified — everything else (the gap set the autonomous loop must drive to zero:
//                   each becomes derive / ocr / narrative / human with a grounded source)
// The register is the MUTABLE source of truth the loop edits; this only SEEDS it (idempotent: keeps
// any human-set class, only (re)seeds bound/narrative/unclassified). No app/server-only imports.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOC_VARS } from '../src/lib/templates/doc-registry'

const here = dirname(fileURLToPath(import.meta.url))
const COV = join(here, '..', 'template-coverage')

// placeholder text → seeded class, for non-namedRange vars (namedRange anchors aren't bracket text).
const VAR_CLASS = new Map<string, 'bound' | 'narrative'>()
for (const v of DOC_VARS) {
  if (v.method === 'namedRange') continue
  VAR_CLASS.set(v.placeholder, v.kind === 'narrative' ? 'narrative' : 'bound')
}
const LOOP_OWNED = new Set(['unclassified', 'bound', 'narrative']) // classes the seed may overwrite

for (const template of ['muap', 'rsk']) {
  const slots: any[] = JSON.parse(readFileSync(join(COV, `${template}-slots.json`), 'utf8'))
  const distinct = [...new Set(slots.map((s) => s.slot))]
  const regPath = join(COV, `register.${template}.json`)
  const prev: Record<string, { class: string; note?: string }> = existsSync(regPath) ? JSON.parse(readFileSync(regPath, 'utf8')) : {}

  const reg: Record<string, { class: string; note?: string }> = {}
  for (const slot of distinct) {
    const existing = prev[slot]
    // Preserve a human-decided class (loop output); only (re)seed loop-owned classes.
    if (existing && !LOOP_OWNED.has(existing.class)) { reg[slot] = existing; continue }
    const seeded = VAR_CLASS.get(slot)
    reg[slot] = seeded ? { class: seeded } : (existing ?? { class: 'unclassified' })
  }
  writeFileSync(regPath, JSON.stringify(reg, null, 2))
  const counts: Record<string, number> = {}
  for (const r of Object.values(reg)) counts[r.class] = (counts[r.class] || 0) + 1
  console.log(`[register] ${template}: ${distinct.length} distinct slots → ${JSON.stringify(counts)}`)
}
