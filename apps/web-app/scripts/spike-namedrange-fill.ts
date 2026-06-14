/* eslint-disable @typescript-eslint/no-explicit-any -- one-off standalone Drive spike */
// Batch 4 V3.5 T1 SPIKE — value-fill NamedRange for an underscore slot. Operates ONLY on throwaway
// copies of the master (deleted after). Proves the 3 gates: (1) a value-fill NamedRange survives
// files.copy; (2) deleteContentRange+insertText cleanly replaces the underscore blank; (3) read-back.
//   tsx scripts/spike-namedrange-fill.ts <masterMuapDocId>
import { google } from 'googleapis'

function clients() {
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_OAUTH_REDIRECT_URI)
  c.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return { docs: google.docs({ version: 'v1', auth: c }), drive: google.drive({ version: 'v3', auth: c }) }
}
const log = (...a: any[]) => console.log('[ns-spike]', ...a)

// Walk the doc body (incl. table cells) yielding each textRun with its ABSOLUTE startIndex.
function* runs(content: any[]): Generator<{ start: number; text: string }> {
  for (const el of content ?? []) {
    if (el.paragraph) for (const pe of el.paragraph.elements ?? []) {
      if (pe.textRun?.content != null && pe.startIndex != null) yield { start: pe.startIndex, text: pe.textRun.content }
    }
    if (el.table) for (const row of el.table.tableRows ?? []) for (const cell of row.tableCells ?? []) yield* runs(cell.content)
  }
}

// Find the FIRST run containing /_{2,}/ → the absolute index range of that underscore substring.
function findUnderscoreSlot(content: any[]): { startIndex: number; endIndex: number; sample: string } | null {
  for (const r of runs(content)) {
    const m = /_{2,}/.exec(r.text)
    if (m) return { startIndex: r.start + m.index, endIndex: r.start + m.index + m[0].length, sample: r.text.trim().slice(0, 40) }
  }
  return null
}

async function main() {
  const [masterId] = process.argv.slice(2)
  if (!masterId) throw new Error('usage: spike-namedrange-fill.ts <masterMuapDocId>')
  const { docs, drive } = clients()
  const trash: string[] = []
  try {
    // 0. Copy master → working doc (we author the NamedRange on this copy, NOT the master).
    const work = (await drive.files.copy({ fileId: masterId, requestBody: { name: 'NS-SPIKE master copy' }, fields: 'id' })).data.id as string
    trash.push(work)
    log('0. copied master → work', work)

    // 1. Locate an underscore slot + create a value-fill NamedRange over it.
    const doc0 = (await docs.documents.get({ documentId: work, fields: 'body' })).data
    const slot = findUnderscoreSlot(doc0.body?.content ?? [])
    if (!slot) { log('NO-GO: no underscore slot found'); return }
    log(`1. slot "${slot.sample}" at [${slot.startIndex},${slot.endIndex})`)
    await docs.documents.batchUpdate({ documentId: work, requestBody: { requests: [{ createNamedRange: { name: 'muap_spike_value', range: { startIndex: slot.startIndex, endIndex: slot.endIndex } } }] } })
    log('   created NamedRange "muap_spike_value"')

    // 2. GATE 1 — copy the work doc; does the NamedRange survive files.copy (like a per-app doc)?
    const perApp = (await drive.files.copy({ fileId: work, requestBody: { name: 'NS-SPIKE per-app copy' }, fields: 'id' })).data.id as string
    trash.push(perApp)
    const copied = (await docs.documents.get({ documentId: perApp, fields: 'namedRanges' })).data
    const survived = Boolean(copied.namedRanges?.['muap_spike_value']?.namedRanges?.[0]?.ranges?.[0])
    log(`2. GATE 1 (survives files.copy): ${survived ? 'PASS' : 'FAIL'}`)
    if (!survived) { log('NO-GO'); return }

    // 3. GATE 2 — fill the range on the per-app copy: deleteContentRange + insertText.
    const range = copied.namedRanges!['muap_spike_value'].namedRanges![0].ranges![0]
    const start = range.startIndex as number
    const end = range.endIndex as number
    const VALUE = '12/MUAP-MKT/VI/2026'
    await docs.documents.batchUpdate({ documentId: perApp, requestBody: { requests: [
      { deleteContentRange: { range: { startIndex: start, endIndex: end } } },
      { insertText: { location: { index: start }, text: VALUE } },
    ] } })
    log('3. filled range (deleteContentRange + insertText)')

    // 4. GATE 3 — read back: value present, the underscore blank gone at that spot.
    const after = (await docs.documents.get({ documentId: perApp, fields: 'body' })).data
    const text = [...runs(after.body?.content ?? [])].map((r) => r.text).join('')
    const filled = text.includes(VALUE)
    log(`4. GATE 3 (read-back): value present=${filled} → ${filled ? 'PASS' : 'FAIL'}`)
    log(filled && survived ? 'RESULT: GO — value-fill NamedRange survives copy + fills cleanly + reads back.' : 'RESULT: NO-GO')
  } catch (e) {
    log('RESULT: NO-GO —', (e as Error).message)
  } finally {
    for (const id of trash) await drive.files.delete({ fileId: id }).then(() => log('cleanup: deleted', id)).catch((e) => log('cleanup FAILED', id, (e as Error).message))
  }
}
void main()
