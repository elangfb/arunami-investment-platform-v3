import type { LoanApplication, ApplicationDocument, HistoryEntry, FiveCSAnalysis, ApprovalStepRecord, PersonalStatus, StageAssignment } from '@/lib/types'
import { buildRequiredDocuments, type RequiredDocsInput } from '@/lib/required-docs'
import { ownersForStage } from '@/lib/stage-owners'
import { buildAnalysisDraft } from '@/lib/analysis-draft'
import { formatRupiah } from '@/lib/sla-utils'
import { AML_ATTESTATION_STATEMENT } from '@/lib/aml'

const emptyAnalysis: FiveCSAnalysis = { character: '', capacity: '', capital: '', condition: '', collateral: '', syariah: '', generated: false }

const SEED_UPLOADED_AT = new Date('2026-05-14T10:00:00+07:00')

// Seed timeline anchored to the real "now" so the SLA spread stays realistic as
// the calendar advances (avoids the all-overdue drift of static dates).
const DAY_MS = 86_400_000
function daysAgo(n: number): Date { return new Date(Date.now() - n * DAY_MS) }

type Verification = ApplicationDocument['legalVerification']

interface SeedDocsOptions {
  /** docTypes left as status 'missing' (Stage 1 incomplete apps). */
  missing?: string[]
  /** legalVerification applied to every uploaded doc. */
  legalVerification?: Verification
  /** Per-docType legalVerification overrides (e.g. one failed doc). */
  verificationOverrides?: Record<string, Verification>
  /** Append the Stage 2 SLIK report (docType 'slik_report'). */
  slik?: boolean
}

// Generates an application's documents from the live required-docs builder,
// then applies per-application upload / verification state. Keeps seed data
// in lockstep with what the workflow actually produces at intake.
function seedDocs(
  idPrefix: string,
  intake: RequiredDocsInput,
  opts: SeedDocsOptions = {},
): ApplicationDocument[] {
  const result = buildRequiredDocuments(intake, idPrefix).map((doc) => {
    if (opts.missing?.includes(doc.docType)) return doc
    const verification = opts.verificationOverrides?.[doc.docType] ?? opts.legalVerification
    return {
      ...doc,
      status: 'uploaded' as const,
      uploadedAt: SEED_UPLOADED_AT,
      uploadedBy: 'u-001',
      ...(verification !== undefined ? { legalVerification: verification } : {}),
    }
  })
  if (opts.slik) {
    result.push({
      id: `${idPrefix}-slik`,
      name: 'Laporan SLIK',
      docType: 'slik_report',
      status: 'uploaded',
      required: true,
      uploadedAt: SEED_UPLOADED_AT,
      uploadedBy: 'u-003',
      legalVerification: null,
    })
  }
  return result
}

// History entries mirror exactly what the running app records: the creation
// event, each stage-transition (named by its action button), and the
// in-stage milestones (Kol input, legal review, risk recommendation).
// Tuple: [id, timestamp, userId, userName, action, stage, reason?].
const history = (
  items: Array<[string, string, string, string, string, HistoryEntry['stage'], string?]>,
): HistoryEntry[] =>
  items.map(([id, timestamp, userId, userName, action, stage, reason]) => ({
    id,
    timestamp: new Date(timestamp),
    userId,
    userName,
    action,
    stage,
    ...(reason ? { reason } : {}),
  }))

// Builds the append-only assignments log from a linear stage path. `path` is
// ordered [stage, ISO date] pairs; the last entry is the current stage. Each
// passed-through stage yields submitted desks; the current stage yields open
// desks. Stage 2 expands to two desks (LG + RT).
const assignments = (
  path: Array<[StageAssignment['stage'], string]>,
  currentStatus: PersonalStatus,
): StageAssignment[] =>
  path.flatMap(([stage, iso], index) => {
    const assignedAt = new Date(iso)
    const isCurrent = index === path.length - 1
    const submittedAt = isCurrent ? null : new Date(path[index + 1][1])
    return ownersForStage(stage).map(owner => ({
      stage,
      role: owner.role,
      userId: owner.id,
      userName: owner.name,
      status: isCurrent ? currentStatus : ('submitted' as const),
      assignedAt,
      submittedAt,
    }))
  })

const analysis005: FiveCSAnalysis = {
  character: 'UD Cahaya Timur memiliki rekam jejak pembayaran yang baik dan hubungan usaha yang stabil dengan pemasok utama. Trade checking menunjukkan reputasi pemilik cukup kuat di komunitas pedagang setempat.',
  capacity: 'Kapasitas bayar memadai berdasarkan revenue tahunan Rp 4,2 miliar dan margin laba bersih 18%. Proyeksi cicilan baru menjaga DSR sekitar 30%, masih dalam appetite bank.',
  capital: 'Struktur modal cukup kuat dengan porsi ekuitas pemilik yang dominan dan tambahan modal kerja dari laba ditahan. Leverage usaha masih sehat untuk skala perdagangan.',
  condition: 'Industri perdagangan kebutuhan harian relatif stabil dengan permintaan berulang. Risiko utama adalah fluktuasi harga pasokan, namun mitigasi tersedia melalui kontrak pemasok bulanan.',
  collateral: 'Jaminan berupa tanah dan bangunan di Bekasi dengan nilai appraisal yang memadai. LTV 50% memberikan buffer konservatif terhadap penurunan nilai agunan.',
  syariah: 'Akad Mudharabah sesuai dengan fatwa DSN-MUI sepanjang nisbah bagi hasil, objek usaha, dan mekanisme pelaporan keuntungan dinyatakan jelas. Tidak ditemukan indikasi aktivitas usaha non-halal.',
  generated: true,
}

const analysisGeneric: FiveCSAnalysis = {
  character: 'Nasabah menunjukkan itikad baik dan kooperatif selama proses pembiayaan. Riwayat hubungan dengan bank dan hasil verifikasi lapangan tidak menunjukkan temuan material.',
  capacity: 'Arus kas operasional dinilai cukup untuk mendukung kewajiban pembiayaan baru. Sensitivitas terhadap penurunan omzet masih perlu dipantau melalui covenant pelaporan berkala.',
  capital: 'Permodalan internal cukup memadai dengan kontribusi modal sendiri yang jelas. Struktur kewajiban masih berada pada tingkat yang dapat diterima.',
  condition: 'Kondisi industri relatif stabil dengan prospek permintaan yang masih positif. Risiko kompetisi dan perubahan harga telah dipertimbangkan dalam proyeksi konservatif.',
  collateral: 'Agunan memiliki legalitas dan nilai yang cukup berdasarkan dokumen appraisal. Rasio LTV berada dalam batas kebijakan bank atau memiliki mitigasi yang memadai.',
  syariah: 'Akad pembiayaan telah disesuaikan dengan tujuan penggunaan dana dan prinsip syariah. Tidak ada indikasi pelanggaran objek akad berdasarkan dokumen yang tersedia.',
  generated: true,
}


// Deterministic, data-grounded AI chat seed — mirrors the hand-written 005/006
// threads so the AI Chat tab renders realistic, per-application content instead
// of an empty state. Each turn references the app's own gates, akad, purpose,
// and collateral. Not a real LLM — see AIChatTab's COMPLIANCE DEBT note.
// Applied post-hoc (see SEED_CHAT_IDS below) to apps that have reached the
// analysis stages; brand-new and fresh-draft apps stay empty on purpose so the
// "Mulai tanya jawab…" empty state remains visible.
function seedChat(app: LoanApplication): LoanApplication['aiChatHistory'] {
  const { dsr, ltv } = app.hardGates
  const plafond = formatRupiah(app.requestedPlafond)
  const income = formatRupiah(app.financialInputs.netMonthlyIncome)
  const collateralValue = formatRupiah(app.financialInputs.collateralAppraisedValue)
  const isProfitShare = app.akadType === 'Musyarakah' || app.akadType === 'Mudharabah'

  const capacityA = dsr > 40
    ? `DSR tercatat ${dsr}%, di atas ambang internal 40%. Mitigasi utama: turunkan plafond, perpanjang tenor, atau tambah agunan agar beban cicilan terhadap pendapatan bersih ${income} kembali sehat. Dasar proyeksi arus kas perlu didokumentasikan.`
    : `Dengan pendapatan bersih ${income} per bulan, DSR berada di ${dsr}% — masih dalam ambang internal 40%. Cicilan baru atas plafond ${plafond} tertutup oleh arus kas operasional; pantau melalui rekening koran.`

  const collateralA = app.collateralType === 'none'
    ? `Pembiayaan diajukan tanpa agunan fisik, sehingga mitigasi bertumpu pada kelayakan usaha dan struktur akad ${app.akadType}. Pastikan covenant pelaporan dibuat ketat.`
    : ltv > 70
      ? `Nilai appraisal agunan ${collateralValue} menghasilkan LTV ${ltv}%, melebihi ambang 70%. Perlu penambahan agunan atau penyesuaian plafond ${plafond} sebelum lanjut.`
      : `Nilai appraisal agunan ${collateralValue} menghasilkan LTV ${ltv}%, masih dalam ambang 70% terhadap plafond ${plafond}. Buffer agunan memadai.`

  const syariahA = isProfitShare
    ? `Akad ${app.akadType} bersifat bagi hasil, sesuai untuk pembiayaan "${app.purpose}" sepanjang nisbah, objek usaha, dan mekanisme pelaporan keuntungan disepakati di awal. Jadikan laporan omzet sebagai covenant agar bagi hasil dapat diaudit.`
    : `Akad ${app.akadType} sesuai untuk "${app.purpose}" selama objek pembiayaan jelas dan halal. Pastikan harga perolehan dan margin transparan sesuai fatwa DSN-MUI.`

  return [
    { role: 'user', content: dsr > 40 ? 'DSR aplikasi ini di atas ambang. Apa mitigasi yang bisa diajukan?' : 'Bagaimana penilaian kapasitas bayar nasabah berdasarkan laporan keuangan?' },
    { role: 'assistant', content: capacityA },
    { role: 'user', content: 'Bagaimana penilaian agunan dan rasio LTV-nya?' },
    { role: 'assistant', content: collateralA },
    { role: 'user', content: `Apakah akad ${app.akadType} sudah sesuai untuk tujuan pembiayaan ini?` },
    { role: 'assistant', content: syariahA },
  ]
}

