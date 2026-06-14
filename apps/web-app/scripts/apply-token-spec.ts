import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import type { docs_v1 } from 'googleapis'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

const { docsClient, driveClient } = await import('../src/server/google/clients')

const TOKEN_RE = /\$?\{\{[^}]*\}\}/g
const BRACKET_RE = /\[(.{3,}?)\]/g
const BLANK_RE = /_{3,}(?:,-)?/g

type SlotKind = 'bracket' | 'blank'
type Location = { tableIndex: number; row: number; col: number } | 'para'

type Edit = {
  location: Location
  locationLabel: string
  cellOrdinal: number
  slotText: string
  slotKind: SlotKind
  token: string
}

type Hit = {
  startIndex: number
  endIndex: number
  kind: 'token' | 'bracket' | 'blank'
  raw: string
  name?: string
}

type Cell = {
  location: Location
  locationLabel: string
  hits: Hit[]
}

type MatchedEdit = Edit & { hit: Hit }

type CompositeSpec = {
  doc: 'muap' | 'rsk'
  location: { tableIndex: number; row: number; col: number }
  rationale: string
  targetText: string
}

type CellRange = {
  location: Exclude<Location, 'para'>
  locationLabel: string
  startIndex: number
  endIndex: number
  text: string
}

const docs = docsClient()
const drive = driveClient()

function parseDocId(s: string): string {
  const m = s.match(/\/document\/d\/([A-Za-z0-9_-]+)/)
  return m ? m[1]! : s
}

function usage(): never {
  throw new Error(
    'usage: apply-token-spec.ts copy <sourceDocId> | apply <reconcileFile> <targetDocId> [--apply] [--target-master] | verify <reconcileFile> <docId> | composite <specFile> <targetDocId> [--apply] [--target-master]',
  )
}

function masterIds(): string[] {
  const muap = process.env.GOOGLE_MASTER_MUAP_DOC_ID
  const rsk = process.env.GOOGLE_MASTER_RSK_V2_DOC_ID
  if (!muap || !rsk) throw new Error('GOOGLE_MASTER_MUAP_DOC_ID and GOOGLE_MASTER_RSK_V2_DOC_ID must both be set')
  return [muap, rsk]
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim()
  const body = trimmed.startsWith('|') ? trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined) : trimmed
  const cells: string[] = []
  let cur = ''
  let escaped = false
  for (const ch of body) {
    if (escaped) {
      cur += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      cur += ch
      continue
    }
    if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  cells.push(cur.trim())
  return cells
}

function unescapeCell(s: string): string {
  return s.replace(/\\\|/g, '|').trim()
}

function stripCode(s: string): string {
  const t = unescapeCell(s).trim()
  return t.startsWith('`') && t.endsWith('`') ? t.slice(1, -1) : t
}

function parseLocation(label: string): Location {
  if (label === '[para]') return 'para'
  const m = /^\[T(\d+) r(\d+) c(\d+)\]$/.exec(label)
  if (!m) throw new Error(`unparseable location: ${label}`)
  return { tableIndex: Number(m[1]), row: Number(m[2]), col: Number(m[3]) }
}

function locationKey(loc: Location): string {
  return loc === 'para' ? 'para' : `T${loc.tableIndex}/r${loc.row}/c${loc.col}`
}

function sameLocation(a: Location, b: Location): boolean {
  return locationKey(a) === locationKey(b)
}

