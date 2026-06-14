// Client-side calls to the Docs API routes.
import type { ExtractedSnapshot, ExtractionReport } from './extraction/types'
import type { SeedContext } from './seed-context'

export interface DocLinkageDTO {
  applicationId: string
  muapDocId: string | null // N2 (ADR-0018): null until the explicit RM "Generate MUAP" mints it
  rskDocId: string | null // Batch 3 T3: null until the RSK is created at Stage-4 entry
  templateVersion: string
  shortcutWarning?: string | null // P4-C (ADR-0019 §4): set when a shortcut into the user folder 403'd → "Coba lagi"
}

export interface DocsState {
  linkage: DocLinkageDTO | null
  latestReport: ExtractionReport | null
  snapshot: ExtractedSnapshot | null
}


export interface DocumentVersionDTO {
  id: string
  applicationId: string
  kind: 'muap' | 'rsk'
  docId: string
  sourceDocId: string | null
  trigger: string
  label: string
  createdBy: string
  createdByName: string | null
  createdAt: string
}
export const docUrl = (docId: string) => `https://docs.google.com/document/d/${docId}/edit`
// Read-only embeddable view. /preview (unlike /edit) is not frame-blocked, so it
// can be iframed; the viewer still needs Google access to the doc to see content.
export const docPreviewUrl = (docId: string) => `https://docs.google.com/document/d/${docId}/preview`

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data as T
}

export function fetchApplicationDocs(id: string): Promise<DocsState> {
  return fetch(`/api/applications/${id}/docs`, { cache: 'no-store' }).then((r) => jsonOrThrow<DocsState>(r))
}

// The server can't read the in-memory app store, so the client sends the SeedContext
// in the body — the server seeds the freshly-copied Docs from it (facts + AI prose).
export function createApplicationDocs(id: string, seed?: SeedContext): Promise<DocLinkageDTO> {
  return fetch(`/api/applications/${id}/docs/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed }),
  }).then((r) => jsonOrThrow<DocLinkageDTO>(r))
}

// Force a fresh MUAP/RSK pair, replacing the linkage. ADR-0008: server snapshots the current pair
// first into DocumentVersion, so the superseded Docs are no longer orphaned/lost.
export function regenerateApplicationDocs(id: string, seed?: SeedContext): Promise<DocLinkageDTO> {
  return fetch(`/api/applications/${id}/docs/regenerate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed }),
  }).then((r) => jsonOrThrow<DocLinkageDTO>(r))
}

export function extractApplicationDocs(id: string): Promise<{ report: ExtractionReport; snapshot: ExtractedSnapshot | null }> {
  return fetch(`/api/applications/${id}/docs/extract`, { method: 'POST' }).then((r) =>
    jsonOrThrow<{ report: ExtractionReport; snapshot: ExtractedSnapshot | null }>(r),
  )
}

export function fetchDocumentVersions(id: string): Promise<DocumentVersionDTO[]> {
  return fetch(`/api/applications/${id}/docs/versions`, { cache: 'no-store' }).then((r) => jsonOrThrow<DocumentVersionDTO[]>(r))
}

export function rollbackDocumentVersion(id: string, versionId: string): Promise<DocLinkageDTO> {
  return fetch(`/api/applications/${id}/docs/rollback`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ versionId }),
  }).then((r) => jsonOrThrow<DocLinkageDTO>(r))
}

export interface DecisionCheckpointDTO {
  id: string
  decision: string
  decidedAt: string
  contentHash: string
  muapBytes: number
  rskBytes: number
}

// Freeze MUAP+RSK to immutable PDFs at the committee decision (audit trail).
export function freezeApplicationDocs(id: string, decision: string): Promise<DecisionCheckpointDTO> {
  return fetch(`/api/applications/${id}/docs/freeze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision }),
  }).then((r) => jsonOrThrow<DecisionCheckpointDTO>(r))
}

// URL to the frozen PDF captured at the decision (for audit download links).
export const checkpointPdfUrl = (id: string, which: 'muap' | 'rsk') =>
  `/api/applications/${id}/docs/checkpoint?doc=${which}`
