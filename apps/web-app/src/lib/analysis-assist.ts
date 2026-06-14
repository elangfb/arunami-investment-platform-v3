import type { FiveCSAnalysis, LoanApplication } from '@/lib/types'
import { DEFAULT_RISK_POLICY } from '@/lib/hardGates'

// Deterministic decision-support for the Loan Analyst at Stage 3: a gap
// checker that flags where the written 5C+1S contradicts the application
// data, and a "next step" hint. Advisory only — neither gates anything.

type Aspect = keyof Omit<FiveCSAnalysis, 'generated' | 'scores'>

const ASPECTS: Aspect[] = ['character', 'capacity', 'capital', 'condition', 'collateral', 'syariah']

const ASPECT_LABELS: Record<Aspect, string> = {
  character: 'Karakter',
  capacity: 'Kapasitas',
  capital: 'Modal',
  condition: 'Kondisi Pasar',
  collateral: 'Agunan',
  syariah: 'Kepatuhan Syariah',
}

// Indonesian terms that read as a reassuring claim. A positive-sounding
// aspect paired with a breached hard gate is the mismatch worth surfacing.
const POSITIVE_TERMS = ['aman', 'memadai', 'sehat', 'mencukupi', 'layak', 'terkendali', 'wajar', 'baik']

function readsPositive(text: string): boolean {
  const lower = text.toLowerCase()
  return POSITIVE_TERMS.some(term => lower.includes(term))
}

export interface AnalysisGap {
  aspect?: Aspect
  message: string
}

// Objective checks only — never judges narrative quality (that is the LA's
// remit). Each finding uses the "perlu ditinjau" / "catatan" register.
export function detectAnalysisGaps(app: LoanApplication): AnalysisGap[] {
  const gaps: AnalysisGap[] = []
  const analysis = app.analysis
  const policy = app.riskPolicy ?? DEFAULT_RISK_POLICY // recompute-live thresholds (no hardcoded 40/70/1)

  for (const aspect of ASPECTS) {
    if (!analysis[aspect] || analysis[aspect].trim() === '') {
      gaps.push({ aspect, message: `Aspek ${ASPECT_LABELS[aspect]} belum diisi.` })
    }
  }

  if (app.financialsAssessed && app.hardGates.dsr > policy.dsrMaxPct && analysis.capacity && readsPositive(analysis.capacity)) {
    gaps.push({
      aspect: 'capacity',
      message: `Narasi Kapasitas bernada positif, namun DSR ${app.hardGates.dsr}% melebihi ambang ${policy.dsrMaxPct}% — perlu ditinjau.`,
    })
  }
  if (app.financialsAssessed && app.hardGates.ltv > policy.ltvMaxPct && analysis.collateral && readsPositive(analysis.collateral)) {
    gaps.push({
      aspect: 'collateral',
      message: `Narasi Agunan bernada positif, namun LTV ${app.hardGates.ltv}% melebihi ambang ${policy.ltvMaxPct}% — perlu ditinjau.`,
    })
  }
  if (app.kolEntered && app.hardGates.kol > policy.kolMax) {
    for (const aspect of ['character', 'condition'] as const) {
      if (analysis[aspect] && readsPositive(analysis[aspect])) {
        gaps.push({
          aspect,
          message: `Narasi ${ASPECT_LABELS[aspect]} bernada positif, namun Kolektibilitas berada di Kol ${app.hardGates.kol} (di atas Kol ${policy.kolMax}) — perlu ditinjau.`,
        })
      }
    }
  }

  const missingDocs = app.documents.filter(doc => doc.required && doc.status !== 'uploaded')
  if (missingDocs.length > 0) {
    gaps.push({ message: `${missingDocs.length} dokumen wajib belum terunggah — perlu ditinjau sebelum analisa final.` })
  }
  const unverifiedDocs = app.documents.filter(
    doc => doc.required && doc.status === 'uploaded' && doc.docType !== 'slik_report' && doc.legalVerification !== 'pass',
  )
  if (unverifiedDocs.length > 0) {
    gaps.push({ message: `${unverifiedDocs.length} dokumen wajib belum terverifikasi Legal — perlu ditinjau.` })
  }

  const unconfirmedOcr = Object.values(app.extractionSources ?? {}).filter(source => source === 'ocr_suggested')
  if (unconfirmedOcr.length > 0) {
    gaps.push({ message: `${unconfirmedOcr.length} nilai hasil OCR belum dikonfirmasi di tab Data — perlu ditinjau.` })
  }

  return gaps
}

export interface NextStep {
  label: string
  detail: string
}

// The single most useful next action for the analyst, derived from the
// existing Stage 3 gating plus the gap checker.
export function nextStep(app: LoanApplication): NextStep {
  if (!app.financialsAssessed) {
    return {
      label: 'Lengkapi & simpan input keuangan',
      detail: 'Buka tab Data untuk mengisi dan menyimpan input keuangan sebelum menyusun analisa.',
    }
  }
  const unconfirmedOcr = Object.values(app.extractionSources ?? {}).filter(source => source === 'ocr_suggested')
  if (unconfirmedOcr.length > 0) {
    return {
      label: 'Konfirmasi nilai OCR di tab Data',
      detail: `${unconfirmedOcr.length} nilai hasil OCR masih menunggu konfirmasi.`,
    }
  }
  const filled = ASPECTS.filter(aspect => app.analysis[aspect] && app.analysis[aspect].trim() !== '').length
  if (filled < ASPECTS.length) {
    return {
      label: `Lengkapi Analisa 5C+1S (${filled}/${ASPECTS.length} aspek terisi)`,
      detail: 'Generate draft analisa lalu tinjau dan sesuaikan setiap aspek.',
    }
  }
  const gaps = detectAnalysisGaps(app)
  if (gaps.length > 0) {
    return {
      label: `Tinjau ${gaps.length} catatan pada Analisa 5C+1S`,
      detail: 'Jalankan "Periksa Ulang Analisa" untuk melihat detail catatan.',
    }
  }
  return {
    label: 'Analisa siap dikirim ke Risk Review',
    detail: 'Seluruh aspek terisi dan tidak ada catatan yang perlu ditinjau.',
  }
}
