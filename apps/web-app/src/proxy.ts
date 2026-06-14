import { NextResponse, type NextRequest } from 'next/server'

// Optimistic, cookie-PRESENCE-only route guard (Next 16 "proxy" = the former
// middleware). Runs on every request incl. prefetches, so it MUST NOT touch the DB
// or the Firebase Admin SDK — it only checks whether a session cookie exists. Real
// verification (validity, revocation, desks) happens in the cached verifySession()
// DAL at the page/layout/action layer. See node_modules/next/.../16-proxy.md.

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'mizan-session'

// Public routes reachable without a session. Everything else under the matcher is
// protected. (/awaiting-access still requires a session — you log in first, then
// land there if you have zero grants.)
const PUBLIC_PATHS = ['/login']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const hasSession = req.cookies.has(SESSION_COOKIE)
  const isPublic = PUBLIC_PATHS.includes(pathname)

  // Authenticated user hitting /login → send to the dashboard.
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  // Unauthenticated user hitting a protected route → send to /login.
  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

// Run on all routes except API, Next internals, and static files.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
}
