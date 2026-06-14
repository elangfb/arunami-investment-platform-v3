// Minimal, dependency-free single-page PDF writer for the dummy-data generator.
//
// Why hand-rolled: the only consumer is `scripts/gen-dummy-docs.ts` producing throwaway KYC
// paperwork for end-to-end testing. The output must (1) pass the real upload byte-validation
// (`file-type` sniffs the `%PDF` magic → `application/pdf`, see server/storage/documents.ts) and
// (2) carry a real text layer so a real OCR provider (documentai/gemini) reads the gate values
// back. A text-only A4 page with the standard Helvetica base fonts (no embedding) satisfies both
// without pulling a PDF library into the tree.
//
// NOT a general PDF library: one page, ASCII text, fixed layout. Keep it that way.

const PAGE_W = 595 // A4 width in pt
const PAGE_H = 842 // A4 height in pt
const MARGIN_X = 56
const TITLE_TOP = 786 // baseline of the title line
const TITLE_SIZE = 18
const BODY_SIZE = 11
const TITLE_GAP = 34 // title baseline → first body baseline
const LEADING = 18 // body line height

// Make arbitrary text safe inside a PDF literal string: transliterate/strip non-ASCII (so the
// WinAnsi text operator and the `file-type` sniff stay happy) then escape the three chars that
// are special inside a `(...)` literal. Non-obvious enough to name; called per title + per line.
function escapePdfString(text: string): string {
  return text
    .replace(/[—–]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function buildContentStream(title: string, lines: string[]): string {
  const ops: string[] = ['BT', `/F2 ${TITLE_SIZE} Tf`, `${MARGIN_X} ${TITLE_TOP} Td`, `(${escapePdfString(title)}) Tj`, `/F1 ${BODY_SIZE} Tf`, `0 -${TITLE_GAP} Td`]
  lines.forEach((line, i) => {
    if (i > 0) ops.push(`0 -${LEADING} Td`)
    ops.push(`(${escapePdfString(line)}) Tj`)
  })
  ops.push('ET')
  return ops.join('\n')
}

/**
 * Render a single-page A4 PDF: `title` in Helvetica-Bold, each `lines` entry on its own
 * Helvetica row. Returns the raw bytes (latin1-encoded), ready to write to disk or feed to
 * the upload validator. Non-ASCII input is transliterated/stripped (see `sanitize`).
 */
export function renderTextPdf(title: string, lines: string[]): Uint8Array {
  const content = buildContentStream(title, lines)
  const contentLen = Buffer.byteLength(content, 'latin1')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${contentLen} >>\nstream\n${content}\nendstream`,
  ]

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets[i] = Buffer.byteLength(body, 'latin1')
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })

  const xrefStart = Buffer.byteLength(body, 'latin1')
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(body + xref + trailer, 'latin1')
}
