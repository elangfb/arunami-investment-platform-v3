import 'server-only'

import type { DriveProvider } from './provider'
import { stubDriveProvider } from './stub'
import { googleDriveProvider } from './google'

export type { DriveProvider, DiscoveredFile } from './provider'

// Drive provider registry (mirrors server/ocr/index.ts). Add a backend by implementing DriveProvider
// and adding a line here — no call-site changes. Selection is env-only via DRIVE_PROVIDER.
//   stub    — in-memory deterministic fake tree; default for dev/test/CI (no credentials, no egress)
//   google  — real Google Drive client (lists a real folder's files as paths + content-address md5).
//             Reads the dedicated Mizan account via the documents+drive OAuth in server/google/auth.ts
//             (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN; see docs/guides/google-docs-oauth.md). Stays
//             content-free: lists metadata/paths + Drive md5 only — never downloads bytes.
const PROVIDERS: Record<string, () => DriveProvider> = {
  stub: stubDriveProvider,
  google: googleDriveProvider,
}

/** The active Drive provider — `DRIVE_PROVIDER` (default 'stub', the in-memory fake tree). */
export function driveProvider(): DriveProvider {
  const name = process.env.DRIVE_PROVIDER?.trim() || 'stub'
  const make = PROVIDERS[name]
  if (!make) throw new Error(`Unknown DRIVE_PROVIDER '${name}'. Known: ${Object.keys(PROVIDERS).join(', ')}.`)
  return make()
}
