import type { FiveCSAnalysis, LoanApplication } from '@/lib/types'
import { formatRupiah } from '@/lib/sla-utils'
import { generateAspectScores } from '@/lib/scoring'
import { akadConfig, hasStricterSyariahBar } from '@/lib/akad-config'
import { DEFAULT_RISK_POLICY } from '@/lib/hardGates'

// Deterministic, data-driven 5C+1S draft (V1). Not a real LLM — the app is a
// prototype and real model calls are compliance-gated (see AIChatTab TODO).
// Objective aspects (capacity/collateral/capital) are derived from the
// application data; judgement aspects (character/condition) are kept thin and
// hand off to the analyst, who completes them from external research.
// Thresholds come from the app's resolved risk policy (recompute-live; falls back to
// DEFAULT_RISK_POLICY) so the narrative ambang matches the active admin policy, not a literal.

const COLLATERAL_LABELS: Record<NonNullable<LoanApplication['collateralType']>, string> = {
  none: 'tanpa agunan fisik',
  fixed_asset: 'aset tetap',
  vehicle: 'kendaraan',
  guarantor: 'jaminan perorangan',
}

function characterText(app: LoanApplication): string {
  const idConfirmed = app.extractionSources?.nik === 'ocr_confirmed' || app.extractionSources?.nik === 'ocr_overridden'
  const idClause = idConfirmed
    ? 'Identitas nasabah telah dikonfirmasi.'
    : 'Identitas nasabah masih perlu dikonfirmasi.'
  const legalClause = app.stage2LegalApproval?.verifiedByLG
    ? 'Legalitas dokumen telah diverifikasi pada tahap Legal, Agunan & Biro.'
    : 'Verifikasi legalitas dokumen belum tuntas.'
  return `${idClause} ${legalClause} Penilaian karakter — rekam jejak pembayaran, trade checking, dan hasil kunjungan — dilengkapi analis berdasarkan riset eksternal.`
}

// TODO (akad-types): for profit-share akad (Musyarakah/Mudharabah) the
// capacity draft should note that DSR is judgmental and prompt the LA to
// document the projection basis — refine when the MUAP/Komite deep-dives land.
function capacityText(app: LoanApplication): string {
  const income = formatRupiah(app.financialInputs.netMonthlyIncome)
  const obligations = formatRupiah(app.financialInputs.existingMonthlyObligations)
  const dsrMax = app.riskPolicy?.dsrMaxPct ?? DEFAULT_RISK_POLICY.dsrMaxPct
  const dsrClause = !app.financialsAssessed
    ? 'DSR belum dihitung — lengkapi input keuangan di tab Data.'
    : app.hardGates.dsr > dsrMax
      ? `DSR ${app.hardGates.dsr}% berada di atas ambang internal ${dsrMax}% sehingga memerlukan mitigasi.`
      : `DSR ${app.hardGates.dsr}% berada dalam ambang internal ${dsrMax}%.`
  const sourceClause = app.incomeSource === 'karyawan'
    ? 'Pendapatan bersumber dari penghasilan tetap sebagai karyawan.'
    : app.incomeSource === 'wiraswasta'
      ? 'Pendapatan bersumber dari usaha (wiraswasta); stabilitas arus kas perlu ditinjau dari rekening koran.'
      : 'Pendapatan bersumber dari operasional usaha nasabah.'
  // Profit-share akad: DSR rests on a projected (not contractual) profit share,
  // so it is judgmental — prompt the analyst to document the projection basis.
  const profitShareClause = akadConfig(app.akadType).isProfitShare
    ? ` Untuk akad ${app.akadType}, DSR bersifat judgmental karena berbasis proyeksi bagi hasil; analis wajib mendokumentasikan dasar proyeksi (${app.financialInputs.projectionBasis?.trim() || 'belum diisi'}).`
    : ''
  return `Pendapatan bersih bulanan tercatat ${income} dengan kewajiban berjalan ${obligations}. ${dsrClause} ${sourceClause}${profitShareClause}`
}

