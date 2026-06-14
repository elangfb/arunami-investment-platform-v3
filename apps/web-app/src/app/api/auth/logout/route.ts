import { NextResponse } from 'next/server'
import { clearSession } from '@/server/auth/session'

// GET logout — the recovery path for a PRESENT-but-INVALID session cookie.
//
// proxy.ts is optimistic (cookie present → lets /dashboard through; bounces /login →
// /dashboard), while the (app) layout verifies for real (verifySession() → null →
// redirect away). When a cookie is present but no longer verifies (expired, revoked,
// or its uid maps to no user after a reseed), those two layers disagree forever and
// the browser hits ERR_TOO_MANY_REDIRECTS. The fix is to CLEAR the stale cookie before
// redirecting to /login, so the next request carries no cookie and stays on /login.
//
// Intentionally public + side-effect-safe: it only clears the caller's own session
// cookie (and best-effort revokes their refresh tokens) — there is nothing to gate.
// Lives under /api so proxy.ts (matcher excludes /api) never touches it.
export async function GET(req: Request) {
  await clearSession()
  return NextResponse.redirect(new URL('/login?expired=1', req.url), { status: 303 })
}
