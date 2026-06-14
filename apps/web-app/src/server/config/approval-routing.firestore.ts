import 'server-only'
import { COL } from '@/server/firebase/collections'
import { parseRoutingMap } from '@/lib/approval-routing'
import type { ApprovalChain } from '@/lib/approval-chain'
import { fetchVersionedConfigDocs } from './versioned-firestore'
import type { ApprovalRoutingRow, ApprovalRoutingRuleRow } from './approval-routing'

export async function fetchRoutingRows(makerUserId: string, chain: ApprovalChain): Promise<ApprovalRoutingRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_approvalRouting, [
    { field: 'makerUserId', value: makerUserId },
    { field: 'chain', value: chain },
  ])
  return rows.map((d) => ({ version: d.version as number, effectiveFrom: d.effectiveFrom as Date, routing: d.routing }))
}

export async function fetchRoutingRuleRows(): Promise<ApprovalRoutingRuleRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_approvalRouting)
  return rows
    .map((d) => {
      const chain = d.chain as ApprovalChain
      return {
        makerUserId: d.makerUserId as string,
        chain,
        version: d.version as number,
        routing: parseRoutingMap(d.routing, chain),
        effectiveFrom: d.effectiveFrom as Date,
        reason: (d.reason as string | null | undefined) ?? null,
        createdBy: d.createdBy as string,
        createdAt: d.createdAt as Date,
      }
    })
    .sort((a, b) => a.makerUserId.localeCompare(b.makerUserId) || a.chain.localeCompare(b.chain) || b.version - a.version)
}
