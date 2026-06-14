// Application ↔ Google Docs lifecycle: copy the masters per application, run the
// extraction, and persist linkage + each run. The detail page / API call these.

import { createHash } from 'node:crypto'
import { driveClient, docsClient } from '../google/clients'
import { extractApplicationDocs } from '../google/extract/extractDocs'
import type { ExtractedSnapshot, ExtractionReport } from '../../lib/extraction/types'
import type { SeedContext } from '../../lib/seed-context'
import { fillApplicationDoc } from './seed'
import type { LoanApplication } from '../../lib/types'
import { generateMuapNarrative, generateRskNarrative } from '../ai/narrative'
import { loadCascadeForSurface } from '../ai/context-layers'
import { log, errField } from '../log'
import { withRetry } from '../retry'
import { getActiveRiskPolicyDetailed } from '../config/risk-policy'
import { ensureBucket, getDocument, putDocument } from '../storage/s3'
import { extractSnapshotFromMarkdown } from '../ai/extract-from-markdown'
import { getApplication } from '../repo'
import { loadApplicationForWrite, saveApplication } from '../repo/write'
import { appendHistory } from '../../lib/history'
import { buildSeedContext } from '../../lib/seed-context'
import { ensureMizanDocFolder, placeDocShortcut } from './mizan-drive'
import { getDocLinkage, getDocLinkageOrThrow, upsertDocLinkage, updateDocLinkage } from '../repo/doc-linkage'
import { createDocumentVersion, listDocumentVersions as repoListDocumentVersions, getDocumentVersion } from '../repo/document-version'
import { createExtractionRun, getLatestExtractionRun, getLatestOkExtractionRun } from '../repo/extraction-run'
import { createDecisionCheckpoint, getLatestCheckpointPdfRefs } from '../repo/decision-checkpoint'
import { getApplicationDriveFields } from '../repo/application-drive'

const TEMPLATE_VERSION = 'v1'

// Fill a freshly-copied MUAP/RSK pair via the V3 registry (`server/docs/seed.ts` fillApplicationDoc):
// each Mizan-known field's unique [Label] placeholder is replaced with its value; unknown fields keep the
// template's original human placeholder (value-or-original-placeholder, leak-proof). Authoritative numbers
// come from deterministic resolvers; the model only supplies the masked narrative tokens. RISK LEVEL /
// recommendation are NOT registry tokens (assertSafeTokens). Best-effort: the caller wraps this.
// At creation the ladder isn't signed and submission history isn't threaded here, so signing-date +
// tanggal_pengajuan resolve to their placeholders; no_aplikasi + all SeedContext facts fill.
async function seedOneDoc(docId: string, kind: DocumentKind, seed: SeedContext, auditUserId: string): Promise<void> {
  const docs = docsClient()
  // Layered AI context (design §5) for the 'narrative' surface (all 3 layers). Loaded from the real
  // app by id (the seed doesn't carry the full aggregate); best-effort — an empty cascade adds nothing.
  const real = await getApplication(seed.applicationId).catch(() => null)
  const cascade = real ? await loadCascadeForSurface(real, 'narrative').catch(() => '') : ''
  const narratives = await (kind === 'muap' ? generateMuapNarrative : generateRskNarrative)(seed, auditUserId, cascade).catch(() => ({}))
  const app = { id: seed.applicationId, history: [], approvalSteps: [] } as unknown as LoanApplication
  await fillApplicationDoc(docs, docId, kind, { app, seed, narratives, rmName: null })
}

function masterIds() {
  const muap = process.env.GOOGLE_MASTER_MUAP_DOC_ID
  const rsk = process.env.GOOGLE_MASTER_RSK_DOC_ID
  if (!muap || !rsk) throw new Error('Missing GOOGLE_MASTER_{MUAP,RSK}_DOC_ID')
  return { muap, rsk }
}

export interface ApplicationDocs {
  applicationId: string
  muapDocId: string | null // N2 (ADR-0018): null until the explicit RM "Generate MUAP" mints it
  rskDocId: string | null // Batch 3 T3: null until RSK is created at Stage-4 entry
  templateVersion: string
  shortcutWarning?: string | null // P4-C (ADR-0019 §4): set when a shortcut into the user folder 403'd → "Coba lagi"
}

