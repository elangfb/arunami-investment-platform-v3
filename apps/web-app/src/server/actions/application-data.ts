'use server'

import { appendHistory } from '@/lib/history'
import { appendConversationMessages, loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { requireActor } from '@/server/auth/session'
import { stageOwnerResolver } from '@/server/auth/stage-owners'
import { assertCanActOnStage, assertCanParticipate, assertCanWorkDesk, assertDesk, auditUserName, AuthzError, canSummarizeBureau, type Actor } from '@/lib/auth/can'
import { getActiveDisbursementConditions } from '@/server/config/disbursement'
import { ocrSuggestionsFor, advisorySuggestionsFor, getFieldExtractor, planMismatchResolution, reconcileExtraction } from '@/lib/extraction-registry'
import { crossCheckSptVsLapkeu, crossCheckIdentityVsCustomerMaster, crossCheckAktaVsCustomer, crossCheckAppraisalVsAdvisory, type RosterMember } from '@/lib/ocr-crosscheck'
import { getCustomerForApplication } from '@/server/repo/customer'
import { extractFields } from '@/server/ai/extract-fields'
import { planAiExtraction, type AiExtractionResult } from '@/lib/ai-extraction-apply'
import { log, errField } from '@/server/log'
import { ownerDeskForDocType } from '@/lib/required-docs'
import { disbursementOpen, sp3FinalReady, resetLegalHandoff, resetSlikHandoff, resetVerificationOnReupload, settleLgAssignment } from '@/lib/stage-action'
import { loadApprovalSteps } from '@/server/repo/approval'
import { dispatch } from '@/lib/workflow-engine'
import { ocrProvider } from '@/server/ocr'
import { computeHardGates } from '@/lib/financials'
import { disbursementConditionsComplete, nextDisbursementStatus } from '@/lib/disbursement'
import { isFlatAkad } from '@/lib/akad-config'
import { generateAspectScores } from '@/lib/scoring'
import { storeDocumentFile, type StoredDocument } from '@/server/storage/documents'
import { generateBureauSummary } from '@/server/ai/bureau'
import type { AppraisalPath, AppraisalRecord, DocumentStatus, ExtractionSource, FiveCSAnalysis, LoanApplication, Stage } from '@/lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Intent-specific, desk-gated write actions. REPLACES the former generic
// `patchApplicationAction(actor, patch, history)` which (a) trusted a client-passed
// identity, (b) let the client choose which fields to write, and (c) let the client
// author the audit-trail string. The generic patch could not enforce the Stage-2 Legal/Appraisal
// vs RM bureau-data separation (both wrote `documents`), which is the whole reason those desks
// are split. Each action below:
//   • reads identity from the verified session (requireActor) — never the client,
//   • asserts the SPECIFIC desk required for the operation (fail closed),
//   • whitelists only the fields it is allowed to touch,
//   • composes its own audit entry server-side, and
//   • computes compliance numbers (DSR/LTV/violations) server-side, not from the client.
// See docs/decisions/0001-write-layer-server-authoritative.md for the rationale.
// ─────────────────────────────────────────────────────────────────────────────

async function load(appId: string): Promise<LoanApplication> {
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  return app
}

function addAudit(app: LoanApplication, actor: Actor, action: string, stage?: Stage, reason?: string): void {
  appendHistory(app, { userId: actor.userId, userName: auditUserName(actor), action, stage: stage ?? app.stage, reason })
}

/** Read the uploaded File from a server-action FormData (key `file`); fail closed if absent. */
function requireFile(formData: FormData): File {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('Berkas tidak ditemukan dalam unggahan.')
  return file
}

/** The fields stamped on a document when its bytes are stored (status + uploader + integrity facts). */
function uploadedFields(actor: Actor, stored: StoredDocument) {
  return {
    status: 'uploaded' as DocumentStatus,
    uploadedAt: new Date(),
    uploadedBy: actor.userId,
    fileName: stored.fileName,
    storageKey: stored.storageKey,
    sha256: stored.sha256,
    sizeBytes: stored.sizeBytes,
    contentType: stored.contentType,
  }
}

/// Best-effort full-document OCR for EVERY uploaded document → text stashed on the doc, later
/// fed (masked) into the MUAP/RSK narrative prompt; gate inputs are parsed from it separately.
/// Mutates app.documents. A failure leaves the doc unchanged — transcription must NEVER block an
/// upload. The text is PII-bearing; it is masked at the egress boundary (server/ai/narrative.ts),
/// never logged here.
async function extractAndStoreText(app: LoanApplication, docId: string, file: File, contentType: string): Promise<string | null> {
  const doc = app.documents.find((d) => d.id === docId)
  if (!doc) return null
  try {
    const text = await ocrProvider().extractFullText?.({
      docKind: doc.docType,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType,
      app,
    })
    if (text) {
      app.documents = app.documents.map((d) =>
        d.id === docId ? { ...d, extractedText: text, extractedAt: new Date() } : d,
      )
      return text
    }
  } catch {
    /* best-effort: a transcription failure must never block the upload */
  }
  return null
}

/// Set a registry fieldPath (≤1 level of nesting) on the app, preserving the immutable-update
/// style used throughout this module.
function setFieldByPath(app: LoanApplication, fieldPath: string, value: number | string): void {
  const target = app as unknown as Record<string, unknown>
  const [head, tail] = fieldPath.split('.')
  if (tail) {
    target[head] = { ...(target[head] as object), [tail]: value }
  } else {
    target[head] = value
  }
}

/// Read a registry fieldPath (≤1 level) — for the confirmed-vs-overridden comparison.
function getFieldByPath(app: LoanApplication, fieldPath: string): unknown {
  const target = app as unknown as Record<string, unknown>
  const [head, tail] = fieldPath.split('.')
  return tail ? (target[head] as Record<string, unknown> | undefined)?.[tail] : target[head]
}

/// Map parsed OCR suggestions onto the right app fields + mark each ocr_suggested, driven by the
/// declarative FIELD_REGISTRY (ocrSuggestionsFor parses + validates). Covers gating numbers AND
/// legal-identity strings (NPWP/NIB/alamat). Only writes when a value was confidently parsed AND
/// valid (else the field stays manual). Each is a SUGGESTION the owner confirms; gates are
/// recomputed server-side, identity values are human-confirmed — never auto-applied.
function applyOcrSuggestions(app: LoanApplication, docType: string, text: string | null): void {
  if (!text) return
  for (const { fieldPath, value } of ocrSuggestionsFor(docType, text)) {
    applyExtractionCandidate(app, fieldPath, value, docType)
  }
}

/// ADVISORY OCR-widening (design §3). A STRICTLY SEPARATE path from applyExtractionCandidate: it
/// writes informational figures into app.advisoryExtractions[key] and NEVER reconciles against a
/// gating fieldPath, NEVER touches hardGates/financialInputs, NEVER adds to a blocker set, NEVER
/// blesses/confirms/gates. Last-OCR-wins for an advisory key — EXCEPT a human-edited advisory note
/// (a value whose existing entry has no docType / a non-OCR provenance) is preserved. NIK stays the
/// sole 1→2 blocker. Mutates app.advisoryExtractions only.
function writeAdvisory(app: LoanApplication, key: string, value: string | number, label: string, docType: string): void {
  const existing = app.advisoryExtractions?.[key]
  // Preserve a human-edited advisory note (no docType = not an OCR-written entry). Last OCR wins
  // otherwise. Carry forward any prior crossCheck (re-annotated in annotateAdvisoryCrossChecks).
  if (existing && !existing.docType) return
  app.advisoryExtractions = {
    ...app.advisoryExtractions,
    [key]: { value, label, docType, detectedAt: new Date().toISOString(), ...(existing?.crossCheck ? { crossCheck: existing.crossCheck } : {}) },
  }
}

function applyAdvisoryExtractions(app: LoanApplication, docType: string, text: string | null): void {
  if (!text) return
  for (const { key, value, label } of advisorySuggestionsFor(docType, text)) {
    writeAdvisory(app, key, value, label, docType)
  }
}

/// Annotate advisory cross-checks (design §3) — ADVISORY ONLY, recorded on AdvisoryExtraction.crossCheck,
/// NEVER a blocker. Runs the pure cross-check fns and stamps the result onto the relevant advisory entry:
///   - SPT vs LapKeu → on pendapatanSpt (omzet/labaBersih comparison)
///   - identity vs customer-master (repeat app) → recorded on a synthetic 'identitas' advisory entry
///   - Akta roster vs Customer aggregate → recorded on a synthetic 'pengurus' advisory entry
/// `customer` is the linked Customer (null when unlinked). `extractedPengurus` is an Akta/SK roster if
/// this doc yielded one (none today from the regex path — wired for the structured extractor). PII: the
/// pure fns keep raw NIK out of notes.
function annotateAdvisoryCrossChecks(
  app: LoanApplication,
  customer: Awaited<ReturnType<typeof getCustomerForApplication>>,
  extractedPengurus?: RosterMember[] | null,
): void {
  const now = new Date().toISOString()
  const stamp = (key: string, label: string, cc: { against: string; status: 'match' | 'mismatch'; note?: string }) => {
    const existing = app.advisoryExtractions?.[key]
    app.advisoryExtractions = {
      ...app.advisoryExtractions,
      [key]: existing
        ? { ...existing, crossCheck: cc }
        : { value: '', label, docType: '', detectedAt: now, crossCheck: cc },
    }
  }

  const spt = crossCheckSptVsLapkeu(app.advisoryExtractions)
  if (spt && app.advisoryExtractions?.pendapatanSpt) {
    app.advisoryExtractions = {
      ...app.advisoryExtractions,
      pendapatanSpt: { ...app.advisoryExtractions.pendapatanSpt, crossCheck: spt },
    }
  }

  // Identity vs customer-master — advisory only, distinct from the NIK BLOCKER (extractionMismatches.nik).
  const idCheck = crossCheckIdentityVsCustomerMaster({ nik: app.nik, npwp: app.npwp }, customer)
  if (idCheck && idCheck.status === 'mismatch') {
    stamp('identitas', 'Identitas vs data master nasabah', idCheck)
  }

  // Akta/SK roster vs Customer aggregate — advisory note on diffs.
  const aktaCheck = crossCheckAktaVsCustomer(extractedPengurus, customer)
  if (aktaCheck && aktaCheck.status === 'mismatch') {
    stamp('pengurus', 'Pengurus/pemegang saham (Akta) vs data nasabah', aktaCheck)
  }

  // P3-D structured Penilaian (design §4): structured nilaiPasar/nilaiLikuidasi vs the P2 OCR advisory
  // figures. Advisory ONLY — recorded on a synthetic 'penilaian' advisory entry, never a blocker.
  const appraisalCheck = crossCheckAppraisalVsAdvisory(app.appraisalRecord, app.advisoryExtractions)
  if (appraisalCheck && appraisalCheck.status === 'mismatch') {
    stamp('penilaian', 'Nilai penilaian (terstruktur) vs hasil OCR laporan appraisal', appraisalCheck)
  }
}

/// Reconcile ONE OCR-read value against what Mizan already holds (Batch 6 cross-check). NEVER
/// overwrites a blessed (human/confirmed/overridden) value: a differing read is recorded as a
/// mismatch for the owner to resolve, while an unblessed/empty field keeps the legacy fill behavior.
/// A re-read that now AGREES clears any stale mismatch. Shared by the gate-suggestion and NIK paths.
function applyExtractionCandidate(app: LoanApplication, fieldPath: string, ocrValue: number | string, docType: string): void {
  const provenance = app.extractionSources?.[fieldPath]
  const existing = getFieldByPath(app, fieldPath)
  switch (reconcileExtraction(existing, provenance, ocrValue)) {
    case 'fill':
      setFieldByPath(app, fieldPath, ocrValue)
      app.extractionSources = { ...app.extractionSources, [fieldPath]: 'ocr_suggested' as ExtractionSource }
      clearExtractionMismatch(app, fieldPath)
      break
    case 'mismatch':
      // Keep the Mizan value + provenance untouched; record the conflict for human resolution.
      app.extractionMismatches = {
        ...app.extractionMismatches,
        [fieldPath]: { existingValue: String(existing), ocrValue: String(ocrValue), provenance: provenance as ExtractionSource, docType, detectedAt: new Date().toISOString() },
      }
      break
    case 'match':
      clearExtractionMismatch(app, fieldPath) // re-read agrees → no conflict to hold
      break
  }
}

function clearExtractionMismatch(app: LoanApplication, fieldPath: string): void {
  if (!app.extractionMismatches?.[fieldPath]) return
  const next = { ...app.extractionMismatches }
  delete next[fieldPath]
  app.extractionMismatches = Object.keys(next).length ? next : undefined
}

/// Map a single AI structured-extraction result onto the app, reusing the SAME suggestion+cross-check
/// spine as the regex path (applyExtractionCandidate): each `known` field is written as an
/// ocr_suggested SUGGESTION (never a blind credit write), and any `extras` are stashed with their
/// source doc-type for later promotion. LOCAL + non-exported on purpose: in a 'use server' module an
/// exported function becomes a client-callable action, so the pure shaping lives in lib/ai-extraction-
/// apply (planAiExtraction, unit-tested) and this just applies the plan via the existing spine.
function applyAiExtraction(app: LoanApplication, docType: string, extraction: AiExtractionResult): void {
  const { candidates, advisory, extras } = planAiExtraction(extraction, docType, (fp) => getFieldExtractor(fp)?.kind)
  for (const { fieldPath, value } of candidates) applyExtractionCandidate(app, fieldPath, value, docType)
  // ADVISORY known fields (design §3) — written to the advisory store, NEVER through the gating
  // applyExtractionCandidate spine (so they can't reach a hard gate / blocker set even under real OCR).
  for (const { key, value } of advisory) {
    writeAdvisory(app, key, value, getFieldExtractor(key)?.label ?? key, docType)
  }
  for (const [key, value] of Object.entries(extras)) {
    app.extractionExtras = { ...app.extractionExtras, [key]: value }
  }
}

/// AI structured extraction runs ONLY against a real OCR provider. Under the offline `stub` default
/// (dev/test/CI) we keep the regex path → hermetic: no network, deterministic, no LLM dependency.
function aiExtractionEnabled(): boolean {
  const p = process.env.OCR_PROVIDER?.trim()
  return !!p && p !== 'stub'
}

/// Shared post-upload spine for checklist, SLIK, and supporting documents: full-text OCR first, then
/// field extraction. With a real OCR provider the LLM extractor (extractFields) is the primary path;
/// it falls back to the registry-driven regex suggestions on failure, and the regex path is the only
/// path under `stub`. Public server actions can differ in creation semantics, but they all run this
/// same extraction/audit spine.
async function runPostUploadExtraction(app: LoanApplication, docId: string, docType: string, file: File, contentType: string): Promise<void> {
  const text = await extractAndStoreText(app, docId, file, contentType)
  if (!text) return
  // GATING extraction (the existing fill/match/mismatch spine) — AI when a real provider is configured,
  // else the regex registry path. Advisory extraction below is a SEPARATE concern that never gates.
  if (aiExtractionEnabled()) {
    try {
      applyAiExtraction(app, docType, await extractFields(docType, text))
    } catch (e) {
      log.warn('docs.ai_extract_failed_fallback_regex', { appId: app.id, docType, ...errField(e) })
      applyOcrSuggestions(app, docType, text)
    }
  } else {
    applyOcrSuggestions(app, docType, text)
  }
  // ADVISORY OCR-widening (design §3) — informational + cross-check ONLY, never gates. Strictly
  // separate from the gating path above: writes app.advisoryExtractions and annotates cross-checks.
  applyAdvisoryExtractions(app, docType, text)
  try {
    annotateAdvisoryCrossChecks(app, await getCustomerForApplication(app.id))
  } catch (e) {
    // A cross-check failure must NEVER block an upload — advisory is best-effort.
    log.warn('docs.advisory_crosscheck_failed', { appId: app.id, docType, ...errField(e) })
  }
}

// ── OCR suggestion confirmation (cross-stage, registry-driven) ──────────────

/// The owner of an OCR-suggested field confirms it (or corrects it). ONE action for every
/// extractable field, driven by FIELD_REGISTRY: the desk that may confirm is the field's
/// ownerDesk (server-authoritative, fail-closed, stage-windowed via assertCanWorkDesk so a frozen
/// stage's data cannot be re-confirmed). The suggested VALUE was written at upload, so a plain
/// confirm only blesses provenance (ocr_suggested → ocr_confirmed) with no value write or gate
/// recompute. An `override` (correcting a misread) is allowed ONLY for IDENTITY fields (NIK): a
/// plain value write is safe there. GATING values (Kol, income, appraisal) are corrected in their
/// dedicated editor — the financial form recomputes DSR/LTV, Kol entry sets kolEntered — never
/// blind-written here. Replaces confirmFinancialOcrAction + confirmNikAction.
export async function confirmExtractedFieldAction(
  appId: string,
  fieldPath: string,
  override?: string,
  resolution?: 'keep' | 'accept',
): Promise<LoanApplication> {
  const actor = await requireActor()
  const entry = getFieldExtractor(fieldPath)
  if (!entry) throw new Error(`Field tidak dikenal: ${fieldPath}`)
  const app = await load(appId)
  assertCanWorkDesk(actor, app, entry.ownerDesk)

  // Cross-check resolution (Batch 6 / T2): the owner decides between the Mizan value and the OCR
  // reading. `accept` writes the OCR value back as a fresh SUGGESTION (so gating values re-enter the
  // confirm+recompute flow — never blind-written to credit); `keep` leaves the Mizan value standing.
  // Audit omits raw IDENTITY values (NIK is PII) and records the numeric delta only for gating fields.
  if (resolution !== undefined) {
    const mismatch = app.extractionMismatches?.[fieldPath]
    if (!mismatch) throw new Error(`Tidak ada selisih OCR untuk ${entry.label}.`)
    const plan = planMismatchResolution(entry, mismatch, resolution)
    if (plan.acceptValue !== null) {
      setFieldByPath(app, fieldPath, plan.acceptValue)
      app.extractionSources = { ...app.extractionSources, [fieldPath]: 'ocr_suggested' as ExtractionSource }
    }
    addAudit(app, actor, plan.audit)
    clearExtractionMismatch(app, fieldPath)
    return saveApplication(app)
  }

  if (override !== undefined) {
    if (entry.kind !== 'identity') {
      throw new Error(`Koreksi nilai ${entry.label} dilakukan di formulir terkait, bukan di sini.`)
    }
    const trimmed = override.trim()
    const check = entry.validate?.(trimmed)
    if (check && !check.ok) throw new Error(check.reason ?? 'Nilai tidak valid')
    const overridden = trimmed !== String(getFieldByPath(app, fieldPath) ?? '')
    setFieldByPath(app, fieldPath, trimmed)
    app.extractionSources = { ...app.extractionSources, [fieldPath]: overridden ? 'ocr_overridden' : 'ocr_confirmed' }
    addAudit(app, actor, overridden ? `${entry.label} dikoreksi & dikonfirmasi (OCR)` : `${entry.label} dikonfirmasi (OCR)`)
    return saveApplication(app)
  }

  // Plain confirm — idempotent; only a still-suggested field flips to confirmed.
  if (app.extractionSources?.[fieldPath] !== 'ocr_suggested') return app
  app.extractionSources = { ...app.extractionSources, [fieldPath]: 'ocr_confirmed' as ExtractionSource }
  addAudit(app, actor, `Konfirmasi OCR: ${entry.label}`)
  return saveApplication(app)
}

/// UNIFORM document upload — the single upload path for any checklist document. The desk gate is
/// DATA (ownerDeskForDocType), not a per-doc-type function: whoever holds the doc's owner desk may
/// upload it (RM intake for ordinary checklist rows, RM bureau-data desk for SLIK/Pefindo). Stores
/// bytes → re-verifies on change → runs structured field extraction (KTP→NIK) + full-text OCR +
/// gate-input suggestions → audits. Each extracted value is a SUGGESTION the owner confirms
/// (ocr_suggested); a misread never becomes credit data.
export async function uploadDocumentAction(appId: string, docId: string, formData: FormData): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  const target = app.documents.find((d) => d.id === docId)
  if (!target) throw new Error('Dokumen tidak ditemukan.')
  assertCanWorkDesk(actor, app, ownerDeskForDocType(target.docType))
  const file = requireFile(formData)
  const stored = await storeDocumentFile(app.id, docId, file)
  // Re-verify on change: a re-uploaded already-verified doc loses its legal verification + clears
  // the LG sign-off (Legal must re-check the new bytes). No-op for a first Stage-1 upload.
  resetVerificationOnReupload(app, docId)
  app.documents = app.documents.map((d) =>
    d.id === docId ? { ...d, ...uploadedFields(actor, stored) } : d,
  )
  // Structured field extraction over the REAL bytes via the configured provider (stub default →
  // identical to before; external/local model is an OCR_PROVIDER swap). Today only KTP→NIK.
  if (target.docType === 'ktp') {
    const ex = await ocrProvider().extract({
      docKind: 'ktp',
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: stored.contentType,
      app,
    })
    if (ex) {
      // Cross-check against any already-blessed NIK: a re-upload that reads a DIFFERENT NIK is a
      // mismatch (recorded), not a silent overwrite (Batch 6).
      applyExtractionCandidate(app, 'nik', String(ex.value), 'ktp')
    }
  }
  // Full-document transcription (every upload) + gate-input suggestions parsed from it.
  await runPostUploadExtraction(app, docId, target.docType, file, stored.contentType)
  addAudit(app, actor, `Dokumen diunggah: ${target.name}`)
  return saveApplication(app)
}

