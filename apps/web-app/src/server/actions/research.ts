'use server'

import { appendHistory } from '@/lib/history'
import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { requireActor } from '@/server/auth/session'
import { assertCanWorkDesk, auditUserName } from '@/lib/auth/can'
import { rateLimit } from '@/server/rate-limit'
import { runWebResearch } from '@/server/research/pipeline'
import type { LoanApplication } from '@/lib/types'
import type { ResearchContext } from '@/server/research/provider'

// Grounded web-research action (workflow-finetune.md §7). Gated to muap-author (the analyst owns
// the MUAP that the research grounds) — rsk-author can request too once an aspect-finding workflow
// uses it. Rate-limited per actor (expensive call, real-world egress). Persists ExploredSource[]
// on the application; the MUAP narrative grounder feeds them (masked) into the next draft.

export async function runWebResearchAction(appId: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  assertCanWorkDesk(actor, app, 'muap-author') // do-it-early: LA can request from stage 1
  const rl = rateLimit(`research:${actor.userId}`, 3, 60_000)
  if (!rl.ok) throw new Error('Terlalu banyak permintaan. Coba lagi sebentar.')

  const ctx: ResearchContext = {
    namaUsaha: app.namaUsaha ?? null,
    nasabahType: app.nasabahType,
    akadType: app.akadType,
    purpose: app.purpose,
    collateralType: app.collateralType,
  }
  // Pass the full app so the pipeline injects the customer-only layered context (design §5), REAL-
  // masked (research egresses to the public internet — the customer "Catatan" name must be masked).
  const sources = await runWebResearch({ appId, userId: actor.userId, ctx, app })

  app.exploredSources = sources
  appendHistory(app, {
    userId: actor.userId,
    userName: auditUserName(actor),
    action: sources.length
      ? `Riset web dijalankan — ${sources.length} sumber terkutip`
      : 'Riset web dijalankan — tidak ada sumber yang lolos klasifikasi/allowlist',
    stage: app.stage,
  })
  return saveApplication(app)
}
