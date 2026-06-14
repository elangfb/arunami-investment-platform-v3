import 'server-only'
import { FieldValue, type Query } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { tsFromDate } from '@/server/firebase/timestamps'
import { isAlreadyExists } from '@/server/repo/errors'

// Generic Firestore "allocate next version + create" for the versioned-config collections — the
// Firestore stand-in for the Prisma `aggregate(_max version) + create` writers. In a transaction:
// read the current max `version` within scope (orderBy version desc limit 1), create the new doc at
// the deterministic docId, retrying on a version collision (deterministic-docId ALREADY_EXISTS is the
// uniqueness backstop). The in-tx orderBy('version','desc') needs the scoped composite index for the
// per-key configs (config_aiPrompt: promptKey+version desc; config_approvalRouting: maker+chain+version desc).
export async function fsAllocateAndCreateVersion(opts: {
  collection: string
  scope?: Record<string, unknown> // scope fields, also written into the doc (e.g. {promptKey} / {makerUserId, chain})
  docId: (version: number) => string
  fields: Record<string, unknown> // config-specific payload (already Firestore-shaped)
  effectiveFrom: Date
  reason: string | null
  createdBy: string
}): Promise<void> {
  const db = getDb()
  const scope = opts.scope ?? {}
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await db.runTransaction(async (tx) => {
        let q: Query = db.collection(opts.collection)
        for (const [k, v] of Object.entries(scope)) q = q.where(k, '==', v)
        const maxSnap = await tx.get(q.orderBy('version', 'desc').limit(1))
        const version = (maxSnap.empty ? 0 : (maxSnap.docs[0].data().version as number)) + 1
        tx.create(db.collection(opts.collection).doc(opts.docId(version)), {
          ...scope,
          ...opts.fields,
          version,
          effectiveFrom: tsFromDate(opts.effectiveFrom),
          reason: opts.reason,
          createdBy: opts.createdBy,
          createdAt: FieldValue.serverTimestamp(),
        })
      })
      return
    } catch (e) {
      if (isAlreadyExists(e) && attempt < 5) continue // version raced — re-read max + retry
      throw e
    }
  }
  throw new Error(`Failed to allocate a config version for ${opts.collection}`)
}