/// AO uploads the KTP. Thin wrapper over the uniform path (kept for the current UI call site).
export async function uploadKtpAction(appId: string, docId: string, formData: FormData): Promise<LoanApplication> {
  return uploadDocumentAction(appId, docId, formData)
}

/// AO uploads a required (non-KTP, non-SLIK) document. Thin wrapper over the uniform path.
export async function uploadRequiredDocAction(appId: string, docId: string, formData: FormData): Promise<LoanApplication> {
  return uploadDocumentAction(appId, docId, formData)
}

/// A supporting (non-required) document may be attached by whoever is actively
/// working the application at its current stage.
export async function uploadSupportingDocAction(appId: string, formData: FormData): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanActOnStage(actor, app)
  const docId = `${app.id}-sup-${Date.now()}`
  const file = requireFile(formData)
  const stored = await storeDocumentFile(app.id, docId, file)
  app.documents = [
    ...app.documents,
    {
      id: docId,
      name: stored.fileName,
      docType: 'pendukung',
      required: false,
      ...uploadedFields(actor, stored),
    },
  ]
  await runPostUploadExtraction(app, docId, 'pendukung', file, stored.contentType)
  addAudit(app, actor, `Dokumen pendukung diunggah: ${stored.fileName}`)
  return saveApplication(app)
}

