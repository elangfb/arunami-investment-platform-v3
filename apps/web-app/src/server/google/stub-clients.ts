import 'server-only'

// In-memory stubs for googleapis Docs+Drive — selected when DOCS_PROVIDER=stub.
// They reproduce the EXACT method shapes used by server/docs/* and
// server/google/extract/*: { data: ... } envelopes, error semantics on missing IDs,
// deterministic IDs and bytes. Anything not implemented here is a real omission —
// fail loudly so we extend the stub rather than skip a test.
//
// State is process-local; e2e runs in workers:1 so cross-scenario bleed is bounded.
// Cleared by clearStubDocsState() between scenarios via support/db.ts.

interface StubDoc {
  documentId: string
  title: string
  namedRanges: Record<string, string> // name → current value
  inlineImages: { uri: string; index: number }[] // recorded insertInlineImage requests
}

const stubDocs = new Map<string, StubDoc>()
let nextSeq = 1

// P4-C (ADR-0019 §4): the Mizan-owned generated-doc folders + the shortcuts placed into the user folder.
// `stubFolders` records created folders (id → parents + permission grants) so a parented copy/shortcut,
// the root-share reparent (files.update addParents), and root 'reader' grants can be itest-asserted;
// `stubShortcuts` records each shortcut's targetId + parent so a test can verify a shortcut was dropped
// into the user folder.
interface StubFolder {
  parents: string[]
  permissions: { id: string; role?: string; type?: string; emailAddress?: string }[]
}
const stubFolders = new Map<string, StubFolder>()
const stubShortcuts = new Map<string, { targetId?: string; parents?: string[] }>()
// A test can force the next shortcut create to 403 (Mizan lacks Editor on the user folder) to exercise the
// warn + "Coba lagi" path. Reset by clearStubDocsState and consumed once per shortcut create.
let forceShortcut403 = false
// A test can force the next permissions.create to throw with the given HTTP code (e.g. 400 invalid
// sharee — a non-Google email) to exercise root-share.ts's permanent-failure 'invalid' marker.
// Reset by clearStubDocsState and consumed once per permissions.create.
let forcePermissionCreateCode: number | null = null

// Real Drive v3 is SINGLE-parent: a file created without `parents` implicitly lives under the
// account's My Drive root, and files.update must MOVE (addParents + removeParents) — adding a
// second parent 403s ("a file can only have one parent"). The stub mirrors that with a sentinel
// parent id so reparent logic that forgets removeParents fails here too, not only in production.
export const STUB_MYDRIVE_ROOT = 'stub-mydrive-root'

function newDocId(kind: 'muap' | 'rsk' | 'doc' | 'folder' | 'shortcut'): string {
  return `stub-${kind}-${nextSeq++}`
}

export function clearStubDocsState(): void {
  stubDocs.clear()
  stubFolders.clear()
  stubShortcuts.clear()
  forceShortcut403 = false
  forcePermissionCreateCode = null
  nextSeq = 1
}

/** Test helper: make the NEXT stub shortcut create throw a 403 (missing-Editor on the user folder). */
export function setStubShortcut403(on = true): void {
  forceShortcut403 = on
}

/** Test helper: make the NEXT stub permissions.create throw with this HTTP code (e.g. 400 for an
 *  invalid/non-Google sharee — exercises the root-share permanent-failure 'invalid' marker). */
export function setStubPermissionCreateError(code: number | null = 400): void {
  forcePermissionCreateCode = code
}

/** Test helper: the shortcuts recorded by the stub (id → { targetId, parents }). */
export function stubShortcutsCreated(): Map<string, { targetId?: string; parents?: string[] }> {
  return stubShortcuts
}

/** Test helper: the Mizan-owned folder ids created by the stub. */
export function stubFoldersCreated(): Set<string> {
  return new Set(stubFolders.keys())
}

/** Test helper: a stub folder's current parents (root-share reparent assertions). */
export function stubFolderParents(folderId: string): string[] {
  return [...(stubFolders.get(folderId)?.parents ?? [])]
}

/** Test helper: the permission grants recorded on a stub folder (root 'reader' assertions).
 *  Strips the stub permission id — callers assert on role/type/emailAddress shape. */
