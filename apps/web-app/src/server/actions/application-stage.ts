'use server'

import { legalUnverified, markStage2RoleSubmitted, ocrBlockers, recommendationLabels, settleLgAssignment, slikUploaded, type TransitionConfig } from '@/lib/stage-action'
import { appendHistory } from '@/lib/history'
import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { requireActor } from '@/server/auth/session'
import { stageOwnerResolver } from '@/server/auth/stage-owners'
import { assertCanWorkDesk, assertDesk, AuthzError, auditUserName } from '@/lib/auth/can'
import { ensureStage3ResearchOnEntry, ensureExtractionOnAdvance } from '@/server/docs/auto-draft'
import { reconcileFrozenDocGrants } from '@/server/docs/access'
import { getDocLinkage } from '@/server/repo/doc-linkage'
import { phaseOf, type LoanApplication, type RiskRecommendation } from '@/lib/types'
import { buildAmlAttestation, AML_ATTESTATION_HISTORY, type AmlAttestationInput } from '@/lib/aml'
import { dispatch, ctxFor } from '@/lib/workflow-engine'
import { isFlatAkad } from '@/lib/akad-config'
import { chainState } from '@/lib/approval-chain'
import { isPreKomite } from '@/lib/workflow'
import { applyProposalRevision, type ProposalRevision } from '@/lib/proposal-revision'
import { appendApprovalStep } from '@/server/repo/approval'
import { snapshotApplicationDocs } from '@/server/docs/service'
import { log, errField } from '@/server/log'

// All identity is read from the verified session (requireActor) — NEVER from the
// client. Each action also asserts the desk required for the operation BEFORE
// mutating (server actions are POST-reachable, so the gate must live here, not just
// in the UI). This is the security hardening the whole migration was for.

async function snapshotDocsBestEffort(appId: string, actor: Awaited<ReturnType<typeof requireActor>>, trigger: string, label: string): Promise<void> {
  try {
    await snapshotApplicationDocs(appId, { trigger, label, createdBy: actor.userId, createdByName: auditUserName(actor) })
  } catch (e) {
    log.warn('docs.snapshot_skipped', { appId, trigger, ...errField(e) })
  }
}


/// Stage transition (forward or send-back). Any holder of a desk owning the current
/// stage may transition; the pure domain fn validates the transition itself.
// Transition logic tested in lib/stage-action.test.ts (handoff + send-back resets); the
// save→reload persistence is covered by repo/write.itest.ts.
export async function transitionAction(
  appId: string,
  transition: TransitionConfig,
  reason?: string,
): Promise<{ app: LoanApplication; autoSkipped: boolean }> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  const previousStage = app.stage
  const { autoSkipped } = dispatch(app, { kind: 'Transition', transition }, actor, reason, await stageOwnerResolver())
  const saved = await saveApplication(app)
  // Best-effort auto-draft MUAP/RSK on Stage-3 entry (workflow-finetune.md §5). Idempotent +
  // never throws — manual "Buat Dokumen" button stays the fallback. Awaited so the post-transition
  // refresh sees docs ready.
  if (saved.stage !== previousStage) await snapshotDocsBestEffort(saved.id, actor, 'stage_transition', `Tahap ${previousStage}→${saved.stage}`)
  // N2 (ADR-0018): the MUAP is NO LONGER auto-minted on Stage-3 entry — it's minted only by the explicit
  // RM "Generate MUAP" (generateMuapAction). On entry we only warm the grounded web research so the memo
  // opens grounded WHEN the RM generates it. Idempotent + never throws (the manual button is the retry).
  await ensureStage3ResearchOnEntry(saved, previousStage, actor.userId)
  // Best-effort Markdown→AI read-back when entering Komite (Stage 5) — advisory snapshot for the
  // committee; never throws (manual refresh is the retry). document-readback-markdown-ai.md.
  await ensureExtractionOnAdvance(saved, previousStage, actor.userId)
  return { app: saved, autoSkipped }
}

/// RA records the risk recommendation (stage 4 — RSK desk).
export async function saveRiskRecommendationAction(
  appId: string,
  recommendation: Exclude<RiskRecommendation, null>,
  note: string,
): Promise<LoanApplication> {
  const actor = await requireActor()
  assertDesk(actor, 'rsk-author')
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  // The risk recommendation is a DECISION, not prep — it stays strictly at stage 4
  // (do-it-early unlocks prep surfaces only; see lib/auth/can.ts canWorkStage).
  if (app.stage !== 4) throw new AuthzError('Rekomendasi risiko hanya dapat diberikan pada tahap Review Risiko.')
  app.riskRecommendation = recommendation
  app.riskNote = note.trim() || undefined
  appendHistory(app, {
    userId: actor.userId,
    userName: auditUserName(actor),
    action: `Risk recommendation: ${recommendationLabels[recommendation]}`,
    stage: app.stage,
  })
  return saveApplication(app)
}