export type DocumentKind = 'muap' | 'rsk'
export interface DocumentVersionDTO {
  id: string
  applicationId: string
  kind: DocumentKind
  docId: string
  sourceDocId: string | null
  trigger: string
  label: string
  createdBy: string
  createdByName: string | null
  createdAt: Date
}
function toDocumentVersionDTO(row: Omit<DocumentVersionDTO, 'kind'> & { kind: string }): DocumentVersionDTO {
  return { ...row, kind: row.kind as DocumentKind }
}

function docIdForKind(linkage: { muapDocId: string | null; rskDocId: string | null }, kind: DocumentKind): string | null {
  return kind === 'muap' ? linkage.muapDocId : linkage.rskDocId
}

// P4-C (ADR-0019 §4): an optional `parentFolderId` lands the copy UNDER a Mizan-owned folder (parents:
// [folderId]) instead of the Mizan account My-Drive root, so generated docs are Mizan-owned + structured.
// Omitted → root, preserving the prior behavior for any caller that hasn't resolved a folder.
async function copyDriveDoc(fileId: string, name: string, label: string, parentFolderId?: string): Promise<string> {
  const drive = driveClient()
  const requestBody = parentFolderId ? { name, parents: [parentFolderId] } : { name }
  const copy = await withRetry(() => drive.files.copy({ fileId, requestBody, fields: 'id' }), { label })
  const id = copy.data.id
  if (!id) throw new Error('Drive copy returned no id')
  return id
}

async function snapshotOne(
  applicationId: string,
  kind: DocumentKind,
  sourceDocId: string,
  opts: { trigger: string; label: string; createdBy: string; createdByName?: string | null },
): Promise<DocumentVersionDTO> {
  const suffix = new Date().toISOString().replace(/[:.]/g, '-')
  const docId = await copyDriveDoc(sourceDocId, `${kind.toUpperCase()} snapshot — ${opts.label} — ${applicationId} — ${suffix}`, `drive.copy.snapshot.${kind}`)
  const row = await createDocumentVersion({
    applicationId,
    kind,
    docId,
    sourceDocId,
    trigger: opts.trigger,
    label: opts.label,
    createdBy: opts.createdBy,
    createdByName: opts.createdByName ?? null,
  })
  return toDocumentVersionDTO(row)
}

// Copy ONE master (MUAP or RSK) into a fresh per-app Doc + best-effort auto-seed. Never blocks on a
// seed failure — the copied template stays intact for the human. Batch 3 T3: MUAP and RSK are copied
// in SEPARATE lifecycle phases (MUAP at Stage-3 entry, RSK at Stage-4 entry), not as a pair.
async function copyAndSeedOne(
  applicationId: string,
  kind: DocumentKind,
  opts: { nasabahName?: string; seed?: SeedContext; auditUserId?: string; deferShortcut?: boolean },
): Promise<string> {
  const { muap, rsk } = masterIds()
  const nasabahName = opts.seed?.nasabahName ?? opts.nasabahName
  const label = nasabahName ? `${nasabahName} (${applicationId})` : applicationId
  // P4-C (ADR-0019 §4): resolve-or-create the Mizan-OWNED folder + land the copy under it (parented),
  // so the generated doc is Mizan-owned + structured, not in the account root. Best-effort: if the folder
  // can't be resolved (a Drive hiccup), fall back to the unparented copy — never block generation.
  let parentFolderId: string | undefined
  try {
    parentFolderId = await ensureMizanDocFolder(applicationId)
  } catch (e) {
    log.warn('docs.mizan_folder_failed', { applicationId, kind, ...errField(e) })
  }
  const docId = await copyDriveDoc(kind === 'muap' ? muap : rsk, `${kind.toUpperCase()} — ${label}`, `drive.copy.${kind}`, parentFolderId)
  if (opts.seed) {
    try {
      await seedOneDoc(docId, kind, opts.seed, opts.auditUserId ?? 'system')
    } catch (e) {
      log.error('docs.seed_failed', { applicationId, kind, ...errField(e) })
    }
  }
  // Drop a shortcut to the Mizan-owned doc into the user's app folder (if linked). Best-effort: a
  // missing-Editor 403 records a warning + "Coba lagi" retry, never blocks (placeDocShortcut never throws).
  // DEFERRED on the first MUAP mint: the DocLinkage row doesn't exist yet at that point (it's upserted by
  // createApplicationDocs AFTER this returns), so its shortcut warning can't be recorded — the caller places
  // the shortcut after writing the linkage. Every other caller's linkage already exists, so place here.
  if (!opts.deferShortcut) await placeDocShortcut(applicationId, docId, `${kind.toUpperCase()} — ${label}`)
  return docId
}

