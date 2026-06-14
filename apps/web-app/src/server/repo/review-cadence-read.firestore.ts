import 'server-only'

import type { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { appRef, COL } from '@/server/firebase/collections'
import { toDate } from '@/server/firebase/timestamps'
import type { ReviewDueAnchors, ReviewDueFacility } from './review-cadence-read.prisma'

// Firestore impl of the review-cadence read joins — parity with review-cadence-read.prisma.ts. The
// Prisma application→customer join becomes doc reads: the app root doc carries the date/scalar anchors +
// customerId; the customer's reviewCadenceMonths is fetched from its doc. The list query filters on the
// single inequality `disbursedAt != null` (Firestore allows one inequality), then drops closed apps in
// code; customer cadences are batch-fetched via getAll.

type Data = Record<string, unknown>

function cadenceFromCustomer(d: Data | undefined): number | null {
  return d ? ((d.reviewCadenceMonths as number | null | undefined) ?? null) : null
}

export async function getReviewDueAnchors(appId: string): Promise<ReviewDueAnchors | null> {
  const db = getDb()
  const snap = await appRef(db, appId).get()
  if (!snap.exists) return null
  const a = snap.data() as Data
  const customerId = (a.customerId as string | null | undefined) ?? null
  let reviewCadenceMonths: number | null = null
  if (customerId) {
    const cust = await db.collection(COL.customers).doc(customerId).get()
    reviewCadenceMonths = cadenceFromCustomer(cust.exists ? (cust.data() as Data) : undefined)
  }
  return {
    id: appId,
    disbursedAt: toDate(a.disbursedAt as Timestamp | undefined) ?? null,
    applicationStatus: (a.applicationStatus as string | null | undefined) ?? null,
    reviewCadenceMonths,
  }
}

export async function listReviewDueFacilities(): Promise<ReviewDueFacility[]> {
  const db = getDb()
  // One inequality (disbursedAt != null); closed apps are filtered in code (a 2nd inequality on
  // applicationStatus can't combine with the first in a single Firestore query).
  const snap = await db.collection(COL.applications).where('disbursedAt', '!=', null).get()
  const rows = snap.docs
    .map((s) => ({ id: s.id, d: s.data() as Data }))
    .filter((r) => (r.d.applicationStatus as string | null | undefined) !== 'closed')

  // Batch-fetch the linked customers for the cadence override.
  const customerIds = [...new Set(rows.map((r) => r.d.customerId as string | null | undefined).filter((c): c is string => !!c))]
  const custById = new Map<string, Data>()
  if (customerIds.length) {
    const custSnaps = await db.getAll(...customerIds.map((id) => db.collection(COL.customers).doc(id)))
    for (const cs of custSnaps) if (cs.exists) custById.set(cs.id, cs.data() as Data)
  }

  return rows.map((r) => {
    const customerId = (r.d.customerId as string | null | undefined) ?? null
    return {
      id: r.id,
      nasabahName: (r.d.nasabahName as string | undefined) ?? r.id,
      disbursedAt: toDate(r.d.disbursedAt as Timestamp | undefined) ?? null,
      applicationStatus: (r.d.applicationStatus as string | null | undefined) ?? null,
      reviewCadenceMonths: cadenceFromCustomer(customerId ? custById.get(customerId) : undefined),
    }
  })
}
