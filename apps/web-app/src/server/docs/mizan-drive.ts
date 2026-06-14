import 'server-only'

// P4-C (ADR-0019 / Topic 6): Mizan-OWNED generated docs + a shortcut into the user's app folder.
//
// Generated docs (MUAP/RSK/MoM/SP3) are authoritative artifacts. ADR-0019 §4 says they must live
// Mizan-owned and frozen in a Mizan-standard skeleton — NOT in a user-controlled folder where they
// could be moved/edited/deleted out from under the audit trail. So instead of landing the file copy in
// the Mizan account My-Drive root (parents omitted), we parent the copy under a per-app Mizan-owned
// folder (`Application.mizanDocFolderId`), and drop a SHORTCUT (by file id) into the user's app folder
// (`Application.driveFolderId`) so the user can still see + reorganize the doc freely without breaking
// the link or owning the file.
//
// If Mizan lacks Editor on the user folder, placing the shortcut 403s → we WARN + offer "Coba lagi"
// retry (never throw): the doc still lives Mizan-owned and is viewable in-app, nothing breaks.
//
// We use the DOCS `driveClient()` (server/google/clients.ts) — NOT the discovery getOAuthClient — so
// these paths run under DOCS_PROVIDER=stub and stay itest-able alongside the existing copy/export/grant
// stubs. The broad READ that ADR-0019 §3 wants IS now implemented — at per-email granularity — via
// ./root-share.ts: every per-app folder created here is parented under the single root "Mizan" folder,
// and each registered user holds one 'reader' grant on that root (permissions inherit downward). The
// group/domain folder-share mechanism PROPER stays W1 (needs a Google Workspace org the single Mizan
// Gmail lacks); at W1 the N member grants on the root become 1 group grant.

import { driveClient } from '../google/clients'
import { withRetry } from '../retry'
import { log, errField } from '../log'
import { ensureMizanRootFolder } from './root-share'
import { getApplicationDriveFields, setMizanDocFolderId } from '../repo/application-drive'
import { getDocLinkage, updateDocLinkage } from '../repo/doc-linkage'

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'

/** Bahasa warning surfaced when Mizan lacks Editor on the user's app folder (403 on shortcut create). */
export const SHORTCUT_NO_ACCESS_WARNING =
  'Mizan tidak memiliki akses Editor pada folder Anda — beri akses lalu coba lagi.'

function is403(e: unknown): boolean {
  const code = (e as { code?: number; status?: number })?.code ?? (e as { status?: number })?.status
  return code === 403
}

/**
 * Resolve-or-create the application's Mizan-OWNED generated-doc folder. A single labelled folder
 * ("Dokumen Mizan — <appId>") satisfies the "Mizan-owned, structured, not in the user's control"
 * intent (the full nested Mizan/Nasabah/…/Dokumen Mizan skeleton is a nice-to-have, deferred). Created
 * under the Mizan account via drive.files.create (mimeType folder), PARENTED under the root "Mizan"
 * folder (./root-share.ts) so the per-email root 'reader' grants inherit down to it; persisted on
 * Application.mizanDocFolderId. Idempotent — returns the stored id without a Drive round-trip once linked.
 */
export async function ensureMizanDocFolder(applicationId: string): Promise<string> {
  const app = await getApplicationDriveFields(applicationId)
  if (app?.mizanDocFolderId) return app.mizanDocFolderId

  const rootId = await ensureMizanRootFolder()
  const drive = driveClient()
  const res = await withRetry(
    () =>
      drive.files.create({
        requestBody: { name: `Dokumen Mizan — ${applicationId}`, mimeType: FOLDER_MIME, parents: [rootId] },
        fields: 'id',
      }),
    { label: 'drive.files.create.mizan_folder' },
  )
  const folderId = res.data.id
  if (!folderId) throw new Error('Drive folder create returned no id')
  // Persist the folder ref so the next call is idempotent. Best-effort: an app row may not exist in
  // some test/seed paths (a bare DocLinkage) — the copy is still parented under the folder either way.
  try {
    await setMizanDocFolderId(applicationId, folderId)
  } catch (e) {
    log.warn('docs.mizan_folder_persist_failed', { applicationId, folderId, ...errField(e) })
  }
  log.info('docs.mizan_folder_created', { applicationId, folderId })
  return folderId
}

/**
 * Create a Drive shortcut (by target file id) inside `parentFolderId`. Best-effort by contract: a 403
 * (Mizan lacks Editor on the parent — the user's app folder) returns a WARNING, never throws, because
 * the target doc still lives Mizan-owned and is viewable in-app. Other Drive errors propagate to the
 * caller's best-effort wrapper. `drive.files.create` with the shortcut mimeType is mirrored in the stub.
 */
