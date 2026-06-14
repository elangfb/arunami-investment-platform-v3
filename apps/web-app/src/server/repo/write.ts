import 'server-only'
import type { LoanApplication } from '@/lib/types'
import { log, errField } from '@/server/log'
import { dataBackend, readsFromFirestore } from './backend'
import * as prismaImpl from './write.prisma'
import * as firestoreImpl from './write.firestore'

// Application write seam — dispatcher. Routes each call to the Prisma or Firestore
// implementation by DATA_BACKEND (server/repo/backend.ts):
//   prisma    → Prisma only (default; today's behavior)
//   firestore → Firestore only (post-cutover)
//   dual      → Prisma authoritative + Firestore shadow-write (best-effort; mismatches logged)
// Callers keep importing '@/server/repo/write' unchanged — the seam is invisible to them.

// Re-exported so the callers that import it from here (e.g. approval.ts) are unaffected by the
// move to ./errors (shared by both backend impls).
export { ConcurrencyError } from './errors'

/// Best-effort Firestore shadow-write used in `dual` mode: never throws (the Prisma write is the
/// authoritative result), only logs divergence so P4 parity can drive mismatches to zero.
async function shadow(op: string, appId: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    log.warn('firestore shadow-write failed', { op, appId, ...errField(e) })
  }
}

export async function loadApplicationForWrite(id: string): Promise<LoanApplication | null> {
  return readsFromFirestore()
    ? firestoreImpl.loadApplicationForWrite(id)
    : prismaImpl.loadApplicationForWrite(id)
}

export async function saveApplication(app: LoanApplication): Promise<LoanApplication> {
  if (dataBackend() === 'firestore') return firestoreImpl.saveApplication(app)
  const result = await prismaImpl.saveApplication(app)
  if (dataBackend() === 'dual') await shadow('saveApplication', app.id, () => firestoreImpl.saveApplication(app))
  return result
}

export async function appendConversationMessages(opts: {
  appId: string
  expectedVersion: number
  surface: 'discussion' | 'assistant'
  messages: Array<{ role: 'user' | 'assistant'; content: string; authorId?: string | null; authorName?: string | null; mentions?: string[] }>
  audit?: { userId: string; userName: string; action: string; stage: number; reason?: string }
}): Promise<LoanApplication> {
  if (dataBackend() === 'firestore') return firestoreImpl.appendConversationMessages(opts)
  const result = await prismaImpl.appendConversationMessages(opts)
  if (dataBackend() === 'dual') await shadow('appendConversationMessages', opts.appId, () => firestoreImpl.appendConversationMessages(opts))
  return result
}

export async function createApplication(app: LoanApplication, link?: { customerId?: string | null }): Promise<LoanApplication> {
  if (dataBackend() === 'firestore') return firestoreImpl.createApplication(app, link)
  const result = await prismaImpl.createApplication(app, link)
  if (dataBackend() === 'dual') await shadow('createApplication', app.id, () => firestoreImpl.createApplication(app, link))
  return result
}
