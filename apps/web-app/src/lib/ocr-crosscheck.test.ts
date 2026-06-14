import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  crossCheckSptVsLapkeu,
  crossCheckAktaVsCustomer,
  crossCheckIdentityVsCustomerMaster,
  crossCheckAppraisalVsAdvisory,
} from './ocr-crosscheck'
import type { AdvisoryExtraction } from './types'

const adv = (value: number): AdvisoryExtraction => ({ value, label: 'x', docType: 'd', detectedAt: 'now' })

test('SPT vs LapKeu — null when nothing to compare', () => {
  assert.equal(crossCheckSptVsLapkeu(undefined), null)
  assert.equal(crossCheckSptVsLapkeu({ pendapatanSpt: adv(100) }), null, 'no LapKeu side')
  assert.equal(crossCheckSptVsLapkeu({ omzet: adv(100) }), null, 'no SPT side')
})

test('SPT vs LapKeu — match within tolerance, mismatch when materially different', () => {
  const close = crossCheckSptVsLapkeu({ pendapatanSpt: adv(100_000_000), labaBersih: adv(110_000_000) })
  assert.equal(close?.status, 'match')

  const far = crossCheckSptVsLapkeu({ pendapatanSpt: adv(50_000_000), labaBersih: adv(500_000_000) })
  assert.equal(far?.status, 'mismatch')
  assert.equal(far?.against, 'spt_vs_lapkeu')
  assert.ok(far?.note && /advisory/i.test(far.note), 'note marks it advisory, not a blocker')
})

test('Akta vs Customer — match when name sets agree, mismatch on diff (names only, no NIK)', () => {
  const none = crossCheckAktaVsCustomer(null, { pengurus: [{ nama: 'Budi' }] })
  assert.equal(none, null, 'no extracted roster → nothing to check')

  const match = crossCheckAktaVsCustomer(
    [{ nama: 'Budi Santoso' }, { nama: 'Siti Aminah' }],
    { pengurus: [{ nama: 'budi santoso' }], pemegangSaham: [{ nama: 'Siti  Aminah' }] },
  )
  assert.equal(match?.status, 'match', 'case/space-insensitive name match')

  const diff = crossCheckAktaVsCustomer(
    [{ nama: 'Budi', nik: '3201234567890123' }],
    { pengurus: [{ nama: 'Andi' }] },
  )
  assert.equal(diff?.status, 'mismatch')
  assert.ok(diff?.note?.includes('Budi') && diff?.note?.includes('Andi'))
  assert.ok(!diff?.note?.includes('3201234567890123'), 'raw NIK must not appear in an advisory note (PII)')
})

test('identity vs customer-master — advisory note on diff, never embeds raw NIK/NPWP', () => {
  assert.equal(crossCheckIdentityVsCustomerMaster({ nik: '111' }, null), null, 'no customer → null')
  assert.equal(crossCheckIdentityVsCustomerMaster({ nik: '111' }, { npwp: '999' }), null, 'nothing comparable')

  const same = crossCheckIdentityVsCustomerMaster({ nik: '3201234567890123' }, { nik: '3201234567890123' })
  assert.equal(same?.status, 'match')

  const diff = crossCheckIdentityVsCustomerMaster(
    { nik: '3201234567890123', npwp: '09.254.294.3-407.000' },
    { nik: '3209999999999999', npwp: '09.254.294.3-407.000' },
  )
  assert.equal(diff?.status, 'mismatch')
  assert.equal(diff?.against, 'identity_vs_customer_master')
  assert.ok(diff?.note?.includes('NIK'), 'names the differing field')
  assert.ok(!diff?.note?.includes('3201234567890123') && !diff?.note?.includes('3209999999999999'), 'no raw NIK in the note (PII)')
  // advisory only — distinct from the existing NIK BLOCKER (extractionMismatches.nik)
  assert.ok(/advisory|bukan blokir/i.test(diff?.note ?? ''))
})

// ── P3-D structured Penilaian (design §4): structured nilaiPasar/nilaiLikuidasi vs P2 OCR advisory ──
// ADVISORY ONLY — never a blocker, never an LTV input. Same 30% material tolerance as the other amounts.

test('appraisal vs advisory — null when there is nothing to compare', () => {
  assert.equal(crossCheckAppraisalVsAdvisory(null, undefined), null, 'no record + no advisory')
  assert.equal(crossCheckAppraisalVsAdvisory({ nilaiPasar: 100 }, undefined), null, 'no advisory side')
  assert.equal(crossCheckAppraisalVsAdvisory(undefined, { nilaiPasar: adv(100) }), null, 'no record side')
  assert.equal(crossCheckAppraisalVsAdvisory({}, { nilaiPasar: adv(100) }), null, 'record has no figures')
  assert.equal(
    crossCheckAppraisalVsAdvisory({ nilaiPasar: 100 }, { nilaiLikuidasi: adv(80) }),
    null,
    'no overlapping figure present on both sides',
  )
})

test('appraisal vs advisory — within tolerance is a match', () => {
  // 1.0B vs 1.05B (5% gap) is well within the 30% material tolerance.
  const cc = crossCheckAppraisalVsAdvisory(
    { nilaiPasar: 1_000_000_000, nilaiLikuidasi: 800_000_000 },
    { nilaiPasar: adv(1_050_000_000), nilaiLikuidasi: adv(820_000_000) },
  )
  assert.equal(cc?.status, 'match')
  assert.equal(cc?.against, 'appraisal_vs_advisory')
})

test('appraisal vs advisory — a material gap is an advisory mismatch (never a blocker)', () => {
  // structured nilaiPasar 1.0B vs OCR advisory 600M → 40% gap > 30% tolerance.
  const cc = crossCheckAppraisalVsAdvisory(
    { nilaiPasar: 1_000_000_000 },
    { nilaiPasar: adv(600_000_000) },
  )
  assert.equal(cc?.status, 'mismatch')
  assert.equal(cc?.against, 'appraisal_vs_advisory')
  assert.ok(/nilai pasar/.test(cc?.note ?? ''), 'names the differing figure')
  assert.ok(/advisory|bukan blokir/i.test(cc?.note ?? ''), 'note states it is advisory, not a blocker')
})

test('appraisal vs advisory — only the materially-different figure is named', () => {
  // nilaiPasar agrees (match), nilaiLikuidasi differs materially → mismatch naming only likuidasi.
  const cc = crossCheckAppraisalVsAdvisory(
    { nilaiPasar: 1_000_000_000, nilaiLikuidasi: 800_000_000 },
    { nilaiPasar: adv(1_000_000_000), nilaiLikuidasi: adv(400_000_000) },
  )
  assert.equal(cc?.status, 'mismatch')
  assert.ok(/nilai likuidasi/.test(cc?.note ?? ''), 'names nilai likuidasi')
  assert.ok(!/nilai pasar/.test(cc?.note ?? ''), 'does not name the agreeing nilai pasar')
})