/// User-friendly label for an arbitrary/supporting upload. The stored filename stays immutable in
/// `fileName`; `name` is the human-readable display name shown in the dossier rows.
export async function renameSupportingDocAction(appId: string, docId: string, displayName: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanActOnStage(actor, app)
  const name = displayName.trim()
  if (!name) throw new Error('Nama dokumen tidak boleh kosong.')
  const doc = app.documents.find((d) => d.id === docId)
  if (!doc) throw new Error('Dokumen tidak ditemukan.')
  if (doc.required) throw new Error('Hanya dokumen pendukung yang dapat diberi nama bebas.')
  app.documents = app.documents.map((d) => (d.id === docId ? { ...d, name } : d))
  addAudit(app, actor, `Nama dokumen pendukung diubah: ${name}`)
  return saveApplication(app)
}

/// Konten/Deck Komite (ADR-0005 #12): the committee presentation material — drafted OUTSIDE Mizan and
/// uploaded into the Rapat per application. Stored as a per-app document (docType 'konten-komite') and
/// surfaced in the Ruang Komite. Uploaded by whoever is working the committee stage (no OCR — it's a deck).
export async function uploadKomiteDeckAction(appId: string, formData: FormData): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanActOnStage(actor, app)
  const docId = `${app.id}-deck-${Date.now()}`
  const file = requireFile(formData)
  const stored = await storeDocumentFile(app.id, docId, file)
  app.documents = [
    ...app.documents,
    { id: docId, name: stored.fileName, docType: 'konten-komite', required: false, ...uploadedFields(actor, stored) },
  ]
  addAudit(app, actor, `Konten/Deck Komite diunggah: ${stored.fileName}`)
  return saveApplication(app)
}

