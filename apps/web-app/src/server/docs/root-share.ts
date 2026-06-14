import 'server-only'

// ADR-0019 §3 — broad READ on Mizan-owned generated docs, V1 mechanism: per-email ROOT-folder share.
//
// §3 ultimately wants a single group/domain share ("everyone at the Bank can read the Mizan doc
// tree"), but that needs a Google Workspace org the single Mizan Gmail account does not have — that
// proper mechanism stays a W1 item. The V1 stand-in implemented here: one root "Mizan" folder in the
// Mizan account's My Drive; every ADMITTED Mizan user (see boundary below) gets ONE per-email
// 'reader' permission on that root. Drive permissions inherit downward, so every per-app
// generated-doc folder (`Application.mizanDocFolderId`, see ./mizan-drive.ts — now parented under the
// root) and every doc inside it becomes readable by everyone: N member grants instead of N×M per-doc
// grants. At W1 the swap is mechanical — replace the N member grants with 1 group grant on the root.
//
// ACCESS BOUNDARY — admitted staff only. Open-read (ADR-0019 §1) is scoped to ADMITTED users: a user
// who is a superadmin OR holds ≥1 effective desk (role desks ∪ direct grants — the flattening in
// server/repo/users.ts). This is the SAME boundary as the in-app awaiting-access wall
// (app/(app)/layout.tsx): a zero-desk "awaiting access" account can log in but sees nothing — it must
// NOT get Drive read over the whole customer-PII doc tree either. Admission mid-session is covered by
// the admin grant actions (server/actions/admin.ts → syncRootGrantForUser); offboarding revokes
// (revokeRootGrant; the reconcile sweep is the backstop for both directions).
//
// SCALE CEILING — Drive caps a file/folder at ~600 direct permission entries. The per-email V1
// mechanism burns one entry per admitted user, so it cannot outlive a few hundred staff: this ceiling
// is the forcing function for the W1 group-grant swap (1 group entry, members managed in Workspace).
// ensureRootGrant logs `docs.root_share_near_permission_limit` at ≥500 ledgered readers.
//
// Scoped WRITE is untouched: the per-doc JIT 'writer' grants for makers (./access.ts
// ensureDocAccessForActor) and the freeze-on-advance downgrade (reconcileFrozenDocGrants) stay
// exactly as they are. `DriveRootGrant` is the audit ledger (ADR-0014 intent at folder granularity)
// and the idempotency guard; `DriveRef` row 'mizan-root' pins the root folder id. A ledger row with
// role 'invalid' is a PERMANENT-failure marker (Drive rejected the sharee, e.g. a non-Google email):
// the login path stops retrying it; the reconcile sweep is the deliberate retry surface.
//
// Entry points: login AND the admin grant/revoke actions (both syncRootGrantForUser —
// fire-and-forget post-response via after(), never throws, converges grant OR revoke to the user's
// current access; login passes a tight retry budget so a Drive outage never slows it), and the
// reconcile sweep (reconcileRootShare — backfill + revoke-down + trust-but-verify + reparent legacy
// flat folders).
//
// PII rule for this module: NEVER log an email — not even inside an error message (Drive sharing
// errors echo the sharee email in e.message, so every catch logs errFieldScrubbed, not errField).

import { driveClient } from '../google/clients'
import { withRetry, statusOf, type RetryOpts } from '../retry'
import { log, errFieldScrubbed } from '../log'
import { getUserAccessById, listUsers } from '../repo/users'
import { listApplicationsWithMizanFolder } from '../repo/applications'
import {
  getDriveRef,
  upsertDriveRef,
  findRootGrantByEmail,
  upsertRootGrant,
  countReaderGrants,
  listAllRootGrants,
  listReaderGrants,
  updateRootGrantPermissionId,
  markRootGrantInvalid,
  deleteRootGrant,
} from '../repo/drive-share'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const ROOT_REF_KEY = 'mizan-root'
const ROOT_FOLDER_NAME = 'Mizan'
// Drive's direct-permission ceiling on a single file/folder is ~600 entries; alarm well before it.
const PERMISSION_LIMIT_ALARM = 500

