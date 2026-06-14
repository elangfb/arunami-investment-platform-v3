import 'server-only'
import type { Timestamp, Query } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { toDate } from '@/server/firebase/timestamps'

// Shared Firestore fetch for the single-keyed versioned config collections (config_*). Reads ALL
// docs and converts effectiveFrom/createdAt Timestamp→Date so resolveActiveVersion's .getTime()
// compare is valid (critique #8). Each config's *.firestore sibling calls this then maps the raw
// fields to its row shape. `where` lets the per-scope configs (ai-prompt by key) filter.
export async function fetchVersionedConfigDocs(
  collection: string,
  wheres?: Array<{ field: string; value: unknown }>,
): Promise<Array<Record<string, unknown>>> {
  let q: Query = getDb().collection(collection)
  for (const w of wheres ?? []) q = q.where(w.field, '==', w.value)
  const snap = await q.get()
  return snap.docs.map((s) => {
    const d = s.data()
    return {
      ...d,
      effectiveFrom: toDate(d.effectiveFrom as Timestamp),
      createdAt: d.createdAt != null ? toDate(d.createdAt as Timestamp) : null,
    }
  })
}
