import type { DiscoveredFile } from '@/lib/doc-discovery/matcher'

// Swappable Drive provider boundary (RM-led redesign, design §3). Mirrors the OCR seam
// (server/ocr/provider.ts): the discovery service depends only on this interface, so moving from
// the in-memory stub → the real Google Drive client is `DRIVE_PROVIDER=<name>` + that provider's
// credentials, NEVER a call-site change. Add a provider = implement this interface and register it
// in index.ts.
//
// CONTENT-FREE CONTRACT (invariant, design §3 — "Discovery never reads content"): a provider lists
// file PATHS + a content-address (a Drive-supplied sha256 / fileId), and NOTHING ELSE. It MUST NOT
// download bytes, open files, or run OCR. `DiscoveredFile` (re-exported below from the matcher) is
// path strings + optional fileId/sha256 only — there is no byte field, by design. The downstream
// matcher is a pure name test against the path; a provider that read content would break the
// invariant and the audit posture (no silent PII egress at discovery time).

/** Re-exported from the matcher so providers and the service share ONE file shape. Paths only. */
export type { DiscoveredFile } from '@/lib/doc-discovery/matcher'

export interface DriveProvider {
  readonly name: string

  /**
   * List every file under a folder (recursively), as PATHS + content-address refs only.
   * `folderRef` is the provider's folder handle (a Drive folder id for the real client; an
   * opaque key for the stub). Returns [] for an unknown/empty folder. NEVER reads bytes.
   */
  listFolderTree(folderRef: string): Promise<DiscoveredFile[]>

  /**
   * OPTIONAL: scaffold the standard sub-folder structure for a set of docTypes inside a folder
   * (so the RM drops each doc into a labelled place). Best-effort: returns the created folder
   * names and an optional warning. A provider may omit this (the stub implements a no-op).
   */
  scaffoldStandardStructure?(
    folderRef: string,
    docTypes: string[],
  ): Promise<{ created: string[]; warning?: string }>
}