function parseReconcile(file: string): { edits: Edit[]; presentational: number; compositeDeferred: number } {
  const rows = readFileSync(file, 'utf8').split(/\r?\n/)
  const edits: Edit[] = []
  let presentational = 0
  let compositeDeferred = 0
  const ordinals = new Map<string, number>()

  for (const line of rows) {
    if (!line.startsWith('| ') || line.includes('|---') || line.includes('| location |')) continue
    const cells = splitMarkdownRow(line)
    if (cells.length < 7) continue
    const [locCell, slotCell, , verdictCell, tokenCell] = cells
    const verdict = unescapeCell(verdictCell ?? '')
    if (verdict === 'PRESENTATIONAL') {
      presentational++
      continue
    }
    if (verdict !== 'MATCHED') continue

    const token = stripCode(tokenCell ?? '')
    if (!token || token.includes('+')) {
      console.warn(`WARN composite-deferred: ${locCell} ${slotCell} -> ${token}`)
      compositeDeferred++
      continue
    }

    const locationLabel = unescapeCell(locCell ?? '')
    // These reconcile rows describe nested placeholders inside one bracket span. They need a
    // holistic cell rewrite, not independent delete/insert requests, or ranges overlap.
    if (locationLabel === '[T34 r1 c5]' || locationLabel === '[T83 r7 c1]') {
      console.warn(`WARN composite-deferred nested slot: ${locationLabel} ${slotCell} -> ${token}`)
      compositeDeferred++
      continue
    }
    const location = parseLocation(locationLabel)
    const slotText = stripCode(slotCell ?? '')
    const slotKind: SlotKind = slotText === '____' ? 'blank' : 'bracket'
    const bucket = `${locationKey(location)}\u0000${slotKind}\u0000${slotText}`
    const cellOrdinal = ordinals.get(bucket) ?? 0
    ordinals.set(bucket, cellOrdinal + 1)
    edits.push({ location, locationLabel, cellOrdinal, slotText, slotKind, token })
  }
  return { edits, presentational, compositeDeferred }
}

function paragraphHits(p: docs_v1.Schema$Paragraph): Hit[] {
  const offsets: number[] = []
  let text = ''
  for (const el of p.elements ?? []) {
    if (el.textRun?.content != null && el.startIndex != null) {
      for (let i = 0; i < el.textRun.content.length; i++) offsets.push(el.startIndex + i)
      text += el.textRun.content
    }
  }

  const out: Hit[] = []
  function range(at: number, len: number): { startIndex: number; endIndex: number } | null {
    if (len <= 0 || offsets[at] == null || offsets[at + len - 1] == null) return null
    return { startIndex: offsets[at]!, endIndex: offsets[at + len - 1]! + 1 }
  }

  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0]!
    if (raw.startsWith('${{')) continue
    const r = range(m.index!, raw.length)
    if (r) out.push({ ...r, kind: 'token', raw, name: raw.replace(/^\{\{/, '').replace(/\}\}$/, '') })
  }
  for (const m of text.matchAll(BRACKET_RE)) {
    const raw = m[0]!
    const r = range(m.index!, raw.length)
    if (r) out.push({ ...r, kind: 'bracket', raw, name: m[1]?.trim() })
  }
  for (const m of text.matchAll(BLANK_RE)) {
    const raw = m[0]!
    const r = range(m.index!, raw.length)
    if (r) out.push({ ...r, kind: 'blank', raw })
  }
  out.sort((a, b) => a.startIndex - b.startIndex)
  return out
}

function walkDoc(doc: docs_v1.Schema$Document): Cell[] {
  const cells: Cell[] = []
  let tableIndex = 0
  for (const el of doc.body?.content ?? []) {
    if (el.paragraph) {
      const hits = paragraphHits(el.paragraph)
      if (hits.length) cells.push({ location: 'para', locationLabel: '[para]', hits })
    } else if (el.table) {
      const tIdx = ++tableIndex
      const rows = el.table.tableRows ?? []
      for (let r = 0; r < rows.length; r++) {
        const tCells = rows[r]?.tableCells ?? []
        for (let c = 0; c < tCells.length; c++) {
          const hits: Hit[] = []
          for (const ce of tCells[c]?.content ?? []) {
            if (ce.paragraph) hits.push(...paragraphHits(ce.paragraph))
          }
          hits.sort((a, b) => a.startIndex - b.startIndex)
          if (hits.length) cells.push({ location: { tableIndex: tIdx, row: r, col: c }, locationLabel: `[T${tIdx} r${r} c${c}]`, hits })
        }
      }
    }
  }
  return cells
}

