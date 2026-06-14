import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AML_ATTESTATION_STATEMENT, amlAttested, amlReattestRequired, buildAmlAttestation } from './aml'

// Compliance-core: the Stage-1 Initial-AML attestation primitives. MIZAN performs NO screening —
// these only capture the RM's affirmation that the EXTERNAL check happened + PASSED.

test('buildAmlAttestation — captures identity, the statement, and an ISO timestamp', () => {
  const before = Date.now()
  const a = buildAmlAttestation('u-001', 'Siti Rahma (a.n. Superadmin Luthfi)')
  const after = Date.now()

  assert.equal(a.attestedBy, 'u-001')
  assert.equal(a.attestedByName, 'Siti Rahma (a.n. Superadmin Luthfi)')
  assert.equal(a.statement, AML_ATTESTATION_STATEMENT)
  // attestedAt is an ISO string (JSON-column timestamp convention) within the call window.
  assert.equal(typeof a.attestedAt, 'string')
  const t = Date.parse(a.attestedAt)
  assert.ok(!Number.isNaN(t), 'attestedAt parses as a date')
  assert.ok(t >= before && t <= after, 'attestedAt is stamped at attestation time')
})

test('buildAmlAttestation — statement never implies MIZAN screened', () => {
  // The affirmation is that the check WAS DONE (externally) — not that MIZAN did it.
  assert.match(AML_ATTESTATION_STATEMENT, /telah dilakukan/)
  assert.match(AML_ATTESTATION_STATEMENT, /PASSED/)
})

test('amlAttested — absent / null are both "not attested"; a record is attested', () => {
  assert.equal(amlAttested({ amlAttestation: undefined }), false)
  assert.equal(amlAttested({ amlAttestation: null }), false)
  assert.equal(amlAttested({ amlAttestation: buildAmlAttestation('u', 'U') }), true)
})

// ── P3-D structured AML upgrade (design §4) ──

test('buildAmlAttestation — a bare call stays the legacy 4-field record (back-compat)', () => {
  const a = buildAmlAttestation('u-001', 'U')
  // Exactly the four legacy keys; no structured fields leak in when none are supplied.
  assert.deepEqual(Object.keys(a).sort(), ['attestedAt', 'attestedBy', 'attestedByName', 'statement'])
  assert.equal(amlAttested({ amlAttestation: a }), true, 'amlAttested unchanged (!!attestation)')
})

test('buildAmlAttestation — the optional structured fields round-trip when supplied (design §4)', () => {
  const a = buildAmlAttestation('u-001', 'U', {
    result: 'hit-cleared',
    catatan: 'Nama cocok DTTOT; diklarifikasi beda orang (tgl lahir berbeda).',
    screenedParties: [{ nama: 'Budi Santoso', peran: 'pemohon' }, { nama: 'Siti Aminah' }],
    evidenceDocId: 'DOC-AML-1',
  })
  assert.equal(a.result, 'hit-cleared')
  assert.equal(a.catatan, 'Nama cocok DTTOT; diklarifikasi beda orang (tgl lahir berbeda).')
  assert.deepEqual(a.screenedParties, [{ nama: 'Budi Santoso', peran: 'pemohon' }, { nama: 'Siti Aminah' }])
  assert.equal(a.evidenceDocId, 'DOC-AML-1')
  // PII: screenedParties carry NAMES only — no NIK field in the shape.
  assert.ok(a.screenedParties?.every((p) => !('nik' in p)), 'screenedParties carry no NIK')
  // A 'hit-cleared' result is still a COMPLETION — amlAttested stays true (verdict is a signal).
  assert.equal(amlAttested({ amlAttestation: a }), true)
})

test('amlReattestRequired — INERT for original apps (P3-D); activates only for review/adendum', () => {
  const attested = buildAmlAttestation('u', 'U')
  // originType defaults 'original' (absent) → always false today, attested or not.
  assert.equal(amlReattestRequired({ originType: undefined, amlAttestation: null }), false)
  assert.equal(amlReattestRequired({ originType: 'original', amlAttestation: null }), false)
  assert.equal(amlReattestRequired({ originType: 'original', amlAttestation: attested }), false)
  // review/adendum WITHOUT a fresh attestation → fresh attest required (P5 will create such apps).
  assert.equal(amlReattestRequired({ originType: 'review', amlAttestation: null }), true)
  assert.equal(amlReattestRequired({ originType: 'adendum', amlAttestation: null }), true)
  // …but once such an app is (re)attested, the requirement clears.
  assert.equal(amlReattestRequired({ originType: 'review', amlAttestation: attested }), false)
})
