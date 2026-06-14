/* eslint-disable @typescript-eslint/no-explicit-any -- one-off standalone tool walking loosely-typed Google Docs JSON */
// Standalone, READ-ONLY master coverage audit (Batch 4 T0). No app imports (avoids `server-only`).
// Walks the master MUAP/RSK docs and inventories fill candidates: [bracket] tokens, underscore
// blanks (Rp ____ / ___ Bulan), and existing namedRanges. Output is a coverage matrix to stdout.
import { google } from 'googleapis'

const MASTERS: Record<string, string> = {
  MUAP: process.env.GOOGLE_MASTER_MUAP_DOC_ID ?? '1rydh9HpZhdWUAgCWJLhMS10CCgdCMnY6fTSZji7eljg',
  RSK: process.env.GOOGLE_MASTER_RSK_DOC_ID ?? '1f1PFM0PA1MqeMzopYWvO4IMH4wx27AyMjFHbwIR7n3c',
}

function client() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
  c.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.docs({ version: 'v1', auth: c })
}

function textOf(el: any): string {
  return (el?.paragraph?.elements ?? []).map((e: any) => e?.textRun?.content ?? '').join('')
}
function* walk(content: any[]): Generator<string> {
  for (const el of content ?? []) {
    if (el.paragraph) yield textOf(el)
    if (el.table) for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) yield* walk(cell.content)
  }
}

async function audit(label: string, id: string) {
  const docs = client()
  const { data } = await docs.documents.get({ documentId: id, fields: 'title,namedRanges,body' })
  const lines = [...walk(data.body?.content ?? [])]
  const text = lines.join('\n')
  const brackets = [...text.matchAll(/\[(.{3,}?)\]/g)].map((m) => m[1])
  const underscores = [...text.matchAll(/[^\n]*_{2,}[^\n]*/g)].map((m) => m[0].trim()).filter(Boolean)
  const ranges = Object.keys(data.namedRanges ?? {})
  console.log(`\n=== ${label} :: "${data.title}" (${id}) ===`)
  console.log(`  [bracket] tokens (${brackets.length}): ${brackets.join(' | ')}`)
  console.log(`  underscore-blank lines (${underscores.length}):`)
  for (const u of underscores) console.log(`    · ${u}`)
  console.log(`  existing namedRanges (${ranges.length}): ${ranges.join(', ')}`)
}

async function main() {
  for (const [label, id] of Object.entries(MASTERS)) {
    try {
      await audit(label, id)
    } catch (e) {
      console.log(`\n=== ${label} (${id}) :: LIVE_FAIL ${(e as Error).message?.slice(0, 300)}`)
    }
  }
}
void main()
