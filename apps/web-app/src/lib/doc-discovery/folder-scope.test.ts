import { test } from 'node:test'
import assert from 'node:assert/strict'

import { folderScopeForDocType, DOC_FOLDER_SCOPE } from './folder-scope'

// Proves the two-card split (Dokumen Nasabah vs Dokumen Pengajuan, design §3): carry-forward
// identity/legal is 'nasabah'; deal-specific docs default to 'app'.

test('carry-forward identity/legal docs map to the nasabah folder', () => {
  for (const docType of [
    'ktp',
    'npwp',
    'kartu_keluarga',
    'buku_nikah',
    'akta_pendirian',
    'sk_kemenkumham',
    'nib',
    'siup',
    'ktp_pengurus',
    'daftar_pemegang_saham',
    'daftar_pengurus_komisaris',
  ]) {
    assert.equal(folderScopeForDocType(docType), 'nasabah', `${docType} should be nasabah-scope`)
  }
})

test('deal-specific docs map to the app folder', () => {
  for (const docType of [
    'laporan_keuangan',
    'rekening_koran_perusahaan',
    'slip_gaji',
    'spt_tahunan',
    'sertifikat_agunan',
    'quotation_objek',
    'rab_penggunaan_dana',
    'kontrak_spk_po',
  ]) {
    assert.equal(folderScopeForDocType(docType), 'app', `${docType} should be app-scope`)
  }
})

test('an unmapped docType defaults to the app folder', () => {
  assert.equal(folderScopeForDocType('some_brand_new_doc'), 'app')
  assert.equal(folderScopeForDocType(''), 'app')
})

test('DOC_FOLDER_SCOPE only enumerates nasabah-scope keys', () => {
  for (const scope of Object.values(DOC_FOLDER_SCOPE)) {
    assert.equal(scope, 'nasabah')
  }
})
