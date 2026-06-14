import { STAGE_NAMES, type LoanApplication, type RiskRecommendation, type Role, type Stage } from '@/lib/types'
import { activeOwnerNames, ownersForStage, type StageOwner } from '@/lib/stage-owners'
import { buildAnalysisDraft } from '@/lib/analysis-draft'
import { parseGateValueFromText } from '@/lib/ocr'
import { getFieldExtractor } from '@/lib/extraction-registry'
import type { Desk } from '@/lib/desks'
import { ownerDeskForDocType } from '@/lib/required-docs'
import { decisionLabel, formatMeetingDate, meetingVenueLabel } from '@/lib/komite'
import { amlAttested, AML_GATE_MESSAGE } from '@/lib/aml'
import { isChainComplete, type ApprovalChain, type ApprovalStepEntry } from '@/lib/approval-chain'
import type { DetailView } from '@/lib/detail-nav'

export type TransitionConfig = {
  action: string
  targetStage: Stage
  requireReason: boolean
}

export interface ActionCtx { addHistory: (targetApp: LoanApplication, action: string, stage: Stage, reason?: string) => void }

// English decision verbs (Approve / Conditional / Reject) — shared vocabulary with
// the committee vote/decision (lib/komite), kept English for user familiarity.
export const recommendationLabels: Record<Exclude<RiskRecommendation, null>, string> = {
  approve: 'Approve',
  conditional: 'Conditional',
  reject: 'Reject',
}

export const OCR_FIELD_LABELS: Record<string, string> = {
  'nik': 'NIK',
  'hardGates.kol': 'Kolektibilitas (SLIK)',
  'financialInputs.netMonthlyIncome': 'Pendapatan Bersih/bulan',
  'financialInputs.collateralAppraisedValue': 'Nilai Appraisal Agunan',
}

// Stage-3 entry side effects: OCR auto-fill from slip gaji / appraisal, then a
// first 5C+1S draft (only if none yet). Shared by Stage-3 entry paths, including
// the explicit Stage-2 dual-handoff advance.
export function applyStage3Entry(source: LoanApplication): void {
  const autoFillSpecs = [
    { docType: 'slip_gaji', subkey: 'netMonthlyIncome', keyPath: 'financialInputs.netMonthlyIncome' },
    { docType: 'appraisal_agunan', subkey: 'collateralAppraisedValue', keyPath: 'financialInputs.collateralAppraisedValue' },
  ] as const
  autoFillSpecs.forEach(({ docType, subkey, keyPath }) => {
    // Skip if upload already produced a suggestion/confirmation for this field. Otherwise parse
    // it from the document's stored OCR text (Slice 2b) — no stub fabrication: if the value isn't
    // confidently in the text, leave the field for manual entry.
    if (source.extractionSources?.[keyPath] !== undefined) return
    const doc = source.documents.find(d => d.docType === docType && d.extractedText)
    const value = doc?.extractedText ? parseGateValueFromText(docType, doc.extractedText) : null
    if (value != null) {
      source.financialInputs[subkey] = value
      source.extractionSources = { ...source.extractionSources, [keyPath]: 'ocr_suggested' }
    }
  })
  if (!source.analysis.generated) source.analysis = buildAnalysisDraft(source)
}

// Stage-2 support is fully complete only when RM bureau-data is handed off and
// Legal & Appraisal deliverables are in. The 2→3 advance itself uses only
// `stage2RmDataReady`; this predicate is for read-model/progress surfaces that want
// the whole RM-coordinated Stage-2 bundle.
export function stage2SupportComplete(s: LoanApplication): boolean {
  return stage2RmDataReady(s) && legalAppraisalComplete(s)
}

// ADR-0007: the Legal & Appraisal deliverables that gate the MUAP→Risk submit (NOT the 2→3 advance).
// Analisa Yuridis (LG handoff + every required non-SLIK doc legally verified) AND Penilaian (the
// appraisal path recorded). RM dispatches both; the MUAP cannot be sent to Risk until both are in.
export function legalAppraisalComplete(s: LoanApplication): boolean {
  if (!s.stage2LegalApproval?.verifiedByLG || !s.appraisalPath) return false
  return !s.documents.some(
    d => d.required && d.docType !== 'slik_report' && d.name !== 'SLIK Report' && d.legalVerification !== 'pass'
  )
}

