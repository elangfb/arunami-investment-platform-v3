'use server'

import { requireActor } from '@/server/auth/session'
import { assertDesk } from '@/lib/auth/can'
import { createApprovalRoutingRule } from '@/server/config/approval-routing'
import { parseRoutingMap, type RoutingMap } from '@/lib/approval-routing'
import type { ApprovalChain } from '@/lib/approval-chain'

// Approval-routing admin write action (approval-routing-config.md). Gated on the ADMIN-USERS desk
// (superadmin passes) — routing is an access/SoD concern (who signs which rung), so it sits with
// user administration. Append-only + SoD-pre-validated in createApprovalRoutingRule (rejects a
// self-route / duplicate account / non-checker rung); the engine four-eyes/order stay the final
// backstop. ROUTING never expands authority — it only narrows a configured rung to one account.
export async function createApprovalRoutingRuleAction(
  input: { makerUserId: string; chain: ApprovalChain; routing: Record<string, string> },
  reason?: string,
): Promise<void> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-USERS')

  if (!input.makerUserId?.trim()) throw new Error('Pilih pembuat (maker) yang dirutekan.')
  if (input.chain !== 'muap' && input.chain !== 'rsk') throw new Error('Rantai tidak dikenal.')
  const routing: RoutingMap = parseRoutingMap(input.routing, input.chain)

  await createApprovalRoutingRule({
    makerUserId: input.makerUserId,
    chain: input.chain,
    routing,
    reason: reason?.trim() || undefined,
    createdBy: actor.userId,
  })
}
