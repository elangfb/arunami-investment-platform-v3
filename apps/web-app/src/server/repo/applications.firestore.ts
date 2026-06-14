import 'server-only'
import { cache } from 'react'
import type { Timestamp } from 'firebase-admin/firestore'
import type { LoanApplication } from '@/lib/types'
import type { MentionNotice } from '@/lib/notifications'
import { getDb } from '@/server/firebase/firestore'
import { COL, SUB, appRef } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import { loadApplicationDoc, latestCheckpoint } from './serialize.firestore'
import type { CommitteeAgendaCandidate, ApplicationFolderRef } from './applications.prisma'
import { listMeetings } from './meetings'
import { meetingForApp } from '@/lib/komite'
import { getActiveSlaTargets } from '@/server/config/sla'
import { getActiveRiskPolicy } from '@/server/config/risk-policy'
import { getActiveDisbursementConditions } from '@/server/config/disbursement'

// Firestore impl of the application READ paths — parity with applications.prisma.ts. Wrapped in
// React cache() (same per-request dedupe as the Prisma seam). getApplication carries the checkpoint
// + the live config/meeting enrichment; listApplications is the bare loader (NO checkpoint) with
// config resolved ONCE for the whole list (critique #13).

type Data = Record<string, unknown>

/// Load one application aggregate (root + 6 subcollections) + its checkpoint + live enrichment.
export const getApplication = cache(async (id: string): Promise<LoanApplication | null> => {
  const db = getDb()
  const app = await loadApplicationDoc(db, id, await latestCheckpoint(db, id))
  if (!app) return null
  // Resolve the committee meeting (if any), SLA targets, risk policy, release conditions — all live
  // from versioned config (recompute-live for in-flight apps), exactly like the Prisma loader.
  app.scheduledMeeting = meetingForApp(await listMeetings(), id) ?? null
  app.slaTargetDays = (await getActiveSlaTargets())[app.stage]
  app.riskPolicy = await getActiveRiskPolicy()
  app.releaseConditions = await getActiveDisbursementConditions()
  return app
})

const LINEAGE_MAX_DEPTH = 64

/// The review/adendum lineage chain for `appId`, root-first. Walks sourceApplicationId UP to the
/// root; cycle/depth guarded. Mirrors applications.prisma.getLineage.
export async function getLineage(appId: string): Promise<LoanApplication[]> {
  const chain: LoanApplication[] = []
  const seen = new Set<string>()
  let cursor: string | null = appId
  for (let depth = 0; cursor && depth < LINEAGE_MAX_DEPTH; depth++) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const app: LoanApplication | null = await getApplication(cursor)
    if (!app) break
    chain.push(app)
    cursor = app.sourceApplicationId ?? null
  }
  return chain.reverse()
}

/// The HEAD of a lineage (most-recent app = current terms). Walks DOWN derived edges (children whose
/// sourceApplicationId == cursor, newest createdAt). Mirrors applications.prisma.lineageHead.
export async function lineageHead(appId: string): Promise<LoanApplication | null> {
  const db = getDb()
  let head: LoanApplication | null = await getApplication(appId)
  if (!head) return null
  const seen = new Set<string>([appId])
  for (let depth = 0; depth < LINEAGE_MAX_DEPTH; depth++) {
    const childSnap = await db
      .collection(COL.applications)
      .where('sourceApplicationId', '==', head.id)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get()
    if (childSnap.empty) break
    const childId = childSnap.docs[0].id
    if (seen.has(childId)) break
    seen.add(childId)
    const childApp = await getApplication(childId)
    if (!childApp) break
    head = childApp
  }
  return head
}

/// Load all applications (list/kanban/portfolio). Checkpoint omitted to avoid N+1; SLA + risk policy
/// resolved ONCE and applied to each (critique #13). NOTE: each app re-reads its root + 6
/// subcollections (Firestore has no JOIN) — the documented per-doc read cost of the list view.
export const listApplications = cache(async (): Promise<LoanApplication[]> => {
  const db = getDb()
  const rootSnap = await db.collection(COL.applications).orderBy('createdAt', 'asc').get()
  const [slaTargets, riskPolicy] = await Promise.all([getActiveSlaTargets(), getActiveRiskPolicy()])
  const loaded = await Promise.all(rootSnap.docs.map((d) => loadApplicationDoc(db, d.id)))
  return loaded
    .filter((a): a is LoanApplication => a !== null)
    .map((app) => {
      app.slaTargetDays = slaTargets[app.stage]
      app.riskPolicy = riskPolicy
      return app
    })
})