/** Grant attempt outcome: 'granted' = Drive permission created (ledger row written);
 *  'skipped' = an existing 'reader' row short-circuited (no Drive call);
 *  'invalid' = permanent Drive rejection (4xx except 429) — marker row written, do not auto-retry. */
export type RootGrantOutcome = 'granted' | 'skipped' | 'invalid'

interface RootGrantOpts {
  /** Tight retry budget for latency-sensitive callers (login). Reconcile keeps the default. */
  retry?: RetryOpts
  /** Re-attempt a ledger row marked 'invalid' (reconcile is the deliberate retry surface). */
  retryInvalid?: boolean
}

// 4xx (except 429) = the request itself is bad (invalid sharee/non-Google email, malformed) —
// retrying on every login just hammers Drive. 429/5xx/network stay transient (withRetry's domain).
function isPermanentDriveRejection(e: unknown): boolean {
  const status = statusOf(e)
  return status !== undefined && status >= 400 && status < 500 && status !== 429
}

/**
 * Resolve-or-create the single root "Mizan" folder in the Mizan account's Drive. The persisted
 * `DriveRef` row ('mizan-root') is the source of truth — once present, no Drive round-trip. Created
 * via drive.files.create (folder mime, no parent → My Drive root). Race-safe: the upsert never
 * overwrites an existing ref, and the persisted id is what we return (a losing concurrent create
 * leaves at most one orphan empty folder, harmless).
 */
export async function ensureMizanRootFolder(retry?: RetryOpts): Promise<string> {
  const ref = await getDriveRef(ROOT_REF_KEY)
  if (ref) return ref.folderId

  const drive = driveClient()
  const res = await withRetry(
    () =>
      drive.files.create({
        requestBody: { name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME },
        fields: 'id',
      }),
    { label: 'drive.files.create.root_folder', ...retry },
  )
  const folderId = res.data.id
  if (!folderId) throw new Error('Drive root folder create returned no id')
  // First-writer-wins: an established ref is never repointed (a concurrent writer that won between our
  // get and this upsert is the outcome we want; the re-read below resolves the winner).
  await upsertDriveRef(ROOT_REF_KEY, folderId)
  const persisted = await getDriveRef(ROOT_REF_KEY)
  log.info('docs.root_folder_created', { folderId: persisted?.folderId ?? folderId })
  return persisted?.folderId ?? folderId
}

/**
 * Idempotent per-email 'reader' grant on the root "Mizan" folder. A `DriveRootGrant` 'reader' row
 * for this email short-circuits (no Drive call); an 'invalid' marker row also short-circuits unless
 * `retryInvalid` (reconcile). Otherwise grant via permissions.create (type=user,
 * sendNotificationEmail=false — same shape as ./access.ts) and record the ledger row. A PERMANENT
 * Drive rejection (4xx except 429 — e.g. a non-Google email) writes the 'invalid' marker and returns
 * without throwing, so logins stop hammering Drive for an unshareable address. Transient failures
 * throw — callers on non-critical paths wrap via ensureRootGrantBestEffort.
 */
export async function ensureRootGrant(
  userId: string,
  email: string,
  opts: RootGrantOpts = {},
): Promise<RootGrantOutcome> {
  const existing = await findRootGrantByEmail(email)
  if (existing?.role === 'reader') return 'skipped'
  if (existing && existing.role === 'invalid' && !opts.retryInvalid) return 'invalid'

  const rootId = await ensureMizanRootFolder(opts.retry)
  const drive = driveClient()
  let permissionId: string | null
  try {
    const res = await withRetry(
      () =>
        drive.permissions.create({
          fileId: rootId,
          sendNotificationEmail: false, // docs surface in-app; no Google email noise
          requestBody: { type: 'user', role: 'reader', emailAddress: email },
          fields: 'id',
        }),
      { label: 'drive.permissions.root_reader', ...opts.retry },
    )
    permissionId = res.data.id ?? null
  } catch (e) {
    if (isPermanentDriveRejection(e)) {
      // Permanent: Drive rejected the sharee itself. Mark 'invalid' so the login path stops
      // retrying; reconcileRootShare is the deliberate retry surface for these rows.
      await upsertRootGrant({ userId, email, role: 'invalid', permissionId: null })
      log.warn('docs.root_grant_invalid', { userId, ...errFieldScrubbed(e) })
      return 'invalid'
    }
    throw e
  }
  await upsertRootGrant({ userId, email, role: 'reader', permissionId })
  // Never log the email (PII) — the userId is enough for the audit/ops trail.
  log.info('docs.root_grant', { userId })

  // ~600 direct-permission ceiling guard (see header): alarm while there is still headroom.
  const readerCount = await countReaderGrants()
  if (readerCount >= PERMISSION_LIMIT_ALARM) {
    log.error('docs.root_share_near_permission_limit', { count: readerCount })
  }
  return 'granted'
}

