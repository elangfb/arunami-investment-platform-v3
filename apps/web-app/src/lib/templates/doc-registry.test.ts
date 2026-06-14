import test from 'node:test'
import assert from 'node:assert/strict'
import { DOC_VARS, docVarsFor } from './doc-registry'

// V3 placeholder vars vs V3.5 NamedRange vars (Batch 4): the unique-name + unique-[bracket]
// invariants apply to the replaceAllText path. NamedRange vars MAY share a resolver name across
// occurrences (one value, distinct ranges); their uniqueness key is `namedRange`.
const PLACEHOLDER_VARS = DOC_VARS.filter((v) => v.method !== 'namedRange')
const NAMEDRANGE_VARS = DOC_VARS.filter((v) => v.method === 'namedRange')

test('doc-registry — placeholder var names are unique', () => {
  const names = PLACEHOLDER_VARS.map((v) => v.name)
  assert.equal(new Set(names).size, names.length)
})

test('doc-registry — placeholders are unique + bracketed (replaceAllText targets must not collide)', () => {
  const placeholders = PLACEHOLDER_VARS.map((v) => v.placeholder)
  assert.equal(new Set(placeholders).size, placeholders.length, 'duplicate placeholders would cross-fill fields')
  for (const v of PLACEHOLDER_VARS) {
    assert.match(v.placeholder, /^\[.+\]$/, `${v.name} placeholder must be bracketed`)
    assert.ok(v.templates.length > 0, `${v.name} must target at least one template`)
  }
})

test('doc-registry — V3.5 NamedRange vars carry a unique range name + a method (Batch 4)', () => {
  const ranges = NAMEDRANGE_VARS.map((v) => v.namedRange)
  assert.equal(new Set(ranges).size, ranges.length, 'each occurrence needs a DISTINCT NamedRange (no dup-occurrence leak)')
  for (const v of NAMEDRANGE_VARS) {
    assert.ok(v.namedRange && v.namedRange.length > 0, `${v.name} namedRange must be set`)
    assert.ok(v.templates.length > 0, `${v.name} must target at least one template`)
  }
})

test('doc-registry — no var name carries a gating keyword (level/recommendation/decision)', () => {
  const FORBIDDEN = /level|recommend|rekomendasi|disetujui|ditolak|keputusan|verdict|memenuhi|setuju|tolak/i
  for (const v of DOC_VARS) assert.doesNotMatch(v.name, FORBIDDEN, `${v.name} smells like a gating field`)
})

test('doc-registry — docVarsFor splits by template; signing-date + narratives are doc-scoped', () => {
  const muap = docVarsFor('muap').map((v) => v.name)
  const rsk = docVarsFor('rsk').map((v) => v.name)
  // signing-date is doc-scoped: RSK carries tanggal_rsk; MUAP no longer has one (tanggal_muap retired —
  // the MUAP master has no [Tanggal MUAP] bracket; the MUAP date fills via the V3.5 NamedRange).
  assert.ok(rsk.includes('tanggal_rsk') && !muap.includes('tanggal_rsk'))
  assert.ok(muap.includes('m_character') && !rsk.includes('m_character'))
  assert.ok(rsk.includes('character_finding') && !muap.includes('character_finding'))
  // grounded template split (2026.06.10): plafond is RSK-only (MUAP master lacks the bracket);
  // nama_nasabah is MUAP-only; akad is shared (present in both masters).
  assert.ok(rsk.includes('plafond') && !muap.includes('plafond'))
  assert.ok(muap.includes('nama_nasabah') && !rsk.includes('nama_nasabah'))
  assert.ok(muap.includes('akad') && rsk.includes('akad'))
})