/// Stage-5 committee-scheduling candidates NOT already on a proposed/upcoming meeting agenda — the
/// daily materializer's pool. Mirrors applications.prisma.listUnscheduledCommitteeCandidates. The
/// anti-join is computed in code: read stage-5 docs, subtract the union of agendaAppIds across all
/// proposed/upcoming meetings. Secondary predicates (riskRecommendation != reject, komiteDecision
/// null) are applied in memory — the stage-5 set is the small committee queue, so this is cheap and
/// needs no extra composite index. Ordered (enteredStageAt asc, id asc) to match Prisma's packing.
export async function listUnscheduledCommitteeCandidates(): Promise<CommitteeAgendaCandidate[]> {
  const db = getDb()
  const [candSnap, meetSnap] = await Promise.all([
    db.collection(COL.applications).where('stage', '==', 5).get(),
    db.collection(COL.meetings).where('status', 'in', ['proposed', 'upcoming']).get(),
  ])
  const scheduled = new Set<string>()
  for (const m of meetSnap.docs) {
    for (const id of ((m.data() as Data).agendaAppIds as string[] | undefined) ?? []) scheduled.add(id)
  }
  const eligible = candSnap.docs
    .map((d) => ({ id: d.id, data: d.data() as Data }))
    .filter(({ data }) => (data.riskRecommendation ?? null) !== 'reject')
    .filter(({ data }) => (data.komiteDecision ?? null) === null)
    .filter(({ id }) => !scheduled.has(id))
    .map(({ id, data }) => ({
      id,
      requestedPlafond: Number(data.requestedPlafond ?? 0),
      akadType: (data.akadType as string | undefined) ?? '',
      entered: toDate(data.enteredStageAt as Timestamp | undefined)?.getTime() ?? 0,
    }))
  eligible.sort((a, b) => a.entered - b.entered || a.id.localeCompare(b.id))
  return eligible.map(({ id, requestedPlafond, akadType }) => ({ id, requestedPlafond, akadType }))
}

/// Discussion @mentions awaiting `userId` — the most-recent UNANSWERED mention per application, which
/// self-resolves once they reply. Mirrors applications.prisma.listUnansweredMentions via a
/// collection-group query over conversation (needs the denormalized applicationId field).
export async function listUnansweredMentions(userId: string): Promise<MentionNotice[]> {
  if (!userId) return []
  const db = getDb()
  const mentionedSnap = await db
    .collectionGroup(SUB.conversation)
    .where('surface', '==', 'discussion')
    .where('mentions', 'array-contains', userId)
    .orderBy('seq', 'desc')
    .get()
  if (mentionedSnap.empty) return []

  const mentioned = mentionedSnap.docs.map((d) => {
    const x = d.data() as Data
    return {
      applicationId: x.applicationId as string,
      seq: x.seq as number,
      authorName: (x.authorName as string | null | undefined) ?? null,
      content: x.content as string,
      at: toDate(x.createdAt as Timestamp | undefined) ?? new Date(0),
    }
  })
  const appIds = [...new Set(mentioned.map((m) => m.applicationId))]

  // The highest seq this user authored in each thread → "replied since the mention".
  const repliedSeq = new Map<string, number>()
  await Promise.all(
    appIds.map(async (appId) => {
      const s = await appRef(db, appId)
        .collection(SUB.conversation)
        .where('surface', '==', 'discussion')
        .where('authorId', '==', userId)
        .orderBy('seq', 'desc')
        .limit(1)
        .get()
      repliedSeq.set(appId, s.empty ? -1 : (s.docs[0].data().seq as number))
    }),
  )

  const appSnaps = await db.getAll(...appIds.map((id) => appRef(db, id)))
  const nameById = new Map(appSnaps.map((s) => [s.id, ((s.data() as Data | undefined)?.nasabahName as string) ?? s.id]))

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
      at: m.at,
    })
  }
  return notices
}

/** The linked Customer id for an application (read off the app root doc), or null. */
export async function getApplicationCustomerId(appId: string): Promise<string | null> {
  const snap = await appRef(getDb(), appId).get()
  if (!snap.exists) return null
  return ((snap.data() as Data).customerId as string | null | undefined) ?? null
}

/** Total application count via a Firestore count() aggregation. */
export async function countApplications(): Promise<number> {
  const agg = await getDb().collection(COL.applications).count().get()
  return agg.data().count
}

/** Apps with a Mizan-owned generated-doc folder set — parity with the Prisma `mizanDocFolderId:{not:null}`
 *  read. Firestore `!= null` returns docs where the field exists and is non-null (write.firestore always
 *  writes the field as null|string, so this is exactly "folder set"). */
export async function listApplicationsWithMizanFolder(): Promise<ApplicationFolderRef[]> {
  const snap = await getDb()
    .collection(COL.applications)
    .where('mizanDocFolderId', '!=', null)
    .select('mizanDocFolderId')
    .get()
  return snap.docs.map((s) => ({ id: s.id, mizanDocFolderId: (s.data() as Data).mizanDocFolderId as string }))
}