// ── Stage 2 — RM bureau data & kolektibilitas ────────────────────────────────

/// RM uploads the SLIK report (enables Kol entry).
export async function uploadSlikAction(appId: string, formData: FormData): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'slik')
  const existing = app.documents.find((d) => d.docType === 'slik_report')
  const docId = existing?.id ?? `${app.id}-slik`
  const file = requireFile(formData)
  const stored = await storeDocumentFile(app.id, docId, file)
  if (existing) {
    resetSlikHandoff(app)
    app.kolEntered = false
    app.documents = app.documents.map((d) =>
      d.id === existing.id
        ? { ...d, name: 'Laporan SLIK', docType: 'slik_report', required: true, ...uploadedFields(actor, stored) }
        : d,
    )
  } else {
    app.documents = [
      ...app.documents,
      {
        id: docId,
        name: 'Laporan SLIK',
        docType: 'slik_report',
        required: true,
        ...uploadedFields(actor, stored),
      },
    ]
  }
  // Real Kol suggestion from the SLIK text (Slice 2b) — only marks ocr_suggested when actually
  // parsed; otherwise RM enters Kol manually. Replaces the former stub fabrication.
  await runPostUploadExtraction(app, docId, 'slik_report', file, stored.contentType)
  addAudit(app, actor, existing ? 'Laporan SLIK diganti' : 'Laporan SLIK diunggah')
  return saveApplication(app)
}