// ADR-0007: the 2→3 advance is RM-coordinated — it fires on RM's own bureau-data work (the SLIK
// handoff + Kol), NOT on a Legal sign-off. Legal & Appraisal complete in parallel and gate MUAP→Risk.
export function stage2RmDataReady(s: LoanApplication): boolean {
  return Boolean(s.stage2SlikApproval?.verifiedByRT && s.kolEntered)
}

// The maker's submit-to-checker gate per ladder — the deliverable that must exist before a `request`
// opens the ladder (Batch 3 T5, closes asymmetry #14). MUAP↔Legal+Appraisal (ADR-0007); RSK↔the Risk
// Analyst's recorded recommendation. Returns a Bahasa error message, or null when the request is
// allowed. Hard-gate override (MUAP only) is handled separately at the call site. Pure → unit-tested.
export function makerSubmitGateError(chain: ApprovalChain, app: LoanApplication): string | null {
  // SP3 (N1) has no app-derived deliverable gate here — its only pre-request gate is the SP3
  // doc-existence check, enforced in server/actions/approval.ts (DocLinkage.sp3DocId). Return null.
  if (chain === 'sp3') return null
  if (chain === 'muap') {
    // RM-led redesign (ADR-0020 §2): the four intake hard gates RELOCATE here from the old 1→2
    // advance and join the pre-existing Legal/Appraisal gate. The MUAP-ladder request is blocked
    // until ALL are satisfied. Surfacing the FIRST keeps one actionable message.
    return muapToRiskBlockers(app)[0] ?? null
  }
  if (chain === 'rsk' && app.riskRecommendation == null) {
    return 'RSK belum dapat diajukan ke Komite: rekomendasi risiko (Risk Analyst) belum diisi.'
  }
  return null
}

// RM-led redesign (ADR-0020 §2, decisions/0020-customer-entity-and-rm-led-pipeline.md): the four intake
// hard gates that USED to block the 1→2 advance (required intake docs · unconfirmed intake OCR = NIK ·
// NIK cross-check mismatch · the Initial-AML attestation) RELOCATE to the MUAP→Risk submit, UNIONed with
// the pre-existing Legal/Appraisal deliverable gate (legalAppraisalComplete). Same predicates + same
// messages as before — only the gate LOCATION moved; nothing that blocked is silently un-gated. Returns
// human-readable blocker messages (empty = clear). Enforced at the MUAP-ladder request via
// makerSubmitGateError('muap'); the intra-Inisiasi 1→2 advance is now free.
export function muapToRiskBlockers(app: LoanApplication): string[] {
  const messages: string[] = []
  const docB = docBlockers(app)
  if (docB.length) messages.push(`Lengkapi dokumen wajib: ${docB.map(d => d.name).join(', ')}`)
  const ocrB = ocrBlockers(app, 'intake')
  if (ocrB.length) messages.push(`Nilai OCR belum dikonfirmasi: ${ocrB.join(', ')}`)
  if (app.extractionMismatches?.nik) messages.push('NIK berbeda dari dokumen (KTP) — selesaikan selisih OCR dulu.')
  if (!amlAttested(app)) messages.push(AML_GATE_MESSAGE)
  if (!legalAppraisalComplete(app)) {
    messages.push('MUAP belum dapat diajukan ke Risk: Analisa Yuridis (Legal) & Penilaian agunan (Appraisal) belum selesai.')
  }
  return messages
}

// Stage-1 advance gate: only RM-intake-owned required docs block the move to Stage 2. Docs owned by
// a later desk (SLIK/Pefindo → RM bureau-data) are that desk's job at Stage 2, never an intake blocker —
// generalizes the former slik_report special-case into the required-by-desk model.
export function docBlockers(app: LoanApplication) {
  return app.documents.filter(d => d.required && d.status !== 'uploaded' && ownerDeskForDocType(d.docType) === 'intake')
}
export function legalDocs(app: LoanApplication) { return app.documents.filter(d => d.required && d.docType !== 'slik_report' && d.name !== 'SLIK Report') }
export function legalUnverified(app: LoanApplication) { return legalDocs(app).filter(d => d.legalVerification !== 'pass') }
export function slikUploaded(app: LoanApplication) { return app.documents.some(d => d.docType === 'slik_report' && d.status === 'uploaded') }
export function analysisComplete(app: LoanApplication) { return ['character', 'capacity', 'capital', 'condition', 'collateral', 'syariah'].every(k => app.analysis[k as keyof typeof app.analysis] && app.analysis[k as keyof typeof app.analysis] !== '') }
// A stage's advance gate may only be blocked by OCR suggestions that ITS OWN desk can confirm —
// a field owned by a later desk (income/collateral → RM analysis, Kol → RM bureau-data) is that
// desk's job, never an upstream blocker (the same desk-scoping rule docBlockers uses).
// `desk` omitted = every unconfirmed suggestion (the final pre-committee backstop at Stage 4).
export function ocrBlockers(app: LoanApplication, desk?: Desk) {
  return Object.entries(app.extractionSources ?? {})
    .filter(([, v]) => v === 'ocr_suggested')
    .filter(([k]) => desk == null || getFieldExtractor(k)?.ownerDesk === desk)
    .map(([k]) => OCR_FIELD_LABELS[k] ?? k)
}

