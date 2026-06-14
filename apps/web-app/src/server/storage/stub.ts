/**
 * In-memory object-storage stub for tests/CI (STORAGE_PROVIDER=stub). Mirrors the
 * shape of putDocument/getDocument/ensureBucket in ./s3 so the call sites are
 * unchanged. State is per-process; cleared between scenarios via clearStubStorage().
 */
import { createHash } from 'node:crypto'

const objects = new Map<string, { bytes: Buffer; contentType: string }>()

export function clearStubStorage(): void {
  objects.clear()
}

export function sha256Stub(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function ensureBucketStub(): Promise<void> {
  // no-op — in-memory has no bucket concept
}

export async function putDocumentStub(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<{ sha256: string; size: number }> {
  objects.set(key, { bytes: Buffer.from(bytes), contentType })
  return { sha256: sha256Stub(bytes), size: bytes.length }
}

export async function getDocumentStub(key: string): Promise<Buffer> {
  const obj = objects.get(key)
  if (!obj) throw new Error(`stub storage: no object at key ${key}`)
  return obj.bytes
}