function paragraphTextAndRange(p: docs_v1.Schema$Paragraph): { text: string; startIndex: number; endIndex: number } | null {
  let text = ''
  let startIndex: number | null = null
  let endIndex: number | null = null
  for (const el of p.elements ?? []) {
    const content = el.textRun?.content
    if (content == null || el.startIndex == null) continue
    if (startIndex == null) startIndex = el.startIndex
    text += content
    endIndex = el.startIndex + content.length
  }
  if (startIndex == null || endIndex == null) return null
  // Preserve the paragraph mark; deleting it can remove required Docs structure.
  if (text.endsWith('\n')) {
    text = text.slice(0, -1)
    endIndex -= 1
  }
  return { text, startIndex, endIndex }
}

function walkCellRanges(doc: docs_v1.Schema$Document): CellRange[] {
  const ranges: CellRange[] = []
  let tableIndex = 0
  for (const el of doc.body?.content ?? []) {
    if (!el.table) continue
    const tIdx = ++tableIndex
    const rows = el.table.tableRows ?? []
    for (let r = 0; r < rows.length; r++) {
      const tCells = rows[r]?.tableCells ?? []
      for (let c = 0; c < tCells.length; c++) {
        const parts: Array<{ text: string; startIndex: number; endIndex: number }> = []
        for (const ce of tCells[c]?.content ?? []) {
          if (ce.paragraph) {
            const part = paragraphTextAndRange(ce.paragraph)
            if (part) parts.push(part)
          }
        }
        if (parts.length === 0) continue
        const startIndex = parts[0]!.startIndex
        const endIndex = parts.at(-1)!.endIndex
        ranges.push({
          location: { tableIndex: tIdx, row: r, col: c },
          locationLabel: `[T${tIdx} r${r} c${c}]`,
          startIndex,
          endIndex,
          text: parts.map((p) => p.text).join('\n'),
        })
      }
    }
  }
  return ranges
}

function normalizedBracketText(s: string): string {
  return s.replace(/^\[/, '').replace(/\]$/, '').replace(/\s+/g, ' ').trim()
}

function slotMatches(edit: Edit, hit: Hit): boolean {
  if (hit.kind !== edit.slotKind) return false
  if (edit.slotKind === 'blank') return true
  if (hit.raw === edit.slotText) return true
  const inner = normalizedBracketText(edit.slotText)
  const live = normalizedBracketText(hit.raw)
  if (inner === live) return true
  // Reconcile rows may contain scanner-truncated long bracket labels ending in an ellipsis.
  if (inner.includes('…')) {
    const prefix = inner.slice(0, inner.indexOf('…')).trim()
    return live.startsWith(prefix)
  }
  return false
}

function matchEdits(edits: Edit[], cells: Cell[]): { matched: MatchedEdit[]; errors: string[] } {
  const matched: MatchedEdit[] = []
  const errors: string[] = []
  for (const edit of edits) {
    const candidates = cells
      .filter((c) => sameLocation(c.location, edit.location))
      .flatMap((c) => c.hits)
      .filter((h) => slotMatches(edit, h))
    const hit = candidates[edit.cellOrdinal]
    if (!hit) {
      errors.push(`${edit.locationLabel} ord=${edit.cellOrdinal} ${edit.slotText} -> {{${edit.token}}}: live slot not found`)
      continue
    }
    matched.push({ ...edit, hit })
  }
  return { matched, errors }
}

function stats(cells: Cell[]): { tokens: number; brackets: number; blanks: number } {
  let tokens = 0, brackets = 0, blanks = 0
  for (const c of cells) for (const h of c.hits) {
    if (h.kind === 'token') tokens++
    else if (h.kind === 'bracket') brackets++
    else blanks++
  }
  return { tokens, brackets, blanks }
}

async function getTitle(fileId: string): Promise<string> {
  const { data } = await drive.files.get({ fileId, supportsAllDrives: true, fields: 'name' })
  return data.name ?? '(untitled)'
}

