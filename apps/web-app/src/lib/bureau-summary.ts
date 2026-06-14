// Pure (no server-only / no prisma) bureau-bundle summary context + prompt builder, so the
// masked-egress contract is hermetically testable (mirrors narrative-scrub vs narrative). The
// server orchestrator (server/ai/bureau.ts) masks this prompt, infers, audits, and unmasks.
//
// The bureau bundle = SLIK + Pefindo + Rekening Koran. The summary is ADVISORY ONLY: Kol and all
// gating values stay human-confirmed + deterministic. The prompt forbids the model from stating a
// risk level / eligibility / recommendation — that is human-only (same discipline as RSK narrative).

import type { LoanApplication } from './types'
import { formatRupiah } from './sla-utils'

const BUREAU_DOC_TYPES = ['slik_report', 'pefindo_report', 'rekening_koran_pribadi', 'rekening_koran_perusahaan']

export interface BureauFacts {
  nasabahName: string
  kol: number
  dsr: number
  ltv: number
  plafond: number
  akad: string
  hasSlik: boolean
  hasPefindo: boolean
  hasRekKoran: boolean
  // Transcribed bureau-report text, if OCR populated it (optional — bureau OCR is opt-in).
  bureauTexts: { label: string; text: string }[]
}

export function buildBureauContext(app: LoanApplication): BureauFacts {
  const uploaded = (dt: string) => app.documents.some((d) => d.docType === dt && d.status === 'uploaded')
  const bureauTexts = app.documents
    .filter((d) => BUREAU_DOC_TYPES.includes(d.docType) && !!d.extractedText?.trim())
    .map((d) => ({ label: d.name, text: (d.extractedText ?? '').trim() }))
  return {
    nasabahName: app.nasabahName,
    kol: Number(app.hardGates.kol),
    dsr: Number(app.hardGates.dsr),
    ltv: Number(app.hardGates.ltv),
    plafond: app.requestedPlafond,
    akad: app.akadType,
    hasSlik: uploaded('slik_report'),
    hasPefindo: uploaded('pefindo_report'),
    hasRekKoran: uploaded('rekening_koran_pribadi') || uploaded('rekening_koran_perusahaan'),
    bureauTexts,
  }
}

export function buildBureauSummaryPrompt(facts: BureauFacts, contextCascade = ''): string {
  const available =
    [facts.hasSlik && 'SLIK', facts.hasPefindo && 'Pefindo', facts.hasRekKoran && 'Rekening Koran']
      .filter(Boolean)
      .join(', ') || 'belum lengkap'
  const lines = [
    `Nasabah: ${facts.nasabahName}`,
    `Akad: ${facts.akad}; Plafond diajukan: ${formatRupiah(facts.plafond)}`,
    `Kolektibilitas (SLIK): Kol ${facts.kol}`,
    `Rasio internal: DSR ${facts.dsr}%, LTV ${facts.ltv}%`,
    `Dokumen biro tersedia: ${available}`,
  ]
  for (const b of facts.bureauTexts) lines.push(`\n[${b.label}]\n${b.text}`)
  // Layered AI context (design §5) appended at the END of the user prompt per the 'bureau' policy.
  if (contextCascade.trim()) lines.push('', contextCascade.trim())
  return [
    'Ringkas profil risiko kredit nasabah dari data biro berikut untuk telaah RM (Tahap 2/3).',
    'Fokus: riwayat pembayaran, indikasi tunggakan, konsistensi arus kas. DILARANG menyatakan level',
    'risiko, kelayakan, atau rekomendasi akhir — itu kewenangan manusia. DILARANG mengarang angka di',
    'luar data yang diberikan.',
    '',
    ...lines,
  ].join('\n')
}
