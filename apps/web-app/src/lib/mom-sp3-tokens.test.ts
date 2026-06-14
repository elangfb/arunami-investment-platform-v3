import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSp3Fill, buildMomFill, SP3_TOKENS, MOM_TOKENS } from './mom-sp3-tokens'
import type { LoanApplication } from './types'

function app(overrides: Partial<LoanApplication> = {}): LoanApplication {
  return {
    nasabahName: 'Tuan A',
    namaUsaha: 'PT Maju Jaya',
    requestedPlafond: 1_000_000_000,
    requestedTenorMonths: 12,
    akadType: 'Musyarakah',
    marginRate: 15,
    komiteDecision: 'approve',
    ...overrides,
  } as LoanApplication
}

test('buildSp3Fill — uses approved terms over requested, formats Rupiah + margin', () => {
  const f = buildSp3Fill(app({ approvedPlafond: 2_000_000_000, approvedTenorMonths: 6, approvedMarginRate: 17 }), {
    letterNo: '410/BPRS-HA/MKT/VII/2025',
  })
  assert.equal(f.nasabah_nama, 'PT Maju Jaya')
  assert.match(f.sp3_plafond, /2\.000\.000\.000/)
  assert.equal(f.sp3_tenor, '6 bulan')
  assert.equal(f.sp3_imbal_hasil, 'Eq. 17% eff p.a.')
  assert.equal(f.sp3_akad, 'Musyarakah')
  assert.equal(f.sp3_no, '410/BPRS-HA/MKT/VII/2025')
})

test('buildSp3Fill — falls back to requested terms when no approved values', () => {
  const f = buildSp3Fill(app())
  assert.match(f.sp3_plafond, /1\.000\.000\.000/)
  assert.equal(f.sp3_tenor, '12 bulan')
  assert.equal(f.sp3_imbal_hasil, 'Eq. 15% eff p.a.')
})

test('buildMomFill — maps the committee decision + conditions', () => {
  const f = buildMomFill(app({ komiteDecision: 'conditional', komiteDecisionNote: 'Lengkapi agunan tambahan' }), {
    muapRef: '084/MUAP-MKT/VI/2025',
  })
  assert.equal(f.mom_keputusan, 'Disetujui dengan syarat')
  assert.equal(f.mom_kondisi, 'Lengkapi agunan tambahan')
  assert.equal(f.mom_muap_ref, '084/MUAP-MKT/VI/2025')
  assert.equal(f.mom_nasabah, 'PT Maju Jaya')
})

test('fill builders cover every declared token (no template slot left unfilled)', () => {
  const sp3 = buildSp3Fill(app())
  for (const t of SP3_TOKENS) assert.ok(t in sp3, `SP3 token ${t} unfilled`)
  const mom = buildMomFill(app())
  for (const t of MOM_TOKENS) assert.ok(t in mom, `MoM token ${t} unfilled`)
})

test('decisionText — falls back to "Belum diputuskan" when no decision', () => {
  assert.equal(buildMomFill(app({ komiteDecision: undefined })).mom_keputusan, 'Belum diputuskan')
})
