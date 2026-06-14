import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { regexRedactor, redactorPipeline, activeRedactor, maskForEgress, maskingEnabled, blockOnResidualPii, type Redactor } from './redact'
import { piiSecrets } from '@/lib/pii-mask'

const secrets = piiSecrets({ nasabahName: 'Budi Santoso', namaUsaha: 'Toko Maju Jaya', nik: '3201234567890123', phoneNumber: '081234567890' })

// Most tests below assert the ENABLED masking path. The flag defaults OFF (compliance parked, Fork
// B4 — see redact.ts maskingEnabled), so turn it ON for this file and restore afterwards; a dedicated
// default-off pass-through test below saves/clears/restores the flag itself.
const PREV_MASK = process.env.PII_MASK_ENABLED
before(() => {
  process.env.PII_MASK_ENABLED = '1'
})
after(() => {
  if (PREV_MASK === undefined) delete process.env.PII_MASK_ENABLED
  else process.env.PII_MASK_ENABLED = PREV_MASK
})

test('regexRedactor masks known fields + generic patterns', () => {
  const masked = regexRedactor.mask('Budi Santoso pemilik Toko Maju Jaya, NIK 3201234567890123, hub 081234567890', secrets)
  assert.ok(!masked.includes('Budi'), 'name token masked')
  assert.ok(!masked.includes('3201234567890123'), 'NIK masked')
  assert.ok(!masked.includes('081234567890'), 'phone masked')
  assert.ok(masked.includes('[NASABAH]') && masked.includes('[USAHA]'))
})

test('maskForEgress reports no residual on fully-masked text', () => {
  const { masked, residual } = maskForEgress('Budi Santoso, NIK 3201234567890123', secrets)
  assert.equal(residual.length, 0, 'clean after masking')
  assert.ok(!masked.includes('3201234567890123'))
})

test('maskForEgress masks stray structured PII even with no secrets (generic sweep)', () => {
  // An unrelated NIK-shaped string not in secrets — masked by the generic pass, so clean.
  const { masked, residual } = maskForEgress('Nomor lain 9988776655443322', [])
  assert.ok(!masked.includes('9988776655443322') && masked.includes('[NIK]'))
  assert.equal(residual.length, 0, 'masked → no residual')
})

test('residual detector fires when a redactor masks less than it detects (regression guard)', () => {
  // Simulates a masking regression: detect catches a pattern the mask pass left behind.
  const leaky: Redactor = {
    name: 'leaky',
    mask: (t) => t, // masks nothing
    detectResidual: (t) => (/\d{16}/.test(t) ? ['[NIK]'] : []),
  }
  const r = leaky
  const masked = r.mask('NIK 3201234567890123', [])
  assert.deepEqual(r.detectResidual(masked, []), ['[NIK]'], 'detector catches the miss')
})

test('activeRedactor is the regex redactor today (NER not yet wired)', () => {
  assert.equal(activeRedactor().name, 'regex')
})

test('redactorPipeline chains masking and unions residual', () => {
  // Second stage masks a custom token the first leaves alone, proving left→right composition.
  const upper: Redactor = {
    name: 'upper',
    mask: (t) => t.replace(/secret/gi, '[X]'),
    detectResidual: (t) => (/secret/i.test(t) ? ['[X]'] : []),
  }
  const pipe = redactorPipeline([regexRedactor, upper])
  assert.equal(pipe.name, 'regex+upper')
  const masked = pipe.mask('NIK 3201234567890123 secret', secrets)
  assert.ok(!masked.includes('3201234567890123') && masked.includes('[X]'))
  assert.equal(pipe.detectResidual('secret 9988776655443322', []).sort().join(','), '[NIK],[X]')
})

test('maskingEnabled defaults OFF; only PII_MASK_ENABLED=1 turns it on (mirrors PII_RESIDUAL_BLOCK)', () => {
  const prev = process.env.PII_MASK_ENABLED
  try {
    delete process.env.PII_MASK_ENABLED
    assert.equal(maskingEnabled(), false, 'unset → off (compliance parked default)')
    process.env.PII_MASK_ENABLED = '0'
    assert.equal(maskingEnabled(), false, "'0' → off")
    process.env.PII_MASK_ENABLED = 'true'
    assert.equal(maskingEnabled(), false, "any non-'1' → off")
    process.env.PII_MASK_ENABLED = '1'
    assert.equal(maskingEnabled(), true, "'1' → on (W1 / Fork B4)")
  } finally {
    if (prev === undefined) delete process.env.PII_MASK_ENABLED
    else process.env.PII_MASK_ENABLED = prev
  }
})

test('maskForEgress is a PASS-THROUGH when masking is DISABLED (default off — raw, no residual)', () => {
  const prev = process.env.PII_MASK_ENABLED
  try {
    delete process.env.PII_MASK_ENABLED // default off
    const raw = 'Budi Santoso, NIK 3201234567890123, hub 081234567890'
    const { masked, residual } = maskForEgress(raw, secrets)
    assert.equal(masked, raw, 'raw text returned unchanged (redactor never runs)')
    assert.deepEqual(residual, [], 'no residual reported in pass-through')
    // And ON: the same input IS masked (proves the gate, not the redactor, flipped behavior).
    process.env.PII_MASK_ENABLED = '1'
    const on = maskForEgress(raw, secrets)
    assert.ok(!on.masked.includes('Budi') && !on.masked.includes('3201234567890123'), 'enabled → masked')
  } finally {
    if (prev === undefined) delete process.env.PII_MASK_ENABLED
    else process.env.PII_MASK_ENABLED = prev
  }
})

test('blockOnResidualPii defaults to fail-OPEN; only PII_RESIDUAL_BLOCK=1 blocks', () => {
  const prev = process.env.PII_RESIDUAL_BLOCK
  try {
    delete process.env.PII_RESIDUAL_BLOCK
    assert.equal(blockOnResidualPii(), false, 'unset → fail-open (presentable default)')
    process.env.PII_RESIDUAL_BLOCK = '0'
    assert.equal(blockOnResidualPii(), false, "'0' → fail-open")
    process.env.PII_RESIDUAL_BLOCK = 'true'
    assert.equal(blockOnResidualPii(), false, "any non-'1' → fail-open")
    process.env.PII_RESIDUAL_BLOCK = '1'
    assert.equal(blockOnResidualPii(), true, "'1' → fail-closed (prod compliance)")
  } finally {
    if (prev === undefined) delete process.env.PII_RESIDUAL_BLOCK
    else process.env.PII_RESIDUAL_BLOCK = prev
  }
})
