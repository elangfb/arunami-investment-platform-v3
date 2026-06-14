import { NextResponse } from 'next/server'
import { createSessionFromIdToken } from '@/server/auth/session'
import { e2eFixturesEnabled } from '@/server/auth/e2e-fixtures'
import { DEMO_LOGINS } from '@/lib/seed-data/demo-logins'

const API_KEY = 'demo-api-key'

function authEmulatorHost(): string {
  return (
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ||
    '127.0.0.1:9099'
  )
}

async function emulatorSignInWithGoogle(input: { sub: string; email: string; name: string }): Promise<string> {
  const idToken = JSON.stringify({
    sub: input.sub,
    email: input.email,
    email_verified: true,
    name: input.name,
  })
  const response = await fetch(
    `http://${authEmulatorHost()}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({
        postBody: `id_token=${idToken}&providerId=google.com`,
        requestUri: 'http://localhost',
        returnSecureToken: true,
      }),
    },
  )
  const json = (await response.json().catch(() => ({}))) as { idToken?: string; error?: { message?: string } }
  if (!response.ok || !json.idToken) {
    throw new Error(json.error?.message ?? `Auth emulator sign-in failed (${response.status})`)
  }
  return json.idToken
}

export async function POST(request: Request) {
  if (!e2eFixturesEnabled()) return new NextResponse('Not found', { status: 404 })

  const body = (await request.json().catch(() => ({}))) as { persona?: string; email?: string }
  const wanted = (body.email ?? body.persona ?? '').trim().toLowerCase()
  if (!wanted) return NextResponse.json({ error: 'Missing persona/email' }, { status: 400 })

  const persona = DEMO_LOGINS.find(
    (d) => d.email.toLowerCase() === wanted || d.name.toLowerCase() === wanted,
  )
  if (!persona) return NextResponse.json({ error: `Unknown demo persona: ${wanted}` }, { status: 404 })

  try {
    const idToken = await emulatorSignInWithGoogle(persona)
    await createSessionFromIdToken(idToken)
    return NextResponse.json({ ok: true, email: persona.email, name: persona.name })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unable to create E2E session' },
      { status: 500 },
    )
  }
}
