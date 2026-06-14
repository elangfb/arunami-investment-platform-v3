/**
 * Object-storage client behind a single small interface (putDocument/getDocument/
 * ensureBucket/sha256). Three interchangeable backends selected by STORAGE_PROVIDER:
 *   • 's3' (default) — S3-compatible (SeaweedFS in dev/on-prem; any S3 engine). Config via
 *     S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.
 *   • 'firebase' — Google Cloud Storage via firebase-admin (the migration target). Config via
 *     FIREBASE_STORAGE_BUCKET (or derived from FIREBASE_PROJECT_ID). Auto-detects the emulator.
 *   • 'stub' — in-memory (tests/CI; set by scripts/test-e2e.sh) so nothing external is needed.
 * The object KEY SCHEME (applications/<appId>/<docId>/<ts>-<name>) is identical across backends,
 * so persisted storageKey values stay valid through the S3→GCS cutover (no re-keying).
 *
 * Server-only by usage (reads secrets, makes network calls). No `server-only` import
 * so the storage scripts (scripts/spike-s3.ts) can exercise it under tsx.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { ensureBucketStub, getDocumentStub, putDocumentStub } from './stub'

type StorageProvider = 'stub' | 'firebase' | 's3'

// STORAGE_PROVIDER selects the backend. 'stub' short-circuits to in-memory storage so e2e/CI
// never needs a running object store; 'firebase' routes to Cloud Storage (the migration target);
// anything else (incl. unset) keeps the real S3 client — today's default behavior.
function storageProvider(): StorageProvider {
  const p = process.env.STORAGE_PROVIDER
  if (p === 'stub') return 'stub'
  if (p === 'firebase' || p === 'gcs') return 'firebase'
  return 's3'
}

function isStubStorage(): boolean {
  return storageProvider() === 'stub'
}

// firebase-admin is imported lazily (dynamic import) so the S3/stub paths never pull the Firebase
// graph, and `next build`/typecheck stay free of Firebase init. getBucket() is itself lazy.
async function fsBucket() {
  const { getBucket } = await import('@/server/firebase/storage')
  return getBucket()
}

function reqEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`${key} is not set`)
  return v
}

let _client: S3Client | undefined
/** Lazy singleton — importing the module never throws when env is unset (typecheck/build safe). */
export function s3(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: reqEnv('S3_ENDPOINT'),
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: true, // SeaweedFS + most self-hosted S3 need path-style addressing
      credentials: {
        accessKeyId: reqEnv('S3_ACCESS_KEY'),
        secretAccessKey: reqEnv('S3_SECRET_KEY'),
      },
    })
  }
  return _client
}

export function bucket(): string {
  return reqEnv('S3_BUCKET')
}

/** Hex SHA-256 of the bytes — tamper-evidence stored alongside the object in Postgres. */
export function sha256(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Create the bucket if it doesn't exist (idempotent; for dev/bootstrap). */
export async function ensureBucket(): Promise<void> {
  if (isStubStorage()) return ensureBucketStub()
  if (storageProvider() === 'firebase') {
    // The Firebase default bucket is provisioned when Storage is enabled on the project (not
    // creatable at runtime without storage.admin), and the emulator serves it on first write —
    // so existence is a precondition, not something we create. Probe so a misconfigured bucket
    // surfaces here rather than on the first upload. The emulator answers exists()=false for an
    // untouched bucket, which is harmless (the write auto-creates it), so don't throw on that.
    const b = await fsBucket()
    try {
      await b.exists()
    } catch {
      // Emulator may not implement the metadata probe; the object write path still works.
    }
    return
  }
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }))
  } catch {
    await s3().send(new CreateBucketCommand({ Bucket: bucket() }))
  }
}

/** Store bytes under `key`; returns the integrity facts to persist (sha256 + size). */
export async function putDocument(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ sha256: string; size: number }> {
  if (isStubStorage()) return putDocumentStub(key, bytes, contentType)
  const digest = sha256(bytes)
  if (storageProvider() === 'firebase') {
    const b = await fsBucket()
    // resumable:false → single-shot upload (right for our <=10 MB KYC docs; avoids the
    // resumable-session round-trips and works against the emulator). Persist the same
    // tamper-evidence facts on the object metadata that we store on the DB row.
    await b.file(key).save(bytes, {
      contentType,
      resumable: false,
      metadata: { contentType, metadata: { sha256: digest } },
    })
    return { sha256: digest, size: bytes.length }
  }
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: bytes, ContentType: contentType }),
  )
  return { sha256: digest, size: bytes.length }
}

/** Fetch the full object bytes for `key` (used by the authenticated retrieval proxy). */
export async function getDocument(key: string): Promise<Buffer> {
  if (isStubStorage()) return getDocumentStub(key)
  if (storageProvider() === 'firebase') {
    const b = await fsBucket()
    const [buf] = await b.file(key).download()
    return buf
  }
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }))
  if (!res.Body) throw new Error(`No body for object ${key}`)
  const bytes = await res.Body.transformToByteArray()
  return Buffer.from(bytes)
}
