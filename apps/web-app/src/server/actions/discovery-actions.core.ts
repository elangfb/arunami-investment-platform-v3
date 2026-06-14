import 'server-only'

import { getApplication } from '@/server/repo/applications'
import { assertCanWorkDesk, canActOnDesk, hasDesk, AuthzError, type Actor } from '@/lib/auth/can'
import { getApplicationFolderRefs, setAppDriveFolder, setCustomerDriveFolder } from '@/server/repo/drive-folder'
import { log } from '@/server/log'
import { discoverForApp, type DiscoveryResult } from '@/server/discovery/discover'
import { driveProvider } from '@/server/discovery'
import { listManifest } from '@/server/repo/source-manifest'
import { folderScopeForDocType, type FolderScope } from '@/lib/doc-discovery/folder-scope'
import { parseDriveFolderRef } from '@/lib/doc-discovery/folder-ref'
import { buildRequiredDocuments } from '@/lib/required-docs'
import type { LoanApplication } from '@/lib/types'

// Actor-injected cores of the document-discovery server actions (RM-led redesign, design §3).
// Kept OUT of the 'use server' module so the actor-trusting entry points are NOT registered as public
// server actions (a forged Actor over the wire) — discovery-actions.ts resolves + gates the real actor,
// then delegates here. server-only (never bundled to the client). This split also makes the gated logic
// itest-able with a test Actor (mirrors application-create.core.ts) — no session mock needed.
//
// Discovery state is NOT stored on the LoanApplication aggregate: the SourceDocManifestEntry ledger is
// the persistence, the reconciliation is computed LIVE by discoverForApp on every scan. So these cores
//   • load the app aggregate ONLY for the desk gate (read; never mutate/save it),
//   • read/write the two Drive folder refs via DIRECT prisma on Customer.driveFolderId /
//     Application.driveFolderId (those columns are not on the domain serializer), and
//   • return a DiscoveryStatus / manifest rows — NEVER the app aggregate (no optimistic-lock coupling).
// Content-free end to end: only file PATHS flow through, never bytes.

/** The two scopes the UI distinguishes: 'nasabah' (customer folder) vs 'app' (per-deal folder). */
export type DiscoveryTarget = 'nasabah' | 'app'

/** One reconciliation run + which folders are linked, for the two-card panel. */
export interface DiscoveryStatus {
  nasabahFolderLinked: boolean
  appFolderLinked: boolean
  result: DiscoveryResult
}

/** A manifest ledger row as the Riwayat view consumes it (path strings only — never bytes). */
export interface ManifestRow {
  id: string
  docType: string
  fullPath: string
  sha256: string
  fileId: string | null
  scannedAt: string
  scannedBy: string
}

