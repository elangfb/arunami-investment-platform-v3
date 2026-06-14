import 'server-only'

import type { LoanApplication } from '@/lib/types'
import { getApplicationFolderRefs } from '@/server/repo/drive-folder'
import {
  reconcileDiscovery,
  itemsFor,
  type DiscoveredFile,
  type DocMatch,
  type ReconciliationResult,
} from '@/lib/doc-discovery/matcher'
import { folderScopeForDocType } from '@/lib/doc-discovery/folder-scope'
import { buildRequiredDocuments } from '@/lib/required-docs'
import { appendScanEntries, type ScanEntryInput } from '@/server/repo/source-manifest'
import { driveProvider } from './index'

// Document discovery SERVICE (RM-led redesign, design §3). One scan of an application's TWO Drive
// folders → the two-card reconciliation + a manifest ledger append. Content-free end to end: the
// only thing this service ever sees is file PATHS + sha256 refs (from driveProvider().listFolderTree).
// It NEVER downloads bytes or runs OCR — the "Discovery never reads content" invariant holds because
// the provider returns paths-only DiscoveredFile and the matcher is a pure name test.
//
// The two folders (design §3):
//   - NASABAH folder (the linked Customer's driveFolderId) — carry-forward identity/legal, shared by
//     reference across the customer's deals → reconciled into the `nasabah` card.
//   - APP folder (app.driveFolderId) — this deal's per-application docs → the `pengajuan` card.
// A folder whose ref is null is skipped: its card is simply all-⬜ missing (no throw).

/** The result of one discovery scan: two reconciled cards + the combined ⚠️ unrecognized bucket. */
export interface DiscoveryResult {
  /** "Dokumen Nasabah" card — carry-forward identity/legal reconciled against the nasabah folder. */
  nasabah: ReconciliationResult
  /** "Dokumen Pengajuan" card — per-deal docs reconciled against the app folder. */
  pengajuan: ReconciliationResult
  /** ⚠️ bucket: every file (from BOTH folders) that matched ZERO checklist items. */
  unrecognized: string[]
}

/** The required docTypes for an app, split by folder scope. */
function splitDocTypesByScope(app: LoanApplication): { nasabah: string[]; app: string[] } {
  // Prefer the app's own per-application snapshot (app.documents); fall back to rebuilding the
  // required-docs spec from intake attributes if the snapshot is somehow empty.
  const docTypes =
    app.documents.length > 0
      ? app.documents.filter((d) => d.required).map((d) => d.docType)
      : buildRequiredDocuments(
          {
            nasabahType: app.nasabahType,
            akadType: app.akadType,
            isMarried: app.isMarried,
            incomeSource: app.incomeSource,
            collateralType: app.collateralType,
          },
          app.id,
        ).map((d) => d.docType)

  const nasabah: string[] = []
  const appScope: string[] = []
  for (const docType of docTypes) {
    if (folderScopeForDocType(docType) === 'nasabah') nasabah.push(docType)
    else appScope.push(docType)
  }
  return { nasabah, app: appScope }
}

/**
 * Build manifest ScanEntryInput rows from a card's satisfied matches. Only SATISFIED items
 * contribute rows; each matched path becomes one entry, with its sha256/fileId looked up from the
 * listed files (paths-only — never bytes). A matched path with no listed sha256 contributes an
 * empty-string sha256 (the manifest dedupes on (docType, sha256), so this stays well-defined).
 */
function manifestEntriesFor(matches: DocMatch[], files: DiscoveredFile[]): ScanEntryInput[] {
  const byPath = new Map<string, DiscoveredFile>()
  for (const f of files) byPath.set(f.path, f)

  const entries: ScanEntryInput[] = []
  for (const m of matches) {
    if (m.state !== 'satisfied') continue
    for (const fullPath of m.matchedPaths) {
      const file = byPath.get(fullPath)
      entries.push({
        docType: m.docType,
        fullPath,
        sha256: file?.sha256 ?? '',
        fileId: file?.fileId ?? null,
      })
    }
  }
  return entries
}

/**
 * Discover an application's source documents across its nasabah + app Drive folders.
 *
 * Steps (NO byte/content read anywhere):
 *  a. Split the app's required docTypes into nasabah-scope vs app-scope (folderScopeForDocType).
 *  b. List each folder via the Drive provider (skip a null ref) and reconcile it against ITS scope's
 *     checklist items (reconcileDiscovery + itemsFor).
 *  c. Append the SATISFIED matches to the manifest ledger: nasabah matches under { customerId },
 *     app matches under { applicationId }.
 *  d. Combine both cards' unrecognized files into the ⚠️ bucket.
 */
export async function discoverForApp(
  app: LoanApplication,
  scannedBy: string,
): Promise<DiscoveryResult> {
  const provider = driveProvider()
  const { nasabah: nasabahDocTypes, app: appDocTypes } = splitDocTypesByScope(app)

  // Resolve the linked customer's nasabah folder ref (LoanApplication doesn't carry customerId in
  // the dual-read window, so read it directly off the row). Either id or folder ref may be null.
  // Read the app's own driveFolderId + the linked customer's driveFolderId straight off the row —
  // the LoanApplication domain aggregate carries neither customerId nor driveFolderId in the
  // dual-read window, so the serializer/type stay untouched.
  const refs = await getApplicationFolderRefs(app.id)
  const customerId = refs.customerId
  const nasabahFolderRef = refs.customerDriveFolderId
  const appFolderRef = refs.appDriveFolderId

  // List each folder (skip a null ref → empty file list → all-⬜ card).
  const nasabahFiles = nasabahFolderRef ? await provider.listFolderTree(nasabahFolderRef) : []
  const appFiles = appFolderRef ? await provider.listFolderTree(appFolderRef) : []

  const nasabah = reconcileDiscovery(nasabahFiles, itemsFor(nasabahDocTypes))
  const pengajuan = reconcileDiscovery(appFiles, itemsFor(appDocTypes))

  // Append satisfied matches to the manifest ledger under each scope. The nasabah scope needs a
  // customerId; if there's no linked customer we skip the nasabah append (nothing to scope it to).
  if (customerId) {
    const nasabahEntries = manifestEntriesFor(nasabah.matches, nasabahFiles)
    if (nasabahEntries.length > 0) {
      await appendScanEntries({ customerId }, scannedBy, nasabahEntries)
    }
  }
  const appEntries = manifestEntriesFor(pengajuan.matches, appFiles)
  if (appEntries.length > 0) {
    await appendScanEntries({ applicationId: app.id }, scannedBy, appEntries)
  }

  return {
    nasabah,
    pengajuan,
    unrecognized: [...nasabah.unrecognized, ...pengajuan.unrecognized],
  }
}
