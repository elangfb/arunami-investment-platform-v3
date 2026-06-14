/**
 * READ-ONLY: dump the live master MUAP/RSK Docs — full text + bracket-placeholder
 * occurrence counts — to design new anchors for setup-template-ranges.ts.
 * Does not modify anything.
 *
 * Run:  pnpm exec tsx apps/web-app/scripts/inspect-masters.ts
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { config } from 'dotenv'
import { docsClient } from '../src/server/google/clients'
import { collectRuns } from '../src/server/google/extract/docText'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

async function dump(label: string, documentId: string): Promise<void> {
  const docs = docsClient()
  const doc = (await docs.documents.get({ documentId })).data
  const runs: { text: string }[] = []
  collectRuns(doc.body?.content ?? undefined, runs as never)
  const full = runs.map((r) => r.text).join('')
  const out = resolve(dirname(fileURLToPath(import.meta.url)), `../../../.tt/master-${label}.txt`)
  writeFileSync(out, full)

  const counts = new Map<string, number>()
  for (const m of full.matchAll(/\[[^\]\n]{1,80}\]/g)) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1)
  console.log(`\n===== ${label} (${full.length} chars) -> ${out} =====`)
  console.log(`brackets: ${counts.size} distinct`)
  for (const [b, n] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${n === 1 ? 'UNIQ' : `x${n} `} ${b}`)
  }
}

async function main() {
  const muap = process.env.GOOGLE_MASTER_MUAP_DOC_ID
  const rsk = process.env.GOOGLE_MASTER_RSK_DOC_ID
  if (!muap || !rsk) throw new Error('Missing GOOGLE_MASTER_{MUAP,RSK}_DOC_ID')
  await dump('muap', muap)
  await dump('rsk', rsk)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
