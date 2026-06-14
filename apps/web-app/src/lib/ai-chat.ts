import {
  ASPECT_LABEL,
  ASPECT_ORDER,
  RECOMMENDATION_LABEL,
  generateAspectScores,
  recommendationFromTotal,
  totalScore,
  type AspectScores,
} from '@/lib/scoring'
import type { HardGateViolation, LoanApplication } from '@/lib/types'

const GATE_LABEL: Record<HardGateViolation, string> = {
  dsr: 'DSR',
  ltv: 'LTV',
  kol: 'Kol',
}

const GATE_VALUE: Record<HardGateViolation, (app: LoanApplication) => string> = {
  dsr: (app) => `${app.hardGates.dsr}%`,
  ltv: (app) => `${app.hardGates.ltv}%`,
  kol: (app) => `${app.hardGates.kol}`,
}

function missingRequiredDocuments(app: LoanApplication): string[] {
  return app.documents.filter((doc) => doc.required && doc.status !== 'uploaded').map((doc) => doc.name)
}

function attentionAspects(scores: AspectScores): string[] {
  return ASPECT_ORDER.filter((key) => typeof scores[key] === 'number' && (scores[key] ?? 0) < 80).map(
    (key) => `${ASPECT_LABEL[key]} ${scores[key]}`,
  )
}

function topRisks(app: LoanApplication, missingDocs: string[]): string {
  const gateRisks = app.hardGateViolations.map((gate) => `${GATE_LABEL[gate]} ${GATE_VALUE[gate](app)}`)
  const docRisk = missingDocs.length ? [`Dokumen kurang ${missingDocs.length}`] : []
  return [...gateRisks, ...docRisk].join('; ') || 'Tidak ada pelanggaran hard gate aktif'
}

function recommendationLine(app: LoanApplication, prompt: string, missingDocs: string[], total: number): string {
  const p = prompt.toLowerCase()
  if (p.includes('dokumen') || p.includes('kurang')) {
    return missingDocs.length
      ? `Lengkapi ${missingDocs.slice(0, 3).join(', ')}${missingDocs.length > 3 ? ', dan dokumen lain' : ''} sebelum eskalasi tahap.`
      : 'Dokumen wajib sudah lengkap; lanjutkan validasi substansi sesuai tahap.'
  }
  if (p.includes('finansial') || p.includes('dsr')) {
    return app.hardGateViolations.includes('dsr')
      ? `Turunkan beban angsuran atau sesuaikan plafond karena DSR ${app.hardGates.dsr}% melewati batas.`
      : `Kapasitas bayar relatif terkendali pada DSR ${app.hardGates.dsr}%; tetap validasi sumber penghasilan.`
  }
  if (p.includes('jaminan') || p.includes('ltv')) {
    return app.hardGateViolations.includes('ltv')
      ? `Perkuat agunan atau turunkan plafond karena LTV ${app.hardGates.ltv}% menjadi risiko utama.`
      : `Agunan memadai pada LTV ${app.hardGates.ltv}%; pastikan dokumen legal agunan bersih.`
  }
  if (p.includes('risiko')) {
    return app.hardGateViolations.length
      ? 'Mitigasi pelanggaran hard gate terlebih dahulu sebelum rekomendasi komite.'
      : 'Fokuskan catatan risiko pada aspek 5C+1S dengan skor terendah.'
  }
  return total >= 80
    ? 'Aplikasi dapat dilanjutkan dengan kontrol normal dan verifikasi akhir.'
    : 'Tahan eskalasi sampai aspek lemah dan hard gate dimitigasi.'
}

export function synthesizeAiReply(app: LoanApplication, prompt: string): string {
  const scores = app.analysis.scores ?? generateAspectScores(app)
  const total = totalScore(scores)
  const recommendation = recommendationFromTotal(total)
  const missingDocs = missingRequiredDocuments(app)
  const aspects = attentionAspects(scores)
  const docsLabel = missingDocs.length ? `${missingDocs.length} dokumen wajib belum lengkap` : 'dokumen wajib lengkap'

  return [
    `Status Analisa ${app.nasabahName}: Skor ${total}/100 (${RECOMMENDATION_LABEL[recommendation]}); ${aspects.length} aspek perlu perhatian; tahap ${app.stage}; ${docsLabel}.`,
    `Top Risks: ${topRisks(app, missingDocs)}.`,
    `Fokus 5C+1S: ${aspects.slice(0, 3).join('; ') || 'seluruh aspek utama ≥80'}.`,
    `Rekomendasi: ${recommendationLine(app, prompt, missingDocs, total)}`,
  ].join('\n')
}