/// RM uploads the Pefindo bureau report (Stage 2, same desk as SLIK). Advisory: it carries NO
/// gating field — Kol stays SLIK-derived + human-confirmed. Stored like SLIK (real bytes, SHA-256).
/// required:false so adding the bureau bundle never tightens the Stage-1→2 completeness gate.
export async function uploadPefindoAction(appId: string, formData: FormData): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'slik')
  const existing = app.documents.find((d) => d.docType === 'pefindo_report')
  const docId = existing?.id ?? `${app.id}-pefindo`
  const file = requireFile(formData)
  const stored = await storeDocumentFile(app.id, docId, file)
  const fields = { name: 'Laporan Pefindo', docType: 'pefindo_report', required: false, ...uploadedFields(actor, stored) }
  app.documents = existing
    ? app.documents.map((d) => (d.id === existing.id ? { ...d, ...fields } : d))
    : [...app.documents, { id: docId, ...fields }]
  addAudit(app, actor, existing ? 'Laporan Pefindo diganti' : 'Laporan Pefindo diunggah')
  return saveApplication(app)
}

/// RM generates the AI bureau-bundle summary (SLIK + Pefindo + Rek Koran) — advisory only, through
/// the masked-egress + audited inference seam (server/ai/bureau.ts). Stored on the app for the RM's
/// Stage-2/3 review. Never authoritative: Kol + all gating values stay human-confirmed.
export async function generateBureauSummaryAction(appId: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  // Shared predicate with the Data-tab UI (lib/auth/can) — RM/`slik`, Stage 1–3, not closed.
  // Was assertCanWorkDesk('slik') (spans 1–2 only), which mismatched the UI (2–3) → Stage-3 403.
  if (!canSummarizeBureau(actor, app)) {
    throw new AuthzError('Ringkasan biro hanya tersedia untuk RM hingga tahap Feasibility (Stage 3).')
  }
  const { summary, model } = await generateBureauSummary(app, actor.userId)
  app.bureauSummary = { summary, model, generatedAt: new Date().toISOString(), generatedByName: auditUserName(actor) }
  addAudit(app, actor, 'Ringkasan biro (AI) dibuat')
  return saveApplication(app)
}