// RM-led redesign (ADR-0020 §2): the intra-Inisiasi 1→2 advance is now FREE. The four intake hard gates
// (required intake docs · unconfirmed intake OCR = NIK · NIK cross-check mismatch · the Initial-AML
// attestation) that this function used to enforce have RELOCATED to the MUAP→Risk submit — see
// `muapToRiskBlockers` (the new home, same predicates + messages). This symbol is kept (always returns
// []) so existing callers (stageActions Stage-1, assertTransitionAllowed) don't break while they no
// longer block on it. Do NOT re-add intake blockers here — that would re-gate the freed advance.
export function stage1To2Blockers(_app: LoanApplication): string[] {
  return []
}

// RE-VERIFY ON CHANGE: replacing the bytes of an already-legally-verified document invalidates
// that verification. Reset the doc's legalVerification and clear the LG handoff so Legal must
// re-verify before the app can advance again (the changed doc could now fail legal). No-op when
// the doc was never verified (Stage 1 upload). Pure → unit-tested.
export function resetVerificationOnReupload(app: LoanApplication, docId: string): void {
  const doc = app.documents.find(d => d.id === docId)
  if (doc?.legalVerification != null) {
    doc.legalVerification = null
    doc.legalVerificationReason = null
    resetLegalHandoff(app)
  }
}

export function resetLegalHandoff(app: LoanApplication): void {
  if (app.stage2LegalApproval?.verifiedByLG) {
    app.stage2LegalApproval = { ...app.stage2LegalApproval, verifiedByLG: false }
    reopenStage2Role(app, 'LG')
  }
}

export function resetSlikHandoff(app: LoanApplication): void {
  if (app.stage2SlikApproval?.verifiedByRT) {
    app.stage2SlikApproval = { ...app.stage2SlikApproval, verifiedByRT: false }
    reopenStage2Role(app, 'RM')
  }
}

export function markStage2RoleSubmitted(app: LoanApplication, role: Extract<Role, 'LG' | 'RM'>): void {
  const now = new Date()
  app.assignments.forEach(a => {
    if (a.stage === 2 && a.role === role && a.submittedAt === null) {
      a.submittedAt = now
      a.status = 'submitted'
    }
  })
}

// The LG assignment carries BOTH deliverables (Analisa Yuridis + Penilaian). It settles ONLY when
// `legalAppraisalComplete` — derived from the domain predicate, never from "the stage moved past
// you". No-op while either deliverable is owed. Works at stage 2 OR 3 (the late-finish case where
// the RM-driven 2→3 advance already moved the deal into MUAP). Called from both deliverable actions.
export function settleLgAssignment(app: LoanApplication): void {
  if (!legalAppraisalComplete(app)) return
  markStage2RoleSubmitted(app, 'LG')
}

function reopenStage2Role(app: LoanApplication, role: Extract<Role, 'LG' | 'RM'>): void {
  // LG's work window is stage 2–3 (matches canWorkDeskNow('legal')) — a doc re-upload at Stage 3
  // reopens the LG assignment too. RM (slik) keeps the stage-2-only window (its work really is stage 2).
  const outsideWindow = role === 'LG' ? app.stage < 2 || app.stage > 3 : app.stage !== 2
  if (outsideWindow) return
  app.assignments.forEach(a => {
    if (a.stage === 2 && a.role === role) {
      a.submittedAt = null
      a.status = 'in_progress'
    }
  })
}

