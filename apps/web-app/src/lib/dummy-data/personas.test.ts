import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileTypeFromBuffer } from 'file-type'
import { DUMMY_PERSONAS, docContent, personaDocs, personaHardGates, type DummyPersona } from './personas'
import { renderTextPdf } from './pdf'
import { parseGateValueFromText } from '@/lib/ocr'
import { computeViolations } from '@/lib/hardGates'

// The value parseGateValueFromText (lib/ocr.ts) must read back off each gate document. If the
// authored phrasing in docContent and the parser ever drift, the E2E happy path breaks silently
// under a real OCR provider — this guard keeps the two in lockstep, exactly as the retired
// dummyDoc.test.ts did for the deleted autofill button.
const PARSE_EXPECT: Record<string, (p: DummyPersona) => number> = {
  slik_report: (p) => p.kol,
  slip_gaji: (p) => p.netMonthlyIncome,
  laporan_keuangan: (p) => p.netMonthlyIncome,
  appraisal_agunan: (p) => p.collateralAppraisedValue,
}

for (const p of DUMMY_PERSONAS) {
  test(`${p.slug} — gate documents OCR-parse back to authored values`, () => {
    for (const doc of personaDocs(p)) {
      const expected = PARSE_EXPECT[doc.docType]
      if (!expected) continue
      const { title, lines } = docContent(p, doc.docType)
      const text = [title, ...lines].join('\n')
      assert.equal(parseGateValueFromText(doc.docType, text), expected(p), `${doc.docType} parse mismatch`)
    }
  })

  test(`${p.slug} — KTP carries a printable 16-digit NIK`, () => {
    assert.match(p.nik, /^\d{16}$/)
    assert.ok(docContent(p, 'ktp').lines.some((l) => l.includes(p.nik)), 'NIK printed on KTP')
  })

  test(`${p.slug} — financials sit inside the hard-gate policy (happy path)`, () => {
    assert.deepEqual(computeViolations(personaHardGates(p)), [])
  })

  test(`${p.slug} — every document in the set renders non-empty content`, () => {
    const docs = personaDocs(p)
    assert.ok(docs.some((d) => d.docType === 'slik_report'), 'SLIK included so the Kol gate has input')
    for (const doc of docs) {
      const { title, lines } = docContent(p, doc.docType)
      assert.ok(title.length > 0 && lines.length > 0, `${doc.docType} renders content`)
    }
  })
}

test('renderTextPdf output passes the upload byte-validation as application/pdf', async () => {
  const { title, lines } = docContent(DUMMY_PERSONAS[0], 'ktp')
  const ft = await fileTypeFromBuffer(renderTextPdf(title, lines))
  assert.equal(ft?.mime, 'application/pdf')
})
