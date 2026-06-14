import 'server-only'
import { cache } from 'react'
import { prisma } from '@/server/db'
import type { LoanApplication } from '@/lib/types'
import type { MentionNotice } from '@/lib/notifications'
import {
  APPLICATION_INCLUDE,
  rowToLoanApplication,
  CHECKPOINT_SELECT,
  toCheckpointRef,
  type CheckpointRef,
} from './serialize'
import { listMeetings } from './meetings'
import { meetingForApp } from '@/lib/komite'
import { getActiveSlaTargets } from '@/server/config/sla'
import { getActiveRiskPolicy } from '@/server/config/risk-policy'
import { getActiveDisbursementConditions } from '@/server/config/disbursement'

async function latestCheckpoint(applicationId: string): Promise<CheckpointRef | null> {
  const cp = await prisma.decisionCheckpoint.findFirst({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
    select: CHECKPOINT_SELECT,
  })
  return toCheckpointRef(cp)
}

/// Load one application aggregate. Wrapped in React cache() so multiple reads in
/// a single render pass dedupe.
export const getApplication = cache(async (id: string): Promise<LoanApplication | null> => {
  const row = await prisma.application.findUnique({ where: { id }, include: APPLICATION_INCLUDE })
  if (!row) return null
  const app = rowToLoanApplication(row, await latestCheckpoint(id))
  // Resolve the committee meeting (if any) so stage-5 detail surfaces have the
  // scheduling/composition without re-reading a global store.
  app.scheduledMeeting = meetingForApp(await listMeetings(), id) ?? null
  // Attach the SLA day-target resolved from versioned config (recompute-live: an SLA-policy
  // change applies to in-flight apps immediately; sla-utils falls back to the constant).
  app.slaTargetDays = (await getActiveSlaTargets())[app.stage]
  // Same recompute-live treatment for the risk-policy thresholds so every gate chip / gap-check
  // / narrative on the detail page reads the active DSR/LTV/Kol max — not a hardcoded 40/70/1.
  app.riskPolicy = await getActiveRiskPolicy()
  app.releaseConditions = await getActiveDisbursementConditions()
  return app
})

/// P5 (RM-led redesign §7 / Topic 7): the review/adendum LINEAGE chain for `appId`, in CAUSAL order
/// (root → … → this app). Follows sourceApplicationId from the given app up to the ROOT (the original),
/// then returns the chain root-first so the UI can show the "full story". The HEAD (last element) is the
/// MOST RECENT app = "current terms" (use lineageHead). A root/original app returns a single-element
/// chain (itself). Guards against a corrupt cycle by capping the walk depth (LINEAGE_MAX_DEPTH) and
/// tracking visited ids — a cycle/missing-parent stops the walk and returns what was collected so far.
const LINEAGE_MAX_DEPTH = 64
export async function getLineage(appId: string): Promise<LoanApplication[]> {
  const chain: LoanApplication[] = []
  const seen = new Set<string>()
  let cursor: string | null = appId
  for (let depth = 0; cursor && depth < LINEAGE_MAX_DEPTH; depth++) {
    if (seen.has(cursor)) break // cycle guard — corrupt sourceApplicationId loop
    seen.add(cursor)
    const app: LoanApplication | null = await getApplication(cursor)
    if (!app) break // missing parent — stop and return what we have
    chain.push(app)
    cursor = app.sourceApplicationId ?? null
  }
  // Collected this-first (walking UP to the root); reverse to causal order (root → … → this).
  return chain.reverse()
}

