/**
 * Run the full extraction pipeline against the master Docs and summarize the
 * result — end-to-end check that placed markers read back correctly.
 *
 * Run:  pnpm exec tsx apps/web-app/scripts/verify-extract.ts
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { extractApplicationDocs } from '../src/server/google/extract/extractDocs'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

async function main() {
  const muap = process.env.GOOGLE_MASTER_MUAP_DOC_ID
  const rsk = process.env.GOOGLE_MASTER_RSK_DOC_ID
  if (!muap || !rsk) throw new Error('Missing GOOGLE_MASTER_{MUAP,RSK}_DOC_ID')

  const { report, snapshot } = await extractApplicationDocs(muap, rsk)

  const byStatus = report.fields.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1
    return acc
  }, {})
  console.log(`report.ok = ${report.ok}`)
  console.log('field status counts:', byStatus)

  if (snapshot) {
    console.log('\n5C+2S matrix:')
    for (const r of snapshot.matrix) console.log(`  ${r.aspect.padEnd(20)} level=${r.level ?? '—'}`)
    console.log('\nratios (periods):', snapshot.ratios[0]?.points.map((p) => p.period).join(' | ') || '—')
    for (const r of snapshot.ratios) {
      console.log(`  ${r.key.padEnd(13)} ${r.points.map((p) => (p.value ?? '·')).join(' | ')}`)
    }
    console.log('\ncollateral:', JSON.stringify(snapshot.collateral))
    console.log('RAC deviations:', snapshot.racDeviations.length)
    for (const d of snapshot.racDeviations) console.log(`  • ${d.item.slice(0, 70)}`)
  } else {
    console.log('\nsnapshot REJECTED (a gating field failed) — see flagged fields:')
    for (const f of report.fields.filter((x) => x.status !== 'ok')) console.log(`  ${f.status}: ${f.fieldKey}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
