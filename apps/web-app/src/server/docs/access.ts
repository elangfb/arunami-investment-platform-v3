import 'server-only'

// Just-in-time Google Drive sharing for the per-application MUAP/RSK Docs. The Docs are
// owned by the dedicated Mizan account and start private, so every human who opens one
// would otherwise hit Google's "request access" wall — including the RM who is supposed
// to be able to draft the MUAP. This grants the operating human the correct Drive role
// (writer = maker, reader = participant) the moment they load the doc panel.
//
// Two invariants:
//  - NEVER link-share (the Docs carry customer PII): always per-email (type=user).
//  - Follow the BROWSER identity. When a superadmin is impersonating, the workflow audit
//    attributes the impersonated desk, but the Google login that actually opens the Doc
//    is the superadmin's — so the Drive grant goes to the superadmin's email, while the
//    writer/reader DECISION is made from the impersonated identity's desks.

import { driveClient } from '../google/clients'
import { withRetry } from '../retry'
// errFieldScrubbed, never errField: Drive sharing errors echo the sharee EMAIL in e.message —
// the scrubbed shape logs HTTP status + Google reason and redacts email substrings.
import { log, errFieldScrubbed } from '../log'
import { getUserEmailById } from '../repo/users'
import {
  getDocAccessGrant,
  upsertDocAccessGrant,
  listWriterGrantsForDoc,
  downgradeDocGrantToReader,
} from '../repo/doc-access-grant'
import type { Actor } from '../../lib/auth/can'
import type { LoanApplication } from '../../lib/types'
import { type DocKind, type DriveRole, driveRoleForDoc, isDocFrozen } from '../../lib/auth/doc-access'

const RANK: Record<DriveRole, number> = { reader: 1, writer: 2 }

/** Idempotent, upgrade-only Drive grant for one (doc, email). Skips the Drive round-trip
 *  when a sufficient grant is already recorded; never downgrades (live Docs stay editable
 *  after approval per the workflow engine). */
async function ensureGrant(
  applicationId: string,
  docId: string,
  email: string,
  role: DriveRole,
  grantedToUserId: string,
): Promise<void> {
  const existing = await getDocAccessGrant(docId, email)
  if (existing && RANK[existing.role as DriveRole] >= RANK[role]) return

  const drive = driveClient()
  const res = await withRetry(
    () =>
      drive.permissions.create({
        fileId: docId,
        sendNotificationEmail: false, // app surfaces the doc in-app; no Google email noise
        requestBody: { type: 'user', role, emailAddress: email },
        fields: 'id',
      }),
    { label: `drive.permissions.${role}` },
  )
  const permissionId = res.data.id ?? existing?.permissionId ?? null
  await upsertDocAccessGrant({ applicationId, docId, email, role, permissionId, grantedToUserId })
  // Never log the email (PII) — the userId + docId + role are enough for the audit/ops trail.
  log.info('docs.access_granted', { applicationId, docId, role, userId: grantedToUserId })
}

/**
 * Downgrade-on-advance (Batch 3 T2 / ADR-0016, spike S1 = GO 2026.06.10): once a doc FREEZES, no one
 * keeps a Drive `writer` grant. One pass over the doc's existing `writer` DocAccessGrant rows: update
 * the Drive permission writer→reader by the stored `permissionId` (idempotent — the spike proved it),
 * then lower the row. Best-effort per grant (a Drive failure is logged, never blocks the advance);
 * `permissions.update` is mirrored in `stubDriveClient`. Reverses the old never-downgrade audit hole.
 * Called from the advance seam (actOnChain) after the doc has moved past its edit stage.
 */
export async function reconcileFrozenDocGrants(
  app: LoanApplication,
  linkage: { muapDocId: string | null; rskDocId: string | null },
): Promise<void> {
  const docs: { kind: DocKind; docId: string }[] = [
    // N2: the MUAP may not be minted yet (explicit Generate) — skip it until it exists.
    ...(linkage.muapDocId ? [{ kind: 'muap' as const, docId: linkage.muapDocId }] : []),
    // RSK may not exist yet (created at Stage-4 entry, Batch 3 T3) — skip it until it does.
    ...(linkage.rskDocId ? [{ kind: 'rsk' as const, docId: linkage.rskDocId }] : []),
  ]
  for (const { kind, docId } of docs) {
    if (!isDocFrozen(app, kind)) continue // do NOT downgrade mid-stage — only a frozen doc
    const writers = await listWriterGrantsForDoc(docId)
    for (const g of writers) {
      try {
        if (g.permissionId) {
          await withRetry(
            () => driveClient().permissions.update({ fileId: docId, permissionId: g.permissionId!, requestBody: { role: 'reader' } }),
            { label: 'drive.permissions.downgrade' },
          )
        }
        await downgradeDocGrantToReader(docId, g.email)
        log.info('docs.access_downgraded', { applicationId: app.id, docId, userId: g.grantedToUserId })
      } catch (e) {
        log.warn('docs.access_downgrade_failed', { applicationId: app.id, docId, userId: g.grantedToUserId, ...errFieldScrubbed(e) })
      }
    }
  }
}

