import 'server-only'

/// Thrown when a concurrent writer advanced an application's version between our load and our
/// save (optimistic-concurrency guard). Message is user-facing (Bahasa) — surfaced via runAction
/// toast. Shared by every backend impl (Prisma + Firestore) and re-exported from ./write for the
/// callers that import it from there (e.g. approval.ts).
export class ConcurrencyError extends Error {
  constructor() {
    super('Data aplikasi telah diperbarui oleh pengguna lain. Muat ulang halaman lalu coba lagi.')
    this.name = 'ConcurrencyError'
  }
}

/// Thrown when the daily materializer (or a concurrent scheduler) would create a meeting for a
/// (template, scheduledDate) slot that already exists — the Firestore analog of the Prisma
/// @@unique([sourceTemplateId, scheduledDate]) P2002. The materializer catches it and counts the
/// slot as 'skipped' (idempotent re-run), mirroring the existing try/catch shape in materialize.ts.
export class DuplicateMeetingSlotError extends Error {
  constructor(slotId: string) {
    super(`Meeting slot already materialized: ${slotId}`)
    this.name = 'DuplicateMeetingSlotError'
  }
}

/// Thrown when a mutation targets a row/doc that does not exist (e.g. updateCustomerContextMd on an
/// unknown id) — parity with Prisma's update-on-missing throw.
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`Not found: ${what}`)
    this.name = 'NotFoundError'
  }
}

/// True when a Firestore Admin error is ALREADY_EXISTS (gRPC code 6) — raised by tx.create / doc.create
/// when the deterministic doc-id is already taken. This is how the deterministic-id uniqueness
/// constraints surface (qrToken, history seq, config version, meeting slot, user email/uid, role key).
export function isAlreadyExists(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false
  const code = (e as { code?: unknown }).code
  if (code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS') return true
  const msg = (e as { message?: unknown }).message
  return typeof msg === 'string' && /already exists|ALREADY_EXISTS/i.test(msg)
}

/// True when a Firestore Admin error is NOT_FOUND (gRPC code 5) — raised by doc.update() on a missing
/// doc. Lets the array-grant revokes mirror Prisma's deleteMany silent no-op on a missing user.
export function isNotFound(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false
  const code = (e as { code?: unknown }).code
  if (code === 5 || code === 'not-found' || code === 'NOT_FOUND') return true
  const msg = (e as { message?: unknown }).message
  return typeof msg === 'string' && /no document to update|NOT_FOUND/i.test(msg)
}
