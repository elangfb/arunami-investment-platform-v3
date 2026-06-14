import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SnapshotSchema, buildExtractPrompt, unmaskSnapshot } from './extract-from-markdown-core'
import { piiSecrets } from '@/lib/pii-mask'
import type { ExtractedSnapshot } from '@/lib/extraction/types'

// Read-back core: the Zod schema is the safety boundary (the model only ever produces a valid
// ExtractedSnapshot or the run is rejected), and unmaskSnapshot restores the analyst's real text
// from the masked domain the model worked in. Both are pure → hermetically testable.

const VALID: ExtractedSnapshot = {
  matrix: [
    { aspect: 'character', level: 'low', finding: 'Rekam jejak baik', mitigation: '' },
    { aspect: 'capacity', level: 'high', finding: 'DSR ketat', mitigation: 'Perpendek tenor' },
    { aspect: 'sharia_compliance', level: null, finding: '', mitigation: '' },
  ],
  ratios: [
    { key: 'dscri', points: [{ period: '2024', value: 1.2, raw: '1,2x' }], sourceDoc: 'muap' },
  ],
  collateral: { marketValue: 500_000_000, liquidationValue: 400_000_000, sccrPercent: 133 },
  racDeviations: [{ item: 'Plafond meldebihi BMPK', justification: 'Disetujui direksi' }],
}

test('SnapshotSchema — accepts a well-formed snapshot, levels constrained to the enum', () => {
  const r = SnapshotSchema.safeParse(VALID)
  assert.equal(r.success, true)
})

test('SnapshotSchema — rejects an out-of-enum risk level (model must not invent levels)', () => {
  const bad = { ...VALID, matrix: [{ aspect: 'character', level: 'tinggi sekali', finding: '', mitigation: '' }] }
  const r = SnapshotSchema.safeParse(bad)
  assert.equal(r.success, false, 'a non-low/medium/high level fails parse → shell rejects the run (snapshot null)')
})

test('SnapshotSchema — rejects an unknown matrix aspect', () => {
  const bad = { ...VALID, matrix: [{ aspect: 'liquidity', level: 'low', finding: '', mitigation: '' }] }
  assert.equal(SnapshotSchema.safeParse(bad).success, false)
})

test('SnapshotSchema — level may be null (blank cell) but the field must be present', () => {
  assert.equal(SnapshotSchema.safeParse(VALID).success, true) // VALID has a null level row
  const missingFinding = { ...VALID, matrix: [{ aspect: 'capital', level: 'low', mitigation: '' }] }
  assert.equal(SnapshotSchema.safeParse(missingFinding).success, false, 'finding is required (string)')
})

test('unmaskSnapshot — restores the analyst PII the model echoed as a placeholder', () => {
  const secrets = piiSecrets({ nasabahName: 'Budi Santoso', namaUsaha: 'Toko Maju Jaya' })
  const masked: ExtractedSnapshot = {
    matrix: [{ aspect: 'character', level: 'low', finding: '[NASABAH] pemilik [USAHA]', mitigation: '' }],
    ratios: [],
    collateral: { marketValue: null, liquidationValue: null, sccrPercent: null },
    racDeviations: [{ item: 'Agunan [USAHA]', justification: '[NASABAH] menjamin' }],
  }
  const out = unmaskSnapshot(masked, secrets)
  assert.equal(out.matrix[0].finding, 'Budi Santoso pemilik Toko Maju Jaya')
  assert.equal(out.racDeviations[0].item, 'Agunan Toko Maju Jaya')
  assert.equal(out.racDeviations[0].justification, 'Budi Santoso menjamin')
})

test('buildExtractPrompt — RSK then MUAP; either may be absent', () => {
  const both = buildExtractPrompt('MUAP-BODY', 'RSK-BODY')
  assert.ok(both.indexOf('RSK-BODY') < both.indexOf('MUAP-BODY'), 'RSK section precedes MUAP')

  const rskOnly = buildExtractPrompt(null, 'RSK-BODY')
  assert.ok(rskOnly.includes('RSK-BODY') && !rskOnly.includes('MUAP'))

  const muapOnly = buildExtractPrompt('MUAP-BODY', null)
  assert.ok(muapOnly.includes('MUAP-BODY') && !muapOnly.includes('matriks risiko'))
})
