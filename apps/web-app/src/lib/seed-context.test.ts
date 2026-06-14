import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSeedContext } from './seed-context'
import type { ApplicationDocument, LoanApplication } from './types'

// Slice 2: buildSeedContext surfaces full-document OCR text as `documentTexts`, which the
// narrative prompt feeds to the model (masked at the egress boundary). Only docs that have
// been transcribed appear; the label is the doc name.

function appWith(documents: ApplicationDocument[]): LoanApplication {
  return {
    id: 'FOS-2026-001',
    nasabahName: 'CV Maju Bersama',
    nasabahType: 'business',
    namaUsaha: 'CV Maju Bersama',
    akadType: 'Murabahah',
    requestedPlafond: 500_000_000,
    requestedTenorMonths: 36,
    purpose: 'Modal kerja',
    marginRate: 14,
    collateralType: 'fixed_asset',
    hardGates: { dsr: 30, ltv: 60, kol: 1 },
    hardGateViolations: [],
    financialInputs: {
      netMonthlyIncome: 0,
      existingMonthlyObligations: 0,
      collateralAppraisedValue: 0,
      proposedMonthlyInstallment: 0,
      projectedMonthlyProfitShare: 0,
    },
    analysis: { character: '', capacity: '', capital: '', condition: '', collateral: '', syariah: '' },
    documents,
  } as unknown as LoanApplication
}

const doc = (over: Partial<ApplicationDocument>): ApplicationDocument =>
  ({ id: 'd', name: 'Doc', docType: 'slik_report', status: 'uploaded', required: true, ...over }) as ApplicationDocument

test('buildSeedContext — only transcribed docs become documentTexts, labelled by name', () => {
  const ctx = buildSeedContext(
    appWith([
      doc({ id: 'd1', name: 'Laporan SLIK', extractedText: 'LAPORAN SLIK\nKol 1' }),
      doc({ id: 'd2', name: 'KTP', extractedText: undefined }),
      doc({ id: 'd3', name: 'Slip Gaji', docType: 'slip_gaji', extractedText: 'Penghasilan 10jt' }),
    ]),
  )
  assert.deepEqual(ctx.documentTexts, [
    { label: 'Laporan SLIK', text: 'LAPORAN SLIK\nKol 1' },
    { label: 'Slip Gaji', text: 'Penghasilan 10jt' },
  ])
})

test('buildSeedContext — no transcribed docs → empty documentTexts (no narrative grounding)', () => {
  const ctx = buildSeedContext(appWith([doc({ id: 'd1', name: 'KTP', extractedText: undefined })]))
  assert.deepEqual(ctx.documentTexts, [])
})

test('buildSeedContext — Batch 5: RM bureau summary flows to the drafter (was a context gap)', () => {
  const base = appWith([])
  // absent → undefined (no bureau work yet)
  assert.equal(buildSeedContext(base).bureauSummary, undefined)
  // present → the summary text is surfaced for the drafter (masked later at egress in narrative.ts)
  const withBureau = { ...base, bureauSummary: { summary: 'SLIK Kol 1, tidak ada tunggakan; Pefindo bersih.', model: 'm', generatedAt: '2026-06-10T00:00:00Z', generatedByName: 'RM' } } as unknown as LoanApplication
  assert.match(buildSeedContext(withBureau).bureauSummary ?? '', /SLIK Kol 1/)
})
