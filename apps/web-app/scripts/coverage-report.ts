/* eslint-disable @typescript-eslint/no-explicit-any -- foundation reporting tool */
// Coverage evaluator (report form): for each template, compare the committed slot snapshot against the
// live DOC_VARS registry + the coverage register, and print the metrics the autonomous loop drives to
// zero: DOC_VARS placeholders ABSENT from the master (silent no-ops / drift), and register-unclassified
// slots (gaps). Hermetic — reads committed JSON only. No app/server-only imports.
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOC_VARS } from '../src/lib/templates/doc-registry'

const here = dirname(fileURLToPath(import.meta.url))
const COV = join(here, '..', 'template-coverage')

for (const template of ['muap', 'rsk'] as const) {
  const slots = new Set<string>(JSON.parse(readFileSync(join(COV, `${template}-slots.json`), 'utf8')).map((s: any) => s.slot))
  const regPath = join(COV, `register.${template}.json`)
  const reg: Record<string, { class: string }> = existsSync(regPath) ? JSON.parse(readFileSync(regPath, 'utf8')) : {}

  const vars = DOC_VARS.filter((v) => v.method !== 'namedRange' && v.templates.includes(template))
  const absent = vars.filter((v) => !slots.has(v.placeholder))
  const unclassified = Object.entries(reg).filter(([, r]) => r.class === 'unclassified').map(([s]) => s)

  console.log(`\n=== ${template.toUpperCase()} (${slots.size} distinct slots) ===`)
  console.log(`  DOC_VARS [bracket]: ${vars.length} | present in master: ${vars.length - absent.length} | ABSENT (silent no-op): ${absent.length}`)
  if (absent.length) console.log(`    drift: ${absent.map((v) => v.placeholder).join(' · ')}`)
  console.log(`  register unclassified (gap): ${unclassified.length}`)
}
console.log('\n[coverage] loop target: drive ABSENT → 0 (registry↔master reconciled) AND unclassified → 0 (every slot decided).')