/// RM records the kolektibilitas (Kol 1–5) from the SLIK report. The hard-gate
/// violations are recomputed server-side (Kol > 1 is an OJK hard-gate failure).
export async function confirmKolAction(appId: string, kol: number): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'slik')
  const kolNum = Number(kol)
  if (!Number.isInteger(kolNum) || kolNum < 1 || kolNum > 5) throw new Error('Kol harus 1–5')
  // The OCR suggestion is the Kol stored at SLIK upload (still ocr_suggested until now). If there
  // was no parsed suggestion, this is a manual entry. Provenance: confirmed = unchanged suggestion,
  // overridden = changed it, human_entered = no suggestion to begin with.
  const wasSuggested = app.extractionSources?.['hardGates.kol'] === 'ocr_suggested'
  const suggested = wasSuggested ? Number(app.hardGates.kol) : null
  resetSlikHandoff(app)
  app.hardGates = { ...app.hardGates, kol: kolNum }
  app.kolEntered = true
  // hardGateViolations is auto-recomputed in saveApplication (derived cache) — don't set here.
  app.extractionSources = {
    ...app.extractionSources,
    'hardGates.kol': suggested == null ? 'human_entered' : kolNum === suggested ? 'ocr_confirmed' : 'ocr_overridden',
  }
  addAudit(app, actor, `Kolektibilitas diinput: Kol ${kolNum}`)
  return saveApplication(app)
}

// ── Stage 2 — Legal verification / Analisa Yuridis (legal desk) ─────────────

/// LG marks a document's authenticity/validity as verified (pass) or doubtful (fail).
export async function verifyDocumentAction(appId: string, docId: string, value: 'pass' | 'fail', reason?: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'legal')
  const target = app.documents.find((d) => d.id === docId)
  if (!target) throw new Error('Dokumen tidak ditemukan.')
  const trimmedReason = reason?.trim() ?? ''
  if (value === 'fail' && !trimmedReason) throw new Error('Alasan wajib diisi saat dokumen ditandai tidak sah.')
  resetLegalHandoff(app)
  app.documents = app.documents.map((d) => (d.id === docId
    ? { ...d, legalVerification: value, legalVerificationReason: value === 'fail' ? trimmedReason : null }
    : d))
  addAudit(
    app,
    actor,
    `Verifikasi legal "${target.name}": ${value === 'pass' ? 'lolos' : 'diragukan'}`,
    app.stage,
    value === 'fail' ? trimmedReason : undefined,
  )
  return saveApplication(app)
}

// ── Stage 3 — Feasibility / 5C+1S (muap-author) ─────────────────────────────

export interface FinancialsInput {
  netMonthlyIncome: number
  existingMonthlyObligations: number
  collateralAppraisedValue: number
  projectedMonthlyProfitShare: number | null
  marginRate: number | null
  nisbahBankPercent: number | null
  nisbahCustomerPercent: number | null
  projectionBasis?: string
  incomeProvenance?: ExtractionSource
  collateralProvenance?: ExtractionSource
}

/// LA saves the financial inputs. DSR/LTV (the hard-gate numbers) and the violations
/// are computed SERVER-SIDE from the inputs — never trusted from the client.
export async function saveFinancialsAction(appId: string, input: FinancialsInput): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'muap-author')
  const flat = isFlatAkad(app.akadType)
  const { dsr, ltv, installment } = computeHardGates({
    requestedPlafond: app.requestedPlafond,
    requestedTenorMonths: app.requestedTenorMonths,
    akadType: app.akadType,
    netMonthlyIncome: input.netMonthlyIncome,
    existingMonthlyObligations: input.existingMonthlyObligations,
    collateralAppraisedValue: input.collateralAppraisedValue,
    projectedMonthlyProfitShare: input.projectedMonthlyProfitShare,
    marginRate: input.marginRate,
  })
  app.hardGates = { ...app.hardGates, dsr, ltv }
  app.financialInputs = {
    netMonthlyIncome: input.netMonthlyIncome,
    existingMonthlyObligations: input.existingMonthlyObligations,
    collateralAppraisedValue: input.collateralAppraisedValue,
    proposedMonthlyInstallment: flat ? installment : null,
    projectedMonthlyProfitShare: flat ? null : (input.projectedMonthlyProfitShare ?? 0),
    nisbahBankPercent: flat ? null : input.nisbahBankPercent,
    nisbahCustomerPercent: flat ? null : input.nisbahCustomerPercent,
    projectionBasis: flat ? undefined : input.projectionBasis?.trim(),
  }
  app.financialsAssessed = true
  app.marginRate = flat ? (input.marginRate ?? 0) : app.marginRate
  // hardGateViolations is auto-recomputed in saveApplication (derived cache) — don't set here.
  app.extractionSources = {
    ...app.extractionSources,
    ...(input.incomeProvenance ? { 'financialInputs.netMonthlyIncome': input.incomeProvenance } : {}),
    ...(input.collateralProvenance ? { 'financialInputs.collateralAppraisedValue': input.collateralProvenance } : {}),
  }
  addAudit(app, actor, `Input keuangan disimpan — DSR ${dsr}%, LTV ${ltv}%`)
  return saveApplication(app)
}

const APPRAISAL_PATH_LABELS: Record<AppraisalPath, string> = {
  internal: 'Internal',
  kjpp_short: 'KJPP — laporan ringkas',
  kjpp_long: 'KJPP — laporan lengkap',
}

/// The P3-D STRUCTURED Penilaian payload (design §4). `path` is required (the gate + back-compat read
/// it); the appraiser figures/metadata are optional. nilaiPasar/nilaiLikuidasi are ADVISORY — they
/// cross-check against the P2 OCR advisory (crossCheckAppraisalVsAdvisory) but do NOT feed the LTV input.
export interface RecordAppraisalInput {
  path: AppraisalPath
  nilaiPasar?: number
  nilaiLikuidasi?: number
  penilai?: string
  tanggalLaporan?: string
  reportDocId?: string
}

