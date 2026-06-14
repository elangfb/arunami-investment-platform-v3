import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBureauContext, buildBureauSummaryPrompt } from './bureau-summary'
import { piiSecrets } from './pii-mask'
import { maskForEgress } from '@/server/ai/redact'
import type { LoanApplication } from './types'

const app = {
  id: 'FOS-2026-001',
  nasabahName: 'Budi Santoso',
  nik: '3201234567890123',
  phoneNumber: '0812-3456-7890',
  akadType: 'Murabahah',
  requestedPlafond: 500_000_000,
  hardGates: { dsr: 35, ltv: 60, kol: 1 },
  documents: [
    { id: 'd1', name: 'Laporan SLIK', docType: 'slik_report', status: 'uploaded', required: true },
    { id: 'd2', name: 'Laporan Pefindo', docType: 'pefindo_report', status: 'uploaded', required: false },
    { id: 'd3', name: 'Rekening Koran 3 Bulan Terakhir', docType: 'rekening_koran_pribadi', status: 'uploaded', required: true, extractedText: 'Saldo rata-rata Rp 20.000.000; tidak ada tunggakan.' },
  ],
} as unknown as LoanApplication

test('buildBureauContext — detects which bureau docs are present + collects transcribed text', () => {
  const f = buildBureauContext(app)
  assert.equal(f.hasSlik, true)
  assert.equal(f.hasPefindo, true)
  assert.equal(f.hasRekKoran, true)
  assert.equal(f.kol, 1)
  assert.equal(f.bureauTexts.length, 1) // only the Rek Koran has extractedText
  assert.match(f.bureauTexts[0].text, /Saldo rata-rata/)
})

test('buildBureauSummaryPrompt — forbids verdicts/levels (advisory-only discipline)', () => {
  const prompt = buildBureauSummaryPrompt(buildBureauContext(app))
  assert.match(prompt, /DILARANG/)
  assert.match(prompt, /rekomendasi akhir/)
  assert.match(prompt, /Kol 1/)
})

test('bureau prompt is PII-safe after maskForEgress — name masked, no residual (fail-closed contract)', () => {
  // Asserts the ENABLED masking path; the flag defaults OFF (compliance parked, Fork B4 — see
  // redact.ts maskingEnabled), so turn it ON for this assertion and restore afterwards.
  const prev = process.env.PII_MASK_ENABLED
  try {
    process.env.PII_MASK_ENABLED = '1'
    const prompt = buildBureauSummaryPrompt(buildBureauContext(app))
    // Raw prompt does contain the name (it's masked at egress, not before).
    assert.match(prompt, /Budi Santoso/)
    const { masked, residual } = maskForEgress(prompt, piiSecrets(app))
    assert.equal(residual.length, 0, `unexpected residual PII: ${residual.join(',')}`)
    assert.equal(masked.includes('Budi Santoso'), false) // full name gone
    assert.equal(masked.includes('Santoso'), false) // token-level masking too
    assert.match(masked, /\[NASABAH\]/) // replaced with the placeholder the model sees
  } finally {
    if (prev === undefined) delete process.env.PII_MASK_ENABLED
    else process.env.PII_MASK_ENABLED = prev
  }
})