// ── Command engine (Phase 3: command-sourced engine, docs/planning/workflow-engine-build.md) ──
// decide() is the PURE core: (state, command) → a Decision describing the state change, with NO
// I/O and NO roster/effect coupling. applyDecision() is the effect step — it applies a Decision
// (assignment open/close, history, send-back resets, stage-3 entry) to the aggregate. dispatch()
// (lib/workflow-engine.ts) is the single guarded seam that composes them; nothing mutates workflow
// state except through it (invariant: one write seam). decide()/applyDecision() stay unit-tested.
//
// Command kinds: `Transition` = a user-initiated manual transition (authz + transition guards in
// dispatch); `SystemTransition` = a transition that is the CONSEQUENCE of an already-authorized
// action (ladder-complete advance, Komite decision, conditional accept, revision regress) and
// bypasses manual-transition guards; `DualSignOff` = the Stage 2→3 advance once RM's bureau-data
// handoff is in (Legal/Appraisal now gate MUAP→Risk instead).
export type WorkflowCommand =
  | { kind: 'Transition'; transition: TransitionConfig }
  | { kind: 'SystemTransition'; transition: TransitionConfig }
  | { kind: 'DualSignOff' }

export interface Decision {
  stage: Stage
  historyAction: string
  /** Send-back doc-reset policy: 2→1 clears only failed docs; 3→1 clears all LG verifications. */
  docReset: 'failed-only' | 'all' | 'none'
  /** Send-back to intake clears the Stage-2 handoffs + AML attestation (re-attest before re-advancing). */
  clearStage2Handoffs: boolean
  clearAmlAttestation: boolean
  /** Stage-3 entry effect (autofill + analysis draft). */
  runStage3Entry: boolean
}

export function decide(state: LoanApplication, command: WorkflowCommand): Decision {
  if (command.kind === 'DualSignOff') {
    // RM bureau-data handoff carries the application into Review Kelayakan.
    return {
      stage: 3,
      historyAction: 'Data biro & kolektibilitas lengkap — masuk Review Kelayakan',
      docReset: 'none',
      clearStage2Handoffs: false,
      clearAmlAttestation: false,
      runStage3Entry: true,
    }
  }
  const { transition } = command
  const prev = state.stage
  const target = transition.targetStage
  const backToIntake = target === 1 && prev > 1
  return {
    stage: target,
    historyAction:
      transition.action === 'Tolak & Kembalikan ke RM'
        ? 'Ditolak oleh Risk Analyst — dikembalikan ke RM untuk komunikasi ke nasabah'
        : transition.action,
    docReset: target === 1 ? (prev === 2 ? 'failed-only' : 'all') : 'none',
    clearStage2Handoffs: backToIntake,
    clearAmlAttestation: backToIntake,
    runStage3Entry: target === 3,
  }
}

// Effect step: apply a Decision to the aggregate. Closes every still-open prior-stage desk, opens
// the target-stage desks, appends the history entry, and runs the send-back resets / stage-3 entry
// the Decision dictates. Pure mutation (history append is via ctx). Single-sourced so the existing
// transition tests guard it. Reached only through dispatch() (the guarded write seam).
export function applyDecision(source: LoanApplication, decision: Decision, ctx: ActionCtx, reason?: string, owners?: StageOwner[]): void {
  const previousStage = source.stage
  const now = new Date()
  source.stage = decision.stage
  source.enteredStageAt = now
  source.assignments.forEach(assignment => {
    if (assignment.stage !== previousStage || assignment.submittedAt !== null) return
    // ADR-0007: LG's deliverables (Analisa Yuridis + Penilaian) do NOT gate the 2→3 advance —
    // they gate MUAP→Risk and may lag into Stage 3. Do not fabricate a "submitted" the LG never
    // did: the assignment stays open until both deliverables are recorded (see settleLgAssignment).
    if (assignment.role === 'LG' && previousStage === 2 && !legalAppraisalComplete(source)) return
    assignment.submittedAt = now
    assignment.status = 'submitted'
  })
  ;(owners ?? ownersForStage(decision.stage)).forEach(owner => {
    source.assignments.push({
      stage: decision.stage,
      role: owner.role,
      userId: owner.id,
      userName: owner.name,
      status: 'todo',
      assignedAt: now,
      submittedAt: null,
    })
  })
  ctx.addHistory(source, decision.historyAction, decision.stage, reason)
  // Apply the send-back resets the Decision dictates (the two policies are explained in decide()).
  if (decision.docReset === 'failed-only') {
    source.documents.forEach(doc => {
      if (doc.legalVerification === 'fail') {
        doc.status = 'missing'
        doc.legalVerification = null
        doc.legalVerificationReason = null
      }
    })
  } else if (decision.docReset === 'all') {
    source.documents.forEach(doc => {
      doc.legalVerification = null
      doc.legalVerificationReason = null
    })
  }
  if (decision.clearStage2Handoffs) {
    source.stage2LegalApproval = null
    source.stage2SlikApproval = null
  }
  if (decision.clearAmlAttestation) source.amlAttestation = null // re-attest before re-advancing (OJK APU-PPT)
  if (decision.runStage3Entry) applyStage3Entry(source)
}