/// LG/Appraisal desk records the agunan-valuation deliverable. The internal-vs-KJPP choice follows Hijra
/// rules OUTSIDE Mizan; Mizan records the path (audit) + the P3-D STRUCTURED figures (design §4). Stage-2
/// work surface; does NOT gate advancement (the 2→3 advance stays the Legal+SLIK dual handoff). Sets BOTH
/// `appraisalRecord` (rich) AND the scalar `appraisalPath` (back-compat — legalAppraisalComplete reads it).
/// The LTV input (financialInputs.collateralAppraisedValue) stays HUMAN-entered in the Financials form —
/// nilaiPasar is NOT auto-written there (kept separate by design; the cross-check links them advisorily).
export async function recordAppraisalAction(appId: string, input: RecordAppraisalInput): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'appraisal')
  if (!(input.path in APPRAISAL_PATH_LABELS)) throw new Error('Jalur penilaian agunan tidak dikenal.')
  const record: AppraisalRecord = {
    path: input.path,
    ...(input.nilaiPasar !== undefined ? { nilaiPasar: input.nilaiPasar } : {}),
    ...(input.nilaiLikuidasi !== undefined ? { nilaiLikuidasi: input.nilaiLikuidasi } : {}),
    ...(input.penilai !== undefined ? { penilai: input.penilai } : {}),
    ...(input.tanggalLaporan !== undefined ? { tanggalLaporan: input.tanggalLaporan } : {}),
    ...(input.reportDocId !== undefined ? { reportDocId: input.reportDocId } : {}),
  }
  app.appraisalRecord = record
  app.appraisalPath = input.path // back-compat: the gate (legalAppraisalComplete) reads the scalar
  settleLgAssignment(app) // settle the LG card if Analisa Yuridis was already in (deliverable order is free)
  addAudit(app, actor, `Penilaian agunan dicatat — jalur ${APPRAISAL_PATH_LABELS[input.path]}`)
  return saveApplication(app)
}

const ASPECT_LABELS: Record<string, string> = {
  character: 'Karakter (Character)',
  capacity: 'Kapasitas (Capacity)',
  capital: 'Modal (Capital)',
  condition: 'Kondisi Pasar (Condition)',
  collateral: 'Agunan (Collateral)',
  syariah: 'Kepatuhan Syariah (Syariah)',
}

export type AnalysisAudit =
  | { kind: 'edit'; aspect: string }
  | { kind: 'generate'; regenerated: boolean }

/// Saves the 5C+1S analysis prose. Scores stay DETERMINISTIC: when the analysis is
/// generated, the server recomputes scores via generateAspectScores rather than
/// trusting client-sent scores (compliance: AI/clients never set gating levels).
///
/// ⚠️ UI-ORPHANED (verified 2026.06.09): NO component calls this. The authoritative 5C+1S prose is
/// authored by the RM in the MUAP Google Doc (`[Analisis …]` sections), NOT in an in-app form.
/// `app.analysis` is the auto-drafted (buildAnalysisDraft) seed for scoring + the MUAP narrative
/// context only — non-authoritative. There is NO sync-back from the Doc, so app.analysis and the Doc
/// diverge by design. Before wiring a 5C+1S editor, settle whether app.analysis should be authoritative
/// (it currently is not). Role note: it's the RM (post AO+LA→RM fold) — no separate "analis" role/account.
export async function saveAnalysisAction(appId: string, analysis: FiveCSAnalysis, auditInfo: AnalysisAudit): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'muap-author')
  app.analysis = { ...analysis, ...(analysis.generated ? { scores: generateAspectScores(app) } : {}) }
  const action =
    auditInfo.kind === 'edit'
      ? `Analisa 5C+1S diperbarui: ${ASPECT_LABELS[auditInfo.aspect] ?? auditInfo.aspect}`
      : `Analisa 5C+1S ${auditInfo.regenerated ? 'digenerate ulang' : 'digenerate'} (AI)`
  addAudit(app, actor, action)
  return saveApplication(app)
}

/// LA runs an analysis gap-check; the run is recorded to the audit trail (OJK: an
/// auditor must be able to confirm the system surfaced a concern and the analyst saw it).
export async function recordAnalysisGapCheckAction(appId: string, foundCount: number): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'muap-author')
  addAudit(app, actor, foundCount > 0 ? `Gap-check dijalankan — ${foundCount} temuan` : 'Gap-check dijalankan — tidak ada temuan')
  return saveApplication(app)
}

/// LA marks the MUAP Google Doc as synced (the MUAP "done" milestone).
export async function markMuapSyncedAction(appId: string, at: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'muap-author')
  if (app.muapSyncedAt) return app
  app.muapSyncedAt = new Date(at)
  addAudit(app, actor, 'MUAP disinkronkan (selesai)')
  return saveApplication(app)
}

// ── Stage 4 — Risk / RSK (rsk-author) ───────────────────────────────────────

/// RA marks the RSK Google Doc as synced (for the audit freeze).
export async function markRskSyncedAction(appId: string, at: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await load(appId)
  assertCanWorkDesk(actor, app, 'rsk-author')
  if (app.rskSyncedAt) return app
  app.rskSyncedAt = new Date(at)
  addAudit(app, actor, 'RSK disinkronkan (selesai)')
  return saveApplication(app)
}

// ── Stage 6 — Pencairan / disbursement (intake ∪ pencairan) ─────────────────
// The RM job spans intake and disbursement (pencairan desk); approved apps sit at stage 6
// while conditional/rejected ones route back to stage 1. Both the intake and pencairan
// desks may toggle release conditions; only pencairan advances the status.

