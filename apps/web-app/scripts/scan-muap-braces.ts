// Structural dump of a MUAP Google Doc:
//   • walks paragraphs in body order, tracking the current heading chain (H1>H2>H3)
//   • marks when we enter/leave a table and tracks (row, col) inside
//   • emits a section-grouped report of every placeholder we find:
//       – `{{token}}` (current/legacy fill literal — v2 style)
//       – `${{token}}`/`${{/token}}` extraction sentinel (live master style)
//       – `[bracketed guidance]` (the raw author hint left by humans)
//       – bare blank slots: a sequence of underscores `____` / `____,-`
//
// Auto-converts .docx via Drive copy if needed. Usage:
//   pnpm --filter web-app exec tsx scripts/scan-muap-braces.ts <docIdOrUrl> [moreIds…]
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { docs_v1 } from 'googleapis'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

const { docsClient, driveClient } = await import('../src/server/google/clients')

const rawArgs = process.argv.slice(2)
if (rawArgs.length === 0) {
  if (process.env.GOOGLE_MASTER_MUAP_DOC_ID) rawArgs.push(process.env.GOOGLE_MASTER_MUAP_DOC_ID)
  else throw new Error('pass at least one doc id (or set GOOGLE_MASTER_MUAP_DOC_ID)')
}
const inputs = rawArgs.map(parseDocId)

function parseDocId(s: string): string {
  const m = s.match(/\/document\/d\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : s
}

const docs = docsClient()
const drive = driveClient()

// ── token detection ─────────────────────────────────────────────────────────
type Hit =
  | { kind: 'token'; name: string; raw: string }              // {{x}}
  | { kind: 'sentinel-open'; name: string; raw: string }      // ${{x}}
  | { kind: 'sentinel-close'; name: string; raw: string }     // ${{/x}}
  | { kind: 'bracket'; name: string; raw: string }            // [Guidance hint…]
  | { kind: 'blank'; raw: string }                            // ____ / ____,-

const TOKEN_RE = /\$?\{\{[^}]*\}\}/g
// Lazy quantifier (`.{3,}?`) matches the shortest `[…]` span ≥3 chars. `.` excludes `\n`
// by default — same behavior as the previous `[^\[\]\n]` exclusion — but with no arbitrary
// upper bound, so long narrative guidance blocks (200-400+ chars in MUAP) are captured.
// `[A] [B]` correctly splits into two matches because of the lazy `?`.
const BRACKET_RE = /\[(.{3,}?)\]/g
const BLANK_RE = /_{3,}(?:,-)?/g

function detect(text: string): Array<{ at: number; len: number; hit: Hit }> {
  const out: Array<{ at: number; len: number; hit: Hit }> = []
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0]
    const inner = raw.replace(/^\$?\{\{/, '').replace(/\}\}$/, '')
    if (raw.startsWith('$') && inner.startsWith('/')) out.push({ at: m.index!, len: raw.length, hit: { kind: 'sentinel-close', name: inner.slice(1), raw } })
    else if (raw.startsWith('$')) out.push({ at: m.index!, len: raw.length, hit: { kind: 'sentinel-open', name: inner, raw } })
    else out.push({ at: m.index!, len: raw.length, hit: { kind: 'token', name: inner, raw } })
  }
  for (const m of text.matchAll(BRACKET_RE)) {
    out.push({ at: m.index!, len: m[0].length, hit: { kind: 'bracket', name: m[1].trim(), raw: m[0] } })
  }
  for (const m of text.matchAll(BLANK_RE)) {
    out.push({ at: m.index!, len: m[0].length, hit: { kind: 'blank', raw: m[0] } })
  }
  out.sort((a, b) => a.at - b.at)
  return out
}

// ── doc walker ──────────────────────────────────────────────────────────────
interface Loc {
  headings: string[]      // path of headings active at this point (H1 ▸ H2 ▸ H3)
  table?: { tableIndex: number; row: number; col: number }
  context: string         // ±40 chars around the hit
  hit: Hit
}

function paragraphText(p: docs_v1.Schema$Paragraph | undefined): string {
  if (!p) return ''
  let t = ''
  for (const el of p.elements ?? []) {
    if (el.textRun?.content) t += el.textRun.content
  }
  return t
}

function headingLevel(style: string | null | undefined): number {
  if (!style) return 0
  const m = /^HEADING_(\d)/.exec(style)
  return m ? Number(m[1]) : 0
}

function pushHits(text: string, headings: string[], table: Loc['table'], acc: Loc[]) {
  const hits = detect(text)
  for (const h of hits) {
    const start = Math.max(0, h.at - 40)
    const end = Math.min(text.length, h.at + h.len + 40)
    const context = text.slice(start, end).replace(/\s+/g, ' ').trim()
    acc.push({ headings: [...headings], table, context, hit: h.hit })
  }
}