// ── Action-Band descriptor model ────────────────────────────────────────────
// Pure (role + stage) → "what is this person's job and next action" model.
// This encodes the exact isRole/stage matrix that lived in OverviewTab's
// "Aksi Tahap" card (the disabled conditions are preserved verbatim); only the
// blocker *messages* are made more explicit. The ActionBand renders this.

export type ActionVariant = 'default' | 'destructive' | 'outline'

export interface ActionDescriptor {
  label: string
  // A transition opens the confirmation modal; an href navigates (CM komite).
  transition?: TransitionConfig
  href?: string
  // A named server action the band invokes directly — Tugas Anda owns the action while the
  // tab keeps the prerequisite work; `workView` is that tab (band shows a "Buka …" link to it).
  action?: 'complete-legal' | 'bureau-handoff'
  workView?: DetailView
  variant: ActionVariant
  disabled: boolean
  blockerMessages: string[]
  // Short, category-level readiness line shown by the band when this primary is disabled
  // (e.g. "Belum lengkap: berkas wajib · atestasi AML"). The full detail stays in the tabs;
  // blockerMessages remains the canonical reason + server-parity message.
  blockerSummary?: string
}

// An inline form the band renders for the owner (uses hook state).
export type StageFormKind = 'risk-recommendation'

export interface StageActionModel {
  // true = the current role has work to do at this stage (band is a workspace);
  // false = read-only observer (band shows a status line).
  isOwner: boolean
  taskTitle: string
  /** Optional one-line context under the task title (e.g. committee meeting date/room). */
  subtitle?: string
  primary?: ActionDescriptor
  // The optional RETURN counterpart of the primary — the band's only non-forward button
  // ("Kembalikan…"/"Tolak…"); the inverse half of the same forward/back decision. At most one;
  // absent when there is nowhere to send back. See docs/guides/detail-page.md (Tugas Anda grammar).
  returnAction?: ActionDescriptor
  form?: StageFormKind
  statusLine: string
}

const RETURN_TO_RM: TransitionConfig = { action: 'Kembalikan ke RM', targetStage: 1, requireReason: true }
const RETURN_TO_ANALYST: TransitionConfig = { action: 'Kembalikan ke Analis', targetStage: 3, requireReason: true }

// When a document signature ladder COMPLETES it IS the advance gate — this replaces the old
// manual LA "Kirim ke Risk Review" (3→4) and RT "Kirim ke Komite" (4→5) transitions: a FINAL
// MUAP carries the application into Risk Review; a FINAL RSK into the Komite queue. `from` guards
// against advancing from an unexpected stage. The approval action applies this on the last approve.
// CARDINAL CONSTRAINT (N1): 'sp3' is DELIBERATELY EXCLUDED — the SP3 Legal-review chain completing
// is a DISBURSEMENT prerequisite (see sp3FinalReady), NOT a stage gate. Adding 'sp3' here would mint
// a second stage-advance path (a known anti-pattern, cf. the removed manual 4→5). The `Exclude` keeps
// the type honest: there is no advance row for sp3, and the compiler forbids adding one by accident.
export const CHAIN_COMPLETE_ADVANCE: Record<Exclude<ApprovalChain, 'sp3'>, { from: Stage; config: TransitionConfig }> = {
  muap: { from: 3, config: { action: 'MUAP final (rantai persetujuan lengkap) — masuk Risk Review', targetStage: 4, requireReason: false } },
  rsk: { from: 4, config: { action: 'RSK final (rantai persetujuan lengkap) — masuk antrean Komite', targetStage: 5, requireReason: false } },
}

// Disbursement (Stage 6) is open for a straight Approve OR a Conditional approval the
// nasabah ACCEPTED — in the conditional case the decision stays 'conditional' for audit
// while conditionalResponse drives the branch. Shared by the action band, the disbursement
// server actions, and the Pencairan tab so all three agree on "who reaches Pencairan".
export function disbursementOpen(app: Pick<LoanApplication, 'komiteDecision' | 'conditionalResponse'>): boolean {
  return app.komiteDecision === 'approve' || (app.komiteDecision === 'conditional' && app.conditionalResponse === 'accepted')
}

