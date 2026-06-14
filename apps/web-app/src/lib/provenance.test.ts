import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  provenanceFromExtractionSource,
  provenanceTone,
  provenanceLabel,
  needsAttention,
  dataAttentionCount,
  type Provenance,
} from './provenance'

test('maps every ExtractionSource to a provenance state', () => {
  assert.equal(provenanceFromExtractionSource('ocr_suggested'), 'suggested')
  assert.equal(provenanceFromExtractionSource('ocr_confirmed'), 'confirmed')
  assert.equal(provenanceFromExtractionSource('ocr_overridden'), 'overridden')
  assert.equal(provenanceFromExtractionSource('human_entered'), 'confirmed')
})

test('tones are colorblind-aware (blue/green/amber, never red/green adjacency)', () => {
  assert.equal(provenanceTone('suggested'), 'info')
  assert.equal(provenanceTone('confirmed'), 'success')
  assert.equal(provenanceTone('overridden'), 'success')
  assert.equal(provenanceTone('ungrounded'), 'warning')
})

test('labels are the Bahasa tri-state + ungrounded flag', () => {
  assert.equal(provenanceLabel('suggested'), 'Disarankan AI')
  assert.equal(provenanceLabel('confirmed'), 'Dikonfirmasi')
  assert.equal(provenanceLabel('overridden'), 'Diubah')
  assert.equal(provenanceLabel('ungrounded'), 'Tanpa sumber')
})

test('needsAttention flags only suggested + ungrounded (the Data-nav badge signal)', () => {
  const states: Provenance[] = ['suggested', 'confirmed', 'overridden', 'ungrounded']
  assert.deepEqual(
    states.filter(needsAttention),
    ['suggested', 'ungrounded'],
  )
})

test('dataAttentionCount includes OCR suggestions plus conservative required blanks', () => {
  const base = {
    stage: 2 as const,
    nik: '',
    akadType: 'Murabahah' as const,
    marginRate: null,
    documents: [{ id: 'slik', name: 'SLIK', docType: 'slik_report', status: 'uploaded' as const, required: true }],
    kolEntered: false,
    financialsAssessed: true,
    financialInputs: {
      netMonthlyIncome: 0,
      existingMonthlyObligations: 0,
      collateralAppraisedValue: 0,
      proposedMonthlyInstallment: null,
      projectedMonthlyProfitShare: null,
    },
    extractionSources: { 'hardGates.kol': 'ocr_suggested' as const },
  }

  assert.equal(dataAttentionCount(base), 2, 'Kol has an OCR suggestion and is still required-but-empty')
  assert.equal(dataAttentionCount({ ...base, kolEntered: true, extractionSources: {} }), 0)
})