function printPlan(args: {
  title: string
  id: string
  reconcile: string
  parsed: { edits: Edit[]; presentational: number; compositeDeferred: number }
  walker: { tokens: number; brackets: number; blanks: number }
  matched: MatchedEdit[]
  errors: string[]
}) {
  console.log(`target doc: ${args.title} (${args.id})`)
  console.log(`reconcile: ${args.reconcile}  matched=${args.parsed.edits.length}  presentational=${args.parsed.presentational}  composite-deferred=${args.parsed.compositeDeferred}`)
  console.log(`walker found: tokens=${args.walker.tokens}  brackets=${args.walker.brackets}  blanks=${args.walker.blanks}`)
  console.log(`planned edits: ${args.matched.length}`)
  const samples = args.matched.length <= 10 ? args.matched : [...args.matched.slice(0, 5), ...args.matched.slice(-5)]
  for (const e of samples) console.log(`${e.locationLabel} ord=${e.cellOrdinal}  "${e.slotText}"  →  {{${e.token}}}  (range ${e.hit.startIndex}-${e.hit.endIndex})`)
  if (args.errors.length) {
    console.error(`errors: ${args.errors.length}`)
    for (const e of args.errors.slice(0, 10)) console.error(`  ${e}`)
  }
}

async function loadDocument(docId: string): Promise<docs_v1.Schema$Document> {
  const { data } = await docs.documents.get({ documentId: docId })
  return data
}

async function commandCopy(sourceRaw: string): Promise<void> {
  const sourceDocId = parseDocId(sourceRaw)
  const allowed = masterIds()
  if (!allowed.includes(sourceDocId)) throw new Error('copy only allows GOOGLE_MASTER_MUAP_DOC_ID or GOOGLE_MASTER_RSK_V2_DOC_ID')
  const sourceName = await getTitle(sourceDocId)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const { data } = await drive.files.copy({
    fileId: sourceDocId,
    supportsAllDrives: true,
    requestBody: { name: `[TOKEN-SPEC-COPY ${stamp}] ${sourceName}`, mimeType: 'application/vnd.google-apps.document' },
    fields: 'id,name',
  })
  console.log(`[${data.name}]: ${data.id}`)
  console.log(`url: https://docs.google.com/document/d/${data.id}/edit`)
}

function removeOverlappingEdits(parsed: ReturnType<typeof parseReconcile>, matched: MatchedEdit[]): { parsed: ReturnType<typeof parseReconcile>; matched: MatchedEdit[] } {
  const byCell = new Map<string, MatchedEdit[]>()
  for (const m of matched) {
    const k = locationKey(m.location)
    if (!byCell.has(k)) byCell.set(k, [])
    byCell.get(k)!.push(m)
  }
  const deferred = new Set<MatchedEdit>()
  for (const group of byCell.values()) {
    const sorted = [...group].sort((a, b) => a.hit.startIndex - b.hit.startIndex || b.hit.endIndex - a.hit.endIndex)
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!, b = sorted[j]!
        if (b.hit.startIndex >= a.hit.endIndex) break
        deferred.add(a)
        deferred.add(b)
      }
    }
  }
  if (deferred.size === 0) return { parsed, matched }
  for (const d of deferred) console.warn(`WARN composite-deferred overlapping slot: ${d.locationLabel} ${d.slotText} -> {{${d.token}}}`)
  const kept = matched.filter((m) => !deferred.has(m))
  const keptKeys = new Set(kept.map((m) => `${locationKey(m.location)}\u0000${m.cellOrdinal}\u0000${m.slotKind}\u0000${m.slotText}\u0000${m.token}`))
  return {
    parsed: {
      ...parsed,
      compositeDeferred: parsed.compositeDeferred + deferred.size,
      edits: parsed.edits.filter((e) => keptKeys.has(`${locationKey(e.location)}\u0000${e.cellOrdinal}\u0000${e.slotKind}\u0000${e.slotText}\u0000${e.token}`)),
    },
    matched: kept,
  }
}

