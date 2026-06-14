import 'server-only'
import { prisma } from '@/server/db'
import { parseRoutingMap } from '@/lib/approval-routing'
import type { ApprovalChain } from '@/lib/approval-chain'
import type { ApprovalRoutingRow, ApprovalRoutingRuleRow } from './approval-routing'

export async function fetchRoutingRows(makerUserId: string, chain: ApprovalChain): Promise<ApprovalRoutingRow[]> {
  return prisma.approvalRoutingRule.findMany({
    where: { makerUserId, chain },
    select: { version: true, effectiveFrom: true, routing: true },
  }) as Promise<ApprovalRoutingRow[]>
}

export async function fetchRoutingRuleRows(): Promise<ApprovalRoutingRuleRow[]> {
  const rows = await prisma.approvalRoutingRule.findMany({
    orderBy: [{ makerUserId: 'asc' }, { chain: 'asc' }, { version: 'desc' }],
  })
  return rows.map((r) => ({
    makerUserId: r.makerUserId,
    chain: r.chain as ApprovalChain,
    version: r.version,
    routing: parseRoutingMap(r.routing, r.chain as ApprovalChain),
    effectiveFrom: r.effectiveFrom,
    reason: r.reason,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }))
}