// N1 dual-prerequisite (docs/designs/rm-led-pipeline-redesign.md §4): SP3-FINAL is gated by BOTH
// (1) the MoM signed by all attending Komite AND (2) the SP3 Legal-review approved — two INDEPENDENT
// prerequisites. (1) is IMPLIED by the deal being disburse-open: it only reaches Stage 6 / disburse
// via the existing MoM-final routing (ADR-0005 §4, signMomAction → routeOnKomiteDecision), which is
// UNTOUCHED here. So the live gate reduces to "disburse-open (MoM done) AND the SP3 single-reviewer
// Legal chain is complete". Pure → unit-tested. Enforced at advanceDisbursementAction (the release
// toward 'Cair'); SP3 completion itself NEVER advances the stage (sp3 ∉ CHAIN_COMPLETE_ADVANCE).
export function sp3FinalReady(
  app: Pick<LoanApplication, 'komiteDecision' | 'conditionalResponse'>,
  sp3Steps: readonly ApprovalStepEntry[],
): boolean {
  return disbursementOpen(app) && isChainComplete('sp3', sp3Steps)
}

// Short, category-level readiness line for a disabled primary — the band shows THIS, not the full
// per-doc/field blocker list (detail lives in the relevant tab). Returns undefined when clear.
function summarizeBlockers(parts: (string | null | false | undefined)[]): string | undefined {
  const items = parts.filter((p): p is string => typeof p === 'string')
  return items.length ? `Belum lengkap: ${items.join(' · ')}` : undefined
}

