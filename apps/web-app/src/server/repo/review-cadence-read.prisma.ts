import 'server-only'

import { prisma } from '@/server/db'

// Review-cadence read joins — Prisma impl, routed behind review-cadence-read.ts by DATA_BACKEND; the
// Firestore twin is review-cadence-read.firestore.ts. Resolves a facility's review-cadence anchors: the
// app's DATE/scalar columns + the linked Customer's reviewCadenceMonths override. INVARIANT "Mizan
// records, never monitors" — ONLY dates/scalars are read, never any payment/Kol/balance signal.
// Consumers: server/actions/lineage-read.ts (single) + server/notifications/review-due-notices.ts (list).

export interface ReviewDueAnchors {
  id: string
  disbursedAt: Date | null
  applicationStatus: string | null
  /** The linked customer's cadence override (null = no customer linked OR no override → default 12mo). */
  reviewCadenceMonths: number | null
}

export interface ReviewDueFacility extends ReviewDueAnchors {
  nasabahName: string
}

export async function getReviewDueAnchors(appId: string): Promise<ReviewDueAnchors | null> {
  const row = await prisma.application.findUnique({
    where: { id: appId },
    select: { id: true, disbursedAt: true, applicationStatus: true, customer: { select: { reviewCadenceMonths: true } } },
  })
  if (!row) return null
  return {
    id: row.id,
    disbursedAt: row.disbursedAt ?? null,
    applicationStatus: row.applicationStatus ?? null,
    reviewCadenceMonths: row.customer?.reviewCadenceMonths ?? null,
  }
}

export async function listReviewDueFacilities(): Promise<ReviewDueFacility[]> {
  const rows = await prisma.application.findMany({
    where: { disbursedAt: { not: null }, NOT: { applicationStatus: 'closed' } },
    select: { id: true, nasabahName: true, disbursedAt: true, applicationStatus: true, customer: { select: { reviewCadenceMonths: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    nasabahName: r.nasabahName,
    disbursedAt: r.disbursedAt ?? null,
    applicationStatus: r.applicationStatus ?? null,
    reviewCadenceMonths: r.customer?.reviewCadenceMonths ?? null,
  }))
}