export function stubFolderPermissions(
  folderId: string,
): { role?: string; type?: string; emailAddress?: string }[] {
  return (stubFolders.get(folderId)?.permissions ?? []).map(({ role, type, emailAddress }) => ({
    role,
    type,
    emailAddress,
  }))
}

function inferKind(name: string): 'muap' | 'rsk' | 'doc' {
  const n = name.toLowerCase()
  if (n.startsWith('muap')) return 'muap'
  if (n.startsWith('rsk')) return 'rsk'
  return 'doc'
}

// Mirrors `googleapis` Docs+Drive return envelopes — { data: ... } — and the subset of
// methods reached from server/docs/* + server/google/extract/*. We intentionally keep
// the shape loose at the seam; the call sites destructure { data: { id } } / { data.body } /
// { data.namedRanges } and never inspect anything beyond what's filled in here.

interface DocsBatchUpdateRequest {
  replaceNamedRangeContent?: { namedRangeName: string; text: string }
  insertInlineImage?: { uri: string; location: { index: number }; objectSize?: unknown }
}

interface NamedRangeEntry {
  name: string
  namedRanges: { namedRangeId: string; ranges: { startIndex: number; endIndex: number }[] }[]
}

function namedRangesEnvelope(doc: StubDoc): Record<string, NamedRangeEntry> {
  const out: Record<string, NamedRangeEntry> = {}
  let i = 0
  for (const name of Object.keys(doc.namedRanges)) {
    i++
    out[name] = {
      name,
      namedRanges: [{ namedRangeId: `${doc.documentId}-${i}`, ranges: [{ startIndex: i, endIndex: i + 1 }] }],
    }
  }
  return out
}

function bodyEnvelope(_doc: StubDoc): { content: unknown[] } {
  // The extractor (server/google/extract/extractDocs.ts) walks body.content; an empty
  // array yields an empty snapshot, which is the right behaviour for tests that don't
  // exercise extraction end-to-end. Scenarios that DO need extracted values will
  // pre-seed via seedStubNamedRanges() before the extract call.
  return { content: [] }
}

export function stubDocsClient() {
  return {
    documents: {
      async get(params: { documentId: string; fields?: string }) {
        const doc = stubDocs.get(params.documentId)
        if (!doc) throw new Error(`stub docs.get: unknown documentId ${params.documentId}`)
        return {
          data: {
            documentId: doc.documentId,
            title: doc.title,
            namedRanges: namedRangesEnvelope(doc),
            body: bodyEnvelope(doc),
          },
        }
      },
      async batchUpdate(params: { documentId: string; requestBody: { requests: DocsBatchUpdateRequest[] } }) {
        const doc = stubDocs.get(params.documentId)
        if (!doc) throw new Error(`stub docs.batchUpdate: unknown documentId ${params.documentId}`)
        for (const req of params.requestBody.requests ?? []) {
          if (req.replaceNamedRangeContent) {
            const { namedRangeName, text } = req.replaceNamedRangeContent
            doc.namedRanges[namedRangeName] = text
          }
          if (req.insertInlineImage) {
            doc.inlineImages.push({ uri: req.insertInlineImage.uri, index: req.insertInlineImage.location.index })
          }
        }
        return { data: { replies: [] } }
      },
    },
  }
}