/** Load the app aggregate for the GATE only. Read-fine (getApplication is cached). */
async function loadForGate(appId: string): Promise<LoanApplication> {
  const app = await getApplication(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  return app
}

/** The two Drive folder refs (app's own + its linked customer's) read straight off the rows. */
async function readFolderRefs(
  appId: string,
): Promise<{ customerId: string | null; nasabahFolderRef: string | null; appFolderRef: string | null }> {
  const refs = await getApplicationFolderRefs(appId)
  return {
    customerId: refs.customerId,
    nasabahFolderRef: refs.customerDriveFolderId,
    appFolderRef: refs.appDriveFolderId,
  }
}

/** The required docTypes for an app, filtered to a single folder scope. */
function requiredDocTypesForScope(app: LoanApplication, scope: FolderScope): string[] {
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
  return docTypes.filter((docType) => folderScopeForDocType(docType) === scope)
}

/** Run a discovery scan + report linked-folder flags. READ-leaning gate (participant OR RM intake).
 *  discoverForApp appends satisfied matches to the manifest ledger as a side effect (scan-of-record). */
export async function runDiscoveryForActor(actor: Actor, appId: string): Promise<DiscoveryStatus> {
  const app = await loadForGate(appId)
  if (!canActOnDesk(actor, app) && !hasDesk(actor, 'intake')) {
    throw new AuthzError('Tindakan ditolak: Anda tidak memiliki akses untuk melihat dokumen Drive.')
  }
  const { nasabahFolderRef, appFolderRef } = await readFolderRefs(appId)
  const result = await discoverForApp(app, actor.userId)
  return { nasabahFolderLinked: nasabahFolderRef != null, appFolderLinked: appFolderRef != null, result }
}

/** Link a Drive folder to a scope (RM intake-gated), persist via direct prisma, then re-scan. */
export async function linkDriveFolderForActor(
  actor: Actor,
  appId: string,
  target: DiscoveryTarget,
  input: string,
): Promise<DiscoveryStatus> {
  const app = await loadForGate(appId)
  assertCanWorkDesk(actor, app, 'intake')

  const folderId = parseDriveFolderRef(input)
  if (!folderId) throw new Error('URL/ID folder tidak valid.')

  if (target === 'app') {
    await setAppDriveFolder(appId, folderId, 'user')
  } else {
    const { customerId } = await readFolderRefs(appId)
    if (!customerId) throw new Error('Nasabah belum tertaut ke pengajuan ini.')
    await setCustomerDriveFolder(customerId, folderId, 'user')
  }

  // Audit WITHOUT the folder ref itself (no folder names/urls/ids — PII-adjacent).
  log.info('discovery.folder_linked', { appId, target })
  return runDiscoveryForActor(actor, appId)
}

/** Scaffold the standard sub-folder structure inside a linked folder (best-effort, RM intake-gated). */
export async function scaffoldDriveFolderForActor(
  actor: Actor,
  appId: string,
  target: DiscoveryTarget,
): Promise<{ created: string[]; warning?: string }> {
  const app = await loadForGate(appId)
  assertCanWorkDesk(actor, app, 'intake')

  const { nasabahFolderRef, appFolderRef } = await readFolderRefs(appId)
  const ref = target === 'app' ? appFolderRef : nasabahFolderRef
  if (!ref) throw new Error('Hubungkan folder dulu sebelum membuat struktur.')

  const provider = driveProvider()
  if (!provider.scaffoldStandardStructure) {
    return { created: [], warning: 'Penyedia Drive ini tidak mendukung pembuatan struktur folder.' }
  }
  const docTypes = requiredDocTypesForScope(app, target === 'app' ? 'app' : 'nasabah')
  const result = await provider.scaffoldStandardStructure(ref, docTypes)
  log.info('discovery.folder_scaffolded', { appId, target, created: result.created.length })
  return result
}

/** List the source-doc manifest ledger for both scopes (Riwayat). READ-leaning gate; path-only rows. */
export async function listSourceManifestForActor(
  actor: Actor,
  appId: string,
): Promise<{ nasabah: ManifestRow[]; app: ManifestRow[] }> {
  const app = await loadForGate(appId)
  if (!canActOnDesk(actor, app) && !hasDesk(actor, 'intake')) {
    throw new AuthzError('Tindakan ditolak: Anda tidak memiliki akses untuk melihat riwayat dokumen.')
  }
  const { customerId } = await readFolderRefs(appId)
  const appRows = await listManifest({ applicationId: appId })
  const nasabahRows = customerId ? await listManifest({ customerId }) : []
  return { app: appRows.map(toManifestRow), nasabah: nasabahRows.map(toManifestRow) }
}

/** Serialize a repo manifest row to the wire shape (Date → ISO string for the client boundary). */
function toManifestRow(row: {
  id: string
  docType: string
  fullPath: string
  sha256: string
  fileId: string | null
  scannedAt: Date
  scannedBy: string
}): ManifestRow {
  return {
    id: row.id,
    docType: row.docType,
    fullPath: row.fullPath,
    sha256: row.sha256,
    fileId: row.fileId,
    scannedAt: row.scannedAt.toISOString(),
    scannedBy: row.scannedBy,
  }
}
