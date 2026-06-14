import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { subCol, SUB } from '@/server/firebase/collections'
import { toDate, tsFromDate } from '@/server/firebase/timestamps'
import type { CreateExtractionRunInput, ExtractionRunRow } from './extraction-run.prisma'

// Firestore impl of ExtractionRun — parity with extraction-run.prisma.ts. Append-only run log as a
// subcollection applications/{appId}/extractionRuns/{auto}. Latest-any uses `createdAt desc` (single
// field, auto index). Latest-OK can't express the Prisma `ok==true AND snapshot!=null` + orderBy in one
// Firestore query (an inequality can't combine with an orderBy on another field), so it scans the
// `ok==true, createdAt desc` index (firestore.indexes.json) and returns the first run that has a
// snapshot — identical result, no inequality filter.

const sub = (appId: string) => subCol(getDb(), appId, SUB.extractionRuns)

function snapToRow(appId: string, s: QueryDocumentSnapshot): ExtractionRunRow {
  const d = s.data()
  return {
    applicationId: appId,
    runId: d.runId as string,
    extractedAt: toDate(d.extractedAt) ?? new Date(0),
    ok: d.ok as boolean,
    report: d.report as string,
    snapshot: (d.snapshot as string | null | undefined) ?? null,
    createdAt: toDate(d.createdAt) ?? new Date(0),
  }
}

export async function createExtractionRun(input: CreateExtractionRunInput): Promise<void> {
  await sub(input.applicationId).add({
    applicationId: input.applicationId,
    runId: input.runId,
    extractedAt: tsFromDate(input.extractedAt),
    ok: input.ok,
    report: input.report,
    snapshot: input.snapshot,
    createdAt: FieldValue.serverTimestamp(),
  })
}

export async function getLatestExtractionRun(applicationId: string): Promise<ExtractionRunRow | null> {
  const snap = await sub(applicationId).orderBy('createdAt', 'desc').limit(1).get()
  return snap.empty ? null : snapToRow(applicationId, snap.docs[0])
}

export async function getLatestOkExtractionRun(applicationId: string): Promise<ExtractionRunRow | null> {
  // Page through ok==true runs newest-first and return the first WITH a snapshot. Pagination BOUNDS the
  // per-query read on the append-only log (the Prisma twin's `snapshot != null` filter can't combine
  // with the createdAt orderBy in a single Firestore query). The common case (the latest ok run has a
  // snapshot) returns on the first doc of the first page. Backed by the (ok ASC, createdAt DESC) index.
  const PAGE = 20
  let q = sub(applicationId).where('ok', '==', true).orderBy('createdAt', 'desc').limit(PAGE)
  for (;;) {
    const snap = await q.get()
    if (snap.empty) return null
    for (const s of snap.docs) {
      const row = snapToRow(applicationId, s)
      if (row.snapshot != null) return row
    }
    if (snap.size < PAGE) return null // last page exhausted with no snapshot found
    q = sub(applicationId).where('ok', '==', true).orderBy('createdAt', 'desc').startAfter(snap.docs[snap.docs.length - 1]).limit(PAGE)
  }
}
