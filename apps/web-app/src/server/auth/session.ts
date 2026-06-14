import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { getAdminAuth } from '@/server/firebase/admin'
import { syncRootGrantForUser } from '@/server/docs/root-share'
import { ensureUser, getUserAccessById, getUserByFirebaseUid } from '@/server/repo/users'
import { ADMIN_DESKS, DESK_CATALOG, DESKS, type Desk } from '@/lib/desks'
import type { Actor } from '@/lib/auth/can'
import { actorTitle } from '@/lib/auth/actor-title'

// The session DAL (Data Access Layer). The single server-authoritative boundary for
// "who is acting": reads the httpOnly session cookie, verifies it with Firebase Admin,
// resolves the Mizan user + effective desks, and returns an Actor. Cached per render
// pass so layout + page + leaf components share ONE verification. proxy.ts does only
// an optimistic cookie-presence check; real verification happens HERE.

export const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'mizan-session'
/** Separate cookie carrying the impersonation target ("desk:<Desk>" | "user:<id>").
 *  Honored ONLY when the real session belongs to a superadmin (Phase 5). */
export const IMPERSONATE_COOKIE = process.env.IMPERSONATE_COOKIE_NAME ?? 'mizan-impersonate'

// Firebase session cookies max out at 14 days.
const SESSION_EXPIRES_MS = 14 * 24 * 60 * 60 * 1000

// A real superadmin (not impersonating) is workflow-READ-ONLY: it holds the cross-cutting ADMIN-*
// desks (console power) + MG (observer view), but NO pipeline desks — so the can.ts gates deny every
// workflow action. To act on the pipeline a superadmin impersonates a real desk/user. This is the
// ONLY place the superadmin desk set is defined.
const SUPERADMIN_DESKS: Desk[] = [...ADMIN_DESKS, 'MG']

/**
 * Resolve an impersonation target into the Actor a superadmin acts AS. The target is
 * either a desk persona ("desk:legal" → a synthetic identity holding exactly that desk)
 * or a real user ("user:<id>" → that user's effective desks). The result is NOT a
 * superadmin (the whole point is to exercise a narrower identity), and carries
 * `impersonating` so the banner + audit trail attribute the real superadmin.
 */
async function resolveImpersonation(real: Actor, raw: string): Promise<Actor | null> {
  const via = { realSuperadminId: real.userId, realName: real.name }
  if (raw.startsWith('desk:')) {
    const desk = raw.slice(5) as Desk
    if (!DESKS.includes(desk)) return null
    const label = DESK_CATALOG.find((d) => d.desk === desk)?.label ?? desk
    return {
      userId: `desk:${desk}`,
      name: `Desk ${label}`,
      avatarInitials: desk.replace(/[^A-Z]/g, '').slice(0, 2) || 'DK',
      title: label,
      desks: [desk],
      isSuperadmin: false,
      impersonating: via,
    }
  }
  if (raw.startsWith('user:')) {
    const target = await getUserAccessById(raw.slice(5))
    if (!target) return null
    return {
      userId: target.id,
      name: target.name,
      avatarInitials: target.avatarInitials,
      title: actorTitle(target),
      desks: target.isSuperadmin ? [...SUPERADMIN_DESKS] : target.desks,
      isSuperadmin: false,
      impersonating: via,
    }
  }
  return null
}

/**
 * Exchange a client Google ID token for an httpOnly session cookie. Verifies the
 * token, provisions/loads the Mizan user (first-login → zero grants), then mints and
 * sets the session cookie. Called from POST /api/auth/session.
 */
export async function createSessionFromIdToken(idToken: string): Promise<void> {
  const decoded = await getAdminAuth().verifyIdToken(idToken)
  const user = await ensureUser({
    email: decoded.email ?? null,
    firebaseUid: decoded.uid,
    name: decoded.name ?? null,
    picture: decoded.picture ?? null,
  })
  // ADR-0019 §3 (V1): converge this user's Drive root-share to their CURRENT access — an ADMITTED
  // user (superadmin or ≥1 effective desk, the same boundary as the in-app awaiting-access wall)
  // gets a 'reader' grant on the root "Mizan" Drive folder; a zero-desk "awaiting access" or
  // since-offboarded account gets any stale grant REVOKED (login backstops the admin-action hook
  // and the reconcile sweep). Non-blocking: scheduled post-response via after() so login latency
  // never rides a Drive round-trip, with a tight retry budget ({ retries: 1 }) so even the
  // background task doesn't burn the full backoff during an outage (the reconcile sweep keeps the
  // full budget). syncRootGrantForUser never throws.
  const syncRootRead = () => syncRootGrantForUser(user.id, { retry: { retries: 1 } })
  try {
    after(syncRootRead)
  } catch {
    // Outside a request scope (shouldn't happen on the login route) — still fire-and-forget.
    void syncRootRead()
  }
  const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_MS,
  })
  const store = await cookies()
  store.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_EXPIRES_MS / 1000,
  })
}

/**
 * Verify the current session and resolve the full Actor, or null if unauthenticated.
 * Cached for the render pass. Superadmin gets the full desk set (§3 resolution rule).
 * Impersonation (Phase 5): when the REAL user is a superadmin and the impersonation
 * cookie is set, the returned Actor is the impersonated identity (narrower desks,
 * isSuperadmin=false) carrying `impersonating` for the banner + audit attribution.
 */
// TODO(test): verifySession — valid cookie → Actor (superadmin → full DESKS); no/invalid
// cookie → null; impersonation override applies ONLY for a real superadmin and yields a
// narrower Actor with isSuperadmin=false + impersonating set. Needs Admin-SDK mocking (P8).
export const verifySession = cache(async (): Promise<Actor | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value
  if (!cookie) return null
  try {
    // checkRevoked = true: a revoked/rotated session is rejected even if unexpired.
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true)
    const user = await getUserByFirebaseUid(decoded.uid)
    if (!user) return null
    const real: Actor = {
      userId: user.id,
      name: user.name,
      avatarInitials: user.avatarInitials,
      title: actorTitle(user),
      desks: user.isSuperadmin ? [...SUPERADMIN_DESKS] : user.desks,
      isSuperadmin: user.isSuperadmin,
    }
    // Impersonation override — ONLY a real superadmin may impersonate.
    if (user.isSuperadmin) {
      const raw = (await cookies()).get(IMPERSONATE_COOKIE)?.value
      if (raw) {
        const impersonated = await resolveImpersonation(real, raw)
        if (impersonated) return impersonated
      }
    }
    return real
  } catch {
    // Invalid/expired/revoked cookie → treat as unauthenticated.
    return null
  }
})

/** verifySession() or bounce. Use in protected RSC entry points. A null actor here
 *  means a present-but-invalid cookie (proxy.ts already redirects cookie-less requests),
 *  so route through /api/auth/logout to CLEAR it — redirecting straight to /login would
 *  loop against proxy's /login → /dashboard bounce (ERR_TOO_MANY_REDIRECTS). */
export async function requireActor(): Promise<Actor> {
  const actor = await verifySession()
  if (!actor) redirect('/api/auth/logout')
  return actor
}

/** Clear the session cookie and best-effort revoke the user's refresh tokens. */
export async function clearSession(): Promise<void> {
  const store = await cookies()
  const cookie = store.get(SESSION_COOKIE)?.value
  if (cookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(cookie)
      await getAdminAuth().revokeRefreshTokens(decoded.sub)
    } catch {
      // Already invalid — nothing to revoke.
    }
  }
  store.delete(SESSION_COOKIE)
}
