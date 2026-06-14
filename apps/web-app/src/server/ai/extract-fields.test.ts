import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractFields, relevantFields, type StructuredGenerate } from './extract-fields'

// Hermetic: we inject a fake structured-generator so no live Gemini is hit. The fake ignores the
// prompt/schema and returns a canned object keyed exactly as extractFields expects (fieldPath with
// dots → '__'). These tests pin the SAFETY behaviour: validate the model's output, drop bad values.

const gen = (canned: Record<string, unknown>): StructuredGenerate =>
  (async () => canned) as unknown as StructuredGenerate

test('relevantFields — maps a docType to its registry fields', () => {
  assert.deepEqual(relevantFields('npwp').map((f) => f.fieldPath), ['npwp'])
  assert.deepEqual(relevantFields('nib').map((f) => f.fieldPath), ['nib', 'alamat', 'bidangUsaha'])
  assert.deepEqual(relevantFields('ktp').map((f) => f.fieldPath), ['nik'])
})

test('extractFields — returns validated known fields + open extras', async () => {
  const out = await extractFields('ktp', 'KTP ...', gen({
    nik: { value: '3201234567890123', confidence: 0.94 },
    extras: { tempat_lahir: 'Bandung', tanggal_lahir: '1990-01-01' },
  }))
  assert.deepEqual(out.known, { nik: { value: '3201234567890123', confidence: 0.94 } })
  assert.deepEqual(out.extras, { tempat_lahir: 'Bandung', tanggal_lahir: '1990-01-01' })
})

test('extractFields — INVALID value is dropped even at high confidence (validate, not trust)', async () => {
  const out = await extractFields('ktp', 'KTP ...', gen({
    nik: { value: '123', confidence: 0.99 }, // not 16 digits → validateNik fails → dropped
    extras: {},
  }))
  assert.deepEqual(out.known, {}, 'invalid NIK never returned')
})

test('extractFields — absent (null) field stays manual; nested gating fieldPath maps back', async () => {
  // SLIK doc → hardGates.kol (schema key hardGates__kol). null kol absent; a valid one maps to the path.
  const absent = await extractFields('slik_report', 'SLIK ...', gen({ hardGates__kol: null, extras: {} }))
  assert.deepEqual(absent.known, {})

  const present = await extractFields('slik_report', 'SLIK ...', gen({ hardGates__kol: { value: '1', confidence: 0.8 }, extras: {} }))
  assert.deepEqual(present.known, { 'hardGates.kol': { value: '1', confidence: 0.8 } })

  const bad = await extractFields('slik_report', 'SLIK ...', gen({ hardGates__kol: { value: '9', confidence: 0.9 }, extras: {} }))
  assert.deepEqual(bad.known, {}, 'Kol 9 is out of 1..5 → dropped')
})

test('extractFields — a NIB doc yields both NIB and the legal address', async () => {
  const out = await extractFields('nib', 'NIB ...', gen({
    nib: { value: '1234567890123', confidence: 0.9 },
    alamat: { value: 'Jl. Merdeka No. 10, Jakarta Pusat', confidence: 0.7 },
    extras: { sektor_usaha: 'Perdagangan' },
  }))
  assert.equal(out.known['nib'].value, '1234567890123')
  assert.equal(out.known['alamat'].value, 'Jl. Merdeka No. 10, Jakarta Pusat')
  assert.equal(out.extras['sektor_usaha'], 'Perdagangan')
})

test('extractFields — empty OCR text short-circuits (no generator call, no fabrication)', async () => {
  let called = false
  const spy: StructuredGenerate = (async () => { called = true; return {} }) as unknown as StructuredGenerate
  const out = await extractFields('ktp', '   ', spy)
  assert.equal(called, false, 'never calls the model on empty text')
  assert.deepEqual(out, { known: {}, extras: {} })
})