export async function createDriveShortcut(
  targetId: string,
  parentFolderId: string,
  name: string,
): Promise<{ id?: string; warning?: string }> {
  const drive = driveClient()
  try {
    const res = await withRetry(
      () =>
        drive.files.create({
          requestBody: {
            name,
            mimeType: SHORTCUT_MIME,
            parents: [parentFolderId],
            shortcutDetails: { targetId },
          },
          fields: 'id',
        }),
      { label: 'drive.files.create.shortcut' },
    )
    return { id: res.data.id ?? undefined }
  } catch (e) {
    if (is403(e)) return { warning: SHORTCUT_NO_ACCESS_WARNING }
    throw e
  }
}

/**
 * Drop a shortcut to a freshly-minted Mizan-owned doc into the user's app folder, IF one is linked
 * (`Application.driveFolderId`). Fully best-effort: any failure (a 403, or any Drive hiccup) is recorded
 * as a per-app shortcut warning on DocLinkage so the UI can offer "Coba lagi" — it NEVER blocks doc
 * generation. On success it clears any prior warning. A null user folder is a clean no-op (no shortcut,
 * no warning): the user simply hasn't linked an app folder yet.
 */
export async function placeDocShortcut(
  applicationId: string,
  targetId: string,
  name: string,
): Promise<{ id?: string; warning?: string }> {
  const app = await getApplicationDriveFields(applicationId)
  const userFolderId = app?.driveFolderId
  if (!userFolderId) return {} // user hasn't linked an app folder — nothing to place into

  let outcome: { id?: string; warning?: string }
  try {
    outcome = await createDriveShortcut(targetId, userFolderId, name)
  } catch (e) {
    // A non-403 Drive failure: treat as a recoverable warning so generation never breaks + retry works.
    log.warn('docs.shortcut_failed', { applicationId, targetId, ...errField(e) })
    outcome = { warning: SHORTCUT_NO_ACCESS_WARNING }
  }
  await recordShortcutWarning(applicationId, outcome.warning ?? null)
  if (outcome.warning) {
    log.info('docs.shortcut_warning', { applicationId, targetId })
  }
  return outcome
}

/** Persist (or clear) the per-app shortcut warning on DocLinkage so the doc panel can show "Coba lagi". */
async function recordShortcutWarning(applicationId: string, warning: string | null): Promise<void> {
  try {
    await updateDocLinkage(applicationId, { shortcutWarning: warning })
  } catch (e) {
    // The linkage row may not exist yet for a MoM/SP3 placed before any MUAP — non-fatal.
    log.warn('docs.shortcut_warning_record_failed', { applicationId, ...errField(e) })
  }
}

/**
 * Re-attempt placing shortcuts for ALL of an application's currently-minted generated docs into the
 * user's app folder (the "Coba lagi" retry). Idempotent-ish: Drive allows duplicate shortcuts, but we
 * only re-run when a prior warning exists, so the duplicate-on-success window is small and harmless
 * (a shortcut is a pointer, not a copy). Clears the warning when every present doc places cleanly;
 * leaves it set (returns it) when any doc still 403s. A null user folder clears the warning (nothing
 * owed). Best-effort throughout — never throws.
 */
export async function retryDocShortcuts(applicationId: string): Promise<{ warning?: string }> {
  const [app, linkage] = await Promise.all([
    getApplicationDriveFields(applicationId),
    getDocLinkage(applicationId),
  ])
  if (!app?.driveFolderId) {
    await recordShortcutWarning(applicationId, null)
    return {}
  }
  if (!linkage) return {}

  const label = app.nasabahName ? `${app.nasabahName} (${applicationId})` : applicationId
  const docs: { kind: string; docId: string | null }[] = [
    { kind: 'MUAP', docId: linkage.muapDocId },
    { kind: 'RSK', docId: linkage.rskDocId },
    { kind: 'MoM', docId: linkage.momDocId },
    { kind: 'SP3', docId: linkage.sp3DocId },
  ]
  let firstWarning: string | undefined
  for (const { kind, docId } of docs) {
    if (!docId) continue
    let outcome: { id?: string; warning?: string }
    try {
      outcome = await createDriveShortcut(docId, app.driveFolderId, `${kind} — ${label}`)
    } catch (e) {
      log.warn('docs.shortcut_retry_failed', { applicationId, docId, ...errField(e) })
      outcome = { warning: SHORTCUT_NO_ACCESS_WARNING }
    }
    if (outcome.warning && !firstWarning) firstWarning = outcome.warning
  }
  await recordShortcutWarning(applicationId, firstWarning ?? null)
  return firstWarning ? { warning: firstWarning } : {}
}