export function stageActions(app: LoanApplication, role: Role): StageActionModel {
  const stage = app.stage
  const owner = activeOwnerNames(app)
  const observer = (statusLine: string): StageActionModel => ({ isOwner: false, taskTitle: '', statusLine })

  // Post-decision routing. Approve (or accepted-conditional) → disbursement at Stage 6.
  // Reject / awaiting-conditional → AO follow-up (Stage 1). Closed → terminal, no task.
  if (app.komiteDecision) {
    // Terminal: the application ended without disbursement (reject notified, or the
    // nasabah declined a conditional approval). No further action for anyone.
    if (app.applicationStatus === 'closed') {
      return observer('Pengajuan ditutup — tidak ada tindak lanjut lebih lanjut.')
    }
    if (disbursementOpen(app)) {
      if (role === 'RM' && stage === 6) {
        // Done: dana sudah cair — no task, the band hides for this actor.
        if (app.disbursementStatus === 'Cair') return observer('Pencairan selesai — dana telah dicairkan.')
        return {
          isOwner: true,
          taskTitle: 'Disetujui Komite — proses pencairan fasilitas',
          primary: { label: 'Buka Pencairan', href: `/applications/${app.id}?view=pencairan`, variant: 'default', disabled: false, blockerMessages: [] },
          statusLine: '',
        }
      }
      return observer(`Disetujui Komite — proses pencairan oleh ${owner}.`)
    }
    // reject / awaiting-conditional → AO handles nasabah communication (tab Pencairan).
    if (role === 'RM') {
      return {
        isOwner: true,
        taskTitle: app.komiteDecision === 'conditional'
          ? 'Keputusan bersyarat — catat respons nasabah (setuju / tolak)'
          : 'Ditolak Komite — komunikasikan keputusan & tutup pengajuan',
        primary: { label: 'Buka Tindak Lanjut', href: `/applications/${app.id}?view=pencairan`, variant: app.komiteDecision === 'reject' ? 'destructive' : 'default', disabled: false, blockerMessages: [] },
        statusLine: '',
      }
    }
    return observer(`Keputusan komite: ${decisionLabel[app.komiteDecision]} — ditindaklanjuti AO ke nasabah.`)
  }

  if (role === 'RM' && stage === 1) {
    // RM-led redesign (ADR-0020 §2): the intra-Inisiasi 1→2 advance is FREE — the four intake hard
    // gates (docs · intake OCR · NIK-mismatch · AML) relocated to the MUAP→Risk submit
    // (muapToRiskBlockers / makerSubmitGateError('muap')). So this primary is never disabled by them;
    // the blocker MESSAGES now surface at the Stage-3 MUAP action, not here.
    return {
      isOwner: true,
      taskTitle: 'Kirim ke Legal, Agunan & Biro',
      primary: {
        label: 'Kirim ke Legal, Agunan & Biro',
        transition: { action: 'Kirim ke Legal, Agunan & Biro', targetStage: 2, requireReason: false },
        variant: 'default',
        disabled: false,
        blockerMessages: [],
      },
      statusLine: '',
    }
  }

  // Analisa Yuridis is a REAL atomic action (complete-legal runs the server action directly), so it
  // belongs in Tugas Anda. Window is stage 2–3 (matches canWorkDeskNow('legal')) so the action
  // PERSISTS after the RM-driven 2→3 advance instead of vanishing at Stage 2 — an owed deliverable
  // must not go off-radar just because the deal moved to MUAP. (Penilaian Agunan is NOT here: it
  // needs a path choice = a form, so it is a NAVIGATION → it lives in Alur kerja / CoordinationPanel,
  // not as a fake-action in the band. See the Tugas-Anda-vs-Alur-kerja separation in AGENTS.md.)
  if (role === 'LG' && stage >= 2 && stage <= 3) {
    const done = !!app.stage2LegalApproval?.verifiedByLG
    const pending = legalUnverified(app).length
    return {
      isOwner: true,
      taskTitle: done ? 'Analisa Yuridis selesai' : 'Verifikasi dokumen di Dokumen, lalu selesaikan Analisa Yuridis',
      primary: done
        ? undefined
        : {
            label: 'Selesaikan Analisa Yuridis',
            action: 'complete-legal',
            workView: 'documents',
            variant: 'default',
            disabled: pending > 0,
            blockerMessages: pending ? [`${pending} dokumen belum diverifikasi`] : [],
            blockerSummary: summarizeBlockers([pending ? 'verifikasi dokumen' : null]),
          },
      returnAction: { label: 'Kembalikan ke RM', transition: RETURN_TO_RM, variant: 'outline', disabled: false, blockerMessages: [] },
      statusLine: '',
    }
  }

  if (role === 'RM' && stage === 2) {
    const done = !!app.stage2SlikApproval?.verifiedByRT
    // SLIK/Kol is RM-owned (D1) — the RM is the originator, so there is no "decline to RM":
    // the Stage-2 bureau handoff is forward-only (no return pair). Kol entry is data work on
    // the Data tab; this primary is the auditable handoff that advances 2→3.
    const bureau = [
      !slikUploaded(app) ? 'Unggah Laporan SLIK' : null,
      !app.kolEntered ? 'Konfirmasi Kolektibilitas' : null,
      ocrBlockers(app, 'slik').length ? 'Konfirmasi OCR SLIK' : null,
    ]
    const messages = bureau.filter((m): m is string => m !== null)
    return {
      isOwner: true,
      taskTitle: done ? 'SLIK sudah dikirim — menunggu Legal' : 'Input SLIK/Kolektibilitas di Data, lalu kirim ke Feasibility',
      primary: done
        ? undefined
        : {
            label: 'Kirim ke Feasibility',
            action: 'bureau-handoff',
            workView: 'data',
            variant: 'default',
            disabled: messages.length > 0,
            blockerMessages: messages,
            blockerSummary: summarizeBlockers(bureau),
          },
      statusLine: '',
    }
  }

  if (role === 'RM' && stage === 3) {
    const ocrB = ocrBlockers(app, 'muap-author')
    const messages: string[] = []
    if (!analysisComplete(app)) messages.push('Analisa 5C+1S belum lengkap.')
    if (!app.financialsAssessed) messages.push('Input keuangan belum disimpan.')
    if (ocrB.length) messages.push(`Nilai OCR belum dikonfirmasi: ${ocrB.join(', ')}`)
    if (!isChainComplete('muap', app.approvalSteps ?? []))
      messages.push('Rantai persetujuan MUAP (TL → BM) belum lengkap — ajukan & selesaikan di tab MUAP.')
    const summary = summarizeBlockers([
      !analysisComplete(app) ? 'analisa 5C+1S' : null,
      !app.financialsAssessed ? 'input keuangan' : null,
      ocrB.length ? 'konfirmasi OCR' : null,
      !isChainComplete('muap', app.approvalSteps ?? []) ? 'rantai MUAP' : null,
    ])
    return {
      isOwner: true,
      taskTitle: 'Lengkapi analisa 5C+1S, lalu kirim ke Risk Review',
      primary: {
        label: 'Kirim ke Risk Review',
        transition: { action: 'Kirim ke Risk Review', targetStage: 4, requireReason: false },
        variant: 'default',
        disabled: !analysisComplete(app) || ocrB.length > 0 || !app.financialsAssessed || !isChainComplete('muap', app.approvalSteps ?? []),
        blockerMessages: messages,
        blockerSummary: summary,
      },
      returnAction: { label: 'Kembalikan ke RM', transition: RETURN_TO_RM, variant: 'outline', disabled: false, blockerMessages: [] },
      statusLine: '',
    }
  }

  if (role === 'RA' && stage === 4) {
    const rec = app.riskRecommendation
    const returnToAnalyst: ActionDescriptor = { label: 'Kembalikan ke Analis', transition: RETURN_TO_ANALYST, variant: 'outline', disabled: false, blockerMessages: [] }
    if (rec === null) {
      return { isOwner: true, taskTitle: 'Tinjau risiko & beri rekomendasi', form: 'risk-recommendation', returnAction: returnToAnalyst, statusLine: '' }
    }
    if (rec === 'reject') {
      return {
        isOwner: true,
        taskTitle: 'Rekomendasi: Reject — kembalikan ke RM',
        primary: { label: 'Tolak & Kembalikan ke RM', transition: { action: 'Tolak & Kembalikan ke RM', targetStage: 1, requireReason: false }, variant: 'destructive', disabled: false, blockerMessages: [] },
        returnAction: returnToAnalyst,
        statusLine: '',
      }
    }
    // approve OR conditional → the recommendation is recorded; the deal now advances to the
    // committee ONLY by completing the RSK signature ladder (RA→RTL — the Risk Team Leader
    // signature freezes the RSK), which auto-advances 4→5 in actOnChain. The old manual "Kirim ke
    // Komite" transition is REMOVED (#13: it was a SECOND 4→5 path with a different gate — a signer
    // could carry the deal forward without a recommendation). The band is now a directive into the RSK tab where the ladder is
    // signed; the RSK-request maker-gate (riskRecommendation != null) backstops it server-side.
    const rskFinal = isChainComplete('rsk', app.approvalSteps ?? [])
    return {
      isOwner: true,
      taskTitle: rec === 'conditional'
        ? 'Rekomendasi: Conditional — lengkapi tanda tangan RSK untuk maju ke Komite'
        : 'Rekomendasi: Approve — lengkapi tanda tangan RSK untuk maju ke Komite',
      primary: {
        label: 'Buka RSK',
        href: `/applications/${app.id}?view=rsk`,
        variant: 'default',
        disabled: false,
        blockerMessages: [],
      },
      returnAction: returnToAnalyst,
      statusLine: rskFinal
        ? 'Ladder RSK lengkap — aplikasi otomatis maju ke Komite.'
        : 'Tanda tangan RSK (RA → RTL) belum lengkap — selesaikan di tab RSK.',
    }
  }

  if (role === 'CM' && stage === 5) {
    // An app only has a committee once it sits on a meeting agenda. Until then,
    // route the chair/members to schedule it rather than into an empty Ruang Komite.
    if (!app.scheduledMeeting) {
      return {
        isOwner: true,
        taskTitle: 'Aplikasi belum dijadwalkan ke sidang komite',
        primary: { label: 'Jadwalkan di Rapat Komite', href: '/komite', variant: 'default', disabled: false, blockerMessages: [] },
        statusLine: '',
      }
    }
    // Merge the old "Dijadwalkan ke sidang komite" seam card in here: the meeting
    // date/room becomes this task's subtitle (one card, not two).
    const m = app.scheduledMeeting
    const meetingLine = `${formatMeetingDate(m.date)} ${m.time} · ${meetingVenueLabel(m)}`
    return {
      isOwner: true,
      taskTitle: 'Putuskan & tanda tangani MoM di Ruang Komite',
      subtitle: meetingLine,
      primary: { label: 'Buka Ruang Komite', href: `/applications/${app.id}/komite`, variant: 'default', disabled: false, blockerMessages: [] },
      statusLine: '',
    }
  }

  // Non-committee roles watching an app at the committee stage: reflect whether
  // it is still waiting to be scheduled or already on a session agenda.
  if (stage === 5) {
    const meeting = app.scheduledMeeting
    return observer(meeting
      ? `Dijadwalkan ${formatMeetingDate(meeting.date)} ${meeting.time} — menunggu keputusan komite.`
      : 'Menunggu dijadwalkan ke sidang komite.')
  }

  return observer(`Tahap ${stage}: ${STAGE_NAMES[stage]} — dikerjakan oleh ${owner}.`)
}