// FOS-2026-014 ships with a freshly AI-drafted 5C+1S — `analysis` is the
// live buildAnalysisDraft output, untouched by the analyst — so the Stage 3
// "AI draft starting point" is openable without clicking Generate.
const app014: LoanApplication = {
  id: 'FOS-2026-014', nasabahName: 'PT Sinar Rezeki', nasabahType: 'business', nik: '3172050607830014', phoneNumber: '0827-1414-2014', whatsappNumber: '0827-1414-2014', namaUsaha: 'PT Sinar Rezeki', akadType: 'Murabahah', requestedPlafond: 900000000, requestedTenorMonths: 36, purpose: 'Modal kerja pengadaan stok barang', collateralType: 'fixed_asset', stage: 3,
  assignments: assignments([[1, '2026-05-09T08:00:00+07:00'], [2, '2026-05-12T09:00:00+07:00'], [3, '2026-05-16T08:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(3), muapSyncedAt: daysAgo(2), createdAt: new Date('2026-05-09T08:00:00+07:00'), createdBy: 'u-001',
  hardGates: { dsr: 32, ltv: 58, kol: 1 }, hardGateViolations: [],
  kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 95000000, existingMonthlyObligations: 3000000, collateralAppraisedValue: 1550000000, proposedMonthlyInstallment: 28000000, projectedMonthlyProfitShare: null }, marginRate: 14,
  extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
  documents: seedDocs('FOS-2026-014', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
  history: history([
    ['h-014-01', '2026-05-09T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
    ['h-014-02', '2026-05-12T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
    ['h-014-03', '2026-05-13T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
    ['h-014-04', '2026-05-14T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
    ['h-014-05', '2026-05-16T08:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
  ]),
  analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
}
app014.analysis = buildAnalysisDraft(app014)

// Prototype state transitions mutate this exported binding in-place.
// eslint-disable-next-line prefer-const
export let APPLICATIONS: LoanApplication[] = [
  {
    id: 'FOS-2026-001', nasabahName: 'CV Maju Bersama', nasabahType: 'business', nik: '3275010101800001', phoneNumber: '0812-1001-2001', whatsappNumber: '0812-1001-2001', namaUsaha: 'CV Maju Bersama', akadType: 'Murabahah', requestedPlafond: 500000000, requestedTenorMonths: 36, purpose: 'Modal kerja operasional', collateralType: 'fixed_asset', stage: 1,
    assignments: assignments([[1, '2026-05-15T08:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(4), createdAt: new Date('2026-05-15T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [],
    kolEntered: false, financialsAssessed: false, stage2LegalApproval: null, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_suggested' },
    documents: seedDocs('FOS-2026-001', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { missing: ['laporan_keuangan', 'appraisal_agunan', 'asuransi_agunan'] }),
    history: history([
      ['h-001-01', '2026-05-15T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
    ]), analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-002', nasabahName: 'Pak Joko Widodo', nasabahType: 'individual', nik: '3173041506750002', phoneNumber: '0813-2002-3002', whatsappNumber: '0813-2002-3002', akadType: 'Musyarakah', requestedPlafond: 200000000, requestedTenorMonths: 24, purpose: 'Ekspansi usaha warung makan', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset', stage: 1,
    assignments: assignments([[1, '2026-05-10T08:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(1), createdAt: new Date('2026-05-10T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [],
    kolEntered: false, financialsAssessed: false, stage2LegalApproval: null, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_suggested' },
    documents: seedDocs('FOS-2026-002', { nasabahType: 'individual', akadType: 'Musyarakah', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset' }, { missing: ['npwp', 'business_plan', 'appraisal_agunan'] }),
    history: history([
      ['h-002-01', '2026-05-10T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
    ]), analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-003', nasabahName: 'PT Berkah Sejahtera', nasabahType: 'business', nik: '3171010202900003', phoneNumber: '0815-3003-4003', whatsappNumber: '0815-3003-4003', namaUsaha: 'PT Berkah Sejahtera', akadType: 'Murabahah', requestedPlafond: 1500000000, requestedTenorMonths: 48, purpose: 'Pembelian mesin produksi', collateralType: 'fixed_asset', stage: 2,
    assignments: assignments([[1, '2026-05-12T08:00:00+07:00'], [2, '2026-05-14T09:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(2), createdAt: new Date('2026-05-12T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [],
    kolEntered: false, financialsAssessed: false, stage2LegalApproval: { verifiedByLG: false }, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_suggested' },
    documents: seedDocs('FOS-2026-003', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: null, slik: true }),
    history: history([
      ['h-003-01', '2026-05-12T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-003-02', '2026-05-14T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
    ]), analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-004', nasabahName: 'Ibu Rini Sumarni', nasabahType: 'individual', nik: '3204052407820004', phoneNumber: '0816-4004-5004', whatsappNumber: '0816-4004-5004', akadType: 'Ijarah', requestedPlafond: 300000000, requestedTenorMonths: 36, purpose: 'Sewa beli kendaraan operasional', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset', stage: 2,
    assignments: assignments([[1, '2026-05-09T08:00:00+07:00'], [2, '2026-05-11T10:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(6), createdAt: new Date('2026-05-09T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 2 }, hardGateViolations: ['kol'],
    kolEntered: true, financialsAssessed: false, stage2LegalApproval: { verifiedByLG: true, notes: 'Dokumen akta dan KTP telah diverifikasi sah' }, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-004', { nasabahType: 'individual', akadType: 'Ijarah', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-004-01', '2026-05-09T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-004-02', '2026-05-11T10:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-004-03', '2026-05-12T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 2', 2],
      ['h-004-04', '2026-05-13T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
    ]), analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-005', nasabahName: 'UD Cahaya Timur', nasabahType: 'business', nik: '3276020311850005', phoneNumber: '0817-5005-6005', whatsappNumber: '0817-5005-6005', namaUsaha: 'UD Cahaya Timur', akadType: 'Mudharabah', requestedPlafond: 800000000, requestedTenorMonths: 24, purpose: 'Bagi hasil usaha perdagangan', collateralType: 'fixed_asset', stage: 3,
    assignments: assignments([[1, '2026-05-08T08:00:00+07:00'], [2, '2026-05-10T09:00:00+07:00'], [3, '2026-05-13T08:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(2), createdAt: new Date('2026-05-08T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 30, ltv: 50, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 67000000, existingMonthlyObligations: 5000000, collateralAppraisedValue: 1600000000, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: 15000000 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-005', { nasabahType: 'business', akadType: 'Mudharabah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-005-01', '2026-05-08T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-005-02', '2026-05-10T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-005-03', '2026-05-11T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-005-04', '2026-05-12T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-005-05', '2026-05-13T08:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
    ]), analysis: analysis005, riskRecommendation: null, komiteVotes: [],
    aiChatHistory: [
      { role: 'user', content: 'Jelaskan lebih detail tentang kapasitas nasabah berdasarkan laporan keuangan' },
      { role: 'assistant', content: 'Berdasarkan laporan keuangan UD Cahaya Timur tahun 2025, revenue tahunan mencapai Rp 4,2 miliar dengan margin laba bersih 18%. Cicilan baru akan menjadi 28% dari pendapatan bersih bulanan, masih dalam batas DSR yang aman...' },
      { role: 'user', content: 'Bagaimana penilaian jaminan tanah di Bekasi?' },
      { role: 'assistant', content: 'Jaminan berupa SHM tanah seluas 450m² di Bekasi Utara dengan nilai appraisal Rp 1,6 miliar. LTV 50% (Rp 800jt / Rp 1,6M) masih jauh di bawah threshold 70%...' },
      { role: 'user', content: 'Apakah akad Mudharabah sesuai untuk usaha perdagangan ini?' },
      { role: 'assistant', content: 'Akad Mudharabah dapat digunakan karena pembiayaan ditujukan untuk modal kerja perdagangan dengan nisbah bagi hasil yang bisa disepakati di awal. Pastikan laporan omzet bulanan menjadi covenant agar pembagian hasil dapat diaudit.' },
    ],
  },
  {
    id: 'FOS-2026-006', nasabahName: 'CV Surya Mandiri', nasabahType: 'business', nik: '3175021201880006', phoneNumber: '0818-6006-7006', whatsappNumber: '0818-6006-7006', namaUsaha: 'CV Surya Mandiri', akadType: 'Murabahah', requestedPlafond: 2000000000, requestedTenorMonths: 48, purpose: 'Modal kerja pembelian bahan baku', collateralType: 'fixed_asset', stage: 3,
    assignments: assignments([[1, '2026-05-01T08:00:00+07:00'], [2, '2026-05-03T09:00:00+07:00'], [3, '2026-05-08T08:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(5), createdAt: new Date('2026-05-01T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 38, ltv: 78, kol: 1 }, hardGateViolations: ['ltv'],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 175000000, existingMonthlyObligations: 0, collateralAppraisedValue: 2560000000, proposedMonthlyInstallment: 66666667, projectedMonthlyProfitShare: null }, marginRate: 15,
    extractionSources: {
      nik: 'ocr_confirmed',
      'hardGates.kol': 'ocr_confirmed',
      'financialInputs.netMonthlyIncome': 'ocr_suggested',
      'financialInputs.collateralAppraisedValue': 'ocr_suggested',
    },
    documents: seedDocs('FOS-2026-006', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-006-01', '2026-05-01T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-006-02', '2026-05-03T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-006-03', '2026-05-04T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-006-04', '2026-05-04T15:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-006-05', '2026-05-05T09:30:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-006-06', '2026-05-06T11:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-006-07', '2026-05-08T08:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kembalikan ke Analis', 3, 'DSR perlu dihitung ulang menggunakan laporan keuangan terbaru Q1 2026'],
    ]),
    analysis: analysisGeneric, riskRecommendation: null, komiteVotes: [],
    aiChatHistory: [
      { role: 'user', content: 'Apa mitigasi untuk LTV 78%?' },
      { role: 'assistant', content: 'Mitigasi utama adalah menambah agunan atau menurunkan plafond agar LTV kembali di bawah threshold 70%. Alternatifnya dapat diminta cash collateral parsial sesuai kebijakan bank.' },
      { role: 'user', content: 'Dokumen apa yang paling kritikal sebelum lanjut?' },
      { role: 'assistant', content: 'Laporan keuangan Q1 2026 dan appraisal agunan terbaru paling kritikal karena mempengaruhi DSR dan LTV, dua hard gate utama pada aplikasi ini.' },
    ],
  },
  {
    id: 'FOS-2026-007', nasabahName: 'Pak Haris Budiman', nasabahType: 'individual', nik: '3201130909790007', phoneNumber: '0819-7007-8007', whatsappNumber: '0819-7007-8007', akadType: 'Musyarakah', requestedPlafond: 400000000, requestedTenorMonths: 36, purpose: 'Investasi properti komersial', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset', stage: 4,
    assignments: assignments([[1, '2026-04-28T08:00:00+07:00'], [2, '2026-05-01T09:00:00+07:00'], [3, '2026-05-06T10:00:00+07:00'], [4, '2026-05-12T14:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(3), createdAt: new Date('2026-04-28T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 36, ltv: 68, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 30600000, existingMonthlyObligations: 2000000, collateralAppraisedValue: 588000000, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: 9000000 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-007', { nasabahType: 'individual', akadType: 'Musyarakah', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-007-01', '2026-04-28T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-007-02', '2026-05-01T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-007-03', '2026-05-02T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-007-04', '2026-05-03T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-007-05', '2026-05-06T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-007-06', '2026-05-08T11:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-007-07', '2026-05-10T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kembalikan ke Analis', 3, 'Perlu klarifikasi sumber down payment properti'],
      ['h-007-08', '2026-05-12T14:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-007-09', '2026-05-12T16:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Profil risiko dapat diterima. DSR dan LTV dalam batas aman.', komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-008', nasabahName: 'PT Mitra Logistik', nasabahType: 'business', nik: '3173031703900008', phoneNumber: '0821-8008-9008', whatsappNumber: '0821-8008-9008', namaUsaha: 'PT Mitra Logistik', akadType: 'Ijarah', requestedPlafond: 3000000000, requestedTenorMonths: 60, purpose: 'Sewa beli armada truk', collateralType: 'fixed_asset', stage: 4,
    assignments: assignments([[1, '2026-04-25T08:00:00+07:00'], [2, '2026-04-29T09:00:00+07:00'], [3, '2026-05-02T09:00:00+07:00'], [4, '2026-05-15T09:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(4), createdAt: new Date('2026-04-25T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 25, ltv: 55, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 340000000, existingMonthlyObligations: 0, collateralAppraisedValue: 5450000000, proposedMonthlyInstallment: 85000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-008', { nasabahType: 'business', akadType: 'Ijarah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-008-01', '2026-04-25T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-008-02', '2026-04-29T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-008-03', '2026-04-30T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-008-04', '2026-05-01T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-008-05', '2026-05-02T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-008-06', '2026-05-15T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-008-07', '2026-05-15T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Conditional', 4],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'conditional', riskNote: 'Disetujui dengan syarat: wajib sertakan asuransi kendaraan dari provider yang disetujui bank. Plafond maksimal Rp 2.8M.', komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-009', nasabahName: 'CV Berkah Abadi', nasabahType: 'business', nik: '3273011102840009', phoneNumber: '0822-9009-1009', whatsappNumber: '0822-9009-1009', namaUsaha: 'CV Berkah Abadi', akadType: 'Murabahah', requestedPlafond: 600000000, requestedTenorMonths: 36, purpose: 'Renovasi & ekspansi toko', collateralType: 'fixed_asset', stage: 5,
    assignments: assignments([[1, '2026-04-20T08:00:00+07:00'], [2, '2026-04-24T09:00:00+07:00'], [3, '2026-05-02T10:00:00+07:00'], [4, '2026-05-10T13:00:00+07:00'], [5, '2026-05-14T10:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(1), createdAt: new Date('2026-04-20T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 29, ltv: 52, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 85000000, existingMonthlyObligations: 1000000, collateralAppraisedValue: 1150000000, proposedMonthlyInstallment: 23666667, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-009', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-009-01', '2026-04-20T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-009-02', '2026-04-24T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-009-03', '2026-04-25T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-009-04', '2026-04-26T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-009-05', '2026-05-02T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-009-06', '2026-05-08T11:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-009-07', '2026-05-09T15:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-009-08', '2026-05-10T13:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Semua parameter dalam batas aman. Rekomendasikan persetujuan.', komiteVotes: [], komiteDecision: undefined, aiChatHistory: [],
  },
  {
    id: 'FOS-2026-010', nasabahName: 'Ibu Sari Dewi', nasabahType: 'individual', nik: '3276022109910010', phoneNumber: '0823-1010-2010', whatsappNumber: '0823-1010-2010', akadType: 'Mudharabah', requestedPlafond: 250000000, requestedTenorMonths: 24, purpose: 'Modal usaha kerajinan tangan', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset', stage: 4,
    assignments: assignments([[1, '2026-04-22T08:00:00+07:00'], [2, '2026-04-26T09:00:00+07:00'], [3, '2026-05-01T09:30:00+07:00'], [4, '2026-05-07T14:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(2), createdAt: new Date('2026-04-22T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 33, ltv: 48, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 21200000, existingMonthlyObligations: 1000000, collateralAppraisedValue: 521000000, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: 6000000 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-010', { nasabahType: 'individual', akadType: 'Mudharabah', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-010-01', '2026-04-22T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-010-02', '2026-04-26T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-010-03', '2026-04-27T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-010-04', '2026-04-28T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-010-05', '2026-05-01T09:30:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-010-06', '2026-05-07T14:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-010-07', '2026-05-07T16:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Reject', 4],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'reject', riskNote: 'Usaha baru < 1 tahun, arus kas belum stabil. Belum memenuhi threshold risk appetite bank. Rekomendasikan penolakan.', komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-011', nasabahName: 'Pak Andi Wijaya', nasabahType: 'individual', nik: '3174060810880011', phoneNumber: '0824-1111-2011', whatsappNumber: '0824-1111-2011', akadType: 'Murabahah', requestedPlafond: 220000000, requestedTenorMonths: 36, purpose: 'Pembelian kendaraan operasional', incomeSource: 'karyawan', isMarried: true, collateralType: 'vehicle', stage: 3,
    assignments: assignments([[1, '2026-04-30T08:00:00+07:00'], [2, '2026-05-04T09:00:00+07:00'], [3, '2026-05-12T08:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(1), createdAt: new Date('2026-04-30T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 34, ltv: 65, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 28000000, existingMonthlyObligations: 1000000, collateralAppraisedValue: 338000000, proposedMonthlyInstallment: 8500000, projectedMonthlyProfitShare: null }, marginRate: 13,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-011', { nasabahType: 'individual', akadType: 'Murabahah', incomeSource: 'karyawan', isMarried: true, collateralType: 'vehicle' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-011-01', '2026-04-30T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-011-02', '2026-05-04T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-011-03', '2026-05-05T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-011-04', '2026-05-07T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-011-05', '2026-05-12T08:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
    ]),
    analysis: analysisGeneric, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-012', nasabahName: 'Ibu Maya Lestari', nasabahType: 'individual', nik: '3273042502920012', phoneNumber: '0825-1212-2012', whatsappNumber: '0825-1212-2012', akadType: 'Musyarakah', requestedPlafond: 180000000, requestedTenorMonths: 24, purpose: 'Tambahan modal kerja usaha katering', incomeSource: 'wiraswasta', isMarried: false, collateralType: 'guarantor', stage: 2,
    assignments: assignments([[1, '2026-05-11T08:00:00+07:00'], [2, '2026-05-14T09:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(1), createdAt: new Date('2026-05-11T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: false, stage2LegalApproval: { verifiedByLG: true, notes: 'Surat pernyataan penjamin dan KTP penjamin telah diverifikasi sah' }, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-012', { nasabahType: 'individual', akadType: 'Musyarakah', incomeSource: 'wiraswasta', isMarried: false, collateralType: 'guarantor' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-012-01', '2026-05-11T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-012-02', '2026-05-14T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-012-03', '2026-05-15T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-012-04', '2026-05-16T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
    ]),
    analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-013', nasabahName: 'CV Amanah Jaya', nasabahType: 'business', nik: '3471020909860013', phoneNumber: '0826-1313-2013', whatsappNumber: '0826-1313-2013', namaUsaha: 'CV Amanah Jaya', akadType: 'Mudharabah', requestedPlafond: 700000000, requestedTenorMonths: 30, purpose: 'Pembiayaan bagi hasil proyek konstruksi', collateralType: 'none', stage: 2,
    assignments: assignments([[1, '2026-05-10T08:00:00+07:00'], [2, '2026-05-13T09:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(3), createdAt: new Date('2026-05-10T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: false, stage2LegalApproval: { verifiedByLG: false }, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-013', { nasabahType: 'business', akadType: 'Mudharabah', collateralType: 'none' }, { legalVerification: 'pass', verificationOverrides: { akta_pendirian: 'fail' }, slik: true }),
    history: history([
      ['h-013-01', '2026-05-10T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-013-02', '2026-05-13T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-013-03', '2026-05-14T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
    ]),
    analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  app014,
  {
    id: 'FOS-2026-015', nasabahName: 'PT Karya Mandiri', nasabahType: 'business', nik: '3172081104810015', phoneNumber: '0828-1515-2015', whatsappNumber: '0828-1515-2015', namaUsaha: 'PT Karya Mandiri', akadType: 'Murabahah', requestedPlafond: 1200000000, requestedTenorMonths: 48, purpose: 'Modal kerja pengadaan material', collateralType: 'fixed_asset', stage: 4,
    assignments: assignments([[1, '2026-04-26T08:00:00+07:00'], [2, '2026-04-30T09:00:00+07:00'], [3, '2026-05-05T09:00:00+07:00'], [4, '2026-05-15T10:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(1), createdAt: new Date('2026-04-26T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 35, ltv: 62, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 130000000, existingMonthlyObligations: 5000000, collateralAppraisedValue: 1935000000, proposedMonthlyInstallment: 40000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-015', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-015-01', '2026-04-26T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-015-02', '2026-04-30T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-015-03', '2026-05-01T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-015-04', '2026-05-02T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-015-05', '2026-05-05T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-015-06', '2026-05-15T10:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
    ]),
    analysis: analysisGeneric, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-016', nasabahName: 'PT Cahaya Mandiri', nasabahType: 'business', nik: '3174051203790016', phoneNumber: '0829-1616-2016', whatsappNumber: '0829-1616-2016', namaUsaha: 'PT Cahaya Mandiri', akadType: 'Murabahah', requestedPlafond: 750000000, requestedTenorMonths: 36, purpose: 'Modal kerja ekspansi gudang', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-04-15T08:00:00+07:00'], [2, '2026-04-19T09:00:00+07:00'], [3, '2026-04-24T09:00:00+07:00'], [4, '2026-04-29T09:00:00+07:00'], [5, '2026-05-04T10:00:00+07:00'], [6, '2026-05-09T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-05-09T10:00:00+07:00'), createdAt: new Date('2026-04-15T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 30, ltv: 55, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 110000000, existingMonthlyObligations: 3000000, collateralAppraisedValue: 1360000000, proposedMonthlyInstallment: 26000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-016', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-016-01', '2026-04-15T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-016-02', '2026-04-19T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-016-03', '2026-04-20T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-016-04', '2026-04-21T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-016-05', '2026-04-24T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-016-06', '2026-04-29T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-016-07', '2026-04-30T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-016-08', '2026-05-04T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-016-09', '2026-05-08T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Seluruh parameter dalam batas aman. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Arus kas stabil, layak disetujui.', timestamp: new Date('2026-05-06T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Struktur akad Murabahah sesuai prinsip syariah.', timestamp: new Date('2026-05-07T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Setuju, profil nasabah baik.', timestamp: new Date('2026-05-08T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan.', approvedPlafond: 750000000, approvedTenorMonths: 36, approvedMarginRate: 14, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  {
    id: 'FOS-2026-017', nasabahName: 'Ibu Lestari Wulandari', nasabahType: 'individual', nik: '3273046601850017', phoneNumber: '0831-1717-2017', whatsappNumber: '0831-1717-2017', akadType: 'Musyarakah', requestedPlafond: 350000000, requestedTenorMonths: 36, purpose: 'Penambahan modal usaha konveksi', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset', stage: 1,
    assignments: assignments([[1, '2026-04-18T08:00:00+07:00'], [2, '2026-04-22T09:00:00+07:00'], [3, '2026-04-28T09:00:00+07:00'], [4, '2026-05-02T09:00:00+07:00'], [5, '2026-05-07T10:00:00+07:00'], [1, '2026-05-11T15:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(2), createdAt: new Date('2026-04-18T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 36, ltv: 64, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 32000000, existingMonthlyObligations: 2000000, collateralAppraisedValue: 547000000, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: 11000000 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-017', { nasabahType: 'individual', akadType: 'Musyarakah', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-017-01', '2026-04-18T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-017-02', '2026-04-22T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-017-03', '2026-04-23T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-017-04', '2026-04-24T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-017-05', '2026-04-28T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-017-06', '2026-05-02T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-017-07', '2026-05-03T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Conditional', 4],
      ['h-017-08', '2026-05-07T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-017-09', '2026-05-11T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Bersyarat', 5],
      ['h-017-10', '2026-05-11T15:05:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan bersyarat — dikembalikan ke AO untuk tindak lanjut nasabah', 1],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'conditional', riskNote: 'Disetujui dengan syarat penyesuaian plafond dan kelengkapan dokumen arus kas.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'conditional', comment: 'Plafond perlu disesuaikan dengan kapasitas arus kas.', timestamp: new Date('2026-05-09T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Usaha layak, akad sesuai.', timestamp: new Date('2026-05-10T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'conditional', comment: 'Setuju bersyarat sesuai catatan komite.', timestamp: new Date('2026-05-11T14:00:00+07:00') },
    ],
    komiteDecision: 'conditional', komiteDecisionNote: 'Disetujui bersyarat: plafond diturunkan menjadi Rp 300 juta dan nasabah wajib melampirkan rekening koran 6 bulan terakhir sebelum pencairan.', approvedPlafond: 300000000, approvedTenorMonths: 36, approvedMarginRate: null, aiChatHistory: [],
  },
  {
    id: 'FOS-2026-018', nasabahName: 'CV Lima Saudara', nasabahType: 'business', nik: '3471051504800018', phoneNumber: '0832-1818-2018', whatsappNumber: '0832-1818-2018', namaUsaha: 'CV Lima Saudara', akadType: 'Mudharabah', requestedPlafond: 1100000000, requestedTenorMonths: 24, purpose: 'Modal kerja proyek bagi hasil', collateralType: 'fixed_asset', stage: 1,
    assignments: assignments([[1, '2026-04-20T08:00:00+07:00'], [2, '2026-04-24T09:00:00+07:00'], [3, '2026-04-30T09:00:00+07:00'], [4, '2026-05-05T09:00:00+07:00'], [5, '2026-05-10T10:00:00+07:00'], [1, '2026-05-14T15:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(0), createdAt: new Date('2026-04-20T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 39, ltv: 68, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 90000000, existingMonthlyObligations: 6000000, collateralAppraisedValue: 1620000000, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: 18000000 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-018', { nasabahType: 'business', akadType: 'Mudharabah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-018-01', '2026-04-20T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-018-02', '2026-04-24T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-018-03', '2026-04-25T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-018-04', '2026-04-26T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-018-05', '2026-04-30T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-018-06', '2026-05-05T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-018-07', '2026-05-06T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-018-08', '2026-05-10T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-018-09', '2026-05-14T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Tolak', 5],
      ['h-018-10', '2026-05-14T15:05:00+07:00', 'u-004', 'Dewi Kirana', 'Ditolak Komite — dikembalikan ke AO untuk komunikasi ke nasabah', 1],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Parameter risiko dalam batas, namun struktur bagi hasil perlu pencermatan komite.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'reject', comment: 'Proyeksi arus kas proyek terlalu optimistis.', timestamp: new Date('2026-05-12T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'reject', comment: 'Struktur nisbah bagi hasil belum memadai.', timestamp: new Date('2026-05-13T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'reject', comment: 'Sependapat, pengajuan ditolak.', timestamp: new Date('2026-05-14T14:00:00+07:00') },
    ],
    komiteDecision: 'reject', komiteDecisionNote: 'Ditolak: struktur bagi hasil belum memadai dan proyeksi arus kas proyek dinilai terlalu optimistis. Nasabah dapat mengajukan ulang dengan proyeksi yang lebih konservatif.', aiChatHistory: [],
  },
  {
    id: 'FOS-2026-019', nasabahName: 'PT Armada Sejati', nasabahType: 'business', nik: '3175052006770019', phoneNumber: '0833-1919-2019', whatsappNumber: '0833-1919-2019', namaUsaha: 'PT Armada Sejati', akadType: 'Ijarah', requestedPlafond: 2200000000, requestedTenorMonths: 60, purpose: 'Sewa beli alat berat', collateralType: 'fixed_asset', stage: 4,
    assignments: assignments([[1, '2026-04-28T08:00:00+07:00'], [2, '2026-05-02T09:00:00+07:00'], [3, '2026-05-07T09:00:00+07:00'], [4, '2026-05-16T10:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(6), createdAt: new Date('2026-04-28T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 45, ltv: 66, kol: 1 }, hardGateViolations: ['dsr'],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 120000000, existingMonthlyObligations: 9000000, collateralAppraisedValue: 3333000000, proposedMonthlyInstallment: 45000000, projectedMonthlyProfitShare: null }, marginRate: 15,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-019', { nasabahType: 'business', akadType: 'Ijarah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-019-01', '2026-04-28T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-019-02', '2026-05-02T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-019-03', '2026-05-03T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-019-04', '2026-05-04T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-019-05', '2026-05-07T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-019-06', '2026-05-16T10:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
    ]),
    analysis: analysisGeneric, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-020', nasabahName: 'CV Tiga Putra', nasabahType: 'business', nik: '3173052807880020', phoneNumber: '0834-2020-2020', whatsappNumber: '0834-2020-2020', namaUsaha: 'CV Tiga Putra', akadType: 'Murabahah', requestedPlafond: 450000000, requestedTenorMonths: 24, purpose: 'Pembelian peralatan produksi', collateralType: 'fixed_asset', stage: 1,
    assignments: assignments([[1, '2026-05-17T08:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(1), createdAt: new Date('2026-05-17T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [],
    kolEntered: false, financialsAssessed: false, stage2LegalApproval: null, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-020', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, {}),
    history: history([
      ['h-020-01', '2026-05-17T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
    ]),
    analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-021', nasabahName: 'PT Sentosa Abadi', nasabahType: 'business', nik: '3174053009810021', phoneNumber: '0835-2121-2021', whatsappNumber: '0835-2121-2021', namaUsaha: 'PT Sentosa Abadi', akadType: 'Murabahah', requestedPlafond: 680000000, requestedTenorMonths: 36, purpose: 'Modal kerja distribusi', collateralType: 'fixed_asset', stage: 5,
    assignments: assignments([[1, '2026-04-22T08:00:00+07:00'], [2, '2026-04-26T09:00:00+07:00'], [3, '2026-05-02T09:00:00+07:00'], [4, '2026-05-08T09:00:00+07:00'], [5, '2026-05-13T10:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(2), createdAt: new Date('2026-04-22T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 31, ltv: 57, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 95000000, existingMonthlyObligations: 3000000, collateralAppraisedValue: 1193000000, proposedMonthlyInstallment: 23000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-021', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-021-01', '2026-04-22T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-021-02', '2026-04-26T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-021-03', '2026-04-27T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-021-04', '2026-04-28T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-021-05', '2026-05-02T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-021-06', '2026-05-08T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-021-07', '2026-05-09T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-021-08', '2026-05-13T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Profil risiko dapat diterima. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Layak disetujui.', timestamp: new Date('2026-05-14T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Akad dan agunan memadai.', timestamp: new Date('2026-05-15T11:00:00+07:00') },
    ],
    komiteDecision: undefined, aiChatHistory: [],
  },
  {
    id: 'FOS-2026-022', nasabahName: 'CV Dwi Karya', nasabahType: 'business', nik: '3175050111820022', phoneNumber: '0836-2222-2022', whatsappNumber: '0836-2222-2022', namaUsaha: 'CV Dwi Karya', akadType: 'Murabahah', requestedPlafond: 1800000000, requestedTenorMonths: 48, purpose: 'Modal kerja pembelian bahan baku', collateralType: 'fixed_asset', stage: 3,
    assignments: assignments([[1, '2026-05-02T08:00:00+07:00'], [2, '2026-05-06T09:00:00+07:00'], [3, '2026-05-13T09:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(6), muapSyncedAt: daysAgo(2), createdAt: new Date('2026-05-02T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 44, ltv: 76, kol: 1 }, hardGateViolations: ['dsr', 'ltv'],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 150000000, existingMonthlyObligations: 6000000, collateralAppraisedValue: 2368000000, proposedMonthlyInstallment: 60000000, projectedMonthlyProfitShare: null }, marginRate: 15,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-022', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-022-01', '2026-05-02T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-022-02', '2026-05-06T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-022-03', '2026-05-07T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-022-04', '2026-05-08T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-022-05', '2026-05-13T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
    ]),
    analysis: analysisGeneric, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  {
    id: 'FOS-2026-023', nasabahName: 'Bapak Surya Atmaja', nasabahType: 'individual', nik: '3273051207840023', phoneNumber: '0837-2323-2023', whatsappNumber: '0837-2323-2023', akadType: 'Ijarah', requestedPlafond: 280000000, requestedTenorMonths: 36, purpose: 'Sewa beli kendaraan usaha', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset', stage: 2,
    assignments: assignments([[1, '2026-05-12T08:00:00+07:00'], [2, '2026-05-15T09:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(4), createdAt: new Date('2026-05-12T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [],
    kolEntered: false, financialsAssessed: false, stage2LegalApproval: { verifiedByLG: true, notes: 'Dokumen identitas dan agunan telah diverifikasi sah.' }, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-023', { nasabahType: 'individual', akadType: 'Ijarah', incomeSource: 'wiraswasta', isMarried: true, collateralType: 'fixed_asset' }, { legalVerification: 'pass' }),
    history: history([
      ['h-023-01', '2026-05-12T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-023-02', '2026-05-15T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-023-03', '2026-05-16T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
    ]),
    analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  // Stage 2, status 'todo' — freshly handed from RM intake to Legal, Agunan & Biro;
  // nothing started yet (LG sign-off pending, Kol not input, SLIK not uploaded, docs
  // not legally verified). Fills the only empty (stage, PersonalStatus) cell at
  // Stage 2; complements 003 (in_progress, already has SLIK).
  {
    id: 'FOS-2026-024', nasabahName: 'Pak Eko Prasetyo', nasabahType: 'individual', nik: '3273051806800024', phoneNumber: '0838-2424-2024', whatsappNumber: '0838-2424-2024', akadType: 'Murabahah', requestedPlafond: 320000000, requestedTenorMonths: 36, purpose: 'Pembelian kendaraan operasional usaha', incomeSource: 'karyawan', isMarried: true, collateralType: 'vehicle', stage: 2,
    assignments: assignments([[1, '2026-05-17T08:00:00+07:00'], [2, '2026-05-20T09:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(2), createdAt: new Date('2026-05-17T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 0, ltv: 0, kol: 1 }, hardGateViolations: [],
    kolEntered: false, financialsAssessed: false, stage2LegalApproval: { verifiedByLG: false }, financialInputs: { netMonthlyIncome: 0, existingMonthlyObligations: 0, collateralAppraisedValue: 0, proposedMonthlyInstallment: 0, projectedMonthlyProfitShare: 0 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-024', { nasabahType: 'individual', akadType: 'Murabahah', incomeSource: 'karyawan', isMarried: true, collateralType: 'vehicle' }, {}),
    history: history([
      ['h-024-01', '2026-05-17T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-024-02', '2026-05-20T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
    ]), analysis: emptyAnalysis, riskRecommendation: null, komiteVotes: [], aiChatHistory: [],
  },
  // Stage 5, freshly handed to the committee — not yet scheduled to a meeting and
  // no MoM signatures yet (ADR-0005, no in-app voting). Risk rec Approve, decision pending.
  {
    id: 'FOS-2026-025', nasabahName: 'PT Bumi Sentosa', nasabahType: 'business', nik: '3174052105820025', phoneNumber: '0839-2525-2025', whatsappNumber: '0839-2525-2025', namaUsaha: 'PT Bumi Sentosa', akadType: 'Murabahah', requestedPlafond: 850000000, requestedTenorMonths: 36, purpose: 'Modal kerja pengadaan persediaan', collateralType: 'fixed_asset', stage: 5,
    assignments: assignments([[1, '2026-04-24T08:00:00+07:00'], [2, '2026-04-28T09:00:00+07:00'], [3, '2026-05-03T09:00:00+07:00'], [4, '2026-05-09T09:00:00+07:00'], [5, '2026-05-19T10:00:00+07:00']], 'todo'), enteredStageAt: daysAgo(0), createdAt: new Date('2026-04-24T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 28, ltv: 53, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 120000000, existingMonthlyObligations: 4000000, collateralAppraisedValue: 1600000000, proposedMonthlyInstallment: 29000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-025', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-025-01', '2026-04-24T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-025-02', '2026-04-28T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-025-03', '2026-04-29T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-025-04', '2026-04-30T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-025-05', '2026-05-03T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-025-06', '2026-05-09T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-025-07', '2026-05-10T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-025-08', '2026-05-19T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Seluruh parameter dalam batas aman. Rekomendasikan persetujuan.',
    komiteVotes: [], komiteDecision: undefined, aiChatHistory: [],
  },
  // Stage 5, scheduled to a committee meeting (MTG-2026-002) — awaiting the attending
  // Komite to record the outcome + QR-sign the MoM (ADR-0005, no in-app voting). The
  // conditional risk-rec exercises the conditional MUAP card.
  {
    id: 'FOS-2026-026', nasabahName: 'CV Harapan Jaya', nasabahType: 'business', nik: '3471052807830026', phoneNumber: '0841-2626-2026', whatsappNumber: '0841-2626-2026', namaUsaha: 'CV Harapan Jaya', akadType: 'Mudharabah', requestedPlafond: 950000000, requestedTenorMonths: 30, purpose: 'Pembiayaan bagi hasil ekspansi usaha', collateralType: 'fixed_asset', stage: 5,
    assignments: assignments([[1, '2026-04-26T08:00:00+07:00'], [2, '2026-04-30T09:00:00+07:00'], [3, '2026-05-05T09:00:00+07:00'], [4, '2026-05-11T09:00:00+07:00'], [5, '2026-05-17T10:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(3), createdAt: new Date('2026-04-26T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 37, ltv: 66, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 90000000, existingMonthlyObligations: 4000000, collateralAppraisedValue: 1440000000, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: 29000000 }, marginRate: null,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-026', { nasabahType: 'business', akadType: 'Mudharabah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-026-01', '2026-04-26T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-026-02', '2026-04-30T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-026-03', '2026-05-01T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-026-04', '2026-05-02T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-026-05', '2026-05-05T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-026-06', '2026-05-11T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-026-07', '2026-05-12T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Conditional', 4],
      ['h-026-08', '2026-05-17T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'conditional', riskNote: 'Disetujui dengan syarat: struktur nisbah bagi hasil dan proyeksi arus kas perlu pencermatan komite.',
    komiteVotes: [],
    komiteDecision: undefined, aiChatHistory: [],
  },
  // Disbursed & performing (Kol 1 → Active). A second clean approval beyond 016
  // so the Portofolio table and post-decision Pencairan surface have volume.
  {
    id: 'FOS-2026-027', nasabahName: 'PT Anugerah Niaga', nasabahType: 'business', nik: '3174051508800027', phoneNumber: '0842-2727-2027', whatsappNumber: '0842-2727-2027', namaUsaha: 'PT Anugerah Niaga', akadType: 'Murabahah', requestedPlafond: 640000000, requestedTenorMonths: 36, purpose: 'Modal kerja pengadaan barang dagangan', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-04-10T08:00:00+07:00'], [2, '2026-04-14T09:00:00+07:00'], [3, '2026-04-18T09:00:00+07:00'], [4, '2026-04-23T09:00:00+07:00'], [5, '2026-04-28T10:00:00+07:00'], [6, '2026-05-03T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-05-03T10:00:00+07:00'), createdAt: new Date('2026-04-10T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 27, ltv: 51, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 98000000, existingMonthlyObligations: 2000000, collateralAppraisedValue: 1255000000, proposedMonthlyInstallment: 24000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-027', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-027-01', '2026-04-10T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-027-02', '2026-04-14T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-027-03', '2026-04-15T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-027-04', '2026-04-16T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-027-05', '2026-04-18T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-027-06', '2026-04-23T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-027-07', '2026-04-24T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-027-08', '2026-04-28T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-027-09', '2026-05-02T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Seluruh parameter dalam batas aman. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Arus kas sehat, layak disetujui.', timestamp: new Date('2026-04-30T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Akad dan agunan memadai.', timestamp: new Date('2026-05-01T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Setuju sesuai pengajuan.', timestamp: new Date('2026-05-02T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan.', approvedPlafond: 640000000, approvedTenorMonths: 36, approvedMarginRate: 14, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  // Disbursed loan that has slipped to Kol 2 (DPK → Watch list). Approved clean
  // at origination; collectibility degraded post-pencairan. Exercises the
  // Portofolio "Watch / DPK" status row.
  {
    id: 'FOS-2026-028', nasabahName: 'CV Rukun Sentosa', nasabahType: 'business', nik: '3471051209790028', phoneNumber: '0843-2828-2028', whatsappNumber: '0843-2828-2028', namaUsaha: 'CV Rukun Sentosa', akadType: 'Ijarah', requestedPlafond: 880000000, requestedTenorMonths: 48, purpose: 'Sewa beli mesin produksi', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-03-20T08:00:00+07:00'], [2, '2026-03-24T09:00:00+07:00'], [3, '2026-03-28T09:00:00+07:00'], [4, '2026-04-02T09:00:00+07:00'], [5, '2026-04-07T10:00:00+07:00'], [6, '2026-04-12T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-04-12T10:00:00+07:00'), createdAt: new Date('2026-03-20T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 34, ltv: 60, kol: 2 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 105000000, existingMonthlyObligations: 4000000, collateralAppraisedValue: 1467000000, proposedMonthlyInstallment: 31000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-028', { nasabahType: 'business', akadType: 'Ijarah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-028-01', '2026-03-20T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-028-02', '2026-03-24T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-028-03', '2026-03-25T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-028-04', '2026-03-26T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-028-05', '2026-03-28T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-028-06', '2026-04-02T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-028-07', '2026-04-03T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-028-08', '2026-04-07T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-028-09', '2026-04-11T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Parameter risiko dalam batas. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Layak, agunan memadai.', timestamp: new Date('2026-04-09T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Akad Ijarah sesuai objek pembiayaan.', timestamp: new Date('2026-04-10T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Disetujui.', timestamp: new Date('2026-04-11T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan.', approvedPlafond: 880000000, approvedTenorMonths: 48, approvedMarginRate: 14, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  // Disbursed loan now in default (Kol 3 → Macet, NPL). Approved conditionally
  // at origination; drives a non-zero NPL ratio and the "Default / Macet" row
  // on the Portofolio dashboard.
  {
    id: 'FOS-2026-029', nasabahName: 'CV Bina Usaha', nasabahType: 'business', nik: '3275050703780029', phoneNumber: '0844-2929-2029', whatsappNumber: '0844-2929-2029', namaUsaha: 'CV Bina Usaha', akadType: 'Murabahah', requestedPlafond: 520000000, requestedTenorMonths: 36, purpose: 'Modal kerja ekspansi gerai', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-02-25T08:00:00+07:00'], [2, '2026-03-01T09:00:00+07:00'], [3, '2026-03-05T09:00:00+07:00'], [4, '2026-03-10T09:00:00+07:00'], [5, '2026-03-15T10:00:00+07:00'], [6, '2026-03-20T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-03-20T10:00:00+07:00'), createdAt: new Date('2026-02-25T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 38, ltv: 64, kol: 3 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 72000000, existingMonthlyObligations: 3000000, collateralAppraisedValue: 813000000, proposedMonthlyInstallment: 18000000, projectedMonthlyProfitShare: null }, marginRate: 15,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-029', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-029-01', '2026-02-25T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-029-02', '2026-03-01T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-029-03', '2026-03-02T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-029-04', '2026-03-03T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-029-05', '2026-03-05T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-029-06', '2026-03-10T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-029-07', '2026-03-11T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-029-08', '2026-03-15T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-029-09', '2026-03-19T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
      ['h-029-10', '2026-03-20T10:00:00+07:00', 'u-004', 'Dewi Kirana', 'Disetujui Komite — masuk tahap Pencairan', 6],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Parameter risiko dalam batas pada saat origination. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Layak disetujui dengan monitoring arus kas.', timestamp: new Date('2026-03-17T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Akad dan agunan memadai.', timestamp: new Date('2026-03-18T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Disetujui sesuai pengajuan.', timestamp: new Date('2026-03-19T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan; monitoring arus kas berkala.', approvedPlafond: 520000000, approvedTenorMonths: 36, approvedMarginRate: 15, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  {
    id: 'FOS-2026-030', nasabahName: 'PT Surya Pratama', nasabahType: 'business', nik: '3174051101860030', phoneNumber: '0845-3030-2030', whatsappNumber: '0845-3030-2030', namaUsaha: 'PT Surya Pratama', akadType: 'Murabahah', requestedPlafond: 1200000000, requestedTenorMonths: 36, purpose: 'Modal kerja pengadaan persediaan proyek', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2025-12-16T08:00:00+07:00'], [2, '2025-12-20T09:00:00+07:00'], [3, '2025-12-24T09:00:00+07:00'], [4, '2025-12-30T09:00:00+07:00'], [5, '2026-01-06T10:00:00+07:00'], [6, '2026-01-12T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-01-12T10:00:00+07:00'), createdAt: new Date('2025-12-16T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 28, ltv: 54, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 155000000, existingMonthlyObligations: 5000000, collateralAppraisedValue: 2220000000, proposedMonthlyInstallment: 43000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-030', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-030-01', '2025-12-16T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-030-02', '2025-12-20T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-030-03', '2025-12-21T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-030-04', '2025-12-22T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-030-05', '2025-12-24T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-030-06', '2025-12-30T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-030-07', '2025-12-31T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-030-08', '2026-01-06T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-030-09', '2026-01-11T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
      ['h-030-10', '2026-01-12T10:00:00+07:00', 'u-004', 'Dewi Kirana', 'Disetujui Komite — masuk tahap Pencairan', 6],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Seluruh parameter dalam batas aman. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Arus kas sehat dan agunan memadai.', timestamp: new Date('2026-01-08T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Akad Murabahah sesuai kebutuhan modal kerja.', timestamp: new Date('2026-01-09T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Setuju sesuai pengajuan.', timestamp: new Date('2026-01-11T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan.', approvedPlafond: 1200000000, approvedTenorMonths: 36, approvedMarginRate: 14, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  {
    id: 'FOS-2026-031', nasabahName: 'CV Mitra Sejahtera', nasabahType: 'business', nik: '3471052205840031', phoneNumber: '0846-3131-2031', whatsappNumber: '0846-3131-2031', namaUsaha: 'CV Mitra Sejahtera', akadType: 'Musyarakah', requestedPlafond: 950000000, requestedTenorMonths: 48, purpose: 'Pembiayaan kemitraan pengembangan lini distribusi', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-01-13T08:00:00+07:00'], [2, '2026-01-17T09:00:00+07:00'], [3, '2026-01-21T09:00:00+07:00'], [4, '2026-01-27T09:00:00+07:00'], [5, '2026-02-03T10:00:00+07:00'], [6, '2026-02-09T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-02-09T10:00:00+07:00'), createdAt: new Date('2026-01-13T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 31, ltv: 58, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 125000000, existingMonthlyObligations: 3500000, collateralAppraisedValue: 1640000000, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: 28000000 }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-031', { nasabahType: 'business', akadType: 'Musyarakah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-031-01', '2026-01-13T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-031-02', '2026-01-17T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-031-03', '2026-01-18T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-031-04', '2026-01-19T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-031-05', '2026-01-21T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-031-06', '2026-01-27T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-031-07', '2026-01-28T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-031-08', '2026-02-03T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-031-09', '2026-02-08T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
      ['h-031-10', '2026-02-09T10:00:00+07:00', 'u-004', 'Dewi Kirana', 'Disetujui Komite — masuk tahap Pencairan', 6],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Profil usaha dan proyeksi bagi hasil dalam batas aman. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Proyeksi bagi hasil realistis dan terukur.', timestamp: new Date('2026-02-05T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Struktur Musyarakah sesuai kebutuhan kemitraan.', timestamp: new Date('2026-02-06T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Disetujui sesuai pengajuan.', timestamp: new Date('2026-02-08T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan.', approvedPlafond: 950000000, approvedTenorMonths: 48, approvedMarginRate: 14, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  {
    id: 'FOS-2026-032', nasabahName: 'PT Karya Abadi', nasabahType: 'business', nik: '3174050909820032', phoneNumber: '0847-3232-2032', whatsappNumber: '0847-3232-2032', namaUsaha: 'PT Karya Abadi', akadType: 'Ijarah', requestedPlafond: 1100000000, requestedTenorMonths: 48, purpose: 'Sewa guna mesin produksi tambahan', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-02-03T08:00:00+07:00'], [2, '2026-02-07T09:00:00+07:00'], [3, '2026-02-11T09:00:00+07:00'], [4, '2026-02-17T09:00:00+07:00'], [5, '2026-02-24T10:00:00+07:00'], [6, '2026-03-02T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-03-02T10:00:00+07:00'), createdAt: new Date('2026-02-03T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 30, ltv: 52, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 142000000, existingMonthlyObligations: 4500000, collateralAppraisedValue: 2115000000, proposedMonthlyInstallment: 32000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-032', { nasabahType: 'business', akadType: 'Ijarah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-032-01', '2026-02-03T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-032-02', '2026-02-07T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-032-03', '2026-02-08T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-032-04', '2026-02-09T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-032-05', '2026-02-11T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-032-06', '2026-02-17T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-032-07', '2026-02-18T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-032-08', '2026-02-24T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-032-09', '2026-03-01T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
      ['h-032-10', '2026-03-02T10:00:00+07:00', 'u-004', 'Dewi Kirana', 'Disetujui Komite — masuk tahap Pencairan', 6],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Seluruh parameter dalam batas aman. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Objek sewa produktif dan agunan kuat.', timestamp: new Date('2026-02-26T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Akad Ijarah sesuai objek pembiayaan.', timestamp: new Date('2026-02-27T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Disetujui sesuai pengajuan.', timestamp: new Date('2026-03-01T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan.', approvedPlafond: 1100000000, approvedTenorMonths: 48, approvedMarginRate: 14, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  {
    id: 'FOS-2026-033', nasabahName: 'CV Sumber Rejeki', nasabahType: 'business', nik: '3471051706810033', phoneNumber: '0848-3333-2033', whatsappNumber: '0848-3333-2033', namaUsaha: 'CV Sumber Rejeki', akadType: 'Murabahah', requestedPlafond: 880000000, requestedTenorMonths: 36, purpose: 'Modal kerja pengadaan stok musiman', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-03-06T08:00:00+07:00'], [2, '2026-03-10T09:00:00+07:00'], [3, '2026-03-14T09:00:00+07:00'], [4, '2026-03-20T09:00:00+07:00'], [5, '2026-03-27T10:00:00+07:00'], [6, '2026-04-02T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-04-02T10:00:00+07:00'), createdAt: new Date('2026-03-06T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 36, ltv: 66, kol: 2 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 112000000, existingMonthlyObligations: 4500000, collateralAppraisedValue: 1334000000, proposedMonthlyInstallment: 31000000, projectedMonthlyProfitShare: null }, marginRate: 15,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-033', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-033-01', '2026-03-06T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-033-02', '2026-03-10T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-033-03', '2026-03-11T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-033-04', '2026-03-12T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-033-05', '2026-03-14T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-033-06', '2026-03-20T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-033-07', '2026-03-21T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-033-08', '2026-03-27T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-033-09', '2026-04-01T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
      ['h-033-10', '2026-04-02T10:00:00+07:00', 'u-004', 'Dewi Kirana', 'Disetujui Komite — masuk tahap Pencairan', 6],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Parameter risiko masih dalam batas, dengan catatan pemantauan arus kas bulanan karena pola penjualan musiman.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Layak disetujui dengan monitoring arus kas.', timestamp: new Date('2026-03-29T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Agunan memadai dan akad sesuai kebutuhan.', timestamp: new Date('2026-03-30T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Disetujui dengan pemantauan arus kas berkala.', timestamp: new Date('2026-04-01T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan; lakukan monitoring arus kas bulanan selama periode penjualan musiman.', approvedPlafond: 880000000, approvedTenorMonths: 36, approvedMarginRate: 15, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  {
    id: 'FOS-2026-034', nasabahName: 'PT Global Persada', nasabahType: 'business', nik: '3174052507800034', phoneNumber: '0849-3434-2034', whatsappNumber: '0849-3434-2034', namaUsaha: 'PT Global Persada', akadType: 'Mudharabah', requestedPlafond: 1050000000, requestedTenorMonths: 36, purpose: 'Pembiayaan bagi hasil ekspansi operasional', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-04-01T08:00:00+07:00'], [2, '2026-04-05T09:00:00+07:00'], [3, '2026-04-09T09:00:00+07:00'], [4, '2026-04-15T09:00:00+07:00'], [5, '2026-04-22T10:00:00+07:00'], [6, '2026-05-08T10:00:00+07:00']], 'submitted'), enteredStageAt: new Date('2026-05-08T10:00:00+07:00'), createdAt: new Date('2026-04-01T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 29, ltv: 50, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 138000000, existingMonthlyObligations: 4000000, collateralAppraisedValue: 2100000000, proposedMonthlyInstallment: null, projectedMonthlyProfitShare: 31000000 }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-034', { nasabahType: 'business', akadType: 'Mudharabah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-034-01', '2026-04-01T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-034-02', '2026-04-05T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-034-03', '2026-04-06T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-034-04', '2026-04-07T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-034-05', '2026-04-09T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-034-06', '2026-04-15T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-034-07', '2026-04-16T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-034-08', '2026-04-22T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-034-09', '2026-05-07T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
      ['h-034-10', '2026-05-08T10:00:00+07:00', 'u-004', 'Dewi Kirana', 'Disetujui Komite — masuk tahap Pencairan', 6],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Profil usaha dan proyeksi bagi hasil dalam batas aman. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Arus kas memadai untuk skema bagi hasil.', timestamp: new Date('2026-04-24T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Struktur Mudharabah sesuai kebutuhan ekspansi.', timestamp: new Date('2026-04-25T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Disetujui sesuai pengajuan.', timestamp: new Date('2026-05-07T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan.', approvedPlafond: 1050000000, approvedTenorMonths: 36, approvedMarginRate: 14, disbursementStatus: 'Cair', aiChatHistory: [],
  },
  // ── State-coverage seeds (FOS-035..037): mid-disbursement, ready-to-release with
  //    frozen audit docs, and a stage-4 app awaiting the Risk Team recommendation. ──
  {
    id: 'FOS-2026-035', nasabahName: 'PT Bahari Nusantara', nasabahType: 'business', nik: '3174050811830035', phoneNumber: '0851-3535-2035', whatsappNumber: '0851-3535-2035', namaUsaha: 'PT Bahari Nusantara', akadType: 'Murabahah', requestedPlafond: 1200000000, requestedTenorMonths: 48, purpose: 'Modal kerja pengadaan armada distribusi', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-04-20T08:00:00+07:00'], [2, '2026-04-24T09:00:00+07:00'], [3, '2026-04-28T09:00:00+07:00'], [4, '2026-05-04T09:00:00+07:00'], [5, '2026-05-11T10:00:00+07:00'], [6, '2026-05-18T10:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(3), createdAt: new Date('2026-04-20T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 33, ltv: 60, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 150000000, existingMonthlyObligations: 5000000, collateralAppraisedValue: 2000000000, proposedMonthlyInstallment: 30000000, projectedMonthlyProfitShare: null }, marginRate: 15,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-035', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-035-01', '2026-04-20T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-035-02', '2026-04-24T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-035-03', '2026-04-25T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-035-04', '2026-04-26T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-035-05', '2026-04-28T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-035-06', '2026-05-04T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-035-07', '2026-05-05T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-035-08', '2026-05-11T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-035-09', '2026-05-17T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
      ['h-035-10', '2026-05-18T10:00:00+07:00', 'u-004', 'Dewi Kirana', 'Disetujui Komite — masuk tahap Pencairan', 6],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Parameter risiko dalam batas aman; plafond disarankan menyesuaikan kapasitas arus kas.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Setuju dengan penyesuaian plafond dan tenor.', timestamp: new Date('2026-05-14T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Akad sesuai; nominal disesuaikan kebutuhan riil.', timestamp: new Date('2026-05-15T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Disetujui dengan penyesuaian nilai fasilitas.', timestamp: new Date('2026-05-17T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui dengan penyesuaian: plafond Rp 1 miliar, tenor 36 bulan, margin 14%.', approvedPlafond: 1000000000, approvedTenorMonths: 36, approvedMarginRate: 14,
    decisionCheckpoint: { id: 'cp-035', contentHash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2', decidedAt: '2026-05-17T15:00:00+07:00', riskPolicyVersion: 1, riskDsrMaxPct: 40, riskLtvMaxPct: 70, riskKolMax: 1 },
    disbursementStatus: 'Proses Akad', disbursementConditions: { 'Plafond disesuaikan dengan keputusan komite': true }, aiChatHistory: [],
  },
  {
    id: 'FOS-2026-036', nasabahName: 'CV Tirta Makmur', nasabahType: 'business', nik: '3174051209840036', phoneNumber: '0852-3636-2036', whatsappNumber: '0852-3636-2036', namaUsaha: 'CV Tirta Makmur', akadType: 'Murabahah', requestedPlafond: 700000000, requestedTenorMonths: 36, purpose: 'Modal kerja pengadaan bahan baku', collateralType: 'fixed_asset', stage: 6,
    assignments: assignments([[1, '2026-04-22T08:00:00+07:00'], [2, '2026-04-26T09:00:00+07:00'], [3, '2026-04-30T09:00:00+07:00'], [4, '2026-05-06T09:00:00+07:00'], [5, '2026-05-13T10:00:00+07:00'], [6, '2026-05-20T10:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(1), createdAt: new Date('2026-04-22T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 30, ltv: 55, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 98000000, existingMonthlyObligations: 3000000, collateralAppraisedValue: 1272000000, proposedMonthlyInstallment: 21000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-036', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-036-01', '2026-04-22T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-036-02', '2026-04-26T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-036-03', '2026-04-27T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-036-04', '2026-04-28T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-036-05', '2026-04-30T09:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-036-06', '2026-05-06T09:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
      ['h-036-07', '2026-05-07T11:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Risk recommendation: Approve', 4],
      ['h-036-08', '2026-05-13T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Komite', 5],
      ['h-036-09', '2026-05-19T15:00:00+07:00', 'u-004', 'Dewi Kirana', 'Keputusan Komite: Setuju', 5],
      ['h-036-10', '2026-05-20T10:00:00+07:00', 'u-004', 'Dewi Kirana', 'Disetujui Komite — masuk tahap Pencairan', 6],
    ]),
    analysis: analysisGeneric, riskRecommendation: 'approve', riskNote: 'Seluruh parameter dalam batas aman. Rekomendasikan persetujuan.',
    komiteVotes: [
      { userId: 'u-007', userName: 'Rizky Hadiman', vote: 'approve', comment: 'Arus kas stabil dan agunan memadai.', timestamp: new Date('2026-05-16T10:00:00+07:00') },
      { userId: 'u-008', userName: 'Nur Fatimah', vote: 'approve', comment: 'Akad Murabahah sesuai kebutuhan modal kerja.', timestamp: new Date('2026-05-17T11:00:00+07:00') },
      { userId: 'u-004', userName: 'Dewi Kirana', vote: 'approve', comment: 'Disetujui sesuai pengajuan.', timestamp: new Date('2026-05-19T14:00:00+07:00') },
    ],
    komiteDecision: 'approve', komiteDecisionNote: 'Disetujui sesuai pengajuan.', approvedPlafond: 700000000, approvedTenorMonths: 36, approvedMarginRate: 14,
    decisionCheckpoint: { id: 'cp-036', contentHash: 'f0e1d2c3b4a5968778695a4b3c2d1e0fa1b2c3d4e5f60718293a4b5c6d7e8f90', decidedAt: '2026-05-19T15:00:00+07:00', riskPolicyVersion: 1, riskDsrMaxPct: 40, riskLtvMaxPct: 70, riskKolMax: 1 },
    disbursementStatus: 'Siap Cair', disbursementConditions: { 'Plafond disesuaikan dengan keputusan komite': true, 'Rekening koran 6 bulan diterima': true, 'Akad final disiapkan': true, 'Dokumen jaminan original diverifikasi': true }, aiChatHistory: [],
  },
  {
    id: 'FOS-2026-037', nasabahName: 'PT Cipta Mandiri', nasabahType: 'business', nik: '3174051503850037', phoneNumber: '0853-3737-2037', whatsappNumber: '0853-3737-2037', namaUsaha: 'PT Cipta Mandiri', akadType: 'Murabahah', requestedPlafond: 850000000, requestedTenorMonths: 36, purpose: 'Modal kerja pengembangan kapasitas produksi', collateralType: 'fixed_asset', stage: 4,
    assignments: assignments([[1, '2026-05-02T08:00:00+07:00'], [2, '2026-05-06T09:00:00+07:00'], [3, '2026-05-11T10:00:00+07:00'], [4, '2026-05-16T14:00:00+07:00']], 'in_progress'), enteredStageAt: daysAgo(2), createdAt: new Date('2026-05-02T08:00:00+07:00'), createdBy: 'u-001',
    hardGates: { dsr: 34, ltv: 62, kol: 1 }, hardGateViolations: [],
    kolEntered: true, financialsAssessed: true, stage2LegalApproval: { verifiedByLG: true }, financialInputs: { netMonthlyIncome: 120000000, existingMonthlyObligations: 4000000, collateralAppraisedValue: 1370000000, proposedMonthlyInstallment: 26000000, projectedMonthlyProfitShare: null }, marginRate: 14,
    extractionSources: { nik: 'ocr_confirmed', 'hardGates.kol': 'ocr_confirmed' },
    documents: seedDocs('FOS-2026-037', { nasabahType: 'business', akadType: 'Murabahah', collateralType: 'fixed_asset' }, { legalVerification: 'pass', slik: true }),
    history: history([
      ['h-037-01', '2026-05-02T08:00:00+07:00', 'u-001', 'Siti Rahma', 'Aplikasi pembiayaan dibuat', 1],
      ['h-037-02', '2026-05-06T09:00:00+07:00', 'u-001', 'Siti Rahma', 'Kirim ke Legal, Agunan & Biro', 2],
      ['h-037-03', '2026-05-07T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kolektibilitas diinput: Kol 1', 2],
      ['h-037-04', '2026-05-08T14:00:00+07:00', 'u-006', 'Laila Ahmadi', 'Legal review selesai oleh LG', 2],
      ['h-037-05', '2026-05-11T10:00:00+07:00', 'u-003', 'Ahmad Fauzi', 'Kirim ke Feasibility', 3],
      ['h-037-06', '2026-05-16T14:00:00+07:00', 'u-002', 'Budi Santoso', 'Kirim ke Risk Review', 4],
    ]),
    analysis: analysisGeneric, riskRecommendation: null, riskNote: '', komiteVotes: [], aiChatHistory: [],
  },
]

// Populate aiChatHistory across apps that have reached the analysis stages, so
// the AI Chat tab renders realistic per-app threads. 005/006 keep their richer
// hand-written threads; 014 (fresh AI draft) and all Stage 1–2 apps stay empty
// on purpose to preserve the empty-state rendering.
const SEED_CHAT_IDS = new Set<string>([
  'FOS-2026-011', 'FOS-2026-022',
  'FOS-2026-007', 'FOS-2026-008', 'FOS-2026-010', 'FOS-2026-015', 'FOS-2026-019',
  'FOS-2026-009', 'FOS-2026-016', 'FOS-2026-017', 'FOS-2026-018', 'FOS-2026-021',
  'FOS-2026-025', 'FOS-2026-026', 'FOS-2026-027', 'FOS-2026-028', 'FOS-2026-029',
  'FOS-2026-030', 'FOS-2026-031', 'FOS-2026-032', 'FOS-2026-033', 'FOS-2026-034',
  'FOS-2026-035', 'FOS-2026-036', 'FOS-2026-037',
])
APPLICATIONS.forEach((app) => {
  if (SEED_CHAT_IDS.has(app.id)) app.aiChatHistory = seedChat(app)
})

// ─────────────────────────────────────────────────────────────────────────────
// Current-flow artifacts (2026.06.04 workflow redesign). The base literals above
// describe each app's stage + committee outcome; this pass derives — coherently
// from how far the app has reached — the Stage-1 AML attestation, the Stage-2 dual
// SLIK handoff, the maker-checker ladder ledger (MUAP RM→TL, RSK RA→RTL),
// the Stage-4 risk recommendation, and the committee MoM signatures (chain='mom').
// Keeps the seed in lockstep with the e2e flow without hand-editing 37 literals
// (mirrors the seedChat post-pass above).
// ─────────────────────────────────────────────────────────────────────────────

type LadderActor = { id: string; name: string }
// Document authors are the existing pipeline actors; the checker rungs are the dedicated
// demo-login ladder personas (data/demo-logins.ts → seed-dummy creates them by id).
const MUAP_AUTHOR: LadderActor = { id: 'u-002', name: 'Budi Santoso' }
const MUAP_TL: LadderActor = { id: 'u-demo-tl', name: 'Teguh Laksana' }
const RSK_AUTHOR: LadderActor = { id: 'u-003', name: 'Ahmad Fauzi' }
const RSK_RTL: LadderActor = { id: 'u-demo-rtl', name: 'Rini Tania Lestari' }
// Attending Komite who QR-sign each decided app's MoM (mirrors meetings.ts attendees).
const MOM_SIGNERS: LadderActor[] = [
  { id: 'u-004', name: 'Dewi Kirana' },
  { id: 'u-007', name: 'Rizky Hadiman' },
  { id: 'u-008', name: 'Nur Fatimah' },
]

const LADDER_HOUR_MS = 3_600_000

// With single-checker chains (MUAP: TL only, RSK: RTL only — 2026.06.12 shortening) an
// in-flight ladder has exactly one pending shape: stage-3 awaits TL, stage-4 awaits RTL —
// so both checker personas have live approvals queued. Only the no-ladder RSK exceptions
// remain mapped; every other stage-4 app defaults to awaiting the RTL.
const RSK_PENDING_RUNG: Record<string, 'none' | 'rtl'> = {
  'FOS-2026-010': 'none', // RA recommended Reject → returns to RM, no checker ladder
  'FOS-2026-037': 'none', // RA still drafting the RSK (no recommendation yet)
}

function ladderStep(
  chain: ApprovalStepRecord['chain'],
  role: ApprovalStepRecord['role'],
  action: ApprovalStepRecord['action'],
  who: LadderActor,
  createdAt: Date,
  qrToken: string | null,
): ApprovalStepRecord {
  return { chain, role, action, userId: who.id, userName: who.name, reason: null, qrToken, createdAt }
}

APPLICATIONS.forEach((app) => {
  const decided = app.komiteDecision != null
  // How far the app has reached, regardless of its current stage (committee-rejected /
  // conditional apps route back to Stage 1 but have fully completed the ladders).
  const reachedCommittee = app.stage >= 5 || decided || app.disbursementStatus != null
  const rskComplete = reachedCommittee // passing Risk Review (4→5) freezes the RSK
  const muapComplete = app.stage >= 4 || rskComplete // passing Feasibility (3→4) freezes the MUAP
  const stage2Done = app.stage >= 3 || muapComplete
  const intakeDone = app.stage >= 2 || stage2Done

  const at = (s: number): Date => app.assignments.find((a) => a.stage === s)?.assignedAt ?? app.enteredStageAt

  // Stage-1 AML attestation (gates 1→2) — present on every app past intake.
  if (intakeDone && !app.amlAttestation) {
    app.amlAttestation = {
      attestedBy: app.createdBy,
      attestedByName: 'Siti Rahma',
      attestedAt: new Date(at(1).getTime() + LADDER_HOUR_MS).toISOString(),
      statement: AML_ATTESTATION_STATEMENT,
    }
  }

  // Stage-2 support markers (Legal/Appraisal + RM bureau-data) — present once past Stage 2.
  if (stage2Done) {
    app.stage2LegalApproval = {
      verifiedByLG: true,
      ...(app.stage2LegalApproval?.notes ? { notes: app.stage2LegalApproval.notes } : {}),
    }
    app.stage2SlikApproval = { verifiedByRT: true, notes: `Kol ${app.hardGates.kol}` }
  }

  const steps: ApprovalStepRecord[] = [...(app.approvalSteps ?? [])]

  // MUAP ladder: RM drafts (request) → TL (TL approval freezes the MUAP).
  const muapAt = at(3)
  if (muapComplete) {
    steps.push(ladderStep('muap', 'muap-author', 'request', MUAP_AUTHOR, muapAt, null))
    steps.push(ladderStep('muap', 'muap-approve-tl', 'approve', MUAP_TL, new Date(muapAt.getTime() + LADDER_HOUR_MS), `qr-${app.id}-muap-tl`))
  } else if (app.stage === 3) {
    steps.push(ladderStep('muap', 'muap-author', 'request', MUAP_AUTHOR, muapAt, null)) // awaiting TL
  }

  // RSK ladder: RA drafts (request) → Risk Team Leader (RTL signature freezes the RSK).
  const rskAt = at(4)
  if (rskComplete) {
    steps.push(ladderStep('rsk', 'rsk-author', 'request', RSK_AUTHOR, rskAt, null))
    steps.push(ladderStep('rsk', 'rsk-approve-rtl', 'approve', RSK_RTL, new Date(rskAt.getTime() + LADDER_HOUR_MS), `qr-${app.id}-rsk-rtl`))
  } else if (app.stage === 4) {
    const rung = RSK_PENDING_RUNG[app.id] ?? 'rtl'
    if (rung !== 'none') {
      steps.push(ladderStep('rsk', 'rsk-author', 'request', RSK_AUTHOR, rskAt, null)) // awaiting RTL
    }
  }

  // Committee MoM signatures (chain='mom') — appended once the committee has recorded a decision.
  if (decided) {
    const momAt = at(5)
    MOM_SIGNERS.forEach((m, i) => {
      steps.push(ladderStep('mom', 'komite-signer', 'approve', m, new Date(momAt.getTime() + (i + 1) * LADDER_HOUR_MS), `qr-${app.id}-mom-${m.id}`))
    })
  }

  app.approvalSteps = steps

  // Risk recommendation — set once the RSK is in flight (stage 4 with a live ladder) or complete.
  if (!app.riskRecommendation) {
    if (rskComplete) {
      app.riskRecommendation = app.komiteDecision === 'conditional' ? 'conditional' : 'approve'
    } else if (app.stage === 4 && (RSK_PENDING_RUNG[app.id] ?? 'rtl') !== 'none') {
      app.riskRecommendation = app.id === 'FOS-2026-019' ? 'conditional' : 'approve'
    }
    if (app.riskRecommendation && !app.riskNote) {
      app.riskNote = app.riskRecommendation === 'conditional'
        ? 'Disetujui bersyarat dengan pemantauan arus kas berkala.'
        : 'Profil risiko dalam batas appetite; direkomendasikan untuk disetujui.'
    }
  }
})