/// P3-D structured Analisa Yuridis payload (design §4). `opinion` is the Legal verdict; `catatan` are
/// bullet notes (typically required for 'layak-dengan-catatan'); `notes` is the legacy free-text summary
/// (kept). All optional from the caller's view, but the action defaults `opinion` to 'layak' when absent.
export interface CompleteLegalInput {
  opinion?: 'layak' | 'layak-dengan-catatan' | 'tidak-layak'
  catatan?: string[]
  notes?: string
  reportDocId?: string
}

const LEGAL_OPINION_LABELS: Record<NonNullable<CompleteLegalInput['opinion']>, string> = {
  layak: 'Layak',
  'layak-dengan-catatan': 'Layak dengan Catatan',
  'tidak-layak': 'Tidak Layak',
}

/// LG records the **Analisa Yuridis** deliverable (ADR-0007 + P3-D §4): every required non-SLIK doc must
/// be `pass` (per-doc verification is prerequisite work, not auto-filled). This does NOT advance 2→3 — RM
/// coordinates that on its bureau data; Analisa Yuridis + Penilaian gate the **MUAP→Risk** submit instead.
/// Workable through Stage 3 (RM may draft the MUAP in parallel).
///
/// INVARIANT — "Completion gates; the verdict doesn't." The STRUCTURED `opinion` is recorded as a SIGNAL
/// Risk/Komite weigh; its VALUE never blocks. Even a 'tidak-layak' opinion sets `verifiedByLG=true` (the
/// deliverable COMPLETES — the gate legalAppraisalComplete passes), exactly like 'layak'. The opinion is
/// surfaced for the human committee to weigh, never an auto-blocker.
export async function completeLegalAction(
  appId: string,
  input: CompleteLegalInput = {},
): Promise<{ app: LoanApplication; autoSkipped: boolean }> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  assertCanWorkDesk(actor, app, 'legal')
  if (app.stage < 2 || app.stage > 3) throw new AuthzError('Analisa Yuridis hanya dapat diselesaikan pada Tahap 2–3 (sebelum MUAP dikirim ke Risk).')
  const blockers = legalUnverified(app)
  if (blockers.length) throw new Error(`Dokumen belum sah: ${blockers.map((d) => d.name).join(', ')}`)
  const opinion = input.opinion ?? 'layak'
  app.stage2LegalApproval = {
    // COMPLETION — true regardless of the opinion value (even 'tidak-layak'). The verdict is a signal.
    verifiedByLG: true,
    notes: input.notes?.trim() || 'Legalitas dokumen dinyatakan lengkap dan sah.',
    opinion,
    ...(input.catatan && input.catatan.length ? { catatan: input.catatan } : {}),
    ...(input.reportDocId !== undefined ? { reportDocId: input.reportDocId } : {}),
  }
  settleLgAssignment(app) // LG settles only when BOTH deliverables are in (legal here + Penilaian)
  // Audit names the opinion (the committee-weighed verdict is in the trail), while the deliverable completes.
  ctxFor(actor).addHistory(app, `Analisa Yuridis (Legal) selesai — opini: ${LEGAL_OPINION_LABELS[opinion]}`, app.stage)
  const saved = await saveApplication(app)
  return { app: saved, autoSkipped: false }
}

/// RM formally sends SLIK/Kol's Stage-2 handoff (SLIK ownership = RM, D1). Uploading SLIK and entering
/// Kol are data work; this click is the auditable handoff. If Legal has already sent, this advances.
export async function completeSlikAction(appId: string): Promise<{ app: LoanApplication; autoSkipped: boolean }> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  assertCanWorkDesk(actor, app, 'slik')
  if (app.stage !== 2) throw new AuthzError('SLIK hanya dapat dikirim saat aplikasi berada di Tahap 2.')
  if (!slikUploaded(app)) throw new Error('Laporan SLIK belum diunggah.')
  if (!app.kolEntered) throw new Error('Kolektibilitas belum diinput.')
  const ocrB = ocrBlockers(app, 'slik')
  if (ocrB.length) throw new Error(`Nilai OCR belum dikonfirmasi: ${ocrB.join(', ')}`)
  const previousStage = app.stage
  app.stage2SlikApproval = { verifiedByRT: true, notes: `Kol ${app.hardGates.kol}` }
  markStage2RoleSubmitted(app, 'RM')
  ctxFor(actor).addHistory(app, 'SLIK/Kolektibilitas dikirim ke Feasibility', app.stage)
  const { autoSkipped } = dispatch(app, { kind: 'DualSignOff' }, actor, undefined, await stageOwnerResolver())
  const saved = await saveApplication(app)
  if (saved.stage !== previousStage) await snapshotDocsBestEffort(saved.id, actor, 'stage_transition', `Tahap ${previousStage}→${saved.stage}`)
  // N2 (ADR-0018): research-only warm-up on Stage-3 entry; the MUAP is minted by the explicit Generate.
  await ensureStage3ResearchOnEntry(saved, previousStage, actor.userId)
  return { app: saved, autoSkipped }
}

