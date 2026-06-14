import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  matchFileToItems,
  reconcileDiscovery,
  itemsFor,
  type ChecklistItem,
} from './matcher'
import { DEFAULT_DOC_ALIASES } from './aliases'

// --- Fixtures ---------------------------------------------------------------
// Minimal hand-built checklists keep these tests independent of the alias table
// content (which is exercised separately at the bottom via itemsFor).
const KTP: ChecklistItem = { docType: 'ktp', aliases: ['KTP', 'Kartu Tanda Penduduk'] }
const NPWP: ChecklistItem = { docType: 'npwp', aliases: ['NPWP'] }
const KK: ChecklistItem = { docType: 'kartu_keluarga', aliases: ['KK', 'Kartu Keluarga'] }

// 1 — full-path match: a file under a docType-named FOLDER satisfies the item via
// the folder segment, not just the filename.
test('full-path match: KTP/scan001.pdf satisfies ktp via the folder segment', () => {
  assert.deepEqual(matchFileToItems({ path: 'KTP/scan001.pdf' }, [KTP, NPWP]), ['ktp'])
})

// 2 — flat dump vs scaffolded: both layouts reconcile identically.
test('flat dump and scaffolded folders both reconcile to satisfied', () => {
  const items = [KTP, NPWP]
  const flat = reconcileDiscovery(
    [{ path: 'KTP Budi.pdf' }, { path: 'NPWP Budi.pdf' }],
    items,
  )
  const scaffolded = reconcileDiscovery(
    [{ path: 'ktp/Budi.pdf' }, { path: 'npwp/Budi.pdf' }],
    items,
  )
  for (const result of [flat, scaffolded]) {
    assert.deepEqual(
      result.matches.map((m) => [m.docType, m.state]),
      [['ktp', 'satisfied'], ['npwp', 'satisfied']],
    )
    assert.deepEqual(result.unrecognized, [])
  }
})

// 3 — many-to-many: one file satisfies EVERY item whose alias matches.
test('many-to-many: "KTP & NPWP Pengurus.pdf" satisfies both ktp and npwp', () => {
  const docTypes = matchFileToItems({ path: 'KTP & NPWP Pengurus.pdf' }, [KTP, NPWP])
  assert.deepEqual(docTypes.sort(), ['ktp', 'npwp'])
})

// 4 — case-insensitivity: the same file matches regardless of casing.
test('case-insensitive: ktp / KTP / Ktp all satisfy ktp', () => {
  for (const path of ['ktp/x.pdf', 'KTP/x.pdf', 'Ktp/x.pdf']) {
    assert.deepEqual(matchFileToItems({ path }, [KTP]), ['ktp'], path)
  }
})

// 5 — missing: a docType with no matching file is 'missing'.
test('missing: a docType with no matching file is reported missing', () => {
  const result = reconcileDiscovery([{ path: 'KTP Budi.pdf' }], [KTP, KK])
  const kk = result.matches.find((m) => m.docType === 'kartu_keluarga')
  assert.equal(kk?.state, 'missing')
  assert.deepEqual(kk?.matchedPaths, [])
})

// 6 — unrecognized: a file matching no item lands in unrecognized[].
test('unrecognized: a file matching zero items lands in unrecognized[]', () => {
  const result = reconcileDiscovery(
    [{ path: 'Foto Selfie Liburan.jpg' }, { path: 'KTP Budi.pdf' }],
    [KTP],
  )
  assert.deepEqual(result.unrecognized, ['Foto Selfie Liburan.jpg'])
  assert.equal(result.matches.find((m) => m.docType === 'ktp')?.state, 'satisfied')
})

// 7 — a satisfied item lists ALL its matched paths.
test('satisfied item lists every matched path', () => {
  const result = reconcileDiscovery(
    [{ path: 'KTP Budi.pdf' }, { path: 'arsip/KTP lama.pdf' }, { path: 'NPWP.pdf' }],
    [KTP, NPWP],
  )
  const ktp = result.matches.find((m) => m.docType === 'ktp')
  assert.deepEqual(ktp?.matchedPaths, ['KTP Budi.pdf', 'arsip/KTP lama.pdf'])
})

// 8 — empty / whitespace aliases never match (defensive against blank admin entries).
test('empty and whitespace-only aliases are ignored', () => {
  const noisy: ChecklistItem = { docType: 'ktp', aliases: ['', '   ', 'KTP'] }
  // A blank alias would substring-match everything; it must be skipped.
  assert.deepEqual(matchFileToItems({ path: 'random.pdf' }, [noisy]), [])
  assert.deepEqual(matchFileToItems({ path: 'KTP.pdf' }, [noisy]), ['ktp'])
})

// 10 — WORD-BOUNDARY: a short alias must NOT match mid-token (the false-positive class).
test('word-boundary: short aliases do not match inside unrelated words', () => {
  const IMB: ChecklistItem = { docType: 'imb_pbg', aliases: ['IMB', 'PBG'] }
  const KKitem: ChecklistItem = { docType: 'kartu_keluarga', aliases: ['KK', 'Kartu Keluarga'] }
  // 'imb' sits inside 'Timbangan'; 'kk' inside 'OKK'/'BukKK' — none may match.
  assert.deepEqual(matchFileToItems({ path: 'Timbangan Truk.pdf' }, [IMB]), [])
  assert.deepEqual(matchFileToItems({ path: 'Laporan OKK Toko.xlsx' }, [KKitem]), [])
  assert.deepEqual(matchFileToItems({ path: 'BukKK Kas.pdf' }, [KKitem]), [])
  // but a whole-token occurrence still matches.
  assert.deepEqual(matchFileToItems({ path: 'IMB Gudang.pdf' }, [IMB]), ['imb_pbg'])
  assert.deepEqual(matchFileToItems({ path: 'Scan KK 2024.pdf' }, [KKitem]), ['kartu_keluarga'])
})