// Explicit "Generate MUAP" first-mint (N2, ADR-0018): mint the MUAP Doc only (the RSK is born later,
// at Stage-4 entry, grounded in the FINAL MUAP — see ensureRskDoc). Called by generateMuapAction, NOT
// auto at Stage-3 entry — the MUAP is minted only on the explicit RM action. Idempotent: returns the
// existing linkage when the MUAP is already minted; if a MUAP-absent linkage somehow exists (defensive),
// mints into it.
export async function createApplicationDocs(
  applicationId: string,
  opts: { nasabahName?: string; seed?: SeedContext; auditUserId?: string } = {},
): Promise<ApplicationDocs> {
  const existing = await getDocLinkage(applicationId)
  if (existing?.muapDocId) return existing
  // Defer the shortcut: the DocLinkage row must exist before placeDocShortcut can record its warning.
  const muapDocId = await copyAndSeedOne(applicationId, 'muap', { ...opts, deferShortcut: true })
  await upsertDocLinkage({
    applicationId,
    create: { muapDocId, rskDocId: null, templateVersion: TEMPLATE_VERSION },
    update: { muapDocId },
  })
  const nasabahName = opts.seed?.nasabahName ?? opts.nasabahName
  const label = nasabahName ? `${nasabahName} (${applicationId})` : applicationId
  await placeDocShortcut(applicationId, muapDocId, `MUAP — ${label}`)
  return getDocLinkageOrThrow(applicationId)
}

// Re-fill a doc once its approval ladder is COMPLETE (Batch 4 V3.5 + the signing-date slots): the
// No. MUAP / Tanggal / [Tanggal MUAP] become OFFICIAL only when fully signed, so they resolve to null
// at creation and are filled HERE with the last signature's date. Idempotent — already-filled
// placeholders/ranges are no-ops; only the now-resolvable date slots fill. Best-effort: never throws
// (a Drive hiccup is logged; the ladder advance still succeeds). Uses the REAL app (with approvalSteps).
export async function finalizeSignedDoc(applicationId: string, chain: DocumentKind, auditUserId?: string): Promise<void> {
  try {
    const [linkage, app] = await Promise.all([
      getDocLinkage(applicationId),
      loadApplicationForWrite(applicationId),
    ])
    const docId = chain === 'muap' ? linkage?.muapDocId : linkage?.rskDocId
    if (!docId || !app) return
    // Narratives were filled at creation (their placeholders are gone); {} → those vars no-op here.
    await fillApplicationDoc(docsClient(), docId, chain, { app, seed: buildSeedContext(app), narratives: {}, rmName: null })
  } catch (e) {
    log.warn('docs.finalize_fill_failed', { applicationId, chain, ...errField(e) })
  }
}

