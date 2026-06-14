'use server'

import { appendHistory } from '@/lib/history'
import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { requireActor } from '@/server/auth/session'
import { assertCanWorkDesk, auditUserName } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { buildSeedContext } from '@/lib/seed-context'
import { generateAdvisoryRecommendation } from '@/server/ai/advisory-rec'
import { loadCascadeForSurface } from '@/server/ai/context-layers'
import { recommendationLabels } from '@/lib/stage-action'
import type { LoanApplication } from '@/lib/types'

// Advisory AI risk recommendation — request flow (workflow-finetune.md §6).
// Gated to rsk-author at Stage ≤ 4 (RA owns the risk decision; advisory is FOR RA, not a public
// surface). Rate-limited per actor (small budget, expensive call). Persists onto
// app.aiRiskAdvisory ONLY; never touches the authoritative riskRecommendation.

export async function askAdvisoryRecommendationAction(appId: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  assertCanWorkDesk(actor, app, 'rsk-author') // do-it-early: RT can request from stage 1
  const rl = rateLimit(`advisory:${actor.userId}`, 5, 60_000)
  if (!rl.ok) throw new Error('Terlalu banyak permintaan. Coba lagi sebentar.')
  const result = await generateAdvisoryRecommendation({
    appId,
    userId: actor.userId,
    pii: app,
    seed: buildSeedContext(app),
    // Layered AI context (design §5), gated for the 'advisory' surface (all 3 layers).
    contextCascade: await loadCascadeForSurface(app, 'advisory'),
  })
  app.aiRiskAdvisory = result
  appendHistory(app, {
    userId: actor.userId,
    userName: auditUserName(actor),
    action: `Saran AI dirilis (advisory): ${recommendationLabels[result.recommendation]}`,
    stage: app.stage,
  })
  return saveApplication(app)
}
