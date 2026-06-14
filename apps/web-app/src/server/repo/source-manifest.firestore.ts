import 'server-only'
import type { Timestamp, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { toDate, tsFromDate } from '@/server/firebase/timestamps'
import { manifestDocId } from './doc-ids'
import type { ManifestScope, ScanEntryInput, SourceDocManifestRow } from './source-manifest.prisma'

// Firestore impl of the source-doc manifest repo — parity with source-manifest.prisma.ts. Content-
// addressed: docId = manifestDocId(scope, docType, sha256), so a re-scan of unchanged bytes maps to
// the SAME doc (dedupe). `added`/`deduped` are computed from a pre-read Set (critique #20: a
// WriteBatch is all-or-nothing, so we stage only NON-existing creates rather than relying on
// collision detection). scannedAt is strictly-increasing within a call for a stable listManifest order.

type Data = Record<string, unknown>

function scopeField(scope: ManifestScope): { field: 'applicationId' | 'customerId'; value: string } {
  return 'applicationId' in scope ? { field: 'applicationId', value: scope.applicationId } : { field: 'customerId', value: scope.customerId }
}
function scopeColumns(scope: ManifestScope): { applicationId: string | null; customerId: string | null } {
  return 'applicationId' in scope ? { applicationId: scope.applicationId, customerId: null } : { applicationId: null, customerId: scope.customerId }
}

function snapToManifest(s: QueryDocumentSnapshot): SourceDocManifestRow {
  const d = s.data() as Data
  return {
    id: s.id,
    applicationId: (d.applicationId as string | null | undefined) ?? null,
    customerId: (d.customerId as string | null | undefined) ?? null,
    docType: d.docType as string,
    fullPath: d.fullPath as string,
    sha256: d.sha256 as string,
    fileId: (d.fileId as string | null | undefined) ?? null,
    driveRevisionId: (d.driveRevisionId as string | null | undefined) ?? null,
    scannedAt: toDate(d.scannedAt as Timestamp | undefined) ?? new Date(0),
    scannedBy: d.scannedBy as string,
  }
}

export async function appendScanEntries(
  scope: ManifestScope,
  scannedBy: string,
  entries: ScanEntryInput[],
): Promise<{ added: number; deduped: number }> {
  if (entries.length === 0) return { added: 0, deduped: 0 }
  const db = getDb()
  const sf = scopeField(scope)
  const existing = await db.collection(COL.sourceManifest).where(sf.field, '==', sf.value).select('docType', 'sha256').get()
  const seen = new Set(existing.docs.map((d) => `${d.data().docType} ${d.data().sha256}`))

  const cols = scopeColumns(scope)
  const toInsert: ScanEntryInput[] = []
  let deduped = 0
  for (const e of entries) {
    const key = `${e.docType} ${e.sha256}`
    if (seen.has(key)) {
      deduped++
      continue
    }
    seen.add(key) // also dedupe duplicate inputs within this call
    toInsert.push(e)
  }

  // Strictly-increasing scannedAt (base+i) so listManifest's scannedAt-asc order is stable; chunk to
  // stay under the 500-write batch cap.
  const base = Date.now()
  for (let off = 0; off < toInsert.length; off += 450) {
    const batch = db.batch()
    toInsert.slice(off, off + 450).forEach((e, j) => {
      const i = off + j
      batch.create(db.collection(COL.sourceManifest).doc(manifestDocId(scope, e.docType, e.sha256)), {
        ...cols,
        docType: e.docType,
        fullPath: e.fullPath,
        sha256: e.sha256,
        fileId: e.fileId ?? null,
        driveRevisionId: e.driveRevisionId ?? null,
        scannedBy,
        scannedAt: tsFromDate(new Date(base + i)),
      })
    })
    await batch.commit()
  }
  return { added: toInsert.length, deduped }
}

export async function listManifest(scope: ManifestScope): Promise<SourceDocManifestRow[]> {
  const db = getDb()
  const sf = scopeField(scope)
  const snap = await db.collection(COL.sourceManifest).where(sf.field, '==', sf.value).orderBy('scannedAt', 'asc').get()
  return snap.docs.map(snapToManifest)
}

export async function latestPerDocType(scope: ManifestScope): Promise<Map<string, SourceDocManifestRow>> {
  const rows = await listManifest(scope) // scannedAt asc
  const head = new Map<string, SourceDocManifestRow>()
  for (const row of rows) head.set(row.docType, row) // later (newer) wins
  return head
}
