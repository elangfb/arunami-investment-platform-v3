import type { ApprovalChain } from '@/lib/approval-chain'
import type { RoutingMap } from '@/lib/approval-routing'

// Demo per-submitter approval routing (approval-routing-config.md) so STRICT routing is demonstrable
// out of the box. The seeded MUAP author (u-002, RM) routes to the demo TL persona; the seeded RSK
// author (u-003, RA) routes to the demo RTL persona — the SAME u-demo-* accounts the seeded chains
// already use, so the existing seeded approvals are consistent with the routing.
//
// PRODUCTION (real, non-seed users) stays UNCONFIGURED → fallback to "all desk holders" until the
// Hijra maker→approver map is populated at W1. Dev-only: written by prisma/seed-dummy.ts (scoped
// replace by maker id), never by the prod-safe seed-config.
export interface DemoRoutingRule {
  makerUserId: string
  chain: ApprovalChain
  routing: RoutingMap
}

export const DEMO_APPROVAL_ROUTING: DemoRoutingRule[] = [
  { makerUserId: 'u-002', chain: 'muap', routing: { 'muap-approve-tl': 'u-demo-tl' } },
  { makerUserId: 'u-003', chain: 'rsk', routing: { 'rsk-approve-rtl': 'u-demo-rtl' } },
]
