'use server'

import { requireActor } from '@/server/auth/session'
import { retryDocShortcutsForActor } from './docs-shortcut.core'

// Thin 'use server' wrapper for the "Coba lagi" shortcut retry (P4-C, ADR-0019 §4). Resolves the real
// actor (requireActor — identity is NEVER from the client) then delegates to the actor-injected core
// (docs-shortcut.core.ts), which holds the participant gate + the retry. The core is server-only and NOT
// a server action, so the actor-trusting entry point is never exposed over the wire.
export async function retryDocShortcutsAction(appId: string): Promise<{ warning?: string }> {
  return retryDocShortcutsForActor(await requireActor(), appId)
}
