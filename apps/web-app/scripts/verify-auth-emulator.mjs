// Verifies the SERVER auth path works against the Auth Emulator end-to-end:
// custom token → idToken (emulator REST) → createSessionCookie → verifySessionCookie.
// Proves session.ts works unchanged with the emulator. Run: node scripts/verify-auth-emulator.mjs
// (requires `pnpm emu` running). Standalone — uses firebase-admin directly, not app code.
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const PROJECT = 'demo-mizan'
process.env.FIREBASE_AUTH_EMULATOR_HOST = HOST

const app = initializeApp({ projectId: PROJECT })
const auth = getAuth(app)

const uid = `verify-${Date.now()}`
const email = 'dev@mizan.local'

// 1. mint a custom token (no service account needed in emulator mode)
const customToken = await auth.createCustomToken(uid, { email })

// 2. exchange it for an idToken via the emulator REST API (any apiKey accepted)
const res = await fetch(
  `http://${HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  },
)
if (!res.ok) throw new Error(`signInWithCustomToken failed: ${res.status} ${await res.text()}`)
const { idToken } = await res.json()
if (!idToken) throw new Error('no idToken returned')

// 3. the exact server flow: createSessionCookie → verifySessionCookie (checkRevoked)
const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: 60 * 60 * 1000 })
const decoded = await auth.verifySessionCookie(sessionCookie, true)

if (decoded.uid !== uid) throw new Error(`uid mismatch: ${decoded.uid} !== ${uid}`)
console.log(`OK — session cookie round-trip works against emulator. uid=${decoded.uid}`)
