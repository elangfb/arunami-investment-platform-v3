import 'server-only'

import { getApps, initializeApp, cert, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

// Firebase Admin (server-side). Initialised once from a base64-encoded service
// account JSON in FIREBASE_SERVICE_ACCOUNT — VALUE-based, never a filesystem path
// (serverless-safe; secret injected by ops at deploy via Secret Manager).
// Used to verify client ID tokens, mint httpOnly session cookies, and revoke them.

function loadServiceAccount(): {
  projectId: string
  clientEmail: string
  privateKey: string
} {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  return {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key,
  }
}

// Dev-only Auth Emulator: enabled ONLY by NEXT_PUBLIC_USE_AUTH_EMULATOR=1 (mirrors
// lib/firebase/client.ts so the client and server never disagree on emulator mode) or by
// an explicit, server-only FIREBASE_AUTH_EMULATOR_HOST (the var firebase-admin itself
// reads). We deliberately do NOT key off NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST as an
// *enabler*: NEXT_PUBLIC_* values are inlined into the build and conventionally present,
// so treating that host as a trigger would let a leaked client var flip a real deploy
// into credential-skipping emulator mode. It is used below only to resolve the address.
// NEVER triggers in production (flag is off and the host is unset).
function isAuthEmulatorEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_AUTH_EMULATOR === '1' ||
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
}

// Firestore / Storage emulator gating. These read ONLY the server-only standard host vars
// that the Admin SDK itself consults (FIRESTORE_EMULATOR_HOST / STORAGE_EMULATOR_HOST) —
// never a NEXT_PUBLIC_* value — so a build-baked client var can never flip a real deploy into
// credential-skipping emulator mode (same security property the auth gating above preserves).
function isFirestoreEmulatorEnabled(): boolean {
  return !!process.env.FIRESTORE_EMULATOR_HOST
}

function isStorageEmulatorEnabled(): boolean {
  return !!process.env.STORAGE_EMULATOR_HOST || !!process.env.FIREBASE_STORAGE_EMULATOR_HOST
}

// True when ANY Firebase emulator is in use → the Admin app is initialised credential-less
// (projectId only). In a real deploy all of these are unset, so the service-account path runs.
function isEmulatorMode(): boolean {
  return isAuthEmulatorEnabled() || isFirestoreEmulatorEnabled() || isStorageEmulatorEnabled()
}

function configureAuthEmulatorEnv(): void {
  if (!isAuthEmulatorEnabled()) return
  // firebase-admin only looks at FIREBASE_AUTH_EMULATOR_HOST and reads it at call time, so
  // it is enough to set it before getAdminAuth() is first used — no import-ordering tricks
  // are required. Resolve the address from the browser's NEXT_PUBLIC_* host (one config
  // drives both sides), falling back to the default. Precedence: an explicit
  // FIREBASE_AUTH_EMULATOR_HOST wins, as the most specific server-side override.
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??=
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'
}

// Shared Admin App singleton — initialised once and reused by BOTH getAdminAuth() (this file)
// and getDb()/getBucket() (firestore.ts / storage). In emulator mode it is credential-less
// (projectId only); in a real deploy it carries the service-account credential.
export function getAdminApp(): App {
  const existing = getApps()
  if (existing.length) return existing[0]
  if (isEmulatorMode()) {
    configureAuthEmulatorEnv() // no-op unless the auth emulator specifically is enabled
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-mizan' })
  }
  const sa = loadServiceAccount()
  return initializeApp({ credential: cert(sa), projectId: sa.projectId })
}

// Lazy accessor — initialise on first use, NOT at module import. Eager init threw
// `FIREBASE_SERVICE_ACCOUNT is not set` during `next build` (page-data collection imports
// the route modules without runtime secrets). Mirrors the lazy s3()/prisma singletons.
let _adminAuth: ReturnType<typeof getAuth> | undefined
export function getAdminAuth(): ReturnType<typeof getAuth> {
  // Mirror the emulator host into FIREBASE_AUTH_EMULATOR_HOST before the first
  // verify/createSessionCookie call; firebase-admin reads it per call (see useEmulator()
  // in firebase-admin/auth), so this is all the emulator wiring needs.
  configureAuthEmulatorEnv()
  if (!_adminAuth) _adminAuth = getAuth(getAdminApp())
  return _adminAuth
}

// Test-only exports (see admin.test.ts). NOT part of the runtime API — these expose the
// pure emulator-gating logic so the auth-bypass guard can be asserted hermetically.
export const __isAuthEmulatorEnabled = isAuthEmulatorEnabled
export const __configureAuthEmulatorEnv = configureAuthEmulatorEnv
