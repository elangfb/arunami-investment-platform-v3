import type { DriveProvider, DiscoveredFile } from './provider'

// The default Drive provider: an in-memory, deterministic fake tree. Zero IO, zero credentials,
// zero egress — keeps dev + tests running with no Google config (mirrors stubOcrProvider). The real
// Google Drive client is DEFERRED pending OAuth creds (see index.ts + docs/guides/google-docs-oauth.md).
//
// CONTENT-FREE: like every provider, it surfaces PATHS + sha256/fileId only, never bytes.

// Module-level seed store: folderRef → its fake file tree. Tests stage a tree with
// __seedStubFolder(ref, files); an unseeded ref lists as empty (no throw). Module-level so the
// seam is process-wide for the duration of a test run, exactly like a real Drive's contents.
const STUB_FOLDERS = new Map<string, DiscoveredFile[]>()

/**
 * TEST HELPER — stage a fake folder tree for a folderRef so itests can drive discovery without a
 * real Drive. Replaces any prior seed for the same ref. Not used in production paths.
 */
export function __seedStubFolder(folderRef: string, files: DiscoveredFile[]): void {
  STUB_FOLDERS.set(folderRef, files)
}

/** TEST HELPER — clear all staged stub folders (call between itests for isolation). */
export function __resetStubFolders(): void {
  STUB_FOLDERS.clear()
}

export function stubDriveProvider(): DriveProvider {
  return {
    name: 'stub',
    async listFolderTree(folderRef: string): Promise<DiscoveredFile[]> {
      // Unknown/unseeded ref → empty tree (the folder's card is simply all-⬜ missing).
      return STUB_FOLDERS.get(folderRef) ?? []
    },
    // No-op scaffold: pretends every requested docType sub-folder was created. Deterministic.
    async scaffoldStandardStructure(_folderRef: string, docTypes: string[]) {
      return { created: docTypes.map((d) => `${d}/`) }
    },
  }
}
