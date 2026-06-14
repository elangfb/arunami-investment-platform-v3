// Stage 1 required-documents specification.
//
// IMPORTANT: the document lists below are NoEffort-proposed defaults, NOT
// Bank-confirmed. They are tracked as a Discovery W1 open question — see
// docs/references/discovery-open-questions.md ("Stage 1 required-documents spec").
// Treat any change here as a proposal until the Bank confirms.
//
// The spec is the merge of four sources, then filtered by per-doc conditions:
//   base + byNasabahType[nasabahType] + byAkadType[akadType] + conditional
// Conditions let a doc depend on application fields (married, income source,
// collateral type) rather than only the akad x nasabah axes.

import type { AkadType, ApplicationDocument, FinancingPurpose } from '@/lib/types'
import type { Desk } from '@/lib/desks'

// "Required, owned by desk D" — the doc's owner is a pure function of its docType (derived, not
// stored), so who-may-upload-it and who-confirms-it is data, not four bespoke upload actions.
// SLIK/Pefindo are owned by RM's bureau-data desk at Stage 2; everything else defaults
// to RM intake. Add a docType→desk override here as new owners appear.
const OWNER_BY_DOC_TYPE: Partial<Record<string, Desk>> = {
  slik_report: 'slik',
  pefindo_report: 'slik', // bureau report uploaded by RM's Stage-2 bureau-data desk
}

export function ownerDeskForDocType(docType: string): Desk {
  return OWNER_BY_DOC_TYPE[docType] ?? 'intake'
}

/** Inputs that determine which documents an application requires at intake. */
export interface RequiredDocsInput {
  nasabahType: 'individual' | 'business'
  akadType: AkadType
  isMarried?: boolean
  incomeSource?: 'karyawan' | 'wiraswasta'
  collateralType?: 'none' | 'fixed_asset' | 'vehicle' | 'guarantor'
  // Optional purpose dimension (SOP slide 5). Undefined → no purpose-conditioned docs (today's
  // behavior); intake capture of this is a W1 step. See FinancingPurpose.
  financingPurpose?: FinancingPurpose
}

/** Condition predicate keys. A doc with no condition is always included. */
type ConditionKey =
  | 'married'
  | 'married_and_secured'
  | 'income_karyawan'
  | 'income_wiraswasta'
  | 'collateral_fixed_asset'
  | 'collateral_vehicle'
  | 'collateral_physical' // fixed_asset OR vehicle
  | 'collateral_guarantor'
  | 'purpose_modal_or_pembangunan' // working-capital or construction
  | 'purpose_pembangunan' // construction only

interface DocSpec {
  /** Stable document type key — also used to derive the doc id. */
  docType: string
  /** Human-readable name shown in the UI (Bahasa Indonesia). */
  name: string
  /** Omit for an unconditional doc; otherwise gated by the predicate. */
  condition?: ConditionKey
}

const CONDITIONS: Record<ConditionKey, (i: RequiredDocsInput) => boolean> = {
  married: (i) => i.isMarried === true,
  married_and_secured: (i) =>
    i.isMarried === true && i.collateralType != null && i.collateralType !== 'none',
  income_karyawan: (i) => i.incomeSource === 'karyawan',
  income_wiraswasta: (i) => i.incomeSource === 'wiraswasta',
  collateral_fixed_asset: (i) => i.collateralType === 'fixed_asset',
  collateral_vehicle: (i) => i.collateralType === 'vehicle',
  collateral_physical: (i) =>
    i.collateralType === 'fixed_asset' || i.collateralType === 'vehicle',
  collateral_guarantor: (i) => i.collateralType === 'guarantor',
  purpose_modal_or_pembangunan: (i) =>
    i.financingPurpose === 'modal_kerja' || i.financingPurpose === 'pembangunan',
  purpose_pembangunan: (i) => i.financingPurpose === 'pembangunan',
}

// --- Template -------------------------------------------------------------

/** Required of every application regardless of akad or nasabah type. */
const BASE: DocSpec[] = [
  { docType: 'ktp', name: 'KTP Pemohon' },
  { docType: 'npwp', name: 'NPWP' },
  { docType: 'formulir_permohonan', name: 'Formulir Permohonan Pembiayaan' },
]

const BY_NASABAH_TYPE: Record<RequiredDocsInput['nasabahType'], DocSpec[]> = {
  individual: [
    { docType: 'kartu_keluarga', name: 'Kartu Keluarga' },
    { docType: 'buku_nikah', name: 'Buku Nikah', condition: 'married' },
    {
      docType: 'persetujuan_pasangan',
      name: 'Surat Persetujuan Pasangan',
      condition: 'married_and_secured',
    },
    { docType: 'slip_gaji', name: 'Slip Gaji', condition: 'income_karyawan' },
    {
      docType: 'laporan_usaha',
      name: 'Laporan Usaha',
      condition: 'income_wiraswasta',
    },
    { docType: 'rekening_koran_pribadi', name: 'Rekening Koran 3 Bulan Terakhir' },
  ],
  business: [
    { docType: 'ktp_pengurus', name: 'KTP Pengurus' },
    { docType: 'akta_pendirian', name: 'Akta Pendirian & Perubahan' },
    { docType: 'sk_kemenkumham', name: 'SK Pengesahan Kemenkumham' },
    { docType: 'nib', name: 'NIB' },
    { docType: 'siup', name: 'SIUP / Izin Usaha' },
    { docType: 'laporan_keuangan', name: 'Laporan Keuangan' },
    {
      docType: 'rekening_koran_perusahaan',
      name: 'Rekening Koran Perusahaan 6 Bulan Terakhir',
    },
    // Badan-usaha-skewed additions (SOP slide 5 / REQUIRED-DOCS-MATRIX). 📝 NoEffort defaults
    // pending W1 confirmation — see the file header.
    { docType: 'daftar_pemegang_saham', name: 'Daftar Pemegang Saham' },
    { docType: 'daftar_pengurus_komisaris', name: 'Daftar Pengurus & Komisaris' },
    { docType: 'spt_tahunan', name: 'SPT Tahunan Badan' },
    { docType: 'daftar_hutang_piutang', name: 'Daftar Hutang & Piutang' },
    { docType: 'daftar_supplier_pelanggan', name: 'Daftar Supplier & Pelanggan Utama' },
    { docType: 'list_project', name: 'Daftar Proyek Berjalan' },
  ],
}

