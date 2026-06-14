import 'server-only'
import { log, errField } from '@/server/log'
import { dataBackend, readsFromFirestore } from './backend'

// Typed dispatch helpers shared by the repo dispatchers. They route a call to the Prisma or
// Firestore implementation by DATA_BACKEND (server/repo/backend.ts) while preserving the exact
// signature of the implementation (generics, no `any`). The aggregate write seam (./write) uses
// bespoke routing; everything else composes these.

/// Route a READ. Firestore when reading from Firestore (DATA_BACKEND=firestore); Prisma otherwise
/// (prisma + dual both read Prisma authoritatively).
export function dispatchRead<A extends unknown[], R>(
  prismaFn: (...a: A) => Promise<R>,
  firestoreFn: (...a: A) => Promise<R>,
): (...a: A) => Promise<R> {
  return (...a: A) => (readsFromFirestore() ? firestoreFn(...a) : prismaFn(...a))
}

/// Route a WRITE.
///   firestore → Firestore is the sole target.
///   prisma    → Prisma only (today's behavior).
///   dual      → Prisma authoritative + best-effort Firestore shadow (never throws; logged for P4 parity).
export function dispatchWrite<A extends unknown[], R>(
  op: string,
  prismaFn: (...a: A) => Promise<R>,
  firestoreFn: (...a: A) => Promise<R>,
): (...a: A) => Promise<R> {
  return async (...a: A): Promise<R> => {
    if (dataBackend() === 'firestore') return firestoreFn(...a)
    const result = await prismaFn(...a)
    if (dataBackend() === 'dual') {
      try {
        await firestoreFn(...a)
      } catch (e) {
        log.warn('firestore shadow-write failed', { op, ...errField(e) })
      }
    }
    return result
  }
}
