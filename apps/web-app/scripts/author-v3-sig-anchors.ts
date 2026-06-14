// Create the MUAP signature-slot NamedRanges (tanggal_ttd_rm/tl_spv/bm_ku) the already-wired
// stampSignatureQr (server/docs/qr-stamp.ts) stamps the approval QR into. The 3 signer cells each
// carry a distinctive "Tanggal: ______" date line; in document order they are RM, TL/SPV, BM/KU.
// createNamedRange does not shift indices, so all three apply in one batch from a single read.
// RSK §IX signature anchors are NOT done here — that section's column→signer order needs confirming.
//   Run: cd apps/web-app && set -a; . .env.local; set +a; [APPLY=1] pnpm exec tsx scripts/author-v3-sig-anchors.ts

import { google } from 'googleapis'
import type { docs_v1 } from 'googleapis'

const APPLY = process.env.APPLY === '1'
const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
const docs = google.docs({ version: 'v1', auth: oauth2 })
const MUAP = '1rydh9HpZhdWUAgCWJLhMS10CCgdCMnY6fTSZji7eljg'
const SLOT_NAMES = ['tanggal_ttd_rm', 'tanggal_ttd_tl_spv', 'tanggal_ttd_bm_ku']
const SIG_RE = /Tanggal:\s*_{5,}/

interface Hit { start: number; end: number }
function walk(content: docs_v1.Schema$StructuralElement[] | undefined, hits: Hit[]): void {
  for (const el of content ?? []) {
    for (const pe of el.paragraph?.elements ?? []) {
      const t = pe.textRun?.content ?? ''
      const s = pe.startIndex ?? -1
      if (s >= 0 && SIG_RE.test(t)) hits.push({ start: s, end: pe.endIndex ?? s })
    }
    for (const r of el.table?.tableRows ?? []) for (const c of r.tableCells ?? []) walk(c.content ?? undefined, hits)
  }
}

const existing = (await docs.documents.get({ documentId: MUAP })).data
const hits: Hit[] = []
walk(existing.body?.content ?? undefined, hits)
hits.sort((a, b) => a.start - b.start)
console.log(`Found ${hits.length} signature date line(s) (expect 3):`)
hits.forEach((h, i) => console.log(`  ${SLOT_NAMES[i] ?? '(extra)'} → [${h.start}..${h.end}]`))

if (hits.length !== 3) { console.error('✗ expected exactly 3 signature date lines; aborting (no write).'); process.exit(1) }
const already = new Set(Object.keys(existing.namedRanges ?? {}))
const requests = SLOT_NAMES.filter((n) => !already.has(n)).map((name, i) => ({
  createNamedRange: { name, range: { startIndex: hits[SLOT_NAMES.indexOf(name)].start, endIndex: hits[SLOT_NAMES.indexOf(name)].end } },
}))
console.log(`\n${APPLY ? 'APPLYING' : '[dry]'} createNamedRange × ${requests.length} (skipped ${SLOT_NAMES.length - requests.length} already present)`)
if (APPLY && requests.length) {
  await docs.documents.batchUpdate({ documentId: MUAP, requestBody: { requests } })
  console.log('✓ created')
}