/**
 * Grant the operating human the correct Drive permission on the application's MUAP + RSK
 * Docs. Best-effort: a per-doc failure is logged and skipped so it never blocks the doc
 * read. Returns the role applied per kind (or null) for observability and tests.
 */
export async function ensureDocAccessForActor(
  actor: Actor,
  app: LoanApplication,
  linkage: { muapDocId: string | null; rskDocId: string | null; momDocId?: string | null; sp3DocId?: string | null },
): Promise<Record<DocKind, DriveRole | null>> {
  const result: Record<DocKind, DriveRole | null> = { muap: null, rsk: null }
  // Follow the BROWSER identity: the real superadmin when impersonating, else the logged-in
  // user — whoever's Google login will actually open the Doc.
  const grantedToUserId = actor.impersonating?.realSuperadminId ?? actor.userId
  const email = await getUserEmailById(grantedToUserId)
  // No email → an identity we can't share to (a seeded demo actor that never logged in).
  // A desk-impersonation resolves to the superadmin's id above, so this only skips
  // genuinely email-less humans.
  if (!email) return result

  const docs: { kind: DocKind; docId: string }[] = [
    // N2: the MUAP may not be minted yet (explicit Generate) — skip it until it exists.
    ...(linkage.muapDocId ? [{ kind: 'muap' as const, docId: linkage.muapDocId }] : []),
    // RSK may not exist yet (created at Stage-4 entry, Batch 3 T3) — skip it until it does.
    ...(linkage.rskDocId ? [{ kind: 'rsk' as const, docId: linkage.rskDocId }] : []),
  ]
  for (const { kind, docId } of docs) {
    const role = driveRoleForDoc(actor, app, kind)
    if (!role) continue
    try {
      await ensureGrant(app.id, docId, email, role, grantedToUserId)
      result[kind] = role
    } catch (e) {
      log.warn('docs.access_grant_failed', { applicationId: app.id, docId, role, userId: grantedToUserId, ...errFieldScrubbed(e) })
    }
  }
  // MoM/SP3 (committee minutes + offer letter) carry no per-stage edit window — they are generated
  // late and finalized in Google by their maker. Universal-read policy: grant every visitor READER.
  // (The generator gets writer at generation time via grantDocAccessForActor; ensureGrant is
  // upgrade-only so this reader pass never clobbers that writer grant.)
  for (const docId of [linkage.momDocId, linkage.sp3DocId]) {
    if (!docId) continue
    try {
      await ensureGrant(app.id, docId, email, 'reader', grantedToUserId)
    } catch (e) {
      log.warn('docs.access_grant_failed', { applicationId: app.id, docId, role: 'reader', userId: grantedToUserId, ...errFieldScrubbed(e) })
    }
  }
  return result
}

/**
 * Grant ONE actor a Drive role on a single per-application Doc, resolving their browser identity
 * (the real superadmin when impersonating). Best-effort — a failure is logged, never thrown — so it
 * never blocks the caller. Used by the MoM/SP3 generate action to grant the generator `writer` on the
 * freshly-copied Doc so their immediate "open in Google Docs" doesn't hit the request-access wall.
 */
export async function grantDocAccessForActor(
  actor: Actor,
  applicationId: string,
  docId: string,
  role: DriveRole,
): Promise<void> {
  const grantedToUserId = actor.impersonating?.realSuperadminId ?? actor.userId
  const email = await getUserEmailById(grantedToUserId)
  if (!email) return
  try {
    await ensureGrant(applicationId, docId, email, role, grantedToUserId)
  } catch (e) {
    log.warn('docs.access_grant_failed', { applicationId, docId, role, userId: grantedToUserId, ...errFieldScrubbed(e) })
  }
}
