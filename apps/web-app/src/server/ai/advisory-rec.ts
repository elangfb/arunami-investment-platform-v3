import 'server-only'

import { z } from 'zod'
import { inferenceProvider } from './provider'
import { maskForEgress, blockOnResidualPii } from './redact'
import { recordAiInteraction } from './audit'
import { auditBestEffort } from './audit-best-effort'
import { getActivePrompt } from '../config/ai-prompts'
import { unmaskPii, piiSecrets } from '@/lib/pii-mask'
import { akadConfig } from '@/lib/akad-config'
import { formatRupiah } from '@/lib/sla-utils'
import { log } from '@/server/log'
import type { SeedContext } from '@/lib/seed-context'
import type { LoanApplication } from '@/lib/types'

// ADVISORY AI RISK RECOMMENDATION (workflow-finetune.md §6).
//
// SCOPE: produce a non-authoritative hint for Risk Team — { recommendation, rationale } —
// labelled "Saran AI" in the UI, NEVER written to riskRecommendation, NEVER frozen into the
// RSK doc. RT must still explicitly choose. This is the ONE narrative path where the model is
// *allowed* to assert a verdict (approve/conditional/reject), because the output is gated by
// (a) a structured schema that confines the verdict to a single labelled field,
// (b) persistence into a separate column (aiRiskAdvisory), never the authoritative one,
// (c) a UI that displays it as advisory + a desk gate so only the decision-maker can request it.
//
// Compliance pipeline is otherwise unchanged: mask-in via the shared redactor (NER-ready),
// fail-closed residual check, audit via recordAiInteraction (surface: 'advisory'). The schema
// has NO `level` / `rating` field — only the standard 3-state recommendation verb.

const AdvisoryRecSchema = z.object({
  recommendation: z.enum(['approve', 'conditional', 'reject']),
  rationale: z.string().min(20).max(2000),
})
export type AdvisoryRec = z.infer<typeof AdvisoryRecSchema>

// System instruction is admin-configurable (lib/ai-prompts.ts `advisory_rec`); fallback in
// code = the historical text. Resolved per-call (cheap DB read; per-version-config pattern).

function buildAdvisoryPrompt(ctx: SeedContext, contextCascade = ''): string {
  const cfg = akadConfig(ctx.akadType)
  const ret = cfg.usesNisbah
    ? `${ctx.nisbahBankPercent ?? '?'} : ${ctx.nisbahCustomerPercent ?? '?'} (Bank : Nasabah)`
    : ctx.marginRate != null
      ? `${ctx.marginRate}% per tahun`
      : '—'
  const lines = [
    'DATA APLIKASI:',
    `- Nasabah: ${ctx.namaUsaha || ctx.nasabahName} (${ctx.nasabahType})`,
    `- Akad: ${ctx.akadType}`,
    `- Plafond diusulkan: ${formatRupiah(ctx.requestedPlafond)}; Tenor: ${ctx.requestedTenorMonths} bulan`,
    `- Tujuan: ${ctx.purpose}`,
    `- Return: ${ret}`,
    `- Hard gate: DSR ${ctx.hardGates.dsr}%, LTV ${ctx.hardGates.ltv}%, Kol ${ctx.hardGates.kol}`,
    `- Pelanggaran hard gate: ${ctx.hardGateViolations.join(', ') || 'tidak ada'}`,
    `- Penghasilan/arus kas bersih bulanan: ${formatRupiah(ctx.financialInputs.netMonthlyIncome)}`,
    `- Kewajiban bulanan berjalan: ${formatRupiah(ctx.financialInputs.existingMonthlyObligations)}`,
    `- Nilai appraisal agunan: ${formatRupiah(ctx.financialInputs.collateralAppraisedValue)}`,
  ]
  if (ctx.analysis) {
    lines.push(
      '',
      'KONTEKS ANALIS SEBELUMNYA (rujukan; verifikasi ke DATA):',
      `- Character: ${ctx.analysis.character || '—'}`,
      `- Capacity: ${ctx.analysis.capacity || '—'}`,
      `- Capital: ${ctx.analysis.capital || '—'}`,
      `- Condition: ${ctx.analysis.condition || '—'}`,
      `- Collateral: ${ctx.analysis.collateral || '—'}`,
      `- Syariah: ${ctx.analysis.syariah || '—'}`,
    )
  }
  // Layered AI context (design §5) appended at the END of the user prompt per the 'advisory' policy.
  if (contextCascade.trim()) lines.push('', contextCascade.trim())
  lines.push('', 'BERIKAN SARAN ringkas + RASIONAL.')
  return lines.join('\n')
}

/// Generate the advisory rec, masked on egress + audited. NEVER mutates riskRecommendation —
/// the caller persists the result on aiRiskAdvisory only. Throws on residual-PII (G3 backstop)
/// so a masking miss never reaches the model or the audit log.
export async function generateAdvisoryRecommendation(opts: {
  appId: string
  userId: string
  pii: Pick<LoanApplication, 'nasabahName' | 'nik' | 'phoneNumber' | 'whatsappNumber' | 'namaUsaha'>
  seed: SeedContext
  /** Pre-rendered layered AI context (design §5), gated for the 'advisory' surface by the caller
   *  (which holds the real app). Appended at the END of the user prompt before maskForEgress. */
  contextCascade?: string
}): Promise<{
  recommendation: AdvisoryRec['recommendation']
  rationale: string
  model: string
  generatedAt: string
}> {
  const secrets = piiSecrets(opts.pii)
  const { masked: maskedPrompt, residual: promptResidual } = maskForEgress(buildAdvisoryPrompt(opts.seed, opts.contextCascade ?? ''), secrets)
  if (promptResidual.length) {
    const block = blockOnResidualPii()
    log.warn('pii.residual_detected', { surface: 'advisory', appId: opts.appId, phase: 'prompt', types: promptResidual, blocked: block })
    if (block) throw new Error('AI request blocked: residual PII detected in prompt.')
  }
  const ai = inferenceProvider()
  const systemInstruction = await getActivePrompt('advisory_rec')
  const obj = await ai.generateStructured(systemInstruction, maskedPrompt, AdvisoryRecSchema, { temperature: 0.2 })
  // Unmask names in the rationale (system supplies the real value; the model never sees it).
  const unmaskedRationale = unmaskPii(obj.rationale, secrets)
  // Defensive re-mask for the AUDIT copy — the store never holds raw PII (G3).
  const { masked: maskedReply, residual: replyResidual } = maskForEgress(unmaskedRationale, secrets)
  if (replyResidual.length) {
    const block = blockOnResidualPii()
    log.warn('pii.residual_detected', { surface: 'advisory', appId: opts.appId, phase: 'reply', types: replyResidual, blocked: block })
    if (block) throw new Error('AI reply blocked: residual PII detected in response.')
  }
  // Best-effort audit: a failed write logs but never discards the recommendation (AI audit =
  // fail-open, decided 2026.06.08; mirrors bureau/narrative/research).
  await auditBestEffort(
    () =>
      recordAiInteraction({
        appId: opts.appId,
        userId: opts.userId,
        surface: 'advisory',
        maskedPrompt,
        // Store the structured shape (label + masked rationale) as a single string so the audit
        // row carries the full advisory state — never the unmasked rationale.
        maskedReply: JSON.stringify({ recommendation: obj.recommendation, rationale: maskedReply }),
        model: ai.model(),
      }),
    'advisory.audit_failed',
    { appId: opts.appId },
  )
  return {
    recommendation: obj.recommendation,
    rationale: unmaskedRationale,
    model: ai.model(),
    generatedAt: new Date().toISOString(),
  }
}
