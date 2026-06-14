import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { ocrProvider } from './index'
import { extractFromDocument } from '@/lib/ocr'
import type { LoanApplication } from '@/lib/types'

// The swappable OCR boundary: selection is env-only, default = the offline stub, and the stub
// is byte-identical to the pre-abstraction extractFromDocument (behavior-preserving cutover).

const saved = process.env.OCR_PROVIDER
afterEach(() => {
  if (saved === undefined) delete process.env.OCR_PROVIDER
  else process.env.OCR_PROVIDER = saved
})

const app = { id: 'FOS-2026-001', hardGates: { kol: 1 }, requestedPlafond: 100_000_000, requestedTenorMonths: 12 } as unknown as LoanApplication
const bytes = Buffer.from('')

test('ocrProvider — defaults to the stub when OCR_PROVIDER is unset', () => {
  delete process.env.OCR_PROVIDER
  assert.equal(ocrProvider().name, 'stub')
})

test('ocrProvider — selects a registered provider by name', () => {
  process.env.OCR_PROVIDER = 'gemini'
  assert.equal(ocrProvider().name, 'gemini')
})

test('ocrProvider — documentai is registered (production engine, env-gated at call time)', () => {
  process.env.OCR_PROVIDER = 'documentai'
  assert.equal(ocrProvider().name, 'documentai')
})

test('ocrProvider — throws on an unknown provider name (fail loud, not silent)', () => {
  process.env.OCR_PROVIDER = 'nope'
  assert.throws(() => ocrProvider(), /Unknown OCR_PROVIDER/)
})

test('stub provider — byte-identical to extractFromDocument (KTP NIK)', async () => {
  delete process.env.OCR_PROVIDER
  const viaProvider = await ocrProvider().extract({ docKind: 'ktp', bytes, contentType: 'image/png', app })
  assert.deepEqual(viaProvider, extractFromDocument('ktp', app))
})

const fullApp = {
  id: 'FOS-2026-001',
  nasabahName: 'CV Maju Bersama',
  nasabahType: 'business',
  namaUsaha: 'CV Maju Bersama',
  hardGates: { kol: 1 },
  requestedPlafond: 100_000_000,
  requestedTenorMonths: 12,
} as unknown as LoanApplication

test('stub provider — extractFullText fabricates deterministic, offline doc text', async () => {
  delete process.env.OCR_PROVIDER
  const text = await ocrProvider().extractFullText?.({ docKind: 'slik_report', bytes, contentType: 'application/pdf', app: fullApp })
  assert.ok(text, 'returns text')
  assert.match(text!, /LAPORAN SLIK/)
  assert.match(text!, /CV Maju Bersama/)
  assert.match(text!, /Kol 1/)
  // Deterministic: same input → same output.
  const again = await ocrProvider().extractFullText?.({ docKind: 'slik_report', bytes, contentType: 'application/pdf', app: fullApp })
  assert.equal(again, text)
})

test('stub provider — extractFullText carries the extracted field value (KTP → NIK in text)', async () => {
  delete process.env.OCR_PROVIDER
  const nik = extractFromDocument('ktp', fullApp)?.value
  const text = await ocrProvider().extractFullText?.({ docKind: 'ktp', bytes, contentType: 'image/png', app: fullApp })
  assert.match(text!, new RegExp(`NIK: ${nik}`))
})
