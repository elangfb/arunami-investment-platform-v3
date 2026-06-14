import 'server-only'

import { getApplicationCustomerId } from '@/server/repo/applications'
import { getCustomerWithApplications } from '@/server/repo/customer'
import {
  buildAiContextLayers,
  renderCascadeForPolicy,
  type ContextLayers,
  type PriorAppSummary,
} from '@/lib/ai-context-cascade'
import { contextPolicyFor } from '@/lib/ai-context-policy'
import type { AiSurface } from './audit'
import type { LoanApplication } from '@/lib/types'

// Thin SERVER wrapper for the layered-AI-context cascade (RM-led redesign §5 / Topic 5). The PURE
// rendering + layer assembly live in lib/ai-context-cascade.ts; this module performs the ONE DB read
// (the linked Customer's "Catatan" + the nasabah's prior applications for carry-forward) and hands
// already-loaded data to the pure builder. Read once per AI call; the injection sites then render the
// per-surface gated cascade and append it to the END of the user prompt (before maskForEgress).

/**
 * Load + assemble the three context layers for an application: the DERIVED (AUTO) block (built from
 * app facts + prior-deal carry-forward) + the customer-scoped human "Catatan" + the app-scoped human
 * "Catatan". A single DB read resolves the linked Customer (its contextMd) and the nasabah's other
 * apps. When the app has no linked Customer (pre-migration / standalone), only the derived + app-note
 * layers are populated. Never throws on the caller's path beyond the DB call itself.
 */
export async function loadAiContextLayers(app: LoanApplication): Promise<ContextLayers> {
  const customerId = await getApplicationCustomerId(app.id)
  let customerNote: string | null = null
  let priorApps: PriorAppSummary[] = []
  if (customerId) {
    const bundle = await getCustomerWithApplications(customerId)
    if (bundle) {
      customerNote = bundle.customer.contextMd ?? null
      priorApps = bundle.applications.map((a) => ({
        id: a.id,
        akadType: a.akadType,
        requestedPlafond: a.requestedPlafond,
        komiteDecision: a.komiteDecision ?? null,
        applicationStatus: a.applicationStatus ?? null,
      }))
    }
  }
  return buildAiContextLayers(app, customerNote, priorApps)
}

/**
 * Convenience for an injection site: load the layers and render the per-surface gated cascade in one
 * call. Returns '' when the surface gets nothing (extract → all-false) or every granted layer is
 * empty — so the caller can append unconditionally and a no-op adds nothing to the prompt.
 *
 * ⚠️ research: contextPolicyFor grants the CUSTOMER layer only and that text egresses to the public
 * internet — the research site MUST pass REAL piiSecrets to its maskForEgress so the customer
 * "Catatan" PII is masked. extract: all-false, so this returns '' and the extractor stays memory-free.
 */
export async function loadCascadeForSurface(app: LoanApplication, surface: AiSurface): Promise<string> {
  const layers = await loadAiContextLayers(app)
  return renderCascadeForPolicy(layers, contextPolicyFor(surface))
}
