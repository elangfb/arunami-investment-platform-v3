'use server'

import { requireActor } from '@/server/auth/session'
import type { Customer } from '@/server/repo/customer'
import type { LoanApplication } from '@/lib/types'
import { updateCustomerContextForActor, updateAppContextForActor } from './ai-context.core'

// Thin 'use server' wrappers for the layered-AI-context "Catatan" editors (RM-led redesign §5 /
// Topic 5). Each resolves the real actor (requireActor) then delegates to the actor-injected core
// (ai-context.core.ts), which holds the attribution + write logic and is server-only (never a public
// server action). The "Catatan" is an OPEN, attributed annotation (Fork A3): any authenticated
// participant may write it, so requireActor() is the only gate. See the core for the full contract
// (writes ONLY the sacred human note; the AUTO derived block is built live, never stored; no PII in
// the audit log).

/** Write the customer-scoped AI-context "Catatan" (Customer.contextMd). Returns the fresh Customer. */
export async function updateCustomerContextAction(customerId: string, catatan: string): Promise<Customer> {
  return updateCustomerContextForActor(await requireActor(), customerId, catatan)
}

/** Write the app-scoped AI-context "Catatan" (Application.contextMd). Returns the fresh application. */
export async function updateAppContextAction(appId: string, catatan: string): Promise<LoanApplication> {
  return updateAppContextForActor(await requireActor(), appId, catatan)
}