/**
 * Best-effort root grant that NEVER throws. A null/empty email (a seeded demo actor) is a silent
 * no-op; any Drive/DB failure is logged and swallowed. (Production paths converge through
 * syncRootGrantForUser, which carries its own catch — this wrapper is the standalone
 * grant-only API and pins the never-throws contract in the itest.)
 */
export async function ensureRootGrantBestEffort(
  userId: string,
  email: string | null | undefined,
  opts: RootGrantOpts = {},
): Promise<void> {
  if (!email) return
  try {
    await ensureRootGrant(userId, email, opts)
  } catch (e) {
    log.warn('docs.root_grant_failed', { userId, ...errFieldScrubbed(e) })
  }
}

/**
 * Revoke an email's 'reader' permission on the root folder and delete the ledger row (offboarding /
 * reconcile-down). Prefers the stored permissionId; falls back to permissions.list matched by
 * emailAddress. A 404 on delete means the permission is already gone — still drop the row. An
 * 'invalid' marker row never had a Drive permission, so it is just deleted. Returns whether a ledger
 * row existed. Throws on a live Drive/DB failure — non-critical callers use the best-effort variant.
 */
export async function revokeRootGrant(email: string): Promise<boolean> {
  const row = await findRootGrantByEmail(email)
  if (!row) return false

  // Read the ref directly — never CREATE the root just to revoke from it.
  const ref = await getDriveRef(ROOT_REF_KEY)
  if (row.role === 'reader' && ref) {
    const drive = driveClient()
    let permissionId = row.permissionId
    if (!permissionId) {
      const res = await withRetry(
        () => drive.permissions.list({ fileId: ref.folderId, fields: 'permissions(id, role, type, emailAddress)' }),
        { label: 'drive.permissions.list.root' },
      )
      const match = (res.data.permissions ?? []).find(
        (p) => p.emailAddress?.toLowerCase() === email.toLowerCase(),
      )
      permissionId = match?.id ?? null
    }
    if (permissionId) {
      try {
        await withRetry(
          () => drive.permissions.delete({ fileId: ref.folderId, permissionId }),
          { label: 'drive.permissions.delete.root' },
        )
      } catch (e) {
        if (statusOf(e) !== 404) throw e // 404 = already removed Drive-side; the row still goes
      }
    }
  }
  await deleteRootGrant(row.id)
  // Never log the email — userId + ledger row id carry the audit trail.
  log.info('docs.root_grant_revoked', { userId: row.userId, grantId: row.id })
  return true
}

/**
 * Re-derive one user's root-share state from their CURRENT effective access and converge Drive to it:
 * admitted (superadmin or ≥1 effective desk) → ensure the grant; not admitted → revoke it. Fired
 * (fire-and-forget) by the admin grant/revoke actions AND by login, so admission/offboarding
 * converges without waiting for the reconcile sweep. Never throws.
 */
export async function syncRootGrantForUser(userId: string, opts: RootGrantOpts = {}): Promise<void> {
  try {
    const user = await getUserAccessById(userId)
    if (!user?.email) return
    if (user.isSuperadmin || user.desks.length > 0) {
      await ensureRootGrant(user.id, user.email, opts)
    } else {
      await revokeRootGrant(user.email)
    }
  } catch (e) {
    log.warn('docs.root_grant_sync_failed', { userId, ...errFieldScrubbed(e) })
  }
}

// Admitted-predicate over the repo's UserWithAccess (server/repo/users.ts): `desks` is ALREADY the
// flattened effective set (role desks ∪ direct grants), so admitted = superadmin OR ≥1 effective desk.
// Same boundary as the in-app awaiting-access wall (a zero-desk account gets no Drive read on PII).
function isAdmitted(u: { isSuperadmin: boolean; desks: readonly string[] }): boolean {
  return u.isSuperadmin || u.desks.length > 0
}