// Stage-4 entry (Batch 3 T3): create the RSK Doc, grounded in the now-final MUAP (the seed carries the
// read-back context). Idempotent by default — returns the existing rskDocId. Requires the MUAP
// linkage to exist (created at Stage 3). Best-effort caller (fire-after-advance).
// `refillIfExists` (Batch 3 T7): on RE-ENTRY to Stage 4 after a send-back, the MUAP was revised, so the
// stale RSK is snapshotted (audit) then re-filled from the revised MUAP — doc repointed, history kept.
export async function ensureRskDoc(
  applicationId: string,
  opts: { nasabahName?: string; seed?: SeedContext; auditUserId?: string; refillIfExists?: boolean } = {},
): Promise<string | null> {
  const linkage = await getDocLinkage(applicationId)
  if (!linkage?.muapDocId) throw new Error(`No MUAP for ${applicationId} — Generate the MUAP first (N2).`)
  if (linkage.rskDocId) {
    if (!opts.refillIfExists) return linkage.rskDocId
    // Re-entry after a send-back: snapshot the stale RSK before replacing it (the MUAP changed too,
    // so snapshotApplicationDocs checkpoints both — version history preserves the audit).
    await snapshotApplicationDocs(applicationId, {
      trigger: 'rsk_refill',
      label: 'Sebelum isi ulang RSK (revisi MUAP)',
      createdBy: opts.auditUserId ?? 'system',
    })
  }
  const rskDocId = await copyAndSeedOne(applicationId, 'rsk', opts)
  await updateDocLinkage(applicationId, { rskDocId })
  return rskDocId
}

// Force a fresh copy + re-seed, REPLACING the linkage — e.g. after a pre-Komite ReviseProposal made
// the docs stale (facts changed). ADR-0008: before replacing, snapshot the current docs so no version
// is lost. Regenerates the MUAP always; the RSK only if it already exists (it may not yet, pre-Stage-4).
export async function regenerateApplicationDocs(
  applicationId: string,
  opts: { nasabahName?: string; seed?: SeedContext; auditUserId?: string; auditUserName?: string | null } = {},
): Promise<ApplicationDocs> {
  const existing = await getDocLinkage(applicationId)
  if (existing) {
    await snapshotApplicationDocs(applicationId, {
      trigger: 'regenerate',
      label: 'Sebelum Buat ulang',
      createdBy: opts.auditUserId ?? 'system',
      createdByName: opts.auditUserName ?? null,
    })
  }
  const muapDocId = await copyAndSeedOne(applicationId, 'muap', opts)
  const rskDocId = existing?.rskDocId ? await copyAndSeedOne(applicationId, 'rsk', opts) : null
  return upsertDocLinkage({
    applicationId,
    create: { muapDocId, rskDocId, templateVersion: TEMPLATE_VERSION },
    update: { muapDocId, rskDocId, templateVersion: TEMPLATE_VERSION },
  })
}

export async function listDocumentVersions(applicationId: string): Promise<DocumentVersionDTO[]> {
  const rows = await repoListDocumentVersions(applicationId)
  return rows.map(toDocumentVersionDTO)
}

export async function snapshotApplicationDocs(
  applicationId: string,
  opts: { trigger: string; label: string; createdBy: string; createdByName?: string | null },
): Promise<DocumentVersionDTO[]> {
  const linkage = await getDocLinkage(applicationId)
  if (!linkage) throw new Error(`No Docs for application ${applicationId} — create them first.`)
  return Promise.all([
    // N2: the MUAP may not be minted yet (explicit Generate) — snapshot it only once it exists.
    ...(linkage.muapDocId ? [snapshotOne(applicationId, 'muap', linkage.muapDocId, opts)] : []),
    // RSK may not exist yet (Batch 3 T3) — snapshot it only once it's been created.
    ...(linkage.rskDocId ? [snapshotOne(applicationId, 'rsk', linkage.rskDocId, opts)] : []),
  ])
}

