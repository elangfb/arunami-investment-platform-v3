'use server'

import { cookies } from 'next/headers'
import { recordImpersonationStart, endImpersonationSessions } from '@/server/repo/impersonation-audit'
import { requireActor, IMPERSONATE_COOKIE } from '@/server/auth/session'
import { AuthzError } from '@/lib/auth/can'
import { DESKS, type Desk } from '@/lib/desks'

// Superadmin-only "Bertindak sebagai…" (impersonation). The target is either a desk
// persona ("desk:<Desk>") or a real user ("user:<id>"). A SEPARATE httpOnly cookie
// carries it; verifySession applies it ONLY when the real session is a superadmin.
// Every start is written to ImpersonationAudit (session-level OJK record); stop stamps
// endedAt. Per-action attribution ("a.n. Superadmin X") is added in the audit trail
// via auditUserName(actor).

// TODO(test): impersonation audit — impersonateAction writes an ImpersonationAudit row
// (superadminId + actedAsDesk|actedAsUserId, endedAt null); stopImpersonationAction stamps
// endedAt; a non-superadmin / already-impersonating actor is rejected (Phase 8).
/** Start impersonating a desk persona or a specific user. */
export async function impersonateAction(target: string, reason?: string): Promise<void> {
  const actor = await requireActor()
  // Only a REAL superadmin (not one already impersonating) may begin.
  if (!actor.isSuperadmin || actor.impersonating) {
    throw new AuthzError('Hanya Superadmin yang dapat menggunakan mode bertindak sebagai.')
  }

  let actedAsDesk: string | null = null
  let actedAsUserId: string | null = null
  if (target.startsWith('desk:')) {
    const desk = target.slice(5)
    if (!DESKS.includes(desk as Desk)) throw new Error('Desk tidak dikenal.')
    actedAsDesk = desk
  } else if (target.startsWith('user:')) {
    actedAsUserId = target.slice(5)
  } else {
    throw new Error('Target tidak valid.')
  }

  await recordImpersonationStart({
    superadminId: actor.userId,
    actedAsDesk,
    actedAsUserId,
    reason: reason?.trim() || null,
  })

  const store = await cookies()
  store.set(IMPERSONATE_COOKIE, target, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

/** Stop impersonating: stamp the open audit row(s) and clear the cookie. */
export async function stopImpersonationAction(): Promise<void> {
  const actor = await requireActor()
  // While impersonating, actor.impersonating holds the real superadmin id; if called
  // without an active impersonation it is a harmless no-op cleanup.
  const realId = actor.impersonating?.realSuperadminId ?? actor.userId
  await endImpersonationSessions(realId)
  const store = await cookies()
  store.delete(IMPERSONATE_COOKIE)
}
