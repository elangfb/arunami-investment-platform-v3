import 'server-only'

import { buildSeedContext } from '@/lib/seed-context'
import { ensureRskDoc, syncExtractionFromMarkdown } from './service'
import { runWebResearch } from '@/server/research/pipeline'
import { saveApplication } from '@/server/repo/write'
import { appendHistory } from '@/lib/history'
import { log, errField } from '@/server/log'
import type { LoanApplication } from '@/lib/types'

// BEST-EFFORT grounded-research warm-up whenever an app ENTERS Stage 3 (Feasibility).
//
// N2 (ADR-0018, docs/designs/rm-led-pipeline-redesign.md §4 — 2026.06.11): the MUAP Doc is NO LONGER
// minted here. The auto-mint-at-Stage-3-entry is REMOVED — the MUAP is minted ONLY by the explicit RM
// "Generate MUAP" (generateMuapAction → createApplicationDocs). What survives on entry is the grounded
// web-research warm-up: it populates exploredSources so that WHEN the RM generates the MUAP, the draft
// opens already grounded in cited sources (createApplicationDocs reads exploredSources from the DB and
// the narrative grounder cites them — server/ai/narrative.ts). Research is also re-runnable by the
// manual "Riset ulang" button (runWebResearchAction).
//
// SAFETY:
//   • Never throws — a research hiccup is caught and logged; the transition still succeeds.
//   • Stage-3-entry only — no-op unless previous stage was NOT 3 and the saved app is. So
//     intra-Stage-3 saves don't re-trigger.
export async function ensureStage3ResearchOnEntry(app: LoanApplication, previousStage: number, auditUserId?: string): Promise<void> {
  if (!(app.stage === 3 && previousStage !== 3)) return
  await runStage3Research(app, auditUserId)
}

// BEST-EFFORT creation of the RSK Doc when an app ENTERS Stage 4 (Risk) — Batch 3 T3 / ADR-0016.
// The RSK is born HERE (not at Stage-3 entry), grounded in the now-FINAL MUAP: first a read-back of
// the MUAP markdown (advisory ExtractionRun, T4), then copy master RSK + fill from the current seed.
//
// SAFETY:
//   • Idempotent — ensureRskDoc returns the existing rskDocId if already created (re-entry after a
//     send-back won't duplicate; the doc is re-filled separately by T7).
//   • Never throws — a Drive/model hiccup is logged; the advance still succeeds and the manual
//     doc-panel button is the retry. Fire-after-advance: never blocks the BM's approve click.
//   • Stage-4-entry only (no-op otherwise), so intra-stage saves don't re-trigger.
export async function ensureStage4DocsOnEntry(app: LoanApplication, previousStage: number, auditUserId?: string): Promise<void> {
  if (!(app.stage === 4 && previousStage !== 4)) return
  // 1. Read back the FINAL MUAP (advisory ExtractionRun) so the RSK is grounded in it, not the raw seed.
  try {
    await syncExtractionFromMarkdown(app.id, { auditUserId: auditUserId ?? 'system' })
  } catch (e) {
    log.warn('docs.stage4_readback_failed', { appId: app.id, ...errField(e) })
  }
  // 2. Create the RSK from the current seed — OR re-fill it if it already exists (T7: a re-entry after
  //    a send-back, where the MUAP was revised, must refresh the RSK from the revised MUAP).
  try {
    const seed = buildSeedContext(app)
    await ensureRskDoc(app.id, { seed, nasabahName: app.nasabahName, auditUserId, refillIfExists: true })
  } catch (e) {
    log.error('docs.rsk_create_failed', { appId: app.id, ...errField(e) })
  }
}

// BEST-EFFORT grounded web research on Stage-3 entry. Auto so the MUAP draft (and the "Riset Web"
// panel) are non-empty when the RM opens the memo; the manual "Riset ulang" button stays the
// explicit re-run after new documents land (ai-assist.md: auto-on-entry + manual re-run).
//
// SAFETY:
//   • Business-entity-only egress — the classifier (lib/research/classifier.ts) refuses individual
//     nasabah / missing business name and returns []. NEVER throws (the whole pipeline is fail-safe),
//     so a research hiccup never blocks the stage transition or the doc auto-draft.
//   • Idempotent — skips if exploredSources already exist, so re-entry / DualSignOff double-fire
//     won't re-run an expensive pass. The manual button is the deliberate re-run.
//   • Cost note: this fires on EVERY business-nasabah Stage-3 entry. Acceptable for V1 (stub in
//     dev/CI; idempotent in prod). The async job queue (server/research/job.ts) is the planned
//     upgrade if the synchronous synthesis latency on the transition becomes a problem.
async function runStage3Research(app: LoanApplication, auditUserId?: string): Promise<void> {
  if (app.nasabahType !== 'business' || !app.namaUsaha?.trim()) return
  if (app.exploredSources?.length) return
  try {
    const sources = await runWebResearch({
      appId: app.id,
      userId: auditUserId ?? 'system',
      ctx: {
        namaUsaha: app.namaUsaha ?? null,
        nasabahType: app.nasabahType,
        akadType: app.akadType,
        purpose: app.purpose,
        collateralType: app.collateralType,
      },
      app, // design §5: customer-only layered context, REAL-masked for the public-internet egress
    })
    if (!sources.length) return
    app.exploredSources = sources
    appendHistory(app, {
      userId: auditUserId ?? 'system',
      userName: 'Sistem (riset otomatis)',
      action: `Riset web otomatis saat masuk Feasibility — ${sources.length} sumber terkutip`,
      stage: app.stage,
    })
    await saveApplication(app)
  } catch (e) {
    log.warn('research.auto_failed', { appId: app.id, ...errField(e) })
  }
}

// BEST-EFFORT structured read-back of the per-application MUAP/RSK Docs when an app ENTERS Komite
// (Stage 5) — the natural gate where the RSK is finalized and the committee needs the snapshot
// (document-readback-markdown-ai.md). Markdown → AI, masked + audited. Replaces dependence on the
// manual "Sinkronkan" click for the common path; that refresh affordance stays as the retry.
//
// SAFETY: never throws — a Drive/model hiccup is logged; the transition still succeeds and the
// manual refresh is the retry path. Stage-5-entry only (no-op otherwise), so intra-stage saves
// don't re-trigger. The snapshot is ADVISORY (scores preview + AI context); it never authors the
// official risk levels nor the authoritative riskRecommendation.
export async function ensureExtractionOnAdvance(app: LoanApplication, previousStage: number, auditUserId: string): Promise<void> {
  if (!(app.stage === 5 && previousStage !== 5)) return
  try {
    await syncExtractionFromMarkdown(app.id, { auditUserId })
  } catch (e) {
    log.warn('docs.auto_extract_failed', { appId: app.id, ...errField(e) })
  }
}
