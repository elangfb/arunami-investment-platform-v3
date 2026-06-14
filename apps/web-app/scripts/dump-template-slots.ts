/* eslint-disable @typescript-eslint/no-explicit-any -- one-off standalone READ-ONLY tool over loosely-typed Google Docs JSON */
// READ-ONLY: dump EVERY fillable slot in the MUAP + RSK masters as a structured JSON inventory, with
// its section heading + table coords, so the coverage-audit agents classify a KNOWN list (vision is
// only a supplement, never how slots are discovered). No app imports (avoids server-only). No mutation.
//   cd apps/web-app && set -a; . .env.local; set +a; pnpm exec tsx scripts/dump-template-slots.ts <outDir>
import { google } from 'googleapis'
import { writeFileSync, mkdirSync } from 'node:fs'

const MASTERS: Record<string, string> = {
  muap: process.env.GOOGLE_MASTER_MUAP_DOC_ID ?? '1rydh9HpZhdWUAgCWJLhMS10CCgdCMnY6fTSZji7eljg',
  rsk: process.env.GOOGLE_MASTER_RSK_DOC_ID ?? '1f1PFM0PA1MqeMzopYWvO4IMH4wx27AyMjFHbwIR7n3c',
}

function docsClient() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
  c.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.docs({ version: 'v1', auth: c })
}
const textOf = (el: any): string => (el?.paragraph?.elements ?? []).map((e: any) => e?.textRun?.content ?? '').join('')

interface Slot { template: string; kind: 'bracket' | 'underscore'; slot: string; line: string; section: string; table: string | null }

// Walk in document order, tracking the most recent heading (section context) + table cell coords.
function collect(template: string, content: any[]): Slot[] {
  const out: Slot[] = []
  let section = '(top)'
  const visit = (els: any[], table: string | null) => {
    for (const el of els ?? []) {
      if (el.paragraph) {
        const t = textOf(el).replace(/\n/g, '').trim()
        const style: string = el.paragraph.paragraphStyle?.namedStyleType ?? ''
        if (style.startsWith('HEADING') && t) section = t
        if (!t) continue
        for (const m of t.matchAll(/\[(.{2,}?)\]/g)) out.push({ template, kind: 'bracket', slot: m[0], line: t.slice(0, 160), section, table })
        for (const m of t.matchAll(/_{2,}/g)) out.push({ template, kind: 'underscore', slot: m[0], line: t.slice(0, 160), section, table })
      }
      if (el.table) {
        let r = 0
        for (const row of el.table.tableRows ?? []) {
          let c = 0
          for (const cell of row.tableCells ?? []) { visit(cell.content, `${r},${c}`); c++ }
          r++
        }
      }
    }
  }
  visit(content, null)
  return out
}

async function main() {
  const outDir = process.argv[2] || '.tt/template-audit'
  mkdirSync(outDir, { recursive: true })
  const docs = docsClient()
  const summary: Record<string, number> = {}
  for (const [template, id] of Object.entries(MASTERS)) {
    const { data } = await docs.documents.get({ documentId: id, fields: 'title,body' })
    const slots = collect(template, data.body?.content ?? [])
    writeFileSync(`${outDir}/${template}-slots.json`, JSON.stringify(slots, null, 2))
    summary[template] = slots.length
    console.log(`[dump] ${template} "${data.title}": ${slots.length} slots → ${outDir}/${template}-slots.json`)
  }
  console.log(`[dump] DONE (read-only). ${JSON.stringify(summary)}`)
}
void main()
