import 'server-only'

import { assertCanParticipate, type Actor } from '@/lib/auth/can'
import { retryDocShortcuts } from '@/server/docs/mizan-drive'
import { getApplicationDriveFields } from '@/server/repo/application-drive'

// Actor-injected core of the "Coba lagi" shortcut retry (P4-C, ADR-0019 §4). Kept OUT of the 'use server'
// module so the actor-trusting entry point is NOT a public server action (a forged Actor over the wire);
// the thin wrapper (docs-shortcut.ts) resolves requireActor() then delegates here. This split makes the
// gate itest-able with a test Actor (mirrors docs-muap.core.ts).
//
// Gate: a participant who can manage docs (assertCanParticipate — holds a pipeline desk; observers and the
// orthogonal admin desks are read-only). Re-attempts dropping the Mizan-owned generated docs' shortcuts
// into the user's app folder; returns the warning if still 403 (Mizan lacks Editor on the folder), or {}
// when every present doc placed cleanly (the warning is cleared on DocLinkage). Never throws on a Drive
// failure — retryDocShortcuts is best-effort.
export async function retryDocShortcutsForActor(
  actor: Actor,
  appId: string,
): Promise<{ warning?: string }> {
  assertCanParticipate(actor)
  // Defensive existence check so a stray retry against an unknown id is a clear error, not a silent no-op.
  const app = await getApplicationDriveFields(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  return retryDocShortcuts(appId)
}
