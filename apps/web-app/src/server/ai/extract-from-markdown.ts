import 'server-only'

import { randomUUID } from 'node:crypto'
import { inferenceProvider } from './provider'
import { maskForEgress, blockOnResidualPii } from './redact'
import { recordAiInteraction } from './audit'
import { auditBestEffort } from './audit-best-effort'
import { piiSecrets } from '@/lib/pii-mask'
import { log, errField } from '@/server/log'
import {
  SnapshotSchema,
  EXTRACT_SYSTEM_INSTRUCTION,
  buildExtractPrompt,
  unmaskSnapshot,
  buildReport,
  type PiiApp,
} from './extract-from-markdown-core'
import type { ExtractedSnapshot, ExtractionResult } from '@/lib/extraction/types'

// ── Document read-back: Markdown → AI — egress + audit shell (document-readback-markdown-ai.md) ──
//
// The structured read-back of the per-application MUAP/RSK Docs. Input is the Doc exported to
// Markdown (server/docs/service.ts exportDocMarkdown); output is the SAME ExtractedSnapshot the
// NamedRange/sentinel adapter produced (shape + transform in extract-from-markdown-core.ts), so
// every downstream consumer (scoresFromSnapshot, ExtractionPreview, the AI snapshotBlock context)
// is untouched.
//
// COMPLIANCE — this is an AI-egress surface, so it obeys the standard pipeline:
//   • mask-in (maskForEgress) BEFORE the model sees the full document Markdown; residual is subject
//     to the PII_RESIDUAL_BLOCK policy (fail-open by default).
//   • Zod-constrained structured output — risk levels are a strict enum; malformed output is
//     REJECTED (snapshot=null) so a bad parse never poisons the advisory score (caller falls back to
//     the deterministic generateAspectScores).
//   • unmask-out the model's free-text fields (it worked in the masked domain), then audit the
//     MASKED prompt + MASKED snapshot via recordAiInteraction (G3) — best-effort/fail-open.
//
// INVARIANT (unchanged by this path): the AI snapshot is a READ of the human-authored doc for
// ADVISORY use only. It never authors official risk levels into the doc and is never written to the
// authoritative riskRecommendation (RSKTab) nor frozen into the decision PDF.

/// Produce an ExtractedSnapshot from the application's MUAP/RSK Markdown via the inference provider.
/// Returns ExtractionResult { report, snapshot } — snapshot is null (and report.ok=false) when there
/// is nothing to read or the model output fails Zod validation, so the caller keeps the prior OK
/// snapshot / falls back to the deterministic score.
export async function extractSnapshotFromMarkdown(opts: {
  appId: string
  userId: string
  pii: PiiApp
  muapMarkdown: string | null
  rskMarkdown: string | null
}): Promise<ExtractionResult> {
  const runId = randomUUID()
  const extractedAt = new Date().toISOString()

  if (!opts.muapMarkdown && !opts.rskMarkdown) {
    return {
      report: buildReport(runId, extractedAt, false, [
        { fieldKey: 'document', doc: 'rsk', status: 'missing_anchor', source: 'none', message: 'Dokumen belum bisa diekspor ke Markdown.' },
      ]),
      snapshot: null,
    }
  }

  const secrets = piiSecrets(opts.pii)
  // Mask-in BEFORE egress (the full document Markdown is the new, larger PII surface — see plan).
  const { masked: maskedPrompt, residual } = maskForEgress(buildExtractPrompt(opts.muapMarkdown, opts.rskMarkdown), secrets)
  if (residual.length) {
    const block = blockOnResidualPii()
    log.warn('pii.residual_detected', { surface: 'extract', appId: opts.appId, phase: 'prompt', types: residual, blocked: block })
    if (block) throw new Error('Doc read-back blocked: residual PII detected in document text.')
  }

  const ai = inferenceProvider()
  let snapshot: ExtractedSnapshot
  try {
    const obj = await ai.generateStructured(EXTRACT_SYSTEM_INSTRUCTION, maskedPrompt, SnapshotSchema, { temperature: 0.1 })
    snapshot = unmaskSnapshot(obj, secrets)
  } catch (e) {
    // Malformed / unparseable model output → reject the run (snapshot null); the caller keeps the
    // prior OK snapshot and the preview falls back to the deterministic generateAspectScores.
    log.warn('extract.markdown_parse_failed', { appId: opts.appId, ...errField(e) })
    return {
      report: buildReport(runId, extractedAt, false, [
        { fieldKey: 'snapshot', doc: 'rsk', status: 'parse_failed', source: 'none', message: 'Model gagal menghasilkan snapshot terstruktur yang valid.' },
      ]),
      snapshot: null,
    }
  }

  // Audit AFTER masking — the store holds only masked text (G3). Best-effort/fail-open.
  const { masked: maskedReply } = maskForEgress(JSON.stringify(snapshot), secrets)
  await auditBestEffort(
    () => recordAiInteraction({ appId: opts.appId, userId: opts.userId, surface: 'extract', maskedPrompt, maskedReply, model: ai.model() }),
    'extract.audit_failed',
    { appId: opts.appId },
  )

  return { report: buildReport(runId, extractedAt, true), snapshot }
}