async function plan(reconcile: string, targetRaw: string): Promise<{
  docId: string
  title: string
  parsed: ReturnType<typeof parseReconcile>
  cells: Cell[]
  matched: MatchedEdit[]
  errors: string[]
}> {
  const docId = parseDocId(targetRaw)
  const [title, doc] = await Promise.all([getTitle(docId), loadDocument(docId)])
  const initialParsed = parseReconcile(reconcile)
  const cells = walkDoc(doc)
  const { matched: initialMatched, errors } = matchEdits(initialParsed.edits, cells)
  const { parsed, matched } = removeOverlappingEdits(initialParsed, initialMatched)
  return { docId, title, parsed, cells, matched, errors }
}

async function commandApply(reconcile: string, targetRaw: string, flags: string[]): Promise<void> {
  const shouldApply = flags.includes('--apply')
  const targetMaster = flags.includes('--target-master')
  const docId = parseDocId(targetRaw)
  if (masterIds().includes(docId) && !(targetMaster && process.env.APPLY_TO_MASTER_CONFIRMED === 'yes')) {
    throw new Error('refusing to apply to a real master without --target-master and APPLY_TO_MASTER_CONFIRMED=yes')
  }
  const p = await plan(reconcile, docId)
  printPlan({ title: p.title, id: p.docId, reconcile, parsed: p.parsed, walker: stats(p.cells), matched: p.matched, errors: p.errors })
  if (p.errors.length) process.exit(1)
  if (!shouldApply) return

  console.error(`APPLYING ${p.matched.length} edits to ${p.docId} (${p.title})`)
  const sorted = [...p.matched].sort((a, b) => b.hit.startIndex - a.hit.startIndex)
  const requests: docs_v1.Schema$Request[] = []
  for (const e of sorted) {
    requests.push({ deleteContentRange: { range: { startIndex: e.hit.startIndex, endIndex: e.hit.endIndex } } })
    requests.push({ insertText: { location: { index: e.hit.startIndex }, text: `{{${e.token}}}` } })
  }
  const res = await docs.documents.batchUpdate({ documentId: p.docId, requestBody: { requests } })
  console.log(`batchUpdate status: ${res.status} replies=${res.data.replies?.length ?? 0}`)
  await commandVerify(reconcile, p.docId)
}

async function commandVerify(reconcile: string, targetRaw: string): Promise<void> {
  const docId = parseDocId(targetRaw)
  const [title, doc] = await Promise.all([getTitle(docId), loadDocument(docId)])
  const parsed = parseReconcile(reconcile)
  const cells = walkDoc(doc)
  let matched = 0, mismatch = 0, missing = 0
  const examples: string[] = []
  for (const edit of parsed.edits) {
    const cellHits = cells.filter((c) => sameLocation(c.location, edit.location)).flatMap((c) => c.hits)
    const hasToken = cellHits.some((h) => h.kind === 'token' && h.raw === `{{${edit.token}}}`)
    const hasOriginal = cellHits.some((h) => slotMatches(edit, h))
    if (hasToken) matched++
    else if (hasOriginal) {
      mismatch++
      if (examples.length < 10) examples.push(`${edit.locationLabel} still has ${edit.slotText} for {{${edit.token}}}`)
    } else {
      missing++
      if (examples.length < 10) examples.push(`${edit.locationLabel} missing slot and token for {{${edit.token}}}`)
    }
  }
  const st = stats(cells)
  console.log(`verify target: ${title} (${docId})`)
  console.log(`verify reconcile: ${reconcile}  expected=${parsed.edits.length}  composite-deferred=${parsed.compositeDeferred}`)
  console.log(`walker found: tokens=${st.tokens}  brackets=${st.brackets}  blanks=${st.blanks}`)
  console.log(`verify: matched=${matched} mismatch=${mismatch} missing=${missing}`)
  for (const e of examples) console.log(`  ${e}`)
  if (mismatch || missing) process.exitCode = 1
}

