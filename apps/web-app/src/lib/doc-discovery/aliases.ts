// Default discovery aliases for deterministic document matching (no AI / no OCR).
//
// Each entry maps a docType key (the REAL keys from `src/lib/required-docs.ts`) to a
// list of case-insensitive SUBSTRING query aliases the RM's filenames/folders are
// likely to contain (Bahasa + common abbreviations). The discovery matcher tests each
// alias as a substring against a file's FULL PATH — so a folder named `KTP/` matches
// just as well as a filename `KTP Budi.pdf`.
//
// These are admin-EDITABLE DEFAULTS. The admin-config wiring that lets an operator
// override per-checklist aliases lands later; until then this table is the seed.
//
// A docType with no entry here simply never auto-matches (it stays ⬜ missing until the
// RM renames/moves the file) — that is an acceptable outcome, not a bug.
export const DEFAULT_DOC_ALIASES: Record<string, string[]> = {
  // --- Identity (individuals + pengurus) ---
  ktp: ['KTP', 'Kartu Tanda Penduduk', 'E-KTP'],
  ktp_pengurus: ['KTP Pengurus', 'KTP Direktur'],
  ktp_penjamin: ['KTP Penjamin'],
  npwp: ['NPWP', 'Nomor Pokok Wajib Pajak'],
  kartu_keluarga: ['KK', 'Kartu Keluarga'],
  buku_nikah: ['Buku Nikah', 'Akta Nikah', 'Surat Nikah'],
  persetujuan_pasangan: ['Persetujuan Pasangan', 'Persetujuan Suami', 'Persetujuan Istri'],

  // --- Income / financials (individual) ---
  slip_gaji: ['Slip Gaji', 'Slip Salary', 'Payslip'],
  laporan_usaha: ['Laporan Usaha'],
  // Disambiguated from rekening_koran_perusahaan: the bare 'Rekening Koran' is intentionally NOT an
  // alias of either (it would satisfy BOTH — two distinct requirements). A file named only "Rekening
  // Koran.pdf" stays ⬜ missing until the RM marks it pribadi/perusahaan (the design's RM-fixes path).
  rekening_koran_pribadi: ['Rekening Koran Pribadi', 'Rek Koran Pribadi', 'Mutasi Tabungan', 'Rekening Tabungan'],

  // --- Legal entity (business) ---
  akta_pendirian: ['Akta Pendirian', 'Akta Perubahan', 'Akta'],
  sk_kemenkumham: ['SK Kemenkumham', 'SK Pengesahan', 'Kemenkumham'],
  nib: ['NIB', 'Nomor Induk Berusaha'],
  siup: ['SIUP', 'Izin Usaha', 'TDP'],

  // --- Financials (business) ---
  laporan_keuangan: ['Laporan Keuangan', 'LapKeu', 'Lapkeu', 'Financial Statement', 'Neraca'],
  rekening_koran_perusahaan: ['Rekening Koran Perusahaan', 'Rek Koran Perusahaan', 'Rekening Koran PT', 'Rekening Giro', 'Mutasi Rekening Perusahaan'],
  daftar_pemegang_saham: ['Daftar Pemegang Saham', 'Pemegang Saham', 'Shareholder'],
  daftar_pengurus_komisaris: ['Daftar Pengurus', 'Pengurus & Komisaris', 'Komisaris'],
  spt_tahunan: ['SPT', 'SPT Tahunan'],
  daftar_hutang_piutang: ['Hutang Piutang', 'Daftar Hutang', 'Daftar Piutang'],
  daftar_supplier_pelanggan: ['Supplier', 'Pelanggan', 'Daftar Supplier', 'Daftar Pelanggan'],
  list_project: ['Daftar Proyek', 'Proyek Berjalan', 'List Project'],

  // --- Akad / objek pembiayaan ---
  quotation_objek: ['Quotation', 'Invoice Objek', 'Penawaran'],
  spesifikasi_barang: ['Spesifikasi Barang', 'Spek Barang'],
  spesifikasi_objek_sewa: ['Spesifikasi Objek Sewa', 'Objek Sewa'],
  business_plan: ['Business Plan', 'Rencana Bisnis'],
  proyeksi_arus_kas: ['Proyeksi Arus Kas', 'Cash Flow', 'Arus Kas'],
  rab_penggunaan_dana: ['RAB', 'Rencana Anggaran Biaya', 'RAB Penggunaan Dana'],
  // 'Kontrak' bare is dropped — it matches HR/employment contracts ("Kontrak Kerja Karyawan"). The
  // financed-project work order is specific: SPK / Surat Perintah Kerja / Purchase Order / a project contract.
  kontrak_spk_po: ['Kontrak SPK', 'SPK', 'Surat Perintah Kerja', 'Purchase Order', 'PO Proyek', 'Kontrak Proyek'],
  surat_bouwheer: ['Bouwheer', 'Surat Bouwheer', 'Surat Pernyataan Bouwheer'],

  // --- Agunan / collateral ---
  // 'Sertifikat' bare is dropped — it matches Sertifikat Halal / Pelatihan / etc. Use the land-title forms.
  sertifikat_agunan: ['Sertifikat Tanah', 'Sertifikat Agunan', 'SHM', 'SHGB', 'Sertifikat Hak Milik', 'Sertifikat Hak Guna'],
  imb_pbg: ['IMB', 'PBG'],
  pbb: ['PBB'],
  bpkb: ['BPKB'],
  stnk: ['STNK'],
  appraisal_agunan: ['Appraisal', 'Penilaian Agunan', 'Laporan Penilaian'],
  // 'Asuransi'/'Polis Asuransi' bare are dropped — they match life/health policies ("Polis Asuransi Jiwa").
  asuransi_agunan: ['Asuransi Agunan', 'Asuransi Kebakaran', 'Asuransi Properti', 'Asuransi Kendaraan', 'Polis Asuransi Agunan', 'Asuransi Jaminan'],
  jaminan_perorangan: ['Jaminan Perorangan', 'Surat Pernyataan Penjamin', 'Personal Guarantee'],
}
