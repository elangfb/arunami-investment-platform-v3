import 'server-only'

import { prisma } from '@/server/db'
import { resolveActiveVersion } from '@/lib/config/versioned'
import { parseRoutingMap, validateRoutingConfig, type RoutingMap } from '@/lib/approval-routing'
import type { ApprovalChain } from '@/lib/approval-chain'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { COL } from '@/server/firebase/collections'
import { approvalRoutingDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import * as prismaImpl from './approval-routing.prisma'
import * as firestoreImpl from './approval-routing.firestore'

// Per-submitter approval routing (approval-routing-config.md). Backend-routed readers; the pure
// routing rules + resolveActiveVersion stay in lib. createApprovalRoutingRule (writer) stays
// Prisma-bound (admin-only; documented firestore-mode write gap).

/** Minimal row for resolveActiveVersion (effectiveFrom MUST be a JS Date). */
export interface ApprovalRoutingRow {
  version: number
  effectiveFrom: Date
  routing: unknown
}

export interface ApprovalRoutingRuleRow {
  makerUserId: string
  chain: ApprovalChain
  version: number
  routing: RoutingMap
  effectiveFrom: Date
  reason: string | null
  createdBy: string
  createdAt: Date
}

const fetchRoutingRows = dispatchRead(prismaImpl.fetchRoutingRows, firestoreImpl.fetchRoutingRows)
const fetchRoutingRuleRows = dispatchRead(prismaImpl.fetchRoutingRuleRows, firestoreImpl.fetchRoutingRuleRows)

/** The routing map in force for (maker, chain) at `at`, or null when unconfigured. */
export async function getActiveApprovalRouting(
  makerUserId: string,
  chain: ApprovalChain,
  at: Date = new Date(),
): Promise<RoutingMap | null> {
  const active = resolveActiveVersion(await fetchRoutingRows(makerUserId, chain), at)
  return active ? parseRoutingMap(active.routing, chain) : null
}

/** All routing rules, grouped by (maker, chain), newest version first — for the admin tab's history. */
export async function listApprovalRoutingRules(): Promise<ApprovalRoutingRuleRow[]> {
  return fetchRoutingRuleRows()
}

// Backend-routed writer (allocate next version per (maker,chain) + create). Validation happens in the
// public createApprovalRoutingRule below before this runs.
const writeRoutingRule = dispatchWrite(
  'createApprovalRoutingRule',
  async (makerUserId: string, chain: ApprovalChain, routing: RoutingMap, effectiveFrom: Date, reason: string | null, createdBy: string) => {
    const latest = await prisma.approvalRoutingRule.findFirst({ where: { makerUserId, chain }, orderBy: { version: 'desc' }, select: { version: true } })
    await prisma.approvalRoutingRule.create({
      data: { makerUserId, chain, version: (latest?.version ?? 0) + 1, routing, effectiveFrom, reason, createdBy },
    })
  },
  async (makerUserId: string, chain: ApprovalChain, routing: RoutingMap, effectiveFrom: Date, reason: string | null, createdBy: string) => {
    await fsAllocateAndCreateVersion({
      collection: COL.config_approvalRouting,
      scope: { makerUserId, chain },
      docId: (v) => approvalRoutingDocId(makerUserId, chain, v),
      fields: { routing },
      effectiveFrom,
      reason,
      createdBy,
    })
  },
)

/** Append a new routing version for (maker, chain) (backend-routed). SoD-pre-validated. */
export async function createApprovalRoutingRule(input: {
  makerUserId: string
  chain: ApprovalChain
  routing: RoutingMap
  effectiveFrom?: Date
  reason?: string
  createdBy: string
}): Promise<void> {
  const routing = parseRoutingMap(input.routing, input.chain)
  const problems = validateRoutingConfig(input.chain, input.makerUserId, routing)
  if (problems.length) throw new Error(`Konfigurasi routing tidak valid: ${problems.join(' ')}`)
  await writeRoutingRule(input.makerUserId, input.chain, routing, input.effectiveFrom ?? new Date(), input.reason ?? null, input.createdBy)
}
