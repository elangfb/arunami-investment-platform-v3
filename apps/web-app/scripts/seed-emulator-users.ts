// Provision demo login accounts in the Firebase Auth Emulator (dev only).
//
// What it does, against a RUNNING emulator (`pnpm emu`):
//   1. Deletes every stale @example.com account absent from the DEMO_LOGINS roster
//      (smoke-test cruft AND demo personas dropped from the roster), so a re-run mirrors
//      the current roster instead of accumulating retired accounts.
//   2. Creates a google.com account for each entry in data/demo-logins.ts, so each
//      shows up in the Google sign-in chooser and links to its seeded Mizan persona.
//
// Login is Google-popup only (login/page.tsx), so accounts must be google.com IDP
// accounts — password accounts never appear in the chooser. The emulator de-dupes by
// email, so this is idempotent and safe to re-run. Pair with `pnpm seed` (which writes
// the matching emails onto the DB users). Run: `pnpm seed:emu`.
//
// This NEVER touches a real Firebase project: it only speaks to the local emulator REST
// API and refuses if the emulator is not reachable.
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

const { DEMO_LOGINS } = await import('../src/lib/seed-data/demo-logins')

const HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ||
  '127.0.0.1:9099'
// The emulator project: client.ts hardcodes `demo-mizan` in emulator mode and
// emulator.sh starts `--project demo-mizan`, so accounts live there.
const PROJECT = process.env.EMULATOR_PROJECT_ID || 'demo-mizan'
const API_KEY = 'demo-api-key' // any key is accepted in emulator mode
const BASE = `http://${HOST}/identitytoolkit.googleapis.com/v1`
// All demo & smoke logins use the reserved @example.com test domain (never a real inbox).
const EXAMPLE_RE = /@example\.com$/i

async function emu(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = (json.error as { message?: string } | undefined)?.message ?? res.statusText
    throw new Error(`${path} → ${res.status} ${msg}`)
  }
  return json
}

async function assertEmulatorUp(): Promise<void> {
  try {
    const res = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/config`, {
      headers: { Authorization: 'Bearer owner' },
    })
    if (!res.ok) throw new Error(String(res.status))
  } catch {
    throw new Error(
      `Auth Emulator not reachable at ${HOST} (project ${PROJECT}). Start it first: pnpm emu`,
    )
  }
}

type Account = { localId: string; email?: string }

async function listAccounts(): Promise<Account[]> {
  const out = await emu(`/projects/${PROJECT}/accounts:query?key=${API_KEY}`, {})
  return ((out.userInfo as Account[]) ?? []).map((u) => ({ localId: u.localId, email: u.email }))
}

/** Create (or, on email match, link) a google.com IDP account. Idempotent by email. */
async function upsertGoogleAccount(sub: string, email: string, name: string): Promise<void> {
  const idToken = JSON.stringify({ sub, email, email_verified: true, name })
  await emu(`/accounts:signInWithIdp?key=${API_KEY}`, {
    postBody: `id_token=${idToken}&providerId=google.com`,
    requestUri: 'http://localhost',
    returnSecureToken: true,
  })
}

async function main(): Promise<void> {
  await assertEmulatorUp()

  // Prune stale @example.com accounts not in the current roster: smoke-test cruft AND
  // demo personas dropped from DEMO_LOGINS (e.g. retired signer personas u-demo-bm/ro/cro/
  // dps). Scoped to the reserved test domain, so a real account is never touched. Mirrors
  // the DB-seed prune (prisma/seed-dummy.ts) — same identifying convention (roster email).
  const rosterEmails = new Set(DEMO_LOGINS.map((d) => d.email.toLowerCase()))
  const before = await listAccounts()
  const stale = before.filter(
    (a) => a.email && EXAMPLE_RE.test(a.email) && !rosterEmails.has(a.email.toLowerCase()),
  )
  for (const a of stale) {
    await emu('/accounts:delete', { localId: a.localId })
    console.log(`  − deleted ${a.email}`)
  }
  console.log(`Removed ${stale.length} stale @example.com account(s) absent from the roster.`)

  for (const d of DEMO_LOGINS) {
    await upsertGoogleAccount(d.sub, d.email, d.name)
    console.log(`  + ${d.email.padEnd(28)} ${d.name}`)
  }
  console.log(`Provisioned ${DEMO_LOGINS.length} demo login(s) in the emulator (${HOST}).`)
  console.log('\nLog in: pnpm dev → /login → "Masuk dengan Google" → pick an account above.')
}

await main()