export async function rollbackApplicationDocVersion(
  applicationId: string,
  versionId: string,
  opts: { createdBy: string; createdByName?: string | null },
): Promise<ApplicationDocs> {
  const [app, linkage, version] = await Promise.all([
    getApplicationDriveFields(applicationId),
    getDocLinkage(applicationId),
    getDocumentVersion(applicationId, versionId),
  ])
  if (!app) throw new Error(`Application ${applicationId} not found`)
  if (!linkage) throw new Error(`No Docs for application ${applicationId} — create them first.`)
  if (!version || version.applicationId !== applicationId) throw new Error('Versi dokumen tidak ditemukan.')
  if (version.kind !== 'muap' && version.kind !== 'rsk') throw new Error('Jenis dokumen tidak dikenal.')
  if (app.stage >= 5) throw new Error('Rollback dokumen hanya tersedia sebelum Komite.')

  const kind = version.kind as DocumentKind
  const currentDocId = docIdForKind(linkage, kind)
  if (!currentDocId) throw new Error('Dokumen belum dibuat — tidak ada versi untuk di-rollback.')
  await snapshotOne(applicationId, kind, currentDocId, {
    trigger: 'rollback_current',
    label: `Sebelum rollback ke ${version.label}`,
    createdBy: opts.createdBy,
    createdByName: opts.createdByName,
  })
  const label = app.nasabahName ? `${app.nasabahName} (${applicationId})` : applicationId
  const newCurrent = await copyDriveDoc(version.docId, `${kind.toUpperCase()} — rollback — ${label}`, `drive.copy.rollback.${kind}`)
  return updateDocLinkage(applicationId, kind === 'muap' ? { muapDocId: newCurrent } : { rskDocId: newCurrent })
}

export interface SyncResult {
  report: ExtractionReport
  snapshot: ExtractedSnapshot | null
}

// Re-extract the application's Docs and persist the run. Atomic by construction:
// the engine returns snapshot=null when a gating field fails, and we store that
// run as not-ok — getApplicationDocs() returns the latest OK snapshot.
export async function syncApplicationDocs(applicationId: string): Promise<SyncResult> {
  const linkage = await getDocLinkage(applicationId)
  if (!linkage) throw new Error(`No Docs for application ${applicationId} — create them first.`)
  // N2: the MUAP is the spine of the NamedRange read-back — nothing to extract until it's minted.
  if (!linkage.muapDocId) throw new Error(`No MUAP for application ${applicationId} — Generate the MUAP first.`)

  const { report, snapshot } = await extractApplicationDocs(linkage.muapDocId, linkage.rskDocId)
  await createExtractionRun({
    applicationId,
    runId: report.runId,
    extractedAt: new Date(report.extractedAt),
    ok: report.ok,
    report: JSON.stringify(report),
    snapshot: snapshot ? JSON.stringify(snapshot) : null,
  })
  return { report, snapshot }
}

// Read-back via Markdown → AI (document-readback-markdown-ai.md): export the MUAP/RSK Docs to
// Markdown and have the inference provider produce the same ExtractedSnapshot the NamedRange path
// did — masked + audited. Persists the run identically to syncApplicationDocs, so getApplicationDocs
// + every snapshot consumer (scores preview, AI context) are unchanged. This is the ACTIVE read-back
// path; the NamedRange syncApplicationDocs/extractApplicationDocs above stay dormant pending the P2
// parity-gated deletion (needs live Google-Doc creds). `auditUserId` is the acting user (audit G3).
export async function syncExtractionFromMarkdown(
  applicationId: string,
  opts: { auditUserId: string },
): Promise<SyncResult> {
  const linkage = await getDocLinkage(applicationId)
  if (!linkage) throw new Error(`No Docs for application ${applicationId} — create them first.`)
  const app = await getApplication(applicationId)
  if (!app) throw new Error(`Application ${applicationId} not found`)

  const drive = driveClient()
  const [muapMarkdown, rskMarkdown] = await Promise.all([
    linkage.muapDocId ? exportMarkdown(drive, linkage.muapDocId) : Promise.resolve(null),
    linkage.rskDocId ? exportMarkdown(drive, linkage.rskDocId) : Promise.resolve(null),
  ])

  const { report, snapshot } = await extractSnapshotFromMarkdown({
    appId: applicationId,
    userId: opts.auditUserId,
    pii: app,
    muapMarkdown,
    rskMarkdown,
  })
  await createExtractionRun({
    applicationId,
    runId: report.runId,
    extractedAt: new Date(report.extractedAt),
    ok: report.ok,
    report: JSON.stringify(report),
    snapshot: snapshot ? JSON.stringify(snapshot) : null,
  })
  return { report, snapshot }
}

