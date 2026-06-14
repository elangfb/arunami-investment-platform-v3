'use server'

import { requireActor } from '@/server/auth/session'
import { assertDesk } from '@/lib/auth/can'
import { createApplicationForActor, type CreateAppInput } from './application-create.core'
import type { LoanApplication } from '@/lib/types'

export type { CreateAppInput } from './application-create.core'

/// Create a new financing application (AO intake). Thin 'use server' wrapper: resolves +
/// authorizes the actor (intake desk), then delegates to the actor-injected core
/// (application-create.core.ts) which builds the Stage-1 aggregate, customer-first links the
/// first-class Customer (ADR-0020 §2), and persists. The core is server-only and NOT a server
/// action, so the actor-trusting entry point is never exposed over the wire.
export async function createApplicationAction(input: CreateAppInput): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'intake')
  return createApplicationForActor(actor, input)
}
