/**
 * Recon: dump the table structure of a master Doc so we can plan marker placement.
 * Prints every table with its row count and the text of each row's cells.
 *
 * Run:  pnpm exec tsx apps/web-app/scripts/inspect-doc.ts [muap|rsk]
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import type { docs_v1 } from 'googleapis'
import { docsClient } from '../src/server/google/clients'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

const which = (process.argv[2] ?? 'rsk').toLowerCase()
const docId = which === 'muap' ? process.env.GOOGLE_MASTER_MUAP_DOC_ID : process.env.GOOGLE_MASTER_RSK_DOC_ID

function cellText(cell: docs_v1.Schema$TableCell): string {
  let s = ''
  for (const el of cell.content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) s += pe.textRun?.content ?? ''
  }
  return s.replace(/\s+/g, ' ').trim()
}

async function main() {
  if (!docId) throw new Error(`No master id for "${which}". Run create-masters first.`)
  const docs = docsClient()
  const { data } = await docs.documents.get({ documentId: docId })
  let tableNo = 0
  for (const el of data.body?.content ?? []) {
    if (!el.table) continue
    tableNo++
    const rows = el.table.tableRows ?? []
    const cols = rows[0]?.tableCells?.length ?? 0
    console.log(`\n=== TABLE #${tableNo} (rows=${rows.length}, cols=${cols}, startIndex=${el.startIndex}) ===`)
    rows.slice(0, 10).forEach((row, ri) => {
      const cells = (row.tableCells ?? []).map((c) => cellText(c).slice(0, 40))
      console.log(`  r${ri}: ${cells.map((c) => `[${c}]`).join(' ')}`)
    })
    if (rows.length > 10) console.log(`  … (${rows.length - 10} more rows)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
