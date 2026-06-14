import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planAiExtraction } from './ai-extraction-apply'
import type { FieldKind } from './extraction-registry'

// kindOf stub mirroring the registry: gating for the hard-gate inputs, advisory for the OCR-widening
// keys (design §3), identity for the rest.
const ADVISORY = new Set(['omzet', 'labaBersih', 'pendapatanSpt', 'saldoRataRata', 'bakiDebet', 'fasilitasAktif', 'nilaiPasar', 'nilaiLikuidasi'])
const kindOf = (fp: string): FieldKind | undefined =>
  fp.startsWith('hardGates.') || fp.startsWith('financialInputs.') ? 'gating' : ADVISORY.has(fp) ? 'advisory' : 'identity'

test('planAiExtraction — gating coerced to number, identity kept string', () => {
  const plan = planAiExtraction(
    { known: { npwp: { value: '09.254.294.3-407.000', confidence: 0.9 }, 'hardGates.kol': { value: '1', confidence: 0.8 } }, extras: {} },
    'nib',
    kindOf,
  )
  const byPath = Object.fromEntries(plan.candidates.map((c) => [c.fieldPath, c.value]))
  assert.equal(byPath['npwp'], '09.254.294.3-407.000') // identity → string
  assert.strictEqual(byPath['hardGates.kol'], 1) // gating → number (not '1')
})

test('planAiExtraction — extras shaped with source doc-type', () => {
  const plan = planAiExtraction(
    { known: {}, extras: { sektor_usaha: 'Perdagangan', nama_direktur: 'Budi' } },
    'nib',
    kindOf,
  )
  assert.deepEqual(plan.extras, {
    sektor_usaha: { value: 'Perdagangan', sourceDocType: 'nib' },
    nama_direktur: { value: 'Budi', sourceDocType: 'nib' },
  })
})

test('planAiExtraction — empty extraction yields no candidates/extras', () => {
  const plan = planAiExtraction({ known: {}, extras: {} }, 'ktp', kindOf)
  assert.deepEqual(plan.candidates, [])
  assert.deepEqual(plan.advisory, [])
  assert.deepEqual(plan.extras, {})
})

test('CRITICAL — advisory known fields route to advisory, NEVER a gating candidate (design §3)', () => {
  const plan = planAiExtraction(
    { known: { omzet: { value: '1200000000', confidence: 0.9 }, 'hardGates.kol': { value: '1', confidence: 0.8 } }, extras: {} },
    'laporan_keuangan',
    kindOf,
  )
  // omzet (advisory) is NOT a gating candidate — it can never reach a hard gate or blocker set.
  assert.ok(!plan.candidates.some((c) => c.fieldPath === 'omzet'), 'advisory omzet must not be a gating candidate')
  assert.deepEqual(plan.advisory, [{ key: 'omzet', value: '1200000000' }])
  // the real gating field still flows through candidates as a number.
  assert.ok(plan.candidates.some((c) => c.fieldPath === 'hardGates.kol' && c.value === 1))
})