export interface RootShareReconcileResult {
  /** New 'reader' grants created for admitted users that lacked one. */
  granted: number
  /** Already-correct items left untouched (existing reader rows; already-parented folders). */
  skipped: number
  /** Rows that (still) fail permanently ('invalid' marker — e.g. a non-Google email). */
  invalid: number
  /** Grants removed because the email no longer maps to an admitted user. */
  revoked: number
  /** Ledgered readers whose Drive-side permission had vanished and was re-created. */
  regranted: number
  /** Live type=user permissions on the root with no ledger row (flagged, NOT auto-removed). */
  unledgered: number
  /** Legacy flat per-app folders moved under the root. */
  reparented: number
  /** Transient per-item failures (the sweep keeps going; CLI exits 1 when > 0). */
  failed: number
}

/**
 * Reconcile sweep (ops CLI: apps/web-app/scripts/reconcile-drive-root.ts):
 *  (a) BACKFILL — every ADMITTED user (superadmin or ≥1 effective desk) with a non-null email and no
 *      'reader' row → ensureRootGrant; rows marked 'invalid' are deliberately re-attempted here
 *      (and counted 'invalid' when they fail permanently again, not 'failed').
 *  (b) REVOKE-DOWN — every DriveRootGrant row whose email no longer maps to an admitted user
 *      (user gone, email changed, or zero-desk non-superadmin) → revokeRootGrant.
 *  (c) TRUST-BUT-VERIFY — one permissions.list on the root: a ledgered reader missing Drive-side is
 *      re-granted (permissionId refreshed); a live type=user permission with no ledger row is
 *      flagged (`docs.root_share_unledgered`, by permission id — never the email) but NOT removed.
 *  (d) REPARENT — every Application.mizanDocFolderId not under the root is MOVED under it
 *      (addParents + removeParents — Drive is single-parent; an add-only update 403s).
 * Best-effort per item — a failure is counted + logged and the sweep keeps going.
 */
