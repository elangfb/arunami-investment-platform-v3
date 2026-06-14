import 'server-only'

import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getAdminApp } from './admin'

// Firestore (Admin SDK) singleton — the runtime data store for the Firebase backend
// (DATA_BACKEND=firestore|dual). Shares the one Admin App instance with getAdminAuth()
// (firebase/admin.ts), so credentials / emulator gating are resolved in exactly one place.
//
// The Firestore client auto-detects the emulator from FIRESTORE_EMULATOR_HOST (the standard
// var the Admin SDK reads), so no extra wiring is needed for integration tests.
//
// Lazy accessor — initialise on first use, NOT at module import (mirrors the prisma/s3/
// getAdminAuth singletons; `next build` page-data collection imports modules without secrets).

let _db: Firestore | undefined

export function getDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getAdminApp())
    // ignoreUndefinedProperties: the domain aggregate (LoanApplication) carries optional fields
    // as `undefined`; Firestore rejects undefined values by default. Dropping them mirrors the
    // Prisma `?? null`/omit semantics at the write seam so repo writers stay declarative.
    _db.settings({ ignoreUndefinedProperties: true })
  }
  return _db
}