function parseCompositeSpec(file: string): CompositeSpec[] {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(parsed)) throw new Error('composite spec must be a JSON array')
  return parsed.map((entry, i) => {
    const e = entry as Partial<CompositeSpec>
    if ((e.doc !== 'muap' && e.doc !== 'rsk') || !e.location || typeof e.targetText !== 'string' || typeof e.rationale !== 'string') {
      throw new Error(`invalid composite spec entry at index ${i}`)
    }
    const { tableIndex, row, col } = e.location
    if (!Number.isInteger(tableIndex) || !Number.isInteger(row) || !Number.isInteger(col)) throw new Error(`invalid location at index ${i}`)
    return { doc: e.doc, location: { tableIndex, row, col }, rationale: e.rationale, targetText: e.targetText }
  })
}

async function commandComposite(specFile: string, targetRaw: string, flags: string[]): Promise<void> {
  const shouldApply = flags.includes('--apply')
  const targetMaster = flags.includes('--target-master')
  const docId = parseDocId(targetRaw)
  if (masterIds().includes(docId) && !(targetMaster && process.env.APPLY_TO_MASTER_CONFIRMED === 'yes')) {
    throw new Error('refusing to apply to a real master without --target-master and APPLY_TO_MASTER_CONFIRMED=yes')
  }
  const [title, doc] = await Promise.all([getTitle(docId), loadDocument(docId)])
  const [muapMaster, rskMaster] = masterIds()
  const docKind: CompositeSpec['doc'] = docId === muapMaster || /MUAP/i.test(title) ? 'muap' : docId === rskMaster || /RSK/i.test(title) ? 'rsk' : (() => { throw new Error('cannot infer target doc kind from id/title') })()
  const spec = parseCompositeSpec(specFile).filter((entry) => entry.doc === docKind)
  const ranges = walkCellRanges(doc)
  const errors: string[] = []
  const planned: Array<CompositeSpec & { range: CellRange }> = []
  for (const entry of spec) {
    const found = ranges.find((r) => sameLocation(r.location, entry.location))
    if (!found) {
      errors.push(`[T${entry.location.tableIndex} r${entry.location.row} c${entry.location.col}] cell not found`)
      continue
    }
    planned.push({ ...entry, range: found })
  }

  const cells = walkDoc(doc)
  const st = stats(cells)
  console.log(`target doc: ${title} (${docId})`)
  console.log(`composite spec: ${specFile}  doc=${docKind}  entries=${spec.length}`)
  console.log(`walker found: tokens=${st.tokens}  brackets=${st.brackets}  blanks=${st.blanks}`)
  console.log(`planned composite edits: ${planned.length}`)
  for (const p of planned) {
    console.log(`${p.range.locationLabel}  range ${p.range.startIndex}-${p.range.endIndex}`)
    console.log(`  old: ${p.range.text.replace(/\s+/g, ' ').trim()}`)
    console.log(`  new: ${p.targetText}`)
  }
  if (errors.length) {
    console.error(`errors: ${errors.length}`)
    for (const e of errors.slice(0, 10)) console.error(`  ${e}`)
    process.exit(1)
  }
  if (!shouldApply) return

  console.error(`APPLYING ${planned.length} composite cell rewrites to ${docId} (${title})`)
  const requests: docs_v1.Schema$Request[] = []
  for (const p of [...planned].sort((a, b) => b.range.startIndex - a.range.startIndex)) {
    if (p.range.endIndex > p.range.startIndex) requests.push({ deleteContentRange: { range: { startIndex: p.range.startIndex, endIndex: p.range.endIndex } } })
    requests.push({ insertText: { location: { index: p.range.startIndex }, text: p.targetText } })
  }
  const res = await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } })
  console.log(`batchUpdate status: ${res.status} replies=${res.data.replies?.length ?? 0}`)
}

const [cmd, a, b, ...flags] = process.argv.slice(2)
if (!cmd) usage()
if (cmd === 'copy') {
  if (!a || b) usage()
  await commandCopy(a)
} else if (cmd === 'apply') {
  if (!a || !b) usage()
  await commandApply(a, b, flags)
} else if (cmd === 'verify') {
  if (!a || !b || flags.length) usage()
  await commandVerify(a, b)
} else if (cmd === 'composite') {
  if (!a || !b) usage()
  await commandComposite(a, b, flags)
} else usage()
