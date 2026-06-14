import 'server-only'

import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { assertCanWorkDesk, auditUserName, type Actor } from '@/lib/auth/can'
import { createApplicationDocs, regenerateApplicationDocs } from '@/server/docs/service'
import { buildSeedContext } from '@/lib/seed-context'
import { appendHistory } from '@/lib/history'
import { getDocLinkage } from '@/server/repo/doc-linkage'
import type { LoanApplication } from '@/lib/types'

// Actor-injected core of the explicit "Generate MUAP" (N2, ADR-0018 / docs/designs/rm-led-pipeline-
// redesign.md §4). Kept OUT of the 'use server' module so the actor-trusting entry point is NOT a public
// server action (a forged Actor over the wire); the thin wrapper (docs-muap.ts) resolves requireActor()
// then delegates here. This split makes the gate itest-able with a test Actor (mirrors
// discovery-actions.core.ts / application-create.core.ts) — no Firebase session mock needed.
//
// The MUAP Doc is minted ONLY by this action, never auto at Stage-3 entry (the auto-mint is removed —
// see server/docs/auto-draft.ts). Available across the whole Inisiasi phase (MUAP-early): the
// `muap-author` desk's work window is phase-wide (stages 1–3, phaseOf===1; lib/auth/can.ts
// canWorkDeskNow), so assertCanWorkDesk enforces BOTH "holds the author desk" AND "inside Inisiasi" in
// one gate. Identity is the verified actor; audit lands on the application history.
//
//   • First call → createApplicationDocs mints the MUAP (idempotent: a second call returns the existing
//     linkage, a no-op — a stray double-click never re-mints).
//   • Explicit re-mint (regenerate=true, only when already minted) → regenerateApplicationDocs
//     (RegenerateMuap): snapshots the current docs then copies a fresh MUAP re-grounded in latest facts.
export async function generateMuapForActor(actor: Actor, appId: string, regenerate = false): Promise<LoanApplication> {
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  // Gate: holder of the MUAP-author desk, inside the Inisiasi phase (MUAP-early). Fails closed.
  assertCanWorkDesk(actor, app, 'muap-author')

  const existing = await getDocLinkage(appId)
  const alreadyMinted = Boolean(existing?.muapDocId)
  const opts = { seed: buildSeedContext(app), nasabahName: app.nasabahName, auditUserId: actor.userId, auditUserName: auditUserName(actor) }

  if (regenerate && alreadyMinted) {
    await regenerateApplicationDocs(appId, opts)
  } else {
    await createApplicationDocs(appId, opts)
  }

  // Audit on the application history — distinguish first mint from a re-mint for the OJK trail.
  appendHistory(app, {
    userId: actor.userId,
    userName: auditUserName(actor),
    action: regenerate && alreadyMinted ? 'MUAP dibuat ulang dari template' : 'MUAP dibuat dari template',
    stage: app.stage,
  })
  return saveApplication(app)
}
