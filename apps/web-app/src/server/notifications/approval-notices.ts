import 'server-only'

import { listApprovalRoutingRules } from '@/server/config/approval-routing'
import { resolveActiveVersion } from '@/lib/config/versioned'
import { type RoutingMap } from '@/lib/approval-routing'
import { awaitingApprovalNotices, type ApprovalActorView } from '@/lib/approval-notify'
import type { ApprovalNotice } from '@/lib/notifications'
import type { LoanApplication } from '@/lib/types'

// Server resolver for the actor's awaiting-signature approval notices. Loads ALL routing rules once,
// resolves the active version per (maker, chain) in memory (avoids N queries on a hot path), then the
// pure resolver (lib/approval-notify) decides which apps await THIS actor's signature. The /notifications
// page + the sidebar badge both call this, so they never disagree (same single-source pattern as mentions).
export async function listAwaitingApprovalNotices(
  apps: LoanApplication[],
  actor: ApprovalActorView,
): Promise<ApprovalNotice[]> {
  // Backend-aware: routing is already parsed to a RoutingMap by the config repo (no re-parse needed).
  const rules = await listApprovalRoutingRules()
  const now = new Date()
  const byGroup = new Map<string, typeof rules>()
  for (const r of rules) {
    const key = `${r.makerUserId}|${r.chain}`
    const arr = byGroup.get(key)
    if (arr) arr.push(r)
    else byGroup.set(key, [r])
  }
  const active = new Map<string, RoutingMap>()
  for (const [key, rows] of byGroup) {
    const resolved = resolveActiveVersion(rows, now)
    if (resolved) active.set(key, resolved.routing)
  }
  return awaitingApprovalNotices(apps, actor, (maker, chain) => active.get(`${maker}|${chain}`) ?? null)
}