// ── slot-level grouping ─────────────────────────────────────────────────────
// A "cell" (table cell or top-level paragraph) is the segmentation unit. Inside it,
// each Hit is a slot; the text between hits is static (labels, separators).
// A slot is RED if its hit kind is 'bracket' or 'blank' — orphan, no NamedRange will
// wrap it at setup, so it leaks visible junk into filled Docs.
interface CellGroup {
  headings: string[]
  table?: { tableIndex: number; row: number; col: number }
  text: string
  hits: Array<{ at: number; len: number; hit: Hit }>
}

function isRedKind(k: Hit['kind']): boolean {
  return k === 'bracket' || k === 'blank'
}

function pushCell(text: string, headings: string[], table: CellGroup['table'], acc: CellGroup[]) {
  const hits = detect(text)
  if (hits.length === 0) return
  acc.push({ headings: [...headings], table, text, hits })
}

function walk(doc: docs_v1.Schema$Document): { locs: Loc[]; cells: CellGroup[] } {
  const out: Loc[] = []
  const cells: CellGroup[] = []
  const headings: string[] = []
  let tableIndex = 0
  for (const el of doc.body?.content ?? []) {
    if (el.paragraph) {
      const style = el.paragraph.paragraphStyle?.namedStyleType
      const lvl = headingLevel(style)
      const text = paragraphText(el.paragraph)
      if (lvl > 0) {
        // adjust heading stack
        headings.splice(lvl - 1)
        headings[lvl - 1] = text.trim() || '(unnamed heading)'
      }
      pushHits(text, headings, undefined, out)
      pushCell(text, headings, undefined, cells)
    } else if (el.table) {
      const tIdx = ++tableIndex
      const rows = el.table.tableRows ?? []
      for (let r = 0; r < rows.length; r++) {
        const tCells = rows[r].tableCells ?? []
        for (let c = 0; c < tCells.length; c++) {
          let cellText = ''
          for (const ce of tCells[c].content ?? []) {
            if (ce.paragraph) cellText += paragraphText(ce.paragraph) + ' '
          }
          pushHits(cellText, headings, { tableIndex: tIdx, row: r, col: c }, out)
          pushCell(cellText, headings, { tableIndex: tIdx, row: r, col: c }, cells)
        }
      }
    }
  }
  return { locs: out, cells }
}

// ── fetch (auto-convert .docx) ──────────────────────────────────────────────
async function loadDoc(inputId: string): Promise<{ doc: docs_v1.Schema$Document; cleanup: () => Promise<void> }> {
  let scanId = inputId
  let tempId: string | null = null
  try {
    const { data } = await docs.documents.get({ documentId: inputId })
    return { doc: data, cleanup: () => Promise.resolve() }
  } catch (e: unknown) {
    const err = e as { code?: number; cause?: { message?: string } }
    const msg = err.cause?.message ?? ''
    if (!(err.code === 400 && /Office file/i.test(msg))) throw e
    console.log(`[${inputId}] .docx detected — copy-converting via Drive…`)
  }
  const copied = await drive.files.copy({
    fileId: inputId,
    supportsAllDrives: true,
    requestBody: { name: `[SCAN-TEMP] ${inputId}`, mimeType: 'application/vnd.google-apps.document' },
    fields: 'id',
  })
  scanId = copied.data.id!
  tempId = scanId
  const { data } = await docs.documents.get({ documentId: scanId })
  return {
    doc: data,
    cleanup: async () => {
      if (tempId && !process.env.KEEP_COPY) {
        await drive.files.delete({ fileId: tempId, supportsAllDrives: true }).catch((e) => console.warn('cleanup:', (e as Error).message))
      }
    },
  }
}

// ── report ──────────────────────────────────────────────────────────────────
function report(label: string, doc: docs_v1.Schema$Document, locs: Loc[]) {
  console.log(`\n${'═'.repeat(78)}`)
  console.log(`${label} :: "${doc.title}" (${doc.documentId})`)
  console.log(`${'═'.repeat(78)}`)

  const byKind = new Map<Hit['kind'], number>()
  for (const l of locs) byKind.set(l.hit.kind, (byKind.get(l.hit.kind) ?? 0) + 1)
  console.log('counts:', [...byKind].map(([k, n]) => `${k}=${n}`).join('  '))

  // Group by heading path
  const groups = new Map<string, Loc[]>()
  for (const l of locs) {
    const k = l.headings.join(' ▸ ') || '(no heading)'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(l)
  }
  for (const [section, items] of groups) {
    console.log(`\n── ${section} ──`)
    for (const l of items) {
      const where = l.table ? `[T${l.table.tableIndex} r${l.table.row} c${l.table.col}]` : ''
      const tag =
        l.hit.kind === 'token' ? `{{${l.hit.name}}}` :
        l.hit.kind === 'sentinel-open' ? `\${{${l.hit.name}}}` :
        l.hit.kind === 'sentinel-close' ? `\${{/${l.hit.name}}}` :
        l.hit.kind === 'bracket' ? `[${l.hit.name.slice(0, 50)}${l.hit.name.length > 50 ? '…' : ''}]` :
        `____`
      console.log(`  ${where.padEnd(14)} ${tag.padEnd(45)} … ${l.context} …`)
    }
  }

  // Per-token summary (just the {{tokens}} — these are the actionable fill targets)
  const tokens = locs.filter((l) => l.hit.kind === 'token') as Array<Loc & { hit: Extract<Hit, { kind: 'token' }> }>
  const names = new Map<string, Loc[]>()
  for (const t of tokens) {
    if (!names.has(t.hit.name)) names.set(t.hit.name, [])
    names.get(t.hit.name)!.push(t)
  }
  console.log(`\n── {{token}} catalog (${names.size} distinct) ──`)
  for (const [n, occ] of [...names].sort()) {
    const where = occ.map((o) => (o.table ? `T${o.table.tableIndex}/r${o.table.row}c${o.table.col}` : (o.headings.at(-1) ?? '?'))).join(', ')
    console.log(`  ${n.padEnd(40)} ×${occ.length}   @ ${where}`)
  }
}

