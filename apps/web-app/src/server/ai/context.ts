// Builds the grounded prompt for the risk-analysis LLM from the app facts (sent
// by the client) + the Doc-extracted snapshot (loaded server-side from the DB).

import type { ExtractedSnapshot } from '../../lib/extraction/types'
import type { AiAppContext } from '../../lib/ai-api'
import { getActivePrompt } from '../config/ai-prompts'

export type { AiAppContext }

/// Admin-configurable per surface (AiPromptVersion `assistant_chat`); fallback = code default.
export function systemInstruction(): Promise<string> {
  return getActivePrompt('assistant_chat')
}

function fmtRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

function snapshotBlock(s: ExtractedSnapshot | null): string {
  if (!s) return 'DATA DOKUMEN (MUAP/RSK): belum tersinkron / belum ada snapshot valid.'
  const matrix = s.matrix
    .map((r) => `- ${r.aspect}: level=${r.level ?? '—'}; temuan=${r.finding || '—'}; mitigasi=${r.mitigation || '—'}`)
    .join('\n')
  const ratios = s.ratios
    .map((r) => `- ${r.key}: ${r.points.map((p) => `${p.period || '?'}=${p.value ?? '—'}`).join(', ') || '—'}`)
    .join('\n')
  const col = s.collateral
  const rac = s.racDeviations.length
    ? s.racDeviations.map((d, i) => `${i + 1}. ${d.item}${d.justification ? ` — ${d.justification}` : ''}`).join('\n')
    : '— tidak ada —'
  return [
    'MATRIKS RISIKO 5C+2S (dari RSK):',
    matrix,
    '',
    'RASIO KEUANGAN (dari MUAP, per periode):',
    ratios,
    '',
    `AGUNAN: nilai pasar=${col.marketValue ?? '—'}; nilai likuidasi=${col.liquidationValue ?? '—'}; SCCR=${col.sccrPercent ?? '—'}%`,
    '',
    'DEVIASI RAC:',
    rac,
  ].join('\n')
}

export function buildPrompt(ctx: AiAppContext, snapshot: ExtractedSnapshot | null, userPrompt: string): string {
  return [
    'PROFIL APLIKASI:',
    `- Nasabah: ${ctx.nasabahName} (${ctx.nasabahType})`,
    `- Akad: ${ctx.akadType}; Plafond: ${fmtRupiah(ctx.requestedPlafond)}; Tenor: ${ctx.requestedTenorMonths} bulan`,
    `- Tujuan: ${ctx.purpose}`,
    `- Tahap: ${ctx.stage}`,
    `- Hard gate: DSR ${ctx.hardGates.dsr}%, LTV ${ctx.hardGates.ltv}%, Kol ${ctx.hardGates.kol}`,
    `- Pelanggaran hard gate: ${ctx.hardGateViolations.join(', ') || 'tidak ada'}`,
    `- Dokumen wajib belum lengkap: ${ctx.missingDocs.join(', ') || 'lengkap'}`,
    '',
    snapshotBlock(snapshot),
    '',
    '────────────────────────',
    `PERTANYAAN ANALIS: ${userPrompt}`,
  ].join('\n')
}