/// P5: the HEAD of a lineage = the MOST RECENT app on the facility = "current terms". Given ANY app id
/// in a chain (root, middle, or head), walks DOWN the derived edges (children whose sourceApplicationId
/// is the cursor) to the latest cycle and returns it. A facility re-underwrites linearly (one open
/// review/adendum at a time), so each app has at most one child in practice; if more than one ever
/// exists the most-recently-CREATED child is followed. Same depth + cycle guard as getLineage. Null
/// when the id is unknown. (For the full causal story use getLineage, which walks UP to the root.)
export async function lineageHead(appId: string): Promise<LoanApplication | null> {
  let head: LoanApplication | null = await getApplication(appId)
  if (!head) return null
  const seen = new Set<string>([appId])
  for (let depth = 0; depth < LINEAGE_MAX_DEPTH; depth++) {
    const child: { id: string } | null = await prisma.application.findFirst({
      where: { sourceApplicationId: head.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
    if (!child || seen.has(child.id)) break
    seen.add(child.id)
    const childApp = await getApplication(child.id)
    if (!childApp) break
    head = childApp
  }
  return head
}

/// Load all applications (list/kanban/portfolio/management). Checkpoint ref omitted
/// to avoid N+1 — list surfaces don't read it.
export const listApplications = cache(async (): Promise<LoanApplication[]> => {
  const rows = await prisma.application.findMany({
    include: APPLICATION_INCLUDE,
    orderBy: { createdAt: 'asc' },
  })
  const slaTargets = await getActiveSlaTargets() // resolve once for the whole list
  const riskPolicy = await getActiveRiskPolicy() // resolve once for the whole list
  return rows.map((row) => {
    const app = rowToLoanApplication(row)
    app.slaTargetDays = slaTargets[app.stage]
    app.riskPolicy = riskPolicy
    return app
  })
})

/// A stage-5 application eligible for committee scheduling — the materializer's candidate shape.
/// requestedPlafond is a plain number (IDR ≪ 2^53) so the type is backend-agnostic (Prisma bigint
/// is narrowed here; Firestore already stores a number).
export type CommitteeAgendaCandidate = { id: string; requestedPlafond: number; akadType: string }

/// Stage-5 applications eligible for committee scheduling that are NOT already on a proposed/upcoming
/// meeting agenda — the daily materializer's candidate pool, ordered (enteredStageAt asc, id asc) so
/// agenda packing is deterministic. The `meetingAgendaItems:{none:…}` anti-join excludes anything
/// already booked. Mirrored by applications.firestore.listUnscheduledCommitteeCandidates.
export async function listUnscheduledCommitteeCandidates(): Promise<CommitteeAgendaCandidate[]> {
  const rows = await prisma.application.findMany({
    where: {
      stage: 5,
      riskRecommendation: { not: 'reject' },
      komiteDecision: null,
      meetingAgendaItems: { none: { meeting: { status: { in: ['proposed', 'upcoming'] } } } },
    },
    orderBy: [{ enteredStageAt: 'asc' }, { id: 'asc' }],
    select: { id: true, requestedPlafond: true, akadType: true },
  })
  return rows.map((r) => ({ id: r.id, requestedPlafond: Number(r.requestedPlafond), akadType: r.akadType }))
}

/// Discussion @mentions awaiting `userId`'s attention (MentionUser). Returns the most-recent
/// UNANSWERED mention per application: a `surface='discussion'` message whose `mentions` array
/// contains `userId`, with NO later message (higher seq) authored by `userId` in that thread — so
/// it self-resolves once they reply. Derived from ConversationMessage rows; no separate store.
export async function listUnansweredMentions(userId: string): Promise<MentionNotice[]> {
  if (!userId) return []
  const mentioned = await prisma.conversationMessage.findMany({
    where: { surface: 'discussion', mentions: { has: userId } },
    select: { applicationId: true, seq: true, authorName: true, content: true, createdAt: true },
    orderBy: { seq: 'desc' },
  })
  if (mentioned.length === 0) return []
  const appIds = [...new Set(mentioned.map((m) => m.applicationId))]
  // The highest seq this user has authored in each thread → "replied since the mention".
  const myLatest = await prisma.conversationMessage.groupBy({
    by: ['applicationId'],
    where: { surface: 'discussion', applicationId: { in: appIds }, authorId: userId },
    _max: { seq: true },
  })
  const repliedSeq = new Map(myLatest.map((r) => [r.applicationId, r._max.seq ?? -1]))
  const apps = await prisma.application.findMany({ where: { id: { in: appIds } }, select: { id: true, nasabahName: true } })
  const nameById = new Map(apps.map((a) => [a.id, a.nasabahName]))
  const seen = new Set<string>()
  const notices: MentionNotice[] = []
  for (const m of mentioned) {
    // mentioned[] is newest-first, so the first unanswered per app is the most recent.
    if (seen.has(m.applicationId)) continue
    if ((repliedSeq.get(m.applicationId) ?? -1) > m.seq) continue // replied after being mentioned → resolved
    seen.add(m.applicationId)
    notices.push({
      appId: m.applicationId,
      nasabahName: nameById.get(m.applicationId) ?? m.applicationId,
      byName: m.authorName ?? 'Tim',
      preview: m.content.length > 80 ? `${m.content.slice(0, 80)}…` : m.content,
      at: m.createdAt,
    })
  }
  return notices
}

/** A per-application Mizan-owned generated-doc folder (id + folder), for the root-share reparent sweep. */
export interface ApplicationFolderRef {
  id: string
  mizanDocFolderId: string
}

/** The linked Customer id for an application (ADR-0020), or null if not linked / not found. */
export async function getApplicationCustomerId(appId: string): Promise<string | null> {
  const row = await prisma.application.findUnique({ where: { id: appId }, select: { customerId: true } })
  return row?.customerId ?? null
}

/** Total application count — backs the FOS-YYYY-NNN display-id allocation (application-create). */
export async function countApplications(): Promise<number> {
  return prisma.application.count()
}

/** Apps with a Mizan-owned generated-doc folder set — server/docs/root-share.ts reparent step. */
export async function listApplicationsWithMizanFolder(): Promise<ApplicationFolderRef[]> {
  const rows = await prisma.application.findMany({
    where: { mizanDocFolderId: { not: null } },
    select: { id: true, mizanDocFolderId: true },
  })
  return rows
    .filter((r) => r.mizanDocFolderId != null)
    .map((r) => ({ id: r.id, mizanDocFolderId: r.mizanDocFolderId as string }))
}