function capitalText(app: LoanApplication): string {
  const plafond = formatRupiah(app.requestedPlafond)
  const cfg = akadConfig(app.akadType)
  const nisbah = app.financialInputs.nisbahBankPercent != null && app.financialInputs.nisbahCustomerPercent != null
    ? ` Nisbah bagi hasil ${app.financialInputs.nisbahBankPercent}:${app.financialInputs.nisbahCustomerPercent} (bank:nasabah).`
    : ''
  const akadClause = cfg.usesMargin && app.marginRate != null
    ? `Skema ${app.akadType} dengan ${cfg.returnLabel} ${app.marginRate}% atas plafond ${plafond}.`
    : cfg.isProfitShare && app.financialInputs.projectedMonthlyProfitShare != null
      ? `Skema ${cfg.returnLabel} ${app.akadType} dengan proyeksi bagi hasil ${formatRupiah(app.financialInputs.projectedMonthlyProfitShare)} per bulan atas plafond ${plafond}.${nisbah}`
      : `Plafond yang diajukan ${plafond} dengan akad ${app.akadType}.`
  return `${akadClause} Tenor ${app.requestedTenorMonths} bulan. Kecukupan modal sendiri dan kontribusi nasabah pada usaha yang dibiayai dikonfirmasi analis dari laporan keuangan.`
}

function conditionText(app: LoanApplication): string {
  return `Pembiayaan ditujukan untuk: ${app.purpose}. Prospek industri, posisi kompetitif nasabah, dan sensitivitas terhadap kondisi pasar dilengkapi analis berdasarkan riset eksternal.`
}

function collateralText(app: LoanApplication): string {
  const typeLabel = COLLATERAL_LABELS[app.collateralType ?? 'none']
  const value = formatRupiah(app.financialInputs.collateralAppraisedValue)
  const ltvMax = app.riskPolicy?.ltvMaxPct ?? DEFAULT_RISK_POLICY.ltvMaxPct
  const ltvClause = !app.financialsAssessed
    ? 'LTV belum dihitung.'
    : app.hardGates.ltv > ltvMax
      ? `LTV ${app.hardGates.ltv}% melebihi ambang ${ltvMax}% sehingga memerlukan penambahan agunan atau penyesuaian plafond.`
      : `LTV ${app.hardGates.ltv}% berada dalam ambang ${ltvMax}%.`
  if (app.collateralType === 'none') {
    return `Pembiayaan diajukan tanpa agunan fisik; mitigasi risiko bertumpu pada kelayakan usaha. ${ltvClause}`
  }
  const hasAppraisal = app.documents.some(d => d.docType === 'appraisal_agunan' && d.status === 'uploaded')
  const hasInsurance = app.documents.some(d => d.docType === 'asuransi_agunan' && d.status === 'uploaded')
  const docClause = `${hasAppraisal ? 'Dokumen appraisal tersedia' : 'Dokumen appraisal belum tersedia'}; ${hasInsurance ? 'agunan telah diasuransikan' : 'bukti asuransi agunan belum tersedia'}.`
  return `Agunan berupa ${typeLabel} dengan nilai appraisal ${value}. ${ltvClause} ${docClause}`
}

function syariahText(app: LoanApplication): string {
  // Mudharabah (full trustee financing) carries a stricter syariah bar.
  const stricterClause = hasStricterSyariahBar(app.akadType)
    ? ' Khusus Mudharabah: pastikan ruang lingkup keahlian/usaha, batas kewenangan pengelolaan, serta definisi kelalaian dan pelanggaran (ta’addi/taqshir) dinyatakan tegas dalam akad.'
    : ''
  return `Akad ${app.akadType} dinilai selaras dengan tujuan pembiayaan: ${app.purpose}. Objek pembiayaan harus dipastikan halal, jelas, dan terdokumentasi; kesesuaian rinci dengan fatwa DSN-MUI ditinjau analis.${stricterClause}`
}

export function buildAnalysisDraft(app: LoanApplication): FiveCSAnalysis {
  return {
    character: characterText(app),
    capacity: capacityText(app),
    capital: capitalText(app),
    condition: conditionText(app),
    collateral: collateralText(app),
    syariah: syariahText(app),
    generated: true,
    scores: generateAspectScores(app),
  }
}