/// RM (intake desk) records the Initial-AML attestation: the RM affirms the EXTERNAL
/// DTTOT/PEP/negative-list check (done by CS/Compliance, NOT by MIZAN) was performed and PASSED.
/// RM-led redesign (ADR-0020 §2): the AML attestation now gates the MUAP→Risk submit
/// (lib/stage-action.ts muapToRiskBlockers / makerSubmitGateError('muap')), NOT the freed 1→2 advance.
/// It is therefore attestable across the whole Inisiasi phase (stages 1–3, phaseOf===1) — matching the
/// phase-wide intake window (lib/auth/can.ts canWorkDeskNow) — so the relocated gate stays satisfiable
/// after a free intra-Inisiasi advance. The authoritative OJK record is the appended HistoryEntry
/// carrying RM identity + timestamp; the column carries the structured affirmation for the gate + UI.
/// Re-calling just re-stamps (idempotent). The backToIntake reset (clearAmlAttestation) is unchanged —
/// a send-back to intake still clears it (re-attest needed). Mirrors completeLegalAction: requireActor
/// identity (never client), desk gate, audit.
export async function attestAmlAction(appId: string, input: AmlAttestationInput = {}): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  assertCanWorkDesk(actor, app, 'intake')
  if (phaseOf(app.stage) !== 1) throw new AuthzError('Atestasi AML hanya dapat dilakukan pada fase Inisiasi (sebelum MUAP dikirim ke Risk).')
  // P3-D §4: the structured fields (result/catatan/screenedParties/evidenceDocId) are OPTIONAL — a bare
  // call (today's UI) builds the legacy 4-field record. amlAttested stays !!attestation regardless.
  app.amlAttestation = buildAmlAttestation(actor.userId, auditUserName(actor), input)
  ctxFor(actor).addHistory(app, AML_ATTESTATION_HISTORY, 1)
  return saveApplication(app)
}

// `confirmKolAction` records Kol data only; Stage 2→3 requires completeSlikAction
// explicit RM bureau handoff. Analisa Yuridis + Penilaian gate MUAP→Risk, not 2→3.
// See docs/guides/workflow.md.

