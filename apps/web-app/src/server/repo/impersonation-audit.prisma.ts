import 'server-only'

import { prisma } from '@/server/db'

// Impersonation-audit persistence — Prisma impl, routed behind the dispatcher (impersonation-audit.ts)
// by DATA_BACKEND; the Firestore twin is impersonation-audit.firestore.ts. The session-level OJK
// record for the superadmin "Bertindak sebagai…" (impersonation) mode: one append-only row per START
// (endedAt null), stamped endedAt on STOP. Per-action attribution is separate (the audit trail).

export interface ImpersonationStart {
  superadminId: string
  actedAsDesk: string | null
  actedAsUserId: string | null
  reason: string | null
}

/** Append a START row (endedAt null). */
export async function recordImpersonationStart(entry: ImpersonationStart): Promise<void> {
  await prisma.impersonationAudit.create({ data: { ...entry } })
}

/** Stamp endedAt on every still-open session for this real superadmin (idempotent — no open row = no-op). */
export async function endImpersonationSessions(superadminId: string): Promise<void> {
  await prisma.impersonationAudit.updateMany({
    where: { superadminId, endedAt: null },
    data: { endedAt: new Date() },
  })
}