export async function reconcileRootShare(): Promise<RootShareReconcileResult> {
  const result: RootShareReconcileResult = {
    granted: 0,
    skipped: 0,
    invalid: 0,
    revoked: 0,
    regranted: 0,
    unledgered: 0,
    reparented: 0,
    failed: 0,
  }

  const rootId = await ensureMizanRootFolder()
  const drive = driveClient()

  // (a) Backfill per-email root grants for ADMITTED users (same boundary as the in-app
  // awaiting-access wall — a zero-desk account gets no Drive read on customer PII).
  const [users, grants] = await Promise.all([listUsers(), listAllRootGrants()])
  const roleByEmail = new Map(grants.map((g) => [g.email, g.role]))
  for (const u of users) {
    if (!u.email || !isAdmitted(u)) continue // not admitted — (b) below revokes any stale grant
    if (roleByEmail.get(u.email) === 'reader') {
      result.skipped++
      continue
    }
    try {
      // retryInvalid: this sweep IS the deliberate retry surface for 'invalid' marker rows.
      const outcome = await ensureRootGrant(u.id, u.email, { retryInvalid: true })
      if (outcome === 'granted') result.granted++
      else if (outcome === 'invalid') result.invalid++
      else result.skipped++
    } catch (e) {
      result.failed++
      log.warn('docs.root_grant_failed', { userId: u.id, ...errFieldScrubbed(e) })
    }
  }

  // (b) Revoke-down: a ledger row whose email no longer maps to an ADMITTED user loses Drive read.
  // Reuse the full user list from (a) (a superset of the grant-row emails) to map email → access.
  const allRows = grants
  const usersByEmail = new Map(users.filter((u) => u.email).map((u) => [u.email as string, u]))
  for (const row of allRows) {
    const owner = usersByEmail.get(row.email)
    if (owner && isAdmitted(owner)) continue
    try {
      await revokeRootGrant(row.email)
      result.revoked++
    } catch (e) {
      result.failed++
      log.warn('docs.root_grant_revoke_failed', { userId: row.userId, grantId: row.id, ...errFieldScrubbed(e) })
    }
  }

  // (c) Trust-but-verify: Drive-side permission removals must be recoverable. One list call; the
  // ledger is the intent — re-grant any ledgered reader Drive dropped, flag any live grant the
  // ledger doesn't know (flag only: removal of an unknown grant is a human call, not the sweep's).
  try {
    const live = await withRetry(
      () => drive.permissions.list({ fileId: rootId, fields: 'permissions(id, role, type, emailAddress)' }),
      { label: 'drive.permissions.list.root' },
    )
    const livePerms = live.data.permissions ?? []
    const liveEmails = new Set(
      livePerms.map((p) => p.emailAddress?.toLowerCase()).filter((e): e is string => !!e),
    )
    const readerRows = await listReaderGrants()
    for (const row of readerRows) {
      if (liveEmails.has(row.email.toLowerCase())) continue
      try {
        const res = await withRetry(
          () =>
            drive.permissions.create({
              fileId: rootId,
              sendNotificationEmail: false,
              requestBody: { type: 'user', role: 'reader', emailAddress: row.email },
              fields: 'id',
            }),
          { label: 'drive.permissions.root_reader' },
        )
        await updateRootGrantPermissionId(row.id, res.data.id ?? null)
        result.regranted++
        log.info('docs.root_grant_regranted', { userId: row.userId, grantId: row.id })
      } catch (e) {
        if (isPermanentDriveRejection(e)) {
          // The sharee became permanently unshareable (e.g. the Google account was deleted while the
          // user stays admitted in Mizan). Mark 'invalid' so the CLI converges instead of reporting a
          // transient failure forever; the next sweep's backfill is the deliberate retry surface.
          await markRootGrantInvalid(row.id)
          result.invalid++
          log.warn('docs.root_grant_invalid', { userId: row.userId, ...errFieldScrubbed(e) })
        } else {
          result.failed++
          log.warn('docs.root_grant_failed', { userId: row.userId, ...errFieldScrubbed(e) })
        }
      }
    }
    const ledgerIds = new Set(readerRows.map((r) => r.permissionId).filter(Boolean))
    const ledgerEmails = new Set(readerRows.map((r) => r.email.toLowerCase()))
    for (const p of livePerms) {
      if (p.type !== 'user' || p.role === 'owner') continue // the Mizan account owns the root
      if (p.id && ledgerIds.has(p.id)) continue
      if (p.emailAddress && ledgerEmails.has(p.emailAddress.toLowerCase())) continue
      result.unledgered++
      // Flag by permission id only — NEVER the email.
      log.warn('docs.root_share_unledgered', { permissionId: p.id ?? '(none)' })
    }
  } catch (e) {
    result.failed++
    log.warn('docs.root_share_verify_failed', { ...errFieldScrubbed(e) })
  }

  // (d) Reparent legacy per-app Mizan folders created flat (before the root existed). Drive v3 is
  // single-parent: this must be a MOVE (addParents + removeParents) — add-only 403s in production.
  const apps = await listApplicationsWithMizanFolder()
  for (const a of apps) {
    const folderId = a.mizanDocFolderId
    if (!folderId) continue
    try {
      const meta = await withRetry(
        () => drive.files.get({ fileId: folderId, fields: 'parents' }),
        { label: 'drive.files.get.parents' },
      )
      const parents = meta.data.parents ?? []
      if (parents.includes(rootId)) {
        result.skipped++
        continue
      }
      await withRetry(
        () =>
          drive.files.update({
            fileId: folderId,
            addParents: rootId,
            // Omit removeParents only when Drive reports no parents at all (defensive — a real
            // My-Drive file always has its implicit root parent).
            ...(parents.length ? { removeParents: parents.join(',') } : {}),
            fields: 'id, parents',
          }),
        { label: 'drive.files.update.reparent' },
      )
      result.reparented++
      log.info('docs.root_reparented', { applicationId: a.id, folderId })
    } catch (e) {
      result.failed++
      log.warn('docs.root_reparent_failed', { applicationId: a.id, folderId, ...errFieldScrubbed(e) })
    }
  }

  log.info('docs.root_share_reconciled', { ...result })
  return result
}
