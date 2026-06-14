import 'server-only'

import { google } from 'googleapis'
import { getOAuthClient } from '@/server/google/auth'
import { withRetry } from '@/server/retry'
import type { DriveProvider } from './provider'
import type { DiscoveredFile } from '@/lib/doc-discovery/matcher'

// Real Google Drive provider for document discovery (P2 / design §3). Lists a folder's file tree as
// PATHS + content-address refs ONLY — it NEVER downloads bytes or runs OCR (the "discovery never reads
// content" invariant). It reads the dedicated Mizan account via the same documents+drive OAuth the rest
// of server/google uses (getOAuthClient → GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN).
//
// CONTENT ADDRESS: Drive exposes `md5Checksum` for uploaded binary files (PDF/JPG/PNG — exactly the
// source docs the RM drops in) WITHOUT a download. Google-native files (Docs/Sheets) have no checksum.
// We store that md5 in the manifest's `sha256` field as the content address: it DETECTS change (a new
// digest = a new version) which is all the source-doc ledger needs (Fork B5). The field name is a
// historical misnomer — it holds whatever content hash the provider can supply without reading bytes.

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const MAX_DEPTH = 25 // defensive bound against pathological nesting (Drive folders cannot truly cycle)

type DriveV3 = ReturnType<typeof google.drive>

function realDrive(): DriveV3 {
  // Always the REAL client — the 'google' provider is selected by DRIVE_PROVIDER, independent of the
  // DOCS_PROVIDER stub used for Docs e2e. The discovery STUB is server/discovery/stub.ts.
  return google.drive({ version: 'v3', auth: getOAuthClient() })
}

/** One page-through of a folder's direct children (files + subfolders). Metadata only. */
async function listChildren(drive: DriveV3, folderId: string): Promise<
  { id: string; name: string; mimeType: string; md5Checksum?: string | null }[]
> {
  const out: { id: string; name: string; mimeType: string; md5Checksum?: string | null }[] = []
  let pageToken: string | undefined
  do {
    const res = await withRetry(
      () =>
        drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          // Metadata ONLY — name, type, and the content checksum. No content/bytes.
          fields: 'nextPageToken, files(id, name, mimeType, md5Checksum)',
          pageSize: 1000,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        }),
      { label: 'drive.files.list.discovery' },
    )
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name) continue
      out.push({ id: f.id, name: f.name, mimeType: f.mimeType ?? '', md5Checksum: f.md5Checksum })
    }
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

/**
 * Recursively list every file under `folderId` as DiscoveredFile (path relative to the scanned root +
 * fileId + content-address md5). Subfolder names become path segments (so a KTP/ folder match works).
 * Content-free: only metadata is read, never bytes.
 */
async function listFolderTree(folderId: string): Promise<DiscoveredFile[]> {
  const drive = realDrive()
  const files: DiscoveredFile[] = []

  async function walk(id: string, prefix: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return
    const children = await listChildren(drive, id)
    for (const child of children) {
      const path = prefix ? `${prefix}/${child.name}` : child.name
      if (child.mimeType === FOLDER_MIME) {
        await walk(child.id, path, depth + 1)
      } else {
        files.push({ path, fileId: child.id, sha256: child.md5Checksum ?? undefined })
      }
    }
  }

  await walk(folderId, '', 0)
  return files
}

/**
 * Opt-in scaffold: create one subfolder per docType inside `folderId` (design §3 — so the RM can drop
 * each doc into a labelled place). Best-effort: a missing-Editor permission (403) is a WARNING, never a
 * hard failure (the design's "warn, never require"). Existing same-named folders are not deduped here —
 * Drive allows duplicate folder names; the matcher tolerates it.
 */
async function scaffoldStandardStructure(
  folderId: string,
  docTypes: string[],
): Promise<{ created: string[]; warning?: string }> {
  const drive = realDrive()
  const created: string[] = []
  for (const docType of docTypes) {
    try {
      await withRetry(
        () =>
          drive.files.create({
            requestBody: { name: docType, mimeType: FOLDER_MIME, parents: [folderId] },
            fields: 'id',
            supportsAllDrives: true,
          }),
        { label: 'drive.files.create.scaffold' },
      )
      created.push(docType)
    } catch (e) {
      // Missing Editor access on a user-supplied folder → warn, never require (design §3).
      const status = (e as { code?: number; status?: number })?.code ?? (e as { status?: number })?.status
      if (status === 403) {
        return {
          created,
          warning: 'Mizan tidak memiliki akses Editor pada folder ini — beri akses Editor lalu coba lagi.',
        }
      }
      throw e
    }
  }
  return { created }
}

/** The real Google Drive provider (DRIVE_PROVIDER=google). Content-free folder listing + opt-in scaffold. */
export function googleDriveProvider(): DriveProvider {
  return { name: 'google', listFolderTree, scaffoldStandardStructure }
}