// Render a cell's slot sequence inline: static text verbatim, hits as ‹kind:value› tags.
// This makes the multi-slot pattern explicit — e.g. the "Nama Perusahaan / Inisial" cell
// renders as `‹B:Nama Lengkap Perusahaan› / ‹B:"Inisial"› Alamat Kantor (sesuai NIB): ‹_›`
function renderSlotSequence(cell: CellGroup): string {
  let out = ''
  let cursor = 0
  for (const h of cell.hits) {
    out += cell.text.slice(cursor, h.at).replace(/\s+/g, ' ')
    const k = h.hit.kind
    if (k === 'token') out += `‹T:${(h.hit as Extract<Hit, { kind: 'token' }>).name}›`
    else if (k === 'sentinel-open') out += `‹S+:${(h.hit as Extract<Hit, { kind: 'sentinel-open' }>).name}›`
    else if (k === 'sentinel-close') out += `‹S-:${(h.hit as Extract<Hit, { kind: 'sentinel-close' }>).name}›`
    else if (k === 'bracket') {
      const name = (h.hit as Extract<Hit, { kind: 'bracket' }>).name
      out += `‹B:${name.length > 60 ? name.slice(0, 60) + '…' : name}›`
    } else out += `‹_›`
    cursor = h.at + h.len
  }
  out += cell.text.slice(cursor).replace(/\s+/g, ' ')
  return out.trim()
}

function reportRedSlots(label: string, cells: CellGroup[]) {
  const red = cells.filter((c) => c.hits.some((h) => isRedKind(h.hit.kind)))
  let bracketCount = 0
  let blankCount = 0
  for (const c of red) for (const h of c.hits) {
    if (h.hit.kind === 'bracket') bracketCount++
    else if (h.hit.kind === 'blank') blankCount++
  }
  console.log(`\n${'═'.repeat(78)}`)
  console.log(`${label} — RED slots (orphan placeholders, no enclosing {{token}})`)
  console.log(`  cells with ≥1 RED slot: ${red.length}   total RED slots: ${bracketCount + blankCount} (bracket=${bracketCount} blank=${blankCount})`)
  console.log(`${'═'.repeat(78)}`)
  if (red.length === 0) {
    console.log('  ✓ zero RED slots — every placeholder is enclosed by a {{token}} literal')
    return
  }

  // Group by section heading path
  const groups = new Map<string, CellGroup[]>()
  for (const c of red) {
    const k = c.headings.join(' ▸ ') || '(no heading)'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(c)
  }
  for (const [section, items] of groups) {
    console.log(`\n── ${section} ──`)
    for (const c of items) {
      const where = c.table ? `[T${c.table.tableIndex} r${c.table.row} c${c.table.col}]` : '[para]'
      const redInCell = c.hits.filter((h) => isRedKind(h.hit.kind)).length
      const greenInCell = c.hits.filter((h) => !isRedKind(h.hit.kind)).length
      console.log(`  ${where.padEnd(14)} red=${redInCell} green=${greenInCell}`)
      console.log(`  ${' '.repeat(14)} ${renderSlotSequence(c)}`)
    }
  }
}

const loaded: Array<{ id: string; doc: docs_v1.Schema$Document; locs: Loc[]; cells: CellGroup[]; cleanup: () => Promise<void> }> = []
try {
  for (const id of inputs) {
    const { doc, cleanup } = await loadDoc(id)
    const { locs, cells } = walk(doc)
    loaded.push({ id, doc, locs, cells, cleanup })
  }
  loaded.forEach((x, i) => report(`DOC #${i + 1}`, x.doc, x.locs))
  loaded.forEach((x, i) => reportRedSlots(`DOC #${i + 1} :: "${x.doc.title}"`, x.cells))
} finally {
  for (const x of loaded) await x.cleanup()
}
