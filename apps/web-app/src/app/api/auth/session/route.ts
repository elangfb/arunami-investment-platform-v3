import { createSessionFromIdToken, clearSession } from '@/server/auth/session'
import { log, errField } from '@/server/log'

// Session endpoint. POST exchanges a Google ID token (from the client sign-in popup)
// for an httpOnly session cookie; DELETE clears it (logout). Auth/authz for app data
// is enforced separately in the DAL (verifySession) and server actions.

export async function POST(req: Request) {
  let idToken: string | undefined
  try {
    const body = (await req.json()) as { idToken?: string }
    idToken = body?.idToken
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!idToken) return Response.json({ error: 'Missing idToken' }, { status: 400 })

  try {
    await createSessionFromIdToken(idToken)
    return Response.json({ ok: true })
  } catch (e) {
    // Token verification failed — log server-side (Firebase detail stays internal).
    log.warn('auth.session_create_failed', errField(e))
    return Response.json({ error: 'Sesi tidak dapat dibuat. Silakan masuk kembali.' }, { status: 401 })
  }
}

export async function DELETE() {
  await clearSession()
  return Response.json({ ok: true })
}
