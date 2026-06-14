import 'server-only'

import { listPendingColeksForUser } from '@/server/repo/colek'
import type { ColekNotice } from '@/lib/notifications'
import type { LoanApplication } from '@/lib/types'

// Server resolver for the actor's open COLEK notices (cross-desk work requests directed at them).
// Reads the actor's pending/in_progress coleks (listPendingColeksForUser) and joins each to its app's
// nasabahName — ColekRow carries no nasabahName, so the caller supplies the apps it already loaded (a
// map, no extra query). The /notifications page + the sidebar badge both call this, so they never
// disagree (same single-source pattern as mentions/approvals — V1 notifications stay DERIVED, no store).
export async function listColekNotices(userId: string, apps: LoanApplication[]): Promise<ColekNotice[]> {
  const coleks = await listPendingColeksForUser(userId)
  if (coleks.length === 0) return []
  const nameById = new Map(apps.map((a) => [a.id, a.nasabahName]))
  return coleks.map((c) => ({
    colekId: c.id,
    appId: c.applicationId,
    nasabahName: nameById.get(c.applicationId) ?? c.applicationId,
    targetDesk: c.targetDesk,
    requestedByName: c.requestedByName,
    description: c.description,
    at: c.createdAt,
  }))
}
