import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseGateValueFromText, parseNpwp, parseNib, parseAddress,
  parseOmzet, parseLabaBersih, parsePendapatanSpt, parseSaldoRataRata, parseBakiDebet, parseFasilitasAktif, parseNilaiPasar, parseNilaiLikuidasi,
} from './ocr'
import { formatRupiah } from './sla-utils'

// Slice 2b: parse hard-gate INPUT suggestions from OCR'd document text. Conservative —
// returns null when not confidently found (field falls back to manual). Finance-critical:
// these feed Kol / DSR / LTV, so over-matching (e.g. a date or a count) must NOT produce a value.

test('Kol — parses "Kol N" and "Kolektibilitas: N" (1–5 only)', () => {
  assert.equal(parseGateValueFromText('slik_report', 'Kolektibilitas terkini: Kol 1'), 1)
  assert.equal(parseGateValueFromText('slik_report', 'KOLEKTIBILITAS 3'), 3)
  assert.equal(parseGateValueFromText('slik_report', 'Status kol: 5 (macet)'), 5)
})

test('Kol — null when absent or out of range', () => {
  assert.equal(parseGateValueFromText('slik_report', 'Tidak ada data kolektibilitas terbaca'), null)
  assert.equal(parseGateValueFromText('slik_report', 'Kol 7'), null) // 7 ∉ 1–5
})

test('income — parses a labelled Rupiah amount (id-ID dotted thousands)', () => {
  assert.equal(parseGateValueFromText('slip_gaji', 'Penghasilan bersih per bulan: Rp 95.000.000'), 95_000_000)
  assert.equal(parseGateValueFromText('slip_gaji', 'Gaji pokok Rp 12.500.000'), 12_500_000)
})

test('income (laporan keuangan) — parses the NET line, not omzet/revenue', () => {
  const text = 'LAPORAN KEUANGAN - LABA RUGI\nPendapatan usaha (omzet) per bulan : Rp 160.000.000\nLaba bersih per bulan : Rp 40.000.000'
  assert.equal(parseGateValueFromText('laporan_keuangan', text), 40_000_000)
})

test('appraisal — parses a labelled Rupiah amount', () => {
  assert.equal(parseGateValueFromText('appraisal_agunan', 'Nilai pasar wajar agunan: Rp 1.550.000.000'), 1_550_000_000)
})

test('Rupiah — null when the labelled line has no real amount (no bare small numbers)', () => {
  // "per bulan" line with only a count must not yield a gate value.
  assert.equal(parseGateValueFromText('slip_gaji', 'Penghasilan: data tidak tersedia'), null)
  assert.equal(parseGateValueFromText('appraisal_agunan', 'Appraisal selesai dalam 3 hari'), null)
})

test('round-trips the stub fabrication (formatRupiah → parse)', () => {
  const income = 95_000_000
  const line = `Penghasilan bersih per bulan: ${formatRupiah(income)}`
  assert.equal(parseGateValueFromText('slip_gaji', line), income)
})

test('unknown docType → null', () => {
  assert.equal(parseGateValueFromText('ktp', 'NIK 3275010101800001'), null)
})

// ── Batch 9: legal-identity string parsing (NPWP / NIB / alamat) ──────────────
// Same conservative posture as the gate parsers: a confident match or null (stays manual).

test('NPWP — dotted form anywhere; 15–16 contiguous digits on an NPWP line', () => {
  assert.equal(parseNpwp('NPWP: 09.254.294.3-407.000'), '09.254.294.3-407.000')
  assert.equal(parseNpwp('Nomor NPWP 3275010101800001'), '3275010101800001')
  assert.equal(parseNpwp('tidak ada nomor pajak di sini'), null)
  assert.equal(parseNpwp('NPWP 123', ), null) // not a full NPWP
})

test('NIB — exactly 13 digits on an NIB line', () => {
  assert.equal(parseNib('NIB (Nomor Induk Berusaha): 1234567890123'), '1234567890123')
  assert.equal(parseNib('Nomor Induk Berusaha 9120304050607'), '9120304050607')
  assert.equal(parseNib('Tidak ada NIB'), null)
  assert.equal(parseNib('NIB 12345'), null) // not 13 digits
})