const BY_AKAD_TYPE: Record<AkadType, DocSpec[]> = {
  Murabahah: [
    { docType: 'quotation_objek', name: 'Quotation / Invoice Objek Pembiayaan' },
    { docType: 'spesifikasi_barang', name: 'Spesifikasi Barang' },
  ],
  Ijarah: [{ docType: 'spesifikasi_objek_sewa', name: 'Spesifikasi Objek Sewa' }],
  Musyarakah: [
    { docType: 'business_plan', name: 'Business Plan' },
    { docType: 'proyeksi_arus_kas', name: 'Proyeksi Arus Kas' },
  ],
  Mudharabah: [
    { docType: 'business_plan', name: 'Business Plan' },
    { docType: 'proyeksi_arus_kas', name: 'Proyeksi Arus Kas' },
    { docType: 'rab_penggunaan_dana', name: 'RAB Penggunaan Dana' },
  ],
}

/**
 * Collateral- and purpose-conditioned docs — included only when the matching predicate holds.
 * Purpose docs (RAB / Kontrak-SPK-PO / bouwheer) stay inert until `financingPurpose` is captured
 * at intake (a W1 step). `rab_penggunaan_dana` also appears under the Mudharabah akad set; the
 * builder dedupes by docType so it's listed once.
 */
const CONDITIONAL: DocSpec[] = [
  {
    docType: 'sertifikat_agunan',
    name: 'Sertifikat Agunan (SHM / SHGB)',
    condition: 'collateral_fixed_asset',
  },
  { docType: 'imb_pbg', name: 'IMB / PBG', condition: 'collateral_fixed_asset' },
  { docType: 'pbb', name: 'PBB Agunan (Tahun Terakhir)', condition: 'collateral_fixed_asset' },
  { docType: 'bpkb', name: 'BPKB', condition: 'collateral_vehicle' },
  { docType: 'stnk', name: 'STNK', condition: 'collateral_vehicle' },
  {
    docType: 'appraisal_agunan',
    name: 'Dokumen Appraisal Agunan',
    condition: 'collateral_physical',
  },
  {
    docType: 'asuransi_agunan',
    name: 'Bukti Asuransi Agunan',
    condition: 'collateral_physical',
  },
  {
    docType: 'jaminan_perorangan',
    name: 'Surat Pernyataan Penjamin (Jaminan Perorangan)',
    condition: 'collateral_guarantor',
  },
  {
    docType: 'ktp_penjamin',
    name: 'KTP Penjamin',
    condition: 'collateral_guarantor',
  },
  // Purpose-conditioned (SOP slide 5). Inert until financingPurpose is captured at intake (W1).
  {
    docType: 'rab_penggunaan_dana',
    name: 'RAB Penggunaan Dana',
    condition: 'purpose_modal_or_pembangunan',
  },
  {
    docType: 'kontrak_spk_po',
    name: 'Kontrak / SPK / Purchase Order Proyek',
    condition: 'purpose_modal_or_pembangunan',
  },
  {
    docType: 'surat_bouwheer',
    name: 'Surat Bouwheer / Surat Tugas Pemberi Kerja',
    condition: 'purpose_pembangunan',
  },
]

// --- Builder --------------------------------------------------------------

/**
 * Resolve the Stage 1 required-documents snapshot for an application.
 *
 * Returns one ApplicationDocument per required doc, all with status 'missing'
 * and required: true. Callers store this on `application.documents` at
 * creation time — that array IS the per-application snapshot, so later edits
 * to this template never retroactively change an in-flight application.
 *
 * @param input    intake attributes of the application
 * @param idPrefix unique per-application prefix for generated doc ids
 */
export function buildRequiredDocuments(
  input: RequiredDocsInput,
  idPrefix: string,
): ApplicationDocument[] {
  const specs = [
    ...BASE,
    ...BY_NASABAH_TYPE[input.nasabahType],
    ...BY_AKAD_TYPE[input.akadType],
    ...CONDITIONAL,
  ].filter((spec) => spec.condition == null || CONDITIONS[spec.condition](input))

  // Dedupe by docType (first wins) — a docType can appear in more than one source (e.g.
  // rab_penggunaan_dana under both the Mudharabah akad set and the purpose-conditioned set).
  const seen = new Set<string>()
  return specs
    .filter((spec) => !seen.has(spec.docType) && seen.add(spec.docType))
    .map((spec, index) => ({
      id: `${idPrefix}-${index + 1}`,
      name: spec.name,
      docType: spec.docType,
      status: 'missing' as const,
      required: true,
    }))
}
