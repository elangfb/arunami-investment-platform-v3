import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planResearch, detectForbiddenInQuery, isAllowedSource } from './classifier'

const businessCtx = {
  namaUsaha: 'CV Maju Jaya',
  nasabahType: 'business' as const,
  akadType: 'Murabahah' as const,
  purpose: 'modal kerja import suku cadang otomotif',
  collateralType: 'fixed_asset' as const,
}

test('planResearch — refuses egress for individual nasabah (PDP Law)', () => {
  const r = planResearch({ ...businessCtx, nasabahType: 'individual' })
  assert.equal(r, null, 'individual must never be researched')
})

test('planResearch — refuses without a business name', () => {
  assert.equal(planResearch({ ...businessCtx, namaUsaha: '' }), null)
  assert.equal(planResearch({ ...businessCtx, namaUsaha: null }), null)
})

test('planResearch — multi-angle (entity + sector + macro), every query PII-free', () => {
  const r = planResearch(businessCtx)
  assert.ok(r, 'business research permitted')
  // Batch 5 (#1): more than the 3 company-profile queries — entity-in-context + sector + macro.
  assert.ok(r.queries.length >= 5, `multi-angle query set, got ${r.queries.length}`)
  // EVERY query is PII-free (the hard invariant — defence-in-depth on top of masking).
  for (const q of r.queries) assert.equal(detectForbiddenInQuery(q).length, 0, `no PII in query: ${q}`)
  // The registry/profile + entity-in-sector queries are anchored to the business name…
  assert.ok(r.queries.filter((q) => q.includes('"CV Maju Jaya"')).length >= 4, 'entity-anchored angles present')
  // …and a SECTOR angle exists.
  assert.ok(r.queries.some((q) => /sektor industri/.test(q)), 'sector angle present')
  // …and a MACRO angle (generic industry stats, deliberately NO entity name — still PII-free).
  const macro = r.queries.find((q) => /industri Indonesia statistik/.test(q))
  assert.ok(macro && !macro.includes('CV Maju Jaya'), 'macro angle is generic (no entity), grounding sector context')
})

test('planResearch — no collateral/asset PRICE queries in the auto path (allowlist + Bank-Legal gate)', () => {
  // The acceptance register rambu: price references need an allowlist expansion + Bank-Legal review
  // first, so they stay OUT of the auto classifier.
  const r = planResearch(businessCtx)
  assert.ok(r && !r.queries.some((q) => /harga (pasar|properti|kendaraan|aset)/i.test(q)), 'no price-reference queries auto-egressed')
})

test('detectForbiddenInQuery — flags NIK / phone / email / NPWP (fail-closed)', () => {
  assert.deepEqual(detectForbiddenInQuery('CV Maju 3201234567890123 profil'), ['NIK'])
  assert.deepEqual(detectForbiddenInQuery('hubungi 081234567890 untuk info'), ['TELEPON'])
  assert.deepEqual(detectForbiddenInQuery('info@example.com perusahaan'), ['EMAIL'])
  assert.deepEqual(detectForbiddenInQuery('NPWP 09.254.294.3-407.000'), ['NPWP'])
  assert.deepEqual(detectForbiddenInQuery('CV Maju Jaya akta pendirian'), [])
})

test('isAllowedSource — keeps AHU/OJK/IDX + tier-1 news; rejects everything else', () => {
  assert.ok(isAllowedSource('https://ahu.go.id/pencarian'))
  assert.ok(isAllowedSource('https://www.ojk.go.id/laporan'))
  assert.ok(isAllowedSource('https://www.idx.co.id/perusahaan'))
  assert.ok(isAllowedSource('https://www.kompas.com/bisnis/cv-maju'))
  assert.ok(!isAllowedSource('https://reddit.com/r/somesub'))
  assert.ok(!isAllowedSource('https://linkedin.com/in/someone'), 'LinkedIn out of scope (PII/ToS)')
  assert.ok(!isAllowedSource('not-a-url'))
})
