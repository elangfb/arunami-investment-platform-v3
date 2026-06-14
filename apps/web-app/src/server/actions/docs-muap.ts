'use server'

import { requireActor } from '@/server/auth/session'
import { generateMuapForActor } from './docs-muap.core'
import type { LoanApplication } from '@/lib/types'

// Thin 'use server' wrapper for the explicit "Generate MUAP" (N2, ADR-0018). Resolves the real actor
// (requireActor — identity is NEVER from the client) then delegates to the actor-injected core
// (docs-muap.core.ts), which holds the desk + Inisiasi-phase gate and the mint/re-mint logic. The core
// is server-only and NOT a server action, so the actor-trusting entry point is never exposed over the
// wire. See the core for the full design contract.
export async function generateMuapAction(appId: string, regenerate = false): Promise<LoanApplication> {
  return generateMuapForActor(await requireActor(), appId, regenerate)
}
