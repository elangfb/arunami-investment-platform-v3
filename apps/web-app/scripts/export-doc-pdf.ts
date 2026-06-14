// One-off: export a Google Doc to PDF via Drive's export endpoint, save to /tmp.
// Used for visual-inspection of MUAP References Doc where the scan structure
// isn't enough to derive semantic token names.
//
// Usage: pnpm --filter web-app exec tsx scripts/export-doc-pdf.ts <docIdOrUrl> [outPath]
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

const { driveClient } = await import('../src/server/google/clients')

const input = process.argv[2]
if (!input) throw new Error('pass doc id or URL')
const m = input.match(/\/document\/d\/([A-Za-z0-9_-]+)/)
const docId = m ? m[1] : input
const outPath = process.argv[3] || `/tmp/${docId}.pdf`

const drive = driveClient()
const res = await drive.files.export(
  { fileId: docId, mimeType: 'application/pdf' },
  { responseType: 'arraybuffer' },
)
const bytes = Buffer.from(res.data as ArrayBuffer)
writeFileSync(outPath, bytes)
console.log(`wrote ${bytes.length} bytes → ${outPath}`)
