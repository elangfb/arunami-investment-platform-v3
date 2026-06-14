// AI bureau-bundle summarization (SLIK + Pefindo + Rek Koran) for the RM's Stage-2/3 review.
// Mirrors the narrative drafter's masked-egress + audit discipline (server/ai/narrative.ts):
//   mask-in (piiSecrets) → residual backstop (fail-OPEN by default, log only) → infer → audit MASKED I/O → unmask-out.
// ADVISORY ONLY: Kol and every gating value stay human-confirmed + deterministic; this never writes
// a gating field. The prompt forbids the model from stating a risk level / eligibility / verdict.

import { inferenceProvider } from './provider'
import { maskForEgress, blockOnResidualPii } from './redact'
import { recordAiInteraction } from './audit'
import { piiSecrets, unmaskPii } from '@/lib/pii-mask'
import { buildBureauContext, buildBureauSummaryPrompt } from '@/lib/bureau-summary'
import { loadCascadeForSurface } from './context-layers'
import { log, errField } from '../log'
import type { LoanApplication } from '@/lib/types'

const SYSTEM_INSTRUCTION =
  'Anda analis kredit bank syariah. Ringkas data biro kredit secara faktual dan ringkas (maksimal ~150 kata, Bahasa Indonesia). ' +
  'DILARANG menyatakan level risiko, kelayakan, atau rekomendasi akhir — itu kewenangan manusia. DILARANG mengarang angka di luar data.'

export interface BureauSummaryResult {
  summary: string
  model: string
}

/**
 * Generate a masked + audited AI summary of the bureau bundle. By default fail-OPEN: a residual-PII
 * hit is logged but the masked summary still generates (set PII_RESIDUAL_BLOCK=1 to fail closed for
 * prod — see redact.ts). `auditUserId` attributes the egress in the AiInteraction trail.
 */
export async function generateBureauSummary(app: LoanApplication, auditUserId: string): Promise<BureauSummaryResult> {
  const secrets = piiSecrets(app)
  // Inject the layered AI context (design §5) at the END of the user prompt, per the 'bureau' policy
  // (all 3 layers). maskForEgress below masks the whole prompt (incl. the appended cascade PII).
  const cascade = await loadCascadeForSurface(app, 'bureau')
  const { masked: prompt, residual } = maskForEgress(buildBureauSummaryPrompt(buildBureauContext(app), cascade), secrets)
  if (residual.length) {
    const block = blockOnResidualPii()
    log.warn('pii.residual_detected', { surface: 'bureau', appId: app.id, phase: 'prompt', types: residual, blocked: block })
    if (block) throw new Error('Ringkasan biro dibatalkan: terdeteksi PII residual sebelum egress.')
  }

  const reply = await inferenceProvider().generateReply(SYSTEM_INSTRUCTION, prompt)

  // Audit the egress: store the MASKED prompt + MASKED reply (re-mask the reply as a backstop in
  // case the model echoed a structured identifier). Best-effort — a failed audit write logs but
  // never discards the already-generated summary (mirrors the narrative path).
  try {
    const { masked: maskedReply } = maskForEgress(reply, secrets)
    await recordAiInteraction({
      appId: app.id,
      userId: auditUserId,
      surface: 'bureau',
      maskedPrompt: prompt,
      maskedReply,
      model: inferenceProvider().model(),
    })
  } catch (e) {
    log.error('bureau.audit_failed', { appId: app.id, ...errField(e) })
  }

  // Unmask-out: the model worked in the masked domain; restore the known PII placeholders it echoed.
  return { summary: unmaskPii(reply, secrets), model: inferenceProvider().model() }
}
