import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scrubNarrative } from './narrative-scrub'

test('drops fields that state a decision verdict (any doc)', () => {
  const { fields, violations } = scrubNarrative(
    {
      m_capacity: 'Kapasitas bayar memadai dengan DSR terjaga.',
      m_syariah: 'Pembiayaan ini direkomendasikan untuk disetujui oleh komite.',
    },
    'muap',
  )
  assert.ok(fields.m_capacity, 'legit field kept')
  assert.equal(fields.m_syariah, undefined, 'verdict field dropped')
  assert.ok(violations.some((v) => v.startsWith('m_syariah')))
})

test('drops MEMENUHI/DITOLAK eligibility verdicts', () => {
  const r = scrubNarrative(
    { r_kesimpulan: 'Nasabah tidak memenuhi ketentuan minimum agunan.' },
    'rsk',
  )
  assert.equal(r.fields.r_kesimpulan, undefined)
  assert.ok(r.violations.length === 1)
})

test('drops RSK risk-level verdicts (English + Indonesian framing)', () => {
  const en = scrubNarrative({ r_profil_risiko: 'Overall risk rating: High.' }, 'rsk')
  assert.equal(en.fields.r_profil_risiko, undefined)

  const id = scrubNarrative({ r_profil_risiko: 'Profil risiko nasabah tergolong tinggi.' }, 'rsk')
  assert.equal(id.fields.r_profil_risiko, undefined)
})

test('keeps legit RSK prose with incidental level words (no risk framing)', () => {
  const { fields } = scrubNarrative(
    { r_mitigasi: 'Permintaan pasar tinggi dan stabil; tetapkan covenant pelaporan bulanan.' },
    'rsk',
  )
  assert.ok(fields.r_mitigasi, 'incidental "tinggi" not flagged when not framed as risk level')
})

test('level words alone do not trip the MUAP doc (only RSK guards levels)', () => {
  const { fields } = scrubNarrative(
    { m_condition: 'Industri tumbuh dengan permintaan tinggi sepanjang tahun.' },
    'muap',
  )
  assert.ok(fields.m_condition)
})

test('drops empty/whitespace fields and records them', () => {
  const { fields, violations } = scrubNarrative({ m_capital: '   ', m_capacity: 'ok' }, 'muap')
  assert.equal(fields.m_capital, undefined)
  assert.ok(fields.m_capacity)
  assert.ok(violations.some((v) => v.startsWith('m_capital')))
})

test('trims kept field values', () => {
  const { fields } = scrubNarrative({ m_capacity: '  teks rapi  ' }, 'muap')
  assert.equal(fields.m_capacity, 'teks rapi')
})
