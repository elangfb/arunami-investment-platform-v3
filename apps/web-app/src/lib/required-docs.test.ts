import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRequiredDocuments, ownerDeskForDocType, type RequiredDocsInput } from './required-docs'

const types = (input: RequiredDocsInput) => buildRequiredDocuments(input, 'app-x').map((d) => d.docType)

test('buildRequiredDocuments — base set is always present; ids are stable + unique', () => {
  const docs = buildRequiredDocuments({ nasabahType: 'individual', akadType: 'Murabahah' }, 'app-1')
  for (const t of ['ktp', 'npwp', 'formulir_permohonan']) assert.ok(docs.some((d) => d.docType === t))
  assert.ok(docs.every((d) => d.status === 'missing' && d.required))
  assert.equal(new Set(docs.map((d) => d.id)).size, docs.length) // no duplicate ids
  assert.equal(new Set(docs.map((d) => d.docType)).size, docs.length) // no duplicate docTypes
})

test('buildRequiredDocuments — business adds badan-usaha-skewed docs (SOP slide 5)', () => {
  const t = types({ nasabahType: 'business', akadType: 'Murabahah' })
  for (const dt of ['ktp_pengurus', 'akta_pendirian', 'daftar_pemegang_saham', 'daftar_pengurus_komisaris', 'spt_tahunan', 'daftar_hutang_piutang', 'daftar_supplier_pelanggan', 'list_project']) {
    assert.ok(t.includes(dt), `business set missing ${dt}`)
  }
  // Individual must NOT get the badan-usaha docs.
  const ind = types({ nasabahType: 'individual', akadType: 'Murabahah' })
  assert.equal(ind.includes('daftar_pemegang_saham'), false)
})

test('buildRequiredDocuments — collateral conditions gate the right docs (incl. PBB for fixed asset)', () => {
  const fixed = types({ nasabahType: 'individual', akadType: 'Murabahah', collateralType: 'fixed_asset' })
  for (const dt of ['sertifikat_agunan', 'imb_pbg', 'pbb', 'appraisal_agunan', 'asuransi_agunan']) assert.ok(fixed.includes(dt), `fixed-asset missing ${dt}`)
  assert.equal(fixed.includes('bpkb'), false) // vehicle-only

  const none = types({ nasabahType: 'individual', akadType: 'Murabahah', collateralType: 'none' })
  for (const dt of ['sertifikat_agunan', 'pbb', 'bpkb', 'jaminan_perorangan']) assert.equal(none.includes(dt), false)
})

test('buildRequiredDocuments — purpose dimension is inert without financingPurpose, active with it', () => {
  const noPurpose = types({ nasabahType: 'business', akadType: 'Murabahah' })
  for (const dt of ['kontrak_spk_po', 'surat_bouwheer']) assert.equal(noPurpose.includes(dt), false)

  const modalKerja = types({ nasabahType: 'business', akadType: 'Murabahah', financingPurpose: 'modal_kerja' })
  assert.ok(modalKerja.includes('rab_penggunaan_dana'))
  assert.ok(modalKerja.includes('kontrak_spk_po'))
  assert.equal(modalKerja.includes('surat_bouwheer'), false) // pembangunan-only

  const pembangunan = types({ nasabahType: 'business', akadType: 'Murabahah', financingPurpose: 'pembangunan' })
  assert.ok(pembangunan.includes('surat_bouwheer'))
})

test('buildRequiredDocuments — dedupes a docType shared across sources (Mudharabah RAB + purpose RAB)', () => {
  // Mudharabah already requires rab_penggunaan_dana; purpose=modal_kerja also adds it → listed once.
  const docs = buildRequiredDocuments({ nasabahType: 'business', akadType: 'Mudharabah', financingPurpose: 'modal_kerja' }, 'app-z')
  assert.equal(docs.filter((d) => d.docType === 'rab_penggunaan_dana').length, 1)
})

test('ownerDeskForDocType — SLIK/Pefindo are RM bureau-data docs; ordinary checklist docs stay RM intake', () => {
  assert.equal(ownerDeskForDocType('slik_report'), 'slik')
  assert.equal(ownerDeskForDocType('pefindo_report'), 'slik')
  assert.equal(ownerDeskForDocType('ktp'), 'intake')
})