/// RM advances the disbursement status one step. The step order and the
/// "all conditions before Cair" gate are enforced server-side.
export async function advanceDisbursementAction(appId: string): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'pencairan')
  const app = await load(appId)
  if (!disbursementOpen(app)) throw new AuthzError('Pencairan hanya untuk aplikasi yang disetujui komite (atau bersyarat yang disetujui nasabah).')
  const current = app.disbursementStatus ?? 'Verifikasi Final'
  const next = nextDisbursementStatus(current)
  if (!next) throw new Error('Pencairan sudah pada tahap akhir.')
  const conditions = await getActiveDisbursementConditions()
  if (next === 'Cair' && !disbursementConditionsComplete(app.disbursementConditions, conditions)) {
    throw new Error('Lengkapi seluruh syarat sebelum dana dapat dicairkan.')
  }
  // N1 dual-prerequisite (rm-led-pipeline-redesign §4): the actual release ('Cair') is ALSO gated on
  // the SP3 Legal-review chain being complete — disburse-open (MoM done) AND SP3-Legal-approved
  // (sp3FinalReady). The 5→6 MoM-final advance is untouched; only this release step is gated.
  if (next === 'Cair') {
    const sp3Steps = await loadApprovalSteps(appId, 'sp3')
    if (!sp3FinalReady(app, sp3Steps)) {
      throw new AuthzError('SP3 belum disetujui Legal — belum bisa cair.')
    }
  }
  app.disbursementStatus = next
  if (next === 'Cair') {
    const cairAt = new Date()
    app.enteredStageAt = cairAt
    // P5 (RM-led redesign §7 / Topic 7): the disbursement DATE is the review-cadence ANCHOR (the next
    // scheduled review is due addMonths(disbursedAt, cadence)). Set once, here at the 5→6 'Cair'
    // transition. A DATE, never a payment signal — INVARIANT "Mizan records, never monitors".
    app.disbursedAt = cairAt
  }
  addAudit(app, actor, `Pencairan: ${current} → ${next}`)
  return saveApplication(app)
}

/// AO toggles a single disbursement release condition.
export async function toggleDisbursementConditionAction(appId: string, item: string, checked: boolean): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'intake', 'pencairan')
  const conditions = await getActiveDisbursementConditions()
  if (!conditions.includes(item)) throw new Error('Syarat pencairan tidak dikenal.')
  const app = await load(appId)
  app.disbursementConditions = { ...(app.disbursementConditions ?? {}), [item]: checked }
  addAudit(app, actor, `Syarat pencairan ${checked ? 'ditandai selesai' : 'dibatalkan'}: ${item}`)
  return saveApplication(app)
}

/// AO records the nasabah's response to a committee CONDITIONAL approval.
///  • accepted → the application proceeds to Pencairan (advances to Stage 6 exactly as an
///    approval does); the decision stays 'conditional' for audit, conditionalResponse marks
///    acceptance, and the committee's conditions are tracked as the disbursement release gate.
///  • declined → the application is CLOSED (terminal, reason 'nasabah-decline').
/// Idempotent guard: rejects a second response or a response on a non-conditional/closed app.
export async function recordConditionalResponseAction(appId: string, accepted: boolean): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'intake', 'pencairan')
  const app = await load(appId)
  if (app.komiteDecision !== 'conditional') throw new AuthzError('Respons nasabah hanya untuk keputusan komite bersyarat.')
  if (app.applicationStatus === 'closed') throw new Error('Pengajuan sudah ditutup.')
  if (app.conditionalResponse) throw new Error('Respons nasabah sudah dicatat.')
  if (accepted) {
    app.conditionalResponse = 'accepted'
    app.disbursementStatus = 'Verifikasi Final'
    dispatch(app, { kind: 'SystemTransition', transition: { action: 'Nasabah menyetujui syarat komite — lanjut ke Pencairan', targetStage: 6, requireReason: false } }, actor, undefined, await stageOwnerResolver())
  } else {
    app.conditionalResponse = 'declined'
    app.applicationStatus = 'closed'
    app.closeReason = 'nasabah-decline'
    app.closedAt = new Date()
    addAudit(app, actor, 'Nasabah menolak syarat komite — pengajuan ditutup')
  }
  return saveApplication(app)
}

/// AO confirms the nasabah was notified of a committee REJECTION; this CLOSES the
/// application (terminal, reason 'committee-reject'). Idempotent guard as above.
export async function closeRejectedApplicationAction(appId: string): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'intake', 'pencairan')
  const app = await load(appId)
  if (app.komiteDecision !== 'reject') throw new AuthzError('Penutupan ini hanya untuk keputusan komite tolak.')
  if (app.applicationStatus === 'closed') throw new Error('Pengajuan sudah ditutup.')
  app.applicationStatus = 'closed'
  app.closeReason = 'committee-reject'
  app.closedAt = new Date()
  addAudit(app, actor, 'Nasabah dinotifikasi penolakan komite — pengajuan ditutup')
  return saveApplication(app)
}

// ── Cross-stage — discussion thread (any participant; observers are read-only) ─

/// Append a message (team or AI) to the application discussion thread. Every prompt
/// and AI response is audited (compliance: AI interactions are logged).
export async function appendDiscussionAction(appId: string, role: 'user' | 'assistant', content: string, mentions: string[] = []): Promise<LoanApplication> {
  const actor = await requireActor()
  assertCanParticipate(actor)
  const app = await load(appId)
  // Mentions are scoped to people working THIS application (its assignment owners) — drop anything else
  // so a client can't inject arbitrary user ids. Assistant messages carry no author/mentions.
  const participantIds = new Set(app.assignments.map((a) => a.userId))
  const validMentions = role === 'user' ? [...new Set(mentions)].filter((id) => participantIds.has(id)) : []
  return appendConversationMessages({
    appId,
    expectedVersion: app.version ?? 0,
    surface: 'discussion',
    messages: [{
      role,
      content,
      authorId: role === 'assistant' ? null : actor.userId,
      authorName: role === 'assistant' ? 'MIZAN AI' : auditUserName(actor),
      mentions: validMentions,
    }],
    audit: {
      userId: actor.userId,
      userName: auditUserName(actor),
      action:
        role === 'assistant'
          ? 'AI menjawab pertanyaan diskusi'
          : validMentions.length
            ? `Pesan diskusi dikirim (menyebut ${validMentions.length} orang)`
            : 'Pesan diskusi dikirim',
      stage: app.stage,
    },
  })
}
