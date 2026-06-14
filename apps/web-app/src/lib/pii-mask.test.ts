import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskPii, maskPiiForApp, piiSecrets, unmaskPii, detectResidualPii } from './pii-mask'
import type { LoanApplication } from './types'

const app = {
  nasabahName: 'Budi Santoso',
  namaUsaha: 'CV Berkah Mandiri',
  nik: '3201234567890001',
  phoneNumber: '081234567890',
  whatsappNumber: '6285600001111',
} as Pick<LoanApplication, 'nasabahName' | 'nik' | 'phoneNumber' | 'whatsappNumber' | 'namaUsaha'>

test('piiSecrets collects non-empty PII (≥3 chars)', () => {
  const s = piiSecrets({ ...app, namaUsaha: undefined, whatsappNumber: '' })
  const placeholders = s.map((x) => x.placeholder)
  assert.ok(placeholders.includes('[NASABAH]'))
  assert.ok(placeholders.includes('[NIK]'))
  assert.ok(placeholders.includes('[TELEPON]'))
  assert.ok(!placeholders.includes('[USAHA]')) // namaUsaha null → omitted
})

test('maskPiiForApp redacts known name, NIK, phone, business name', () => {
  const masked = maskPiiForApp(
    'Nasabah Budi Santoso (NIK 3201234567890001, HP 081234567890) dari CV Berkah Mandiri.',
    app,
  )
  assert.ok(!masked.includes('Budi Santoso'))
  assert.ok(!masked.includes('3201234567890001'))
  assert.ok(!masked.includes('081234567890'))
  assert.ok(!masked.includes('CV Berkah Mandiri'))
  assert.ok(masked.includes('[NASABAH]') && masked.includes('[NIK]') && masked.includes('[TELEPON]') && masked.includes('[USAHA]'))
})

test('generic patterns catch unknown NIK / phone / email in free text', () => {
  const masked = maskPii('Kontak lain 9988776655443322, 087811112222, orang@contoh.co.id', [])
  assert.ok(!masked.includes('9988776655443322'))
  assert.ok(!masked.includes('087811112222'))
  assert.ok(!masked.includes('orang@contoh.co.id'))
  assert.ok(masked.includes('[NIK]') && masked.includes('[TELEPON]') && masked.includes('[EMAIL]'))
})

test('leaves non-PII analysis text intact', () => {
  const text = 'DSR 35% di bawah ambang 40%; LTV 60% aman; Kol 1.'
  assert.equal(maskPiiForApp(text, app), text)
})

// Mask-in / unmask-out: the AI drafts from placeholders, the system restores real values.
test('unmaskPii restores known placeholders an AI output echoed (model never saw the PII)', () => {
  const secrets = piiSecrets(app)
  const aiOutput = 'Analisis Character: [NASABAH] dari [USAHA] memiliki rekam jejak baik.'
  const restored = unmaskPii(aiOutput, secrets)
  assert.equal(restored, 'Analisis Character: Budi Santoso dari CV Berkah Mandiri memiliki rekam jejak baik.')
})

test('unmaskPii is the inverse of maskPii for known secrets (round-trip)', () => {
  const original = 'Nasabah Budi Santoso dari CV Berkah Mandiri layak.'
  const secrets = piiSecrets(app)
  assert.equal(unmaskPii(maskPii(original, secrets), secrets), original)
})

test('unmaskPii does NOT invent values for generic/hallucinated tokens', () => {
  // A bare [NIK] with no known NIK secret stays masked (no value to restore).
  const secrets = piiSecrets({ nasabahName: 'Budi Santoso' })
  assert.equal(unmaskPii('Rujukan [NIK] dan [NASABAH].', secrets), 'Rujukan [NIK] dan Budi Santoso.')
})

// ── I1: case-insensitive + whitespace-tolerant known-value matching ─────────────────
test('masks the known name regardless of case', () => {
  for (const variant of ['budi santoso', 'BUDI SANTOSO', 'Budi  Santoso']) {
    const masked = maskPiiForApp(`Nasabah ${variant} hadir.`, app)
    assert.ok(!/budi/i.test(masked), `leaked: ${masked}`)
    assert.ok(masked.includes('[NASABAH]'))
  }
})

// ── I4: token-level person-name masking (person only, not business) ─────────────────
test('masks partial references to the person name (Pak Budi / Santoso)', () => {
  assert.ok(!/budi/i.test(maskPiiForApp('Pak Budi mengajukan.', app)))
  assert.ok(!/santoso/i.test(maskPiiForApp('Berkas dari Santoso lengkap.', app)))
})

test('name token does NOT over-mask a longer word (Budi vs Budidaya)', () => {
  const masked = maskPiiForApp('Sektor budidaya ikan tumbuh.', app)
  assert.equal(masked, 'Sektor budidaya ikan tumbuh.') // boundary-aware → untouched
})

test('business name is NOT token-masked (common words stay)', () => {
  const masked = maskPiiForApp('Ekonomi maju pesat tahun ini.', { namaUsaha: 'Toko Maju Jaya' })
  assert.equal(masked, 'Ekonomi maju pesat tahun ini.')
})

// ── I2: regex tolerates separators; landline; NPWP ──────────────────────────────────
test('masks phone numbers written with separators and landlines', () => {
  for (const phone of ['0812-3456-7890', '0812 3456 7890', '+62 812 3456 7890', '021-1234567']) {
    const masked = maskPii(`Hubungi ${phone} ya.`, [])
    assert.ok(!/\d{4}/.test(masked), `leaked digits: ${masked}`)
    assert.ok(masked.includes('[TELEPON]'))
  }
})

test('masks grouped NIK and dotted NPWP', () => {
  assert.ok(maskPii('NIK 3201 2345 6789 0001.', []).includes('[NIK]'))
  assert.ok(maskPii('NPWP 09.254.294.3-407.000.', []).includes('[NPWP]'))
})

test('does NOT mask financial amounts as phone numbers', () => {
  const text = 'Plafond Rp 100.000.000 dengan angsuran Rp 4.500.000.'
  assert.equal(maskPii(text, []), text)
})

// ── I3: pre-egress residual backstop ────────────────────────────────────────────────
test('detectResidualPii is clean for properly masked text', () => {
  const secrets = piiSecrets(app)
  const masked = maskPii('Nasabah Budi Santoso, NIK 3201234567890001, HP 081234567890.', secrets)
  assert.deepEqual(detectResidualPii(masked, secrets), [])
})

test('detectResidualPii flags surviving structured identifiers (types only, no value)', () => {
  assert.deepEqual(detectResidualPii('sisa 3201234567890001').sort(), ['[NIK]'])
  assert.deepEqual(detectResidualPii('telp 081234567890').sort(), ['[TELEPON]'])
  assert.deepEqual(detectResidualPii('email a@b.co').sort(), ['[EMAIL]'])
})

test('detectResidualPii flags a surviving known value but not a common word', () => {
  const secrets = piiSecrets(app)
  assert.deepEqual(detectResidualPii('masih ada Budi di sini', secrets), ['[NASABAH]'])
  assert.deepEqual(detectResidualPii('sektor budidaya tumbuh', secrets), [])
})

// The hash-suffix question: token-masking is unmask-safe because every [NASABAH] (full or
// partial) restores to the one canonical full name — no per-entity disambiguation needed.
test('token-masked partial restores to the full name on unmask', () => {
  const secrets = piiSecrets(app)
  assert.equal(unmaskPii(maskPii('Pak Budi setuju.', secrets), secrets), 'Pak Budi Santoso setuju.')
})