test('alamat — captures the value after the Alamat label, conservative min length', () => {
  assert.equal(parseAddress('Alamat : Jl. Merdeka No. 10, Jakarta'), 'Jl. Merdeka No. 10, Jakarta')
  assert.equal(parseAddress('Alamat Kantor: Komplek Ruko ABC Blok 2'), 'Komplek Ruko ABC Blok 2')
  assert.equal(parseAddress('Alamat: JKT'), null) // too short → stays manual
  assert.equal(parseAddress('tidak ada baris alamat'), null)
})

// ── Advisory OCR-widening parsers (RM-led design §3) — HEURISTIC, tuned on sample TEXT only ──
// These feed advisory-only fields (never gate). Same conservative posture: a labelled amount or null.
test('omzet — revenue top-line (distinct from net income)', () => {
  assert.equal(parseOmzet('Omzet usaha: Rp 1.200.000.000'), 1_200_000_000)
  assert.equal(parseOmzet('Total Penjualan Rp 850.000.000'), 850_000_000)
  assert.equal(parseOmzet('Tidak ada baris omzet'), null)
})

test('laba bersih — net profit line', () => {
  assert.equal(parseLabaBersih('Laba Bersih: Rp 150.000.000'), 150_000_000)
  assert.equal(parseLabaBersih('Laba setelah pajak Rp 90.000.000'), 90_000_000)
  assert.equal(parseLabaBersih('Pendapatan usaha Rp 1.000.000.000'), null) // revenue, not net → null
})

test('pendapatan SPT — reported taxable income', () => {
  assert.equal(parsePendapatanSpt('Penghasilan Kena Pajak Rp 120.000.000'), 120_000_000)
  assert.equal(parsePendapatanSpt('Penghasilan Neto: Rp 200.000.000'), 200_000_000)
  assert.equal(parsePendapatanSpt('tidak ada angka pajak'), null)
})

test('saldo rata-rata — bank statement average balance', () => {
  assert.equal(parseSaldoRataRata('Saldo Rata-rata: Rp 45.000.000'), 45_000_000)
  assert.equal(parseSaldoRataRata('Rata-rata Saldo Rp 12.000.000'), 12_000_000)
  assert.equal(parseSaldoRataRata('Saldo akhir Rp 5.000.000'), null) // not the average line
})

test('baki debet — SLIK outstanding principal', () => {
  assert.equal(parseBakiDebet('Baki Debet: Rp 300.000.000'), 300_000_000)
  assert.equal(parseBakiDebet('Outstanding Rp 75.000.000'), 75_000_000)
  assert.equal(parseBakiDebet('Kolektibilitas: Kol 1'), null)
})

test('fasilitas aktif — count of active facilities (a COUNT, not Rupiah)', () => {
  assert.equal(parseFasilitasAktif('Fasilitas Aktif: 3'), 3)
  assert.equal(parseFasilitasAktif('2 fasilitas kredit aktif'), 2)
  assert.equal(parseFasilitasAktif('Jumlah Fasilitas 5'), 5)
  assert.equal(parseFasilitasAktif('tidak ada fasilitas tercatat'), null)
})

test('nilai pasar / likuidasi — appraisal report values', () => {
  assert.equal(parseNilaiPasar('Nilai Pasar: Rp 2.000.000.000'), 2_000_000_000)
  assert.equal(parseNilaiPasar('Nilai Wajar Rp 1.800.000.000'), 1_800_000_000)
  assert.equal(parseNilaiLikuidasi('Nilai Likuidasi: Rp 1.500.000.000'), 1_500_000_000)
  assert.equal(parseNilaiLikuidasi('Nilai jual cepat Rp 1.200.000.000'), 1_200_000_000)
  assert.equal(parseNilaiPasar('tidak ada penilaian'), null)
})
