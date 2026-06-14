import 'server-only'

import { auditUserName, type Actor } from '@/lib/auth/can'
import { appendHistory } from '@/lib/history'
import { log } from '@/server/log'
import { getCustomer, updateCustomerContextMd, type Customer } from '@/server/repo/customer'
import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import type { LoanApplication } from '@/lib/types'

// Actor-injected cores of the layered-AI-context "Catatan" editors (RM-led redesign §5 / Topic 5).
// Kept OUT of the 'use server' module so the actor-trusting entry points are NOT registered as public
// server actions (a forged Actor over the wire); ai-context.ts resolves the real actor (requireActor)
// then delegates here. server-only (never bundled to the client). Mirrors colek-actions.core.ts.
//
// What this writes: ONLY the sacred human "Catatan" — Customer.contextMd (Nasabah-scoped) and
// Application.contextMd (app-scoped). The AUTO derived block is built live at injection
// (lib/ai-context-cascade.ts) and is NEVER stored, so it is not touched here.
//
// Gate (Fork A3): the contextMd "Catatan" is an OPEN, ATTRIBUTED annotation — any authenticated
// participant may write it (NOT desk-scoped). So the gate is simply "is there a real actor", which the
// thin wrapper enforces via requireActor() before delegating here. We attribute every write.
//
// ⚠️ Audit MUST NOT log the note body — the "Catatan" is free-text and can contain PII (server/log.ts
// "never log PII"). We log only the attribution + a length, never the content.

/**
 * Write the customer-scoped "Catatan" (Customer.contextMd). Resolves the customer first (404 → throw),
 * persists the normalised note (blank → NULL), and audits the attribution to the server log (no PII:
 * actor + note length only — a Customer has no HistoryEntry ledger of its own). Returns the fresh
 * Customer aggregate so the caller can refresh its view.
 */
export async function updateCustomerContextForActor(
  actor: Actor,
  customerId: string,
  catatan: string,
): Promise<Customer> {
  const existing = await getCustomer(customerId)
  if (!existing) throw new Error(`Customer ${customerId} not found`)
  const updated = await updateCustomerContextMd(customerId, catatan)
  log.info('ai_context.customer_note_updated', {
    customerId,
    actorId: actor.userId,
    actorName: auditUserName(actor),
    noteChars: updated.contextMd?.length ?? 0,
  })
  return updated
}

/**
 * Write the app-scoped "Catatan" (Application.contextMd) through the canonical load/save aggregate path
 * (loadApplicationForWrite → set field → saveApplication; the round-trip is wired in serialize.ts/
 * write.ts). A blank/whitespace note is normalised to NULL (an empty layer is omitted by the cascade
 * renderer). Audits onto the application's HistoryEntry ledger — attribution only, NO note body (PII).
 * Returns the fresh persisted aggregate.
 */
export async function updateAppContextForActor(
  actor: Actor,
  appId: string,
  catatan: string,
): Promise<LoanApplication> {
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  app.contextMd = catatan.trim() ? catatan : null
  appendHistory(app, {
    userId: actor.userId,
    userName: auditUserName(actor),
    action: 'Catatan konteks AI pengajuan diperbarui',
    stage: app.stage,
  })
  return saveApplication(app)
}