/// RM revises the proposal (akad/plafond/tenor/margin/agunan/tujuan) during pre-Komite negotiation
/// (workflow-engine.md "Proposal vs workflow"). NOT a workflow transition — a +History edit that
/// recomputes the hard gates and rebuilds the doc checklist on an akad/agunan change. Because the
/// proposal feeds the MUAP credit memo, a non-idle MUAP (and its dependent RSK) is INVALIDATED via a
/// chain `reset`, and a finalized MUAP (stage ≥ 4) regresses the app to MUAP re-authoring. Frozen at
/// the Komite decision (isPreKomite gate). Pure revision + cascade reducer are unit-tested; the
/// chain-reset + regression round-trip is covered by the integration suite.
export async function reviseProposalAction(appId: string, rev: ProposalRevision, reason: string): Promise<LoanApplication> {
  const actor = await requireActor()
  let app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  assertDesk(actor, 'intake') // proposal ownership is the RM's (relationship-manager)
  if (!isPreKomite(app)) throw new AuthzError('Proposal hanya dapat direvisi sebelum keputusan Komite.')
  if (app.applicationStatus === 'closed') throw new AuthzError('Pengajuan sudah ditutup — tidak dapat direvisi.')
  if (!reason.trim()) throw new AuthzError('Alasan revisi wajib diisi (jejak audit).')
  if (rev.requestedPlafond !== undefined && (!Number.isFinite(rev.requestedPlafond) || rev.requestedPlafond <= 0)) {
    throw new AuthzError('Plafond harus berupa angka positif.')
  }
  if (rev.requestedTenorMonths !== undefined && (!Number.isInteger(rev.requestedTenorMonths) || rev.requestedTenorMonths <= 0)) {
    throw new AuthzError('Tenor harus bilangan bulat positif.')
  }
  if (isFlatAkad(rev.akadType ?? app.akadType)) {
    if (rev.marginRate != null && rev.marginRate < 0) throw new AuthzError('Margin tidak boleh negatif.')
  } else if (rev.marginRate != null) {
    throw new AuthzError('Akad bagi hasil tidak memakai margin (gunakan nisbah).')
  }

  await snapshotDocsBestEffort(app.id, actor, 'revise', 'Sebelum revisi proposal')
  // Cascade — a revised proposal makes a signed/in-progress MUAP (and its dependent RSK) stale. Each
  // reset is an append-only ledger row (the chain returns to idle → maker must re-draft + re-request).
  const userName = auditUserName(actor)
  if (chainState('muap', app.approvalSteps ?? []).status !== 'idle') {
    app = await appendApprovalStep({ appId, expectedVersion: app.version ?? 0, chain: 'muap', role: 'muap-author', action: 'reset', userId: actor.userId, userName, reason, audit: { action: 'MUAP dibatalkan — revisi proposal pra-Komite', stage: app.stage } })
  }
  if (chainState('rsk', app.approvalSteps ?? []).status !== 'idle') {
    app = await appendApprovalStep({ appId, expectedVersion: app.version ?? 0, chain: 'rsk', role: 'rsk-author', action: 'reset', userId: actor.userId, userName, reason, audit: { action: 'RSK dibatalkan — revisi proposal pra-Komite', stage: app.stage } })
  }

  const previousStage = app.stage
  applyProposalRevision(app, rev)
  const parts: string[] = []
  if (rev.akadType !== undefined) parts.push(`akad ${rev.akadType}`)
  if (rev.requestedPlafond !== undefined) parts.push(`plafond Rp${rev.requestedPlafond.toLocaleString('id-ID')}`)
  if (rev.requestedTenorMonths !== undefined) parts.push(`tenor ${rev.requestedTenorMonths} bln`)
  if (rev.marginRate !== undefined) parts.push(`margin ${rev.marginRate ?? 0}%`)
  if (rev.collateralType !== undefined) parts.push(`agunan ${rev.collateralType}`)
  if (rev.purpose !== undefined) parts.push('tujuan')
  appendHistory(app, { userId: actor.userId, userName, action: `Revisi proposal pra-Komite: ${parts.join(', ') || 'tidak ada perubahan'}`, stage: app.stage, reason })

  // A finalized MUAP (the app had advanced to Risk/beyond) is now void → regress to MUAP re-authoring.
  if (previousStage >= 4) {
    dispatch(app, { kind: 'SystemTransition', transition: { action: 'Revisi proposal — kembali ke penyusunan MUAP', targetStage: 3, requireReason: true } }, actor, reason, await stageOwnerResolver())
  }

  const saved = await saveApplication(app)
  if (previousStage >= 4) {
    // N2 (ADR-0018): no auto-mint — the MUAP already exists (it was minted + advanced before this
    // pre-Komite regress). Only the research warm-up runs on re-entry; the MUAP stays as-is for re-edit.
    await ensureStage3ResearchOnEntry(saved, previousStage, actor.userId)
    // Batch 3 T7: the regress reopens the MUAP (Stage 3 → RM regains writer on next mount) and
    // RE-FREEZES the RSK — downgrade any lingering RSK writer grant to reader (isDocFrozen(rsk) is
    // now true at Stage 3). Best-effort; the RSK is re-filled from the revised MUAP on re-entry to 4.
    const linkage = await getDocLinkage(appId)
    if (linkage) await reconcileFrozenDocGrants(saved, linkage)
  }
  return saved
}

/// RM withdraws an active application before disbursement (nasabah backs out, or the bank declines
/// to proceed). Terminal close with reason 'withdrawn'. A disbursed application ('Cair') cannot be
/// withdrawn. RM-owned (intake desk); reason mandatory (audit).
export async function withdrawApplicationAction(appId: string, reason: string): Promise<LoanApplication> {
  const actor = await requireActor()
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  assertDesk(actor, 'intake')
  if (app.applicationStatus === 'closed') throw new AuthzError('Pengajuan sudah ditutup.')
  if (app.disbursementStatus === 'Cair') throw new AuthzError('Pembiayaan sudah dicairkan — tidak dapat ditarik.')
  if (!reason.trim()) throw new AuthzError('Alasan penarikan wajib diisi (jejak audit).')
  app.applicationStatus = 'closed'
  app.closeReason = 'withdrawn'
  app.closedAt = new Date()
  appendHistory(app, { userId: actor.userId, userName: auditUserName(actor), action: 'Pengajuan ditarik (withdraw)', stage: app.stage, reason })
  return saveApplication(app)
}