export interface ApplicationDocsState {
  linkage: ApplicationDocs | null
  // The most recent run's report (any), and the latest OK snapshot (may be older).
  latestReport: ExtractionReport | null
  snapshot: ExtractedSnapshot | null
}

// ── Decision-time audit freeze ──────────────────────────────────────────────
// Google Docs stay editable after approval, so the committee's bound record can't
// be the live doc. At decision we export both Docs to PDF and store the bytes +
// a SHA-256 over them — an immutable, tamper-evident copy for the OJK audit trail.

export interface DecisionCheckpointMeta {
  id: string
  decision: string
  decidedAt: string
  contentHash: string
  muapBytes: number
  rskBytes: number
}

type Drive = ReturnType<typeof driveClient>

async function exportPdf(drive: Drive, fileId: string): Promise<Buffer> {
  const res = await withRetry(
    () => drive.files.export({ fileId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' }),
    { label: 'drive.export.pdf' },
  )
  return Buffer.from(res.data as ArrayBuffer)
}

async function exportMarkdown(drive: Drive, fileId: string): Promise<string> {
  const res = await withRetry(
    () => drive.files.export({ fileId, mimeType: 'text/markdown' }, { responseType: 'text' }),
    { label: 'drive.export.markdown' },
  )
  return typeof res.data === 'string' ? res.data : Buffer.from(res.data as ArrayBuffer).toString('utf8')
}

export async function freezeDecisionDocs(applicationId: string, decision: string): Promise<DecisionCheckpointMeta> {
  const [linkage, app] = await Promise.all([
    getDocLinkage(applicationId),
    getApplicationDriveFields(applicationId),
  ])
  if (!linkage) throw new Error(`No Docs for application ${applicationId} — nothing to freeze.`)
  // A committee decision freezes BOTH docs — by Komite the MUAP MUST exist (the ladder doc-exists gate
  // guarantees it) and the RSK MUST exist (created at Stage-4 entry). If either is somehow absent the
  // archive would be incomplete, which is an audit bug — fail loud (clear Bahasa), never NPE.
  if (!linkage.muapDocId) throw new Error(`Tidak bisa membekukan arsip keputusan: MUAP belum dibuat untuk ${applicationId}.`)
  if (!linkage.rskDocId) throw new Error(`RSK Doc not created for ${applicationId} — cannot freeze an incomplete decision archive.`)

  const drive = driveClient()
  const [muapPdf, rskPdf] = await Promise.all([
    exportPdf(drive, linkage.muapDocId),
    exportPdf(drive, linkage.rskDocId),
  ])
  const contentHash = createHash('sha256').update(muapPdf).update(rskPdf).digest('hex')
  const decidedAt = new Date()
  // Freeze-at-decision: capture the OJK hard-gate policy in effect at the decision instant,
  // alongside the PDF freeze, so the audit record shows which thresholds the committee decided under.
  const policy = await getActiveRiskPolicyDetailed(decidedAt)

  // Store the frozen PDFs in SeaweedFS (object storage, like uploaded docs) rather than inline
  // in Postgres. The key is deterministic per decision instant (one checkpoint per decidedAt),
  // namespaced under the application. contentHash (over both PDFs) remains the tamper-evidence.
  await ensureBucket()
  const keyBase = `checkpoints/${applicationId}/${decidedAt.getTime()}`
  const muapKey = `${keyBase}-muap.pdf`
  const rskKey = `${keyBase}-rsk.pdf`
  await Promise.all([
    putDocument(muapKey, muapPdf, 'application/pdf'),
    putDocument(rskKey, rskPdf, 'application/pdf'),
  ])

  const cp = await createDecisionCheckpoint({
    applicationId,
    decision,
    decidedAt,
    muapDocId: linkage.muapDocId,
    rskDocId: linkage.rskDocId,
    muapStorageKey: muapKey,
    rskStorageKey: rskKey,
    muapSizeBytes: muapPdf.length,
    rskSizeBytes: rskPdf.length,
    contentHash,
    riskPolicyVersion: policy.version,
    riskDsrMaxPct: policy.dsrMaxPct,
    riskLtvMaxPct: policy.ltvMaxPct,
    riskKolMax: policy.kolMax,
    exploredSources: app?.exploredSources ?? undefined,
  })
  return { id: cp.id, decision, decidedAt: decidedAt.toISOString(), contentHash, muapBytes: muapPdf.length, rskBytes: rskPdf.length }
}

export interface FreezeArchiveResult {
  ok: boolean
  checkpointId?: string
  error?: string
}

/// Server-side decision archive (Batch 3 T6). The immutable decision record — frozen PDF MUAP+RSK +
/// SHA + the policy/sources in effect — is created as PART of the committee decision flow
/// (signMomAction), NOT a fire-and-forget client call. Success logs the checkpoint. FAILURE is
/// recorded HARD: an error log AND a durable audit history entry on the application — an app that
/// decides without an archive is an audit bug, so the gap must be visible in the OJK trail and
/// retryable, never silently swallowed (the old `KomiteVoting` client `.catch(console.warn)`).
export async function freezeDecisionArchive(
  applicationId: string,
  decision: string,
  actor?: { userId: string; name: string },
): Promise<FreezeArchiveResult> {
  try {
    const meta = await freezeDecisionDocs(applicationId, decision)
    log.info('komite.decision_frozen', { applicationId, decision, checkpointId: meta.id, contentHash: meta.contentHash })
    return { ok: true, checkpointId: meta.id }
  } catch (e) {
    log.error('komite.freeze_failed', { applicationId, decision, ...errField(e) })
    const app = await loadApplicationForWrite(applicationId)
    if (app) {
      appendHistory(app, {
        userId: actor?.userId ?? 'system',
        userName: actor?.name ?? 'Sistem',
        action: '⚠️ Arsip beku keputusan Komite GAGAL — jejak audit belum lengkap, perlu retry (hubungi admin).',
        stage: app.stage,
      })
      await saveApplication(app).catch((err) => log.error('komite.freeze_failure_audit_failed', { applicationId, ...errField(err) }))
    }
    return { ok: false, error: (e as Error).message }
  }
}

// The PDF bytes of the latest checkpoint for a doc, for the audit download links. Prefers the
// SeaweedFS object (current checkpoints); falls back to the legacy inline Bytes column for
// pre-SeaweedFS checkpoints so existing audit records keep serving.
export async function checkpointPdf(applicationId: string, which: 'muap' | 'rsk'): Promise<Buffer | null> {
  const cp = await getLatestCheckpointPdfRefs(applicationId)
  if (!cp) return null
  const key = which === 'muap' ? cp.muapStorageKey : cp.rskStorageKey
  if (key) return getDocument(key)
  const legacy = which === 'muap' ? cp.muapPdf : cp.rskPdf
  return legacy ? Buffer.from(legacy) : null
}

export async function getApplicationDocs(applicationId: string): Promise<ApplicationDocsState> {
  const linkage = await getDocLinkage(applicationId)
  if (!linkage) return { linkage: null, latestReport: null, snapshot: null }

  const [latest, latestOk] = await Promise.all([
    getLatestExtractionRun(applicationId),
    getLatestOkExtractionRun(applicationId),
  ])
  return {
    linkage,
    latestReport: latest ? (JSON.parse(latest.report) as ExtractionReport) : null,
    snapshot: latestOk?.snapshot ? (JSON.parse(latestOk.snapshot) as ExtractedSnapshot) : null,
  }
}

/**
 * Read-back: export an application's MUAP or RSK source Doc to Markdown (document-system.md §Read) —
 * the faithful, cheap path for later AI analysis (no OCR, no NamedRange round-trip; the PDF export
 * stays the signed/frozen audit artifact). The AI-analysis CONSUMER is a separate future feature;
 * this is the export capability it will call. Returns null when the application has no linked Docs.
 */
export async function exportDocMarkdown(
  applicationId: string,
  which: 'muap' | 'rsk',
): Promise<string | null> {
  const linkage = await getDocLinkage(applicationId)
  if (!linkage) return null
  const fileId = which === 'muap' ? linkage.muapDocId : linkage.rskDocId
  if (!fileId) return null
  return exportMarkdown(driveClient(), fileId)
}