// 11 — DISAMBIGUATION: the two bank-statement requirements no longer cross-satisfy.
test('rekening koran pribadi vs perusahaan do not cross-satisfy', () => {
  const items = itemsFor(['rekening_koran_pribadi', 'rekening_koran_perusahaan'])
  const pribadi = reconcileDiscovery([{ path: 'Rekening Koran Pribadi Budi.pdf' }], items)
  assert.equal(pribadi.matches.find((m) => m.docType === 'rekening_koran_pribadi')?.state, 'satisfied')
  assert.equal(pribadi.matches.find((m) => m.docType === 'rekening_koran_perusahaan')?.state, 'missing')
  const perusahaan = reconcileDiscovery([{ path: 'Rekening Koran Perusahaan PT Maju.pdf' }], items)
  assert.equal(perusahaan.matches.find((m) => m.docType === 'rekening_koran_perusahaan')?.state, 'satisfied')
  assert.equal(perusahaan.matches.find((m) => m.docType === 'rekening_koran_pribadi')?.state, 'missing')
  // A bare "Rekening Koran.pdf" satisfies NEITHER (RM must disambiguate) and lands unrecognized.
  const bare = reconcileDiscovery([{ path: 'Rekening Koran.pdf' }], items)
  assert.deepEqual(bare.unrecognized, ['Rekening Koran.pdf'])
})

// 12 — GENERIC-WORD: dropped over-broad aliases no longer false-satisfy.
test('generic words no longer false-satisfy (Sertifikat Halal, Polis Jiwa, Kontrak Kerja)', () => {
  const items = itemsFor(['sertifikat_agunan', 'asuransi_agunan', 'kontrak_spk_po'])
  const result = reconcileDiscovery(
    [
      { path: 'Sertifikat Halal Produk.pdf' },
      { path: 'Polis Asuransi Jiwa Direktur.pdf' },
      { path: 'Kontrak Kerja Karyawan.pdf' },
    ],
    items,
  )
  for (const m of result.matches) assert.equal(m.state, 'missing', `${m.docType} must not be falsely satisfied`)
  // all three are unrecognized (the ⚠️ bucket), not silently absorbed
  assert.equal(result.unrecognized.length, 3)
})

// 14 — LONGEST-ALIAS-WINS: a pengurus KTP must NOT also satisfy the principal `ktp`.
test('longest-alias-wins: "KTP Pengurus.pdf" satisfies only ktp_pengurus, not bare ktp', () => {
  const items = itemsFor(['ktp', 'ktp_pengurus', 'ktp_penjamin'])
  const result = reconcileDiscovery([{ path: 'KTP Pengurus.pdf' }], items)
  assert.equal(result.matches.find((m) => m.docType === 'ktp_pengurus')?.state, 'satisfied')
  assert.equal(result.matches.find((m) => m.docType === 'ktp')?.state, 'missing')
  // 'KTP Direktur.pdf' is the other ktp_pengurus alias — same suppression of bare ktp.
  const direktur = reconcileDiscovery([{ path: 'KTP Direktur.pdf' }], items)
  assert.equal(direktur.matches.find((m) => m.docType === 'ktp_pengurus')?.state, 'satisfied')
  assert.equal(direktur.matches.find((m) => m.docType === 'ktp')?.state, 'missing')
})

// 15 — but a file genuinely holding BOTH a standalone KTP and a pengurus KTP satisfies both:
// suppression is positional, so the standalone "KTP" occurrence keeps `ktp` alive.
test('positional suppression: a standalone KTP alongside a pengurus KTP still satisfies ktp', () => {
  const items = itemsFor(['ktp', 'ktp_pengurus'])
  // one file naming both
  const both = matchFileToItems({ path: 'KTP dan KTP Pengurus.pdf' }, items)
  assert.deepEqual(both.sort(), ['ktp', 'ktp_pengurus'])
  // two separate files — the bare principal KTP and the pengurus KTP
  const twoFiles = reconcileDiscovery(
    [{ path: 'KTP Budi.pdf' }, { path: 'KTP Pengurus.pdf' }],
    items,
  )
  assert.equal(twoFiles.matches.find((m) => m.docType === 'ktp')?.state, 'satisfied')
  assert.equal(twoFiles.matches.find((m) => m.docType === 'ktp_pengurus')?.state, 'satisfied')
})

// 13 — alias-table hygiene: no single-character alias (boundary matching makes ≥2-char abbreviations
// like "KK" safe, but a 1-char alias is never a real document name and risks noise).
test('no alias in the default table is a single character', () => {
  for (const [docType, aliases] of Object.entries(DEFAULT_DOC_ALIASES)) {
    for (const alias of aliases) {
      assert.ok(alias.trim().length >= 2, `${docType} alias "${alias}" is too short`)
    }
  }
})

// 9 — itemsFor builds checklist items from the DEFAULT_DOC_ALIASES table.
test('itemsFor builds ChecklistItem[] from the default alias table', () => {
  const items = itemsFor(['ktp', 'npwp'])
  assert.deepEqual(
    items.map((i) => i.docType),
    ['ktp', 'npwp'],
  )
  // Each known docType carries a non-empty alias list.
  for (const item of items) {
    assert.ok(item.aliases.length > 0, `${item.docType} should have aliases`)
  }
})