export function stubDriveClient() {
  return {
    files: {
      async copy(params: { fileId: string; requestBody?: { name?: string; parents?: string[] }; fields?: string }) {
        const kind = inferKind(params.requestBody?.name ?? '')
        const id = newDocId(kind)
        stubDocs.set(id, {
          documentId: id,
          title: params.requestBody?.name ?? id,
          namedRanges: {},
          inlineImages: [],
        })
        // P4-C: a `parents` ref lands the copy under a Mizan-owned folder. The id is recorded loosely —
        // the parent need not be a known stub folder (it may be a real-id pre-seeded test value).
        return { data: { id } }
      },
      // P4-C (ADR-0019 §4): create a Mizan-owned FOLDER (mimeType folder) or a SHORTCUT into the user
      // folder (mimeType shortcut, shortcutDetails.targetId). Deterministic ids; the shortcut records its
      // targetId + parents so tests can assert it landed in the user folder. A 403 can be forced to
      // exercise the warn + "Coba lagi" retry. Mirrors drive.files.create used by server/docs/mizan-drive.ts.
      async create(params: {
        requestBody?: { name?: string; mimeType?: string; parents?: string[]; shortcutDetails?: { targetId?: string } }
        fields?: string
      }) {
        const mime = params.requestBody?.mimeType
        if (mime === 'application/vnd.google-apps.folder') {
          const id = newDocId('folder')
          // Root-share (ADR-0019 §3 V1): record parents so a per-app folder parented under the
          // root "Mizan" folder — and a later files.update MOVE reparent — can be asserted.
          // No `parents` → the implicit My Drive root sentinel (real-Drive fidelity: a legacy flat
          // folder is NOT parentless; reparenting it requires removeParents of the implicit root).
          const parents = params.requestBody?.parents?.length
            ? [...params.requestBody.parents]
            : [STUB_MYDRIVE_ROOT]
          stubFolders.set(id, { parents, permissions: [] })
          return { data: { id } }
        }
        if (mime === 'application/vnd.google-apps.shortcut') {
          if (forceShortcut403) {
            forceShortcut403 = false
            // Mirror googleapis' error shape (a numeric `code`) so is403() in mizan-drive.ts matches.
            throw Object.assign(new Error('stub drive.files.create: forced 403 (missing Editor)'), { code: 403 })
          }
          const id = newDocId('shortcut')
          stubShortcuts.set(id, {
            targetId: params.requestBody?.shortcutDetails?.targetId,
            parents: params.requestBody?.parents,
          })
          return { data: { id } }
        }
        throw new Error(`stub drive.files.create: unsupported mimeType ${mime ?? '(none)'}`)
      },
      async export(params: { fileId: string; mimeType: string }) {
        const doc = stubDocs.get(params.fileId)
        if (!doc) throw new Error(`stub drive.export: unknown fileId ${params.fileId}`)
        // Deterministic PDF-shaped bytes: callers hash them (decision-freeze contentHash)
        // and store them — they never PDF-parse the result.
        const payload = `%PDF-stub\n${doc.documentId}\n${JSON.stringify(doc.namedRanges)}\n%%EOF`
        const buf = Buffer.from(payload)
        // googleapis returns an ArrayBuffer when responseType=arraybuffer; mirror that.
        const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
        return { data: ab }
      },
      async get(params: { fileId: string; fields?: string }) {
        // Root-share (ADR-0019 §3 V1): a stub FOLDER id answers with its parents (reconcile sweep
        // reads `fields: 'parents'`); doc ids keep the existing revision/modifiedTime envelope.
        const folder = stubFolders.get(params.fileId)
        if (folder) return { data: { id: params.fileId, parents: [...folder.parents] } }
        const doc = stubDocs.get(params.fileId)
        if (!doc) throw new Error(`stub drive.get: unknown fileId ${params.fileId}`)
        return { data: { headRevisionId: `${doc.documentId}-rev1`, modifiedTime: '2026-01-01T00:00:00.000Z' } }
      },
      // Root-share (ADR-0019 §3 V1): MOVE a legacy flat per-app folder under the root. Real Drive
      // v3 fidelity: removeParents applies FIRST, then addParents (comma-separated), and a result
      // with more than one parent throws a 403-shaped error (single-parent model — addParents
      // without removeParents on a parented file 403s in production). Folders only — no production
      // path updates a doc's parents.
      async update(params: { fileId: string; addParents?: string; removeParents?: string; fields?: string }) {
        const folder = stubFolders.get(params.fileId)
        if (!folder) throw new Error(`stub drive.files.update: unknown folder fileId ${params.fileId}`)
        const remove = new Set((params.removeParents ?? '').split(',').filter(Boolean))
        const next = folder.parents.filter((p) => !remove.has(p))
        for (const p of (params.addParents ?? '').split(',')) {
          if (p && !next.includes(p)) next.push(p)
        }
        if (next.length > 1) {
          throw Object.assign(
            new Error('stub drive.files.update: a file can only have one parent (use removeParents to move)'),
            { code: 403 },
          )
        }
        folder.parents = next
        return { data: { id: params.fileId, parents: [...folder.parents] } }
      },
    },
    // Per-user sharing of the per-app Docs (server/docs/access.ts) AND of the root "Mizan" folder
    // (server/docs/root-share.ts) — folder ids are accepted alongside doc ids. The stub mints a
    // deterministic permission id; the DocAccessGrant/DriveRootGrant row is what the tests assert
    // on (a folder additionally records the grant for stubFolderPermissions()).
    permissions: {
      async create(params: {
        fileId: string
        sendNotificationEmail?: boolean
        fields?: string
        requestBody?: { role?: string; type?: string; emailAddress?: string }
      }) {
        if (forcePermissionCreateCode !== null) {
          const code = forcePermissionCreateCode
          forcePermissionCreateCode = null
          // Mirror googleapis' error shape (numeric `code`) so statusOf() in server/retry.ts matches.
          throw Object.assign(new Error(`stub drive.permissions.create: forced ${code}`), { code })
        }
        const folder = stubFolders.get(params.fileId)
        if (folder) {
          const id = `stub-perm-${nextSeq++}`
          folder.permissions.push({
            id,
            role: params.requestBody?.role,
            type: params.requestBody?.type,
            emailAddress: params.requestBody?.emailAddress,
          })
          return { data: { id } }
        }
        if (!stubDocs.has(params.fileId)) throw new Error(`stub drive.permissions.create: unknown fileId ${params.fileId}`)
        return { data: { id: `stub-perm-${nextSeq++}` } }
      },
      // Mirror of the live downgrade-on-advance path (Batch 3 T2). The DocAccessGrant row is what
      // the tests assert on; the stub just acknowledges the role change idempotently.
      async update(params: { fileId: string; permissionId: string; requestBody?: { role?: string } }) {
        if (!stubDocs.has(params.fileId) && !stubFolders.has(params.fileId)) {
          throw new Error(`stub drive.permissions.update: unknown fileId ${params.fileId}`)
        }
        return { data: { id: params.permissionId, role: params.requestBody?.role } }
      },
      // Root-share trust-but-verify (reconcileRootShare) + revoke-by-email fallback: list a stub
      // folder's recorded permissions. `fields` is accepted-and-ignored (the stub always returns
      // the full id/role/type/emailAddress shape the callers select).
      async list(params: { fileId: string; fields?: string }) {
        const folder = stubFolders.get(params.fileId)
        if (folder) return { data: { permissions: folder.permissions.map((p) => ({ ...p })) } }
        if (!stubDocs.has(params.fileId)) throw new Error(`stub drive.permissions.list: unknown fileId ${params.fileId}`)
        return { data: { permissions: [] } }
      },
      // Root-share revocation (offboarding / reconcile-down). Real Drive 404s on an unknown
      // permission id — mirror that (revokeRootGrant treats 404 as already-removed).
      async delete(params: { fileId: string; permissionId: string }) {
        const folder = stubFolders.get(params.fileId)
        if (folder) {
          const idx = folder.permissions.findIndex((p) => p.id === params.permissionId)
          if (idx < 0) {
            throw Object.assign(
              new Error(`stub drive.permissions.delete: unknown permissionId ${params.permissionId}`),
              { code: 404 },
            )
          }
          folder.permissions.splice(idx, 1)
          return { data: {} }
        }
        if (!stubDocs.has(params.fileId)) throw new Error(`stub drive.permissions.delete: unknown fileId ${params.fileId}`)
        return { data: {} }
      },
    },
  }
}

// Test helper: pre-populate a stub doc's namedRanges so an `extract` round-trip can be
// exercised. Not used by production code paths — only by e2e scenarios that need to
// stage a doc state. Returns the docId so the caller can wire it into DocLinkage.
export function seedStubDoc(opts: {
  kind?: 'muap' | 'rsk' | 'doc'
  title?: string
  namedRanges?: Record<string, string>
}): string {
  const id = newDocId(opts.kind ?? 'doc')
  stubDocs.set(id, {
    documentId: id,
    title: opts.title ?? id,
    namedRanges: { ...(opts.namedRanges ?? {}) },
    inlineImages: [],
  })
  return id
}

/** Test helper: the insertInlineImage requests recorded for a stub doc (for QR-stamp assertions). */
export function stubInlineImages(docId: string): { uri: string; index: number }[] {
  return stubDocs.get(docId)?.inlineImages ?? []
}
