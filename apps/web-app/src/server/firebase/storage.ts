import 'server-only'

import { getStorage } from 'firebase-admin/storage'
import { getAdminApp } from './admin'

// Cloud Storage (Admin SDK) bucket singleton — the runtime blob store for the Firebase backend
// (STORAGE_PROVIDER=firebase). Shares the one Admin App instance with getDb()/getAdminAuth()
// (firebase/firestore.ts, firebase/admin.ts), so credentials / emulator gating resolve in one place.
//
// Emulator: firebase-admin's Storage constructor reads FIREBASE_STORAGE_EMULATOR_HOST (injected by
// `firebase emulators:exec`) and points the underlying GCS client at the emulator automatically.
// Because getBucket() is lazy, that env is already set by the time the constructor runs in tests.
//
// Lazy accessor — initialise on first use, NOT at module import (mirrors the prisma/s3/getDb/
// getAdminAuth singletons; `next build` page-data collection imports modules without secrets).

/** The Cloud Storage bucket name. Explicit FIREBASE_STORAGE_BUCKET wins; else the Firebase default
 *  bucket derived from the project id (`<projectId>.appspot.com`). The same key scheme as the S3
 *  backend (`applications/<appId>/<docId>/<ts>-<name>`) is preserved, so storageKey values are
 *  backend-agnostic and survive the migration unchanged. */
function bucketName(): string {
  const explicit = process.env.FIREBASE_STORAGE_BUCKET
  if (explicit) return explicit
  const projectId = process.env.FIREBASE_PROJECT_ID ?? 'demo-mizan'
  return `${projectId}.appspot.com`
}

type Bucket = ReturnType<ReturnType<typeof getStorage>['bucket']>

let _bucket: Bucket | undefined

export function getBucket(): Bucket {
  if (!_bucket) _bucket = getStorage(getAdminApp()).bucket(bucketName())
  return _bucket
}

/** Exposed for diagnostics / bootstrap scripts (e.g. migrate-storage.ts target bucket). */
export function storageBucketName(): string {
  return bucketName()
}
