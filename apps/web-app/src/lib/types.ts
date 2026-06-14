import type { RiskPolicy } from '@/lib/hardGates'
import type { ApprovalAction, ApprovalChain, ApprovalRole } from '@/lib/approval-chain'

// Role types
export type Role = 'RM' | 'LG' | 'RA' | 'CM' | 'MG'
export type AkadType = 'Murabahah' | 'Musyarakah' | 'Ijarah' | 'Mudharabah'
export type Stage = 1 | 2 | 3 | 4 | 5 | 6

export const STAGE_NAMES: Record<Stage, string> = {
  1: 'Pengajuan Dokumen',
  2: 'Legal, Agunan & Biro',
  3: 'Feasibility / MUAP (5C+1S)',
  4: 'Risk Review',
  5: 'Committee Decision',
  6: 'Pencairan',
}

// 4-phase view of the RM-led target model (design: docs/designs/workflow-target.md). The engine keeps
// the 6 working stages; this is a DERIVED presentation grouping (no engine renumber — that's a
// deferred cosmetic remodel). Origination spans intake→legal/agunan/biro→feasibility/MUAP.
export type Phase = 1 | 2 | 3 | 4
export const PHASE_NAMES: Record<Phase, string> = {
  1: 'Inisiasi',
  2: 'Analisis Risiko',
  3: 'Komite',
  4: 'Pencairan',
}
const PHASE_OF_STAGE: Record<Stage, Phase> = { 1: 1, 2: 1, 3: 1, 4: 2, 5: 3, 6: 4 }
export const phaseOf = (stage: Stage): Phase => PHASE_OF_STAGE[stage]
/** "Fase 1 · Inisiasi" — the derived phase label for a stage. */
export const phaseLabel = (stage: Stage): string => `Fase ${phaseOf(stage)} · ${PHASE_NAMES[phaseOf(stage)]}`

// SLA day-targets per stage: single source is `sla-utils.ts` (the SLA logic + the
// versioned-config fallback seed). This stale duplicate was unused — removed in Phase A.

// Disbursement (Stage 6) sub-status — the post-approval release pipeline.
export type DisbursementStatus = 'Verifikasi Final' | 'Proses Akad' | 'Siap Cair' | 'Cair'

// Terminal closure. An application is 'active' until a terminal event ends it without
// disbursement; 'closed' is terminal (no further workflow action).
export type ApplicationStatus = 'active' | 'closed'
// Why an application was closed: committee rejected (AO notified the nasabah), a committee
// CONDITIONAL approval the nasabah declined, or the RM withdrew it pre-disbursement (nasabah
// backed out / bank declined to proceed during pre-Komite or post-decision-pre-akad).
export type CloseReason = 'committee-reject' | 'nasabah-decline' | 'withdrawn'
// Named workflow position (ADR-0004 §3). The step model is aligned 1:1 to the 6 stages today; the
// snapshot is the persisted read-model (computed by deriveWorkflowSnapshot in lib/workflow.ts).
// Defined HERE (the pure type module) so LoanApplication can carry it without a types↔workflow cycle.
export type WorkflowStep = 'intake' | 'legal-slik' | 'feasibility' | 'risk' | 'komite' | 'pencairan'
export type WorkflowStatus = 'active' | 'closed'
export interface WorkflowSnapshot {
  phase: Phase
  step: WorkflowStep
  status: WorkflowStatus
  closeReason: CloseReason | null
}
// Nasabah response to a committee CONDITIONAL approval.
export type ConditionalResponse = 'accepted' | 'declined'

// A per-application working copy of a document template (MUAP / RSK). Seeded
// from a default template on first open, then edited per-application.
export interface TemplateSection {
  id: string
  title: string
  body: string
}
export interface TemplateDoc {
  sections: TemplateSection[]
}

export type SLAStatus = 'normal' | 'at_risk' | 'overdue' | 'done'
export type PersonalStatus = 'todo' | 'in_progress' | 'submitted'
export type DocumentStatus = 'missing' | 'uploaded'
// Drives the conditional income document required of an individual nasabah.
export type IncomeSource = 'karyawan' | 'wiraswasta'
// Drives the conditional collateral document layer. 'guarantor' = jaminan
// perorangan, a personal guarantee with no physical collateral.
export type CollateralType = 'none' | 'fixed_asset' | 'vehicle' | 'guarantor'
// Financing purpose dimension (SOP slide-5 doc-checklist). Drives purpose-conditioned docs
// (RAB / Kontrak-SPK-PO / bouwheer). Optional at intake: undefined = no purpose-conditioned docs
// (today's behavior). Exact category set + intake capture are W1 — keep as NoEffort default.
export type FinancingPurpose = 'modal_kerja' | 'investasi' | 'pembangunan' | 'konsumtif'
export type RiskRecommendation = 'approve' | 'conditional' | 'reject' | null
export type KomiteVoteValue = 'approve' | 'conditional' | 'reject'
// 'proposed' / 'cancelled' added with the auto-materializer (workflow-finetune.md §8).
// Manual scheduleMeetingAction still creates 'upcoming' directly; the daily materializer
// creates 'proposed' rows that a human confirms (→ 'upcoming') or cancels (→ 'cancelled').
export type MeetingStatus = 'upcoming' | 'completed' | 'proposed' | 'cancelled'
export type HardGateViolation = 'dsr' | 'ltv' | 'kol'
export type ExtractionSource =
  | 'human_entered'
  | 'ocr_suggested'
  | 'ocr_confirmed'
  | 'ocr_overridden'

/// A cross-check conflict (Batch 6): OCR re-read a value for a field that ALREADY holds a blessed
/// (human/confirmed/overridden) value, and the two DIFFER. Recorded — never auto-overwritten — for a
/// human to resolve (keep the Mizan value, or accept the OCR reading). Values are stringified for a
/// uniform, audit-stable JSON shape; the owner desk resolves it. OCR stays a human-confirmed suggestion.
export interface ExtractionMismatch {
  /** The blessed Mizan value at detection (stringified). */
  existingValue: string
  /** The differing value OCR read from the uploaded document (stringified). */
  ocrValue: string
  /** The existing field's provenance when the conflict was detected. */
  provenance: ExtractionSource
  /** The uploaded document type that produced the OCR value. */
  docType: string
  /** ISO timestamp of detection. */
  detectedAt: string
}

/// An ADVISORY extraction (RM-led OCR-widening — design §3). An informational figure/value read
/// from a document that NEVER gates anything: it is NOT a hard-gate input, NEVER enters
/// stage1To2Blockers/ocrBlockers/docBlockers, NEVER writes into hardGates/financialInputs, NEVER
/// flips a status. NIK stays the sole 1→2 blocker. Keyed by an advisory KEY (e.g. 'omzet') in
/// LoanApplication.advisoryExtractions — distinct from extractionMismatches (gating cross-check)
/// which it mirrors as a JSON store. The optional crossCheck records a SPT-vs-LapKeu / Akta-vs-
/// Customer / identity-vs-customer-master comparison as an advisory annotation (never a blocker).
/// PII: a crossCheck.note about identity must NOT embed a raw NIK/identity number.
export interface AdvisoryExtraction {
  value: string | number
  label: string
  docType: string
  detectedAt: string // ISO timestamp
  crossCheck?: { against: string; status: 'match' | 'mismatch'; note?: string }
}

export interface User {
  id: string
  name: string
  role: Role
  avatarInitials: string
  title: string
  tagline: string
}

export interface HistoryEntry {
  id: string
  timestamp: Date  // ISO
  userId: string
  userName: string
  action: string
  stage: Stage
  reason?: string
}

export interface ApplicationDocument {
  id: string
  name: string
  docType: string
  status: DocumentStatus
  // true = part of the Stage 1 required-docs spec (gates advancement);
  // false = supporting/volunteered document.
  required: boolean
  uploadedAt?: Date
  uploadedBy?: string
  fileName?: string
  legalVerification?: 'pass' | 'fail' | null
  /** Human reason required when Legal marks the document as fail; cleared on pass/reupload. */
  legalVerificationReason?: string | null
  // Real object-storage facts (Tier 0.1); present once bytes are stored.
  storageKey?: string
  sha256?: string
  sizeBytes?: number
  contentType?: string
  // Full-document OCR text (Slice 2); present once extracted. PII-bearing — feeds
  // MUAP/RSK narrative grounding, masked before egress.
  extractedText?: string
  extractedAt?: Date
}

export interface FiveCSAnalysis {
  character: string
  capacity: string
  capital: string
  condition: string
  collateral: string
  syariah: string
  generated: boolean
  // Quantified 5C+1S scores (0–100 per aspect). Optional: seed apps generated
  // before scoring shipped fall back to a computed score at render time.
  scores?: Partial<
    Record<'character' | 'capacity' | 'capital' | 'condition' | 'collateral' | 'syariah', number>
  >
}

export interface KomiteVote {
  userId: string
  userName: string
  vote: KomiteVoteValue
  comment?: string
  timestamp: Date
  // true when the Ketua voted before all non-Ketua members had submitted.
  isEarlyVote?: boolean
}

// A scheduled committee session (Rapat Komite). Groups Stage-5 applications
// into an agenda and carries the per-meeting voting composition: attendees are
// drawn from the CM roster and one is designated chair (Ketua) for THIS
// meeting. Quorum and the chair's voting order are derived from these — there
// is no fixed committee. In-memory store; resets on hard refresh.
export interface KomiteMeeting {
  id: string                 // 'MTG-2026-001'
  date: string               // ISO date 'YYYY-MM-DD'
  time: string               // 'HH:mm'
  room?: string              // physical room — for tatap-muka / hybrid; omitted for online-only
  meetingUrl?: string        // join link — for daring / hybrid; omitted for onsite-only
  // Modality is implicit: room only = tatap muka · url only = daring · both = hybrid.
  // At least one of room/meetingUrl is always present.
  agendaAppIds: string[]     // LoanApplication.id[], expected to be Stage 5
  /** Per-application routing rationale for proposed/auto-assigned agenda items. */
  agendaReasons?: Record<string, string>
  attendeeUserIds: string[]  // chosen per meeting from the CM roster
  chairUserId: string        // Ketua for this meeting; MUST be in attendeeUserIds
  notes?: string
  // Minutes-of-meeting (MOM / notulen). Due ≤ H+1 business day after the meeting completes (SOP).
  // Absent = not yet recorded → the MOM SLA (meetingMomSlaState) and notifications surface it.
  minutes?: string
  minutesRecordedAt?: Date
  minutesRecordedBy?: string
  status: MeetingStatus
  createdBy: string
  createdAt: Date
  // Auto-materialization metadata (workflow-finetune.md §8). Set ONLY for rows the daily
  // materializer wrote; manual scheduleMeetingAction leaves these undefined. The uniqueness
  // (sourceTemplateId, scheduledDate) on the DB column makes the materializer idempotent.
  sourceTemplateId?: string
  scheduledDate?: Date
  slotCapacity?: number
}

export interface HardGates {
  dsr: number   // percentage value e.g. 42 means 42%
  ltv: number   // percentage value e.g. 68 means 68%
  kol: number   // 1-5 kolektibilitas score
}

// Append-only ownership log. One record per (user, stage) desk-holding.
// submittedAt is set when that desk hands the application onward; an app
// re-handled by the same user accumulates multiple records.
export interface StageAssignment {
  stage: Stage
  role: Role
  userId: string
  userName: string
  status: PersonalStatus
  assignedAt: Date
  submittedAt: Date | null
}

/**
 * Stage-1 Initial-AML attestation (OJK APU-PPT segregation of duties). The RM (intake
 * desk) affirms that the EXTERNAL DTTOT/PEP/negative-list check (performed by
 * CS/Compliance, NOT by MIZAN) was done and PASSED. The authoritative OJK record is the
 * paired HistoryEntry; this column carries the structured affirmation for the gate + UI.
 * `attestedAt` is an ISO string (timestamps embedded in JSON columns are stored/read as
 * ISO, mirroring aiRiskAdvisory.generatedAt / exploredSources[].retrievedAt). Cleared on a
 * Stage 2→1 / 3→1 send-back so the RM must re-attest before re-advancing.
 */
export interface AmlAttestation {
  attestedBy: string // actor.userId
  attestedByName: string // auditUserName(actor) — handles superadmin impersonation
  attestedAt: string // ISO timestamp
  statement: string // AML_ATTESTATION_STATEMENT at attestation time
  // ── P3-D structured AML upgrade (design §4) — all OPTIONAL + back-compat. The attestation REMAINS a
  // completion (amlAttested = !!attestation); these fields enrich the structured record the Risk/Komite
  // desks weigh. A 'hit-cleared' result is a SIGNAL, never an auto-blocker (completion gates; the verdict
  // doesn't). PII: screenedParties carry NAMES only (peran/role), never a NIK/identity number.
  result?: 'clear' | 'hit-cleared' // 'clear' = no DTTOT/PEP/negative-list hit; 'hit-cleared' = a hit was found and resolved externally
  catatan?: string // free-text note on the screening result (e.g. how a hit was cleared)
  screenedParties?: { nama: string; peran?: string }[] // the parties the external check covered (names only — no NIK)
  evidenceDocId?: string // ApplicationDocument.id of the uploaded external screening evidence, when attached
}

/**
 * AI bureau-bundle summary (SLIK + Pefindo + Rek Koran), advisory only. Generated through the
 * masked-egress + audited inference seam (server/ai/bureau.ts) for the RM's Stage-2/3 review.
 * NEVER authoritative: Kol and all gating values stay human-confirmed + deterministic. Stored as
 * a JSON column; `generatedAt` is an ISO string (JSON-column timestamp convention).
 */
export interface BureauSummary {
  summary: string
  model: string // inference model id (audit/logging, never PII)
  generatedAt: string // ISO timestamp
  generatedByName: string // auditUserName(actor)
}

// A persisted maker-checker ladder row (ApprovalStep). Superset of the reducer's
// ApprovalStepEntry — the extra fields are audit + the QR signature anchor.
export interface ApprovalStepRecord {
  chain: ApprovalChain | 'mom'
  role: ApprovalRole | 'komite-signer'
  action: ApprovalAction
  userId: string
  userName: string
  reason: string | null
  qrToken: string | null
  createdAt: Date
}

/// Appraisal (agunan valuation) method recorded by the Stage-2 Appraisal desk (LG role):
/// 'internal' (in-house, ~2 HK) · 'kjpp_short' (KJPP short report, ~3 HK) · 'kjpp_long' (KJPP long
/// report, ~7–14 HK). Mizan only RECORDS the path used (the internal-vs-KJPP choice follows Hijra
/// rules outside Mizan); it does NOT gate the 2→3 advance (workflow-target.md: appraisal = tracked,
/// not gating). The appraised VALUE stays financialInputs.collateralAppraisedValue.
export type AppraisalPath = 'internal' | 'kjpp_short' | 'kjpp_long'

/// P3-D structured Penilaian (design §4): the STRUCTURED appraisal deliverable recorded by the Stage-2
/// Appraisal desk (LG). Supersedes the bare `appraisalPath` scalar as the rich record while the scalar
/// is KEPT for the gate (legalAppraisalComplete) + back-compat. `nilaiPasar`/`nilaiLikuidasi` are the
/// appraiser's advisory market/liquidation figures — they cross-check against the P2 OCR advisory
/// (lib/ocr-crosscheck.ts crossCheckAppraisalVsAdvisory) but DO NOT auto-write the LTV input
/// (financialInputs.collateralAppraisedValue stays human-entered in the Financials form). `tanggalLaporan`
/// is an ISO date string (JSON-column timestamp convention). `reportDocId` links the uploaded report doc.
export interface AppraisalRecord {
  path: AppraisalPath
  nilaiPasar?: number // appraiser's market value (advisory; NOT the LTV input)
  nilaiLikuidasi?: number // appraiser's liquidation value (advisory)
  penilai?: string // appraiser name / KJPP firm
  tanggalLaporan?: string // ISO date string of the appraisal report
  reportDocId?: string // ApplicationDocument.id of the uploaded appraisal report, when attached
}

export interface LoanApplication {
  id: string
  // Optimistic-concurrency token. Set when loaded from the DB; `saveApplication`
  // bumps it only if it is unchanged (else a concurrent-edit conflict is thrown).
  // Optional: in-memory/seed-constructed aggregates omit it (treated as 0).
  version?: number
  nasabahName: string
  nasabahType: 'individual' | 'business'
  nik?: string
  phoneNumber: string
  whatsappNumber?: string // optional; defaults to phoneNumber via UI
  namaUsaha?: string // business only — legal entity name
  /** Legal-identity fields (OCR-suggested + human-confirmed) that fill MUAP IDENTITAS HUKUM slots. */
  npwp?: string // tax number (NPWP)
  nib?: string // Nomor Induk Berusaha (business only)
  alamat?: string // legal address (sesuai dokumen legalitas)
  bidangUsaha?: string // primary business sector — fills [Bidang Usaha Utama]
  /** Opportunistic OCR-extracted fields without a dedicated column yet (Data-tab display, human-confirmed). */
  extractionExtras?: Record<string, { value: string; sourceDocType: string }>
  akadType: AkadType
  requestedPlafond: number
  requestedTenorMonths: number
  approvedPlafond?: number
  approvedTenorMonths?: number
  approvedMarginRate?: number | null
  extractionSources?: Record<string, ExtractionSource>
  /** OCR cross-check conflicts awaiting human resolution, keyed by fieldPath (Batch 6). */
  extractionMismatches?: Record<string, ExtractionMismatch>
  /** ADVISORY OCR extractions (RM-led OCR-widening — design §3), keyed by advisory KEY (e.g. 'omzet').
   *  Informational + cross-check ONLY — never gates, never a blocker, never feeds a hard gate. NIK
   *  stays the sole 1→2 blocker. Mirrors extractionMismatches as a Json column. */
  advisoryExtractions?: Record<string, AdvisoryExtraction>
  purpose: string
  // Intake attributes that drive the conditional required-docs spec.
  // Optional: only set on applications created after the required-docs
  // mechanism shipped. buildRequiredDocuments() treats absent values as
  // the safe default (no condition matched).
  incomeSource?: IncomeSource
  isMarried?: boolean
  collateralType?: CollateralType
  stage: Stage
  /** Persisted WorkflowSnapshot read-model (ADR-0004 §3, Phase 3a): == deriveWorkflowSnapshot(app),
   *  written at the persistence seam. `stage` REMAINS the SSOT (the authority inversion is Phase 3b).
   *  Absent on pre-migration rows → serialize re-derives, so it is always present after a read. */
  workflowSnapshot?: WorkflowSnapshot | null
  assignments: StageAssignment[]
  enteredStageAt: Date
  /** SLA day-target for the current stage, resolved from versioned config at read time
   *  (server/config/sla.ts). Transient (not persisted) — absent → sla-utils uses the
   *  code constant. See configurability-and-admin.md Phase A. */
  slaTargetDays?: number
  /** Active risk-policy thresholds (DSR/LTV/Kol max), resolved from versioned config at read
   *  time (server/config/risk-policy.ts). Transient (not persisted) — absent → consumers fall
   *  back to DEFAULT_RISK_POLICY. RECOMPUTE-LIVE: a policy change applies to in-flight apps so
   *  every gate chip / gap-check / narrative reads the SAME active threshold (no drift). */
  riskPolicy?: RiskPolicy
  /** Active disbursement release-condition definition, resolved from versioned config at read
   *  time (server/config/disbursement.ts). Transient (not persisted) — absent → consumers fall
   *  back to DEFAULT_DISBURSEMENT_CONDITIONS. DISTINCT from disbursementConditions below, which
   *  is the per-application done map. */
  releaseConditions?: string[]
  createdAt: Date
  createdBy: string
  hardGates: HardGates
  /** DERIVED READ-CACHE of computeViolations(hardGates, active policy). Fast-read only (list/
   *  dashboard surfaces); never hand-set — auto-recomputed from hardGates in saveApplication/
   *  createApplication (server/repo/write.ts). Source of truth = hardGates + RiskPolicy. */
  hardGateViolations: HardGateViolation[]
  kolEntered: boolean
  financialsAssessed: boolean
  // Stage-2 support tracking. Data entry is NOT handoff: RM bureau-data needs an explicit
  // "Kirim SLIK/Kol ke Feasibility" click for 2→3. Legal's Analisa Yuridis is recorded here
  // as a tracked deliverable, but gates MUAP→Risk together with `appraisalPath`.
  // P3-D structured Analisa Yuridis (design §4): `verifiedByLG` REMAINS the completion flag the gate
  // (legalAppraisalComplete) reads — KEEP it. The structured `opinion` is the Legal verdict the
  // Risk/Komite desks weigh; it is a SIGNAL, NEVER an auto-blocker — even 'tidak-layak' COMPLETES the
  // deliverable (verifiedByLG=true). `catatan` are per-opinion bullet notes; `reportDocId` links the
  // uploaded Analisa Yuridis report. All three optional + back-compat.
  stage2LegalApproval:
    | {
        verifiedByLG: boolean
        notes?: string
        opinion?: 'layak' | 'layak-dengan-catatan' | 'tidak-layak'
        catatan?: string[]
        reportDocId?: string
      }
    | null
  stage2SlikApproval?: { verifiedByRT: boolean; notes?: string } | null
  // Stage-2 Appraisal desk (LG): which agunan valuation method was used (AppraisalPath). Recorded
  // for the audit trail; absent/null = not yet recorded. Gates MUAP→Risk, not the 2→3 advance.
  appraisalPath?: AppraisalPath | null
  // P3-D structured Penilaian (see AppraisalRecord). The RICH appraisal deliverable; absent/null = not yet
  // recorded. KEPT alongside `appraisalPath` (the scalar the gate + back-compat read): recordAppraisalAction
  // sets BOTH. `appraisalRecord.path` === `appraisalPath` is an invariant. Does NOT feed the LTV input.
  appraisalRecord?: AppraisalRecord | null
  // P3-D origin tag (design §4): 'original' (fresh intake) · 'review' (re-underwrite of an existing
  // facility) · 'adendum' (amendment). Absent/null is treated as 'original' everywhere. Inert in P3-D
  // (no review/adendum creation path exists yet — that lands in P5); it pre-wires the AML fresh-attest
  // hook (lib/aml.ts amlReattestRequired) so a review/adendum forces a fresh screening, while an
  // 'original' app's gate behaviour is byte-identical to before.
  originType?: 'original' | 'review' | 'adendum'
  // P5 (RM-led redesign §7 / Topic 7): self-reference forming the review/adendum LINEAGE. A review/
  // adendum app points at its direct parent (the prior cycle's app id); an 'original' app has none.
  // Walk to the ROOT for the "full story", the HEAD for "current terms" (server/repo/applications.ts
  // getLineage / lineageHead). Absent/null = a root (original) app.
  sourceApplicationId?: string | null
  // P5 (RM-led redesign §7 / Topic 7): the review CADENCE ANCHOR — the disbursement DATE, set once at
  // the 5→6 'Cair' transition. The next review is due addMonths(disbursedAt, cadence). A DATE, never a
  // payment signal (INVARIANT "Mizan records, never monitors"). Null until the facility disburses;
  // reviewDueState returns 'n/a' while null. See lib/review-cadence.ts.
  disbursedAt?: Date | null
  // P4-A (RM-led redesign §5 / Topic 5): app-scoped AI context (≈ AGENTS.md app-local). Holds ONLY
  // the SACRED HUMAN "Catatan" block (free-text, additive, attributed) for this deal — the AUTO
  // derived block is rendered LIVE at injection (lib/ai-context-cascade.ts buildAiContextLayers),
  // never stored. Absent/null = no human note yet. Mirrors Customer.contextMd (Nasabah-scoped track).
  contextMd?: string | null
  // P4-C (RM-led redesign / ADR-0019 §4 / Topic 6): the Mizan-OWNED Drive folder holding this app's
  // GENERATED docs (MUAP/RSK/MoM/SP3) — distinct from driveFolderId (the user's source-upload folder).
  // Nullable until the first generated doc is minted (created lazily by ensureMizanDocFolder). Raw column
  // round-trip; consumers/writers go through server/docs/mizan-drive.ts, not the aggregate, in practice.
  mizanDocFolderId?: string | null
  // Initial-AML attestation (see AmlAttestation). Optional + nullable, mirroring the sibling
  // stage2SlikApproval sign-off: absent/null = not attested. RM-led redesign (ADR-0020 §2): the
  // AML gate RELOCATED from the 1→2 advance to the MUAP→Risk submit — it now blocks via
  // lib/stage-action.ts `muapToRiskBlockers` / `makerSubmitGateError('muap')`. The gate and the
  // amlAttested() predicate treat absent and null identically.
  amlAttestation?: AmlAttestation | null
  // AI bureau-bundle summary (see BureauSummary). Advisory only; absent until generated.
  bureauSummary?: BureauSummary | null
  // V1-provisional profit-share model (pending Akad-types deep-dive): flat akad (Murabahah/Ijarah) uses proposedMonthlyInstallment, profit-share akad (Musyarakah/Mudharabah) uses projectedMonthlyProfitShare. DSR denominator = proposedMonthlyInstallment ?? projectedMonthlyProfitShare.
  financialInputs: {
    netMonthlyIncome: number
    existingMonthlyObligations: number
    collateralAppraisedValue: number
    proposedMonthlyInstallment: number | null
    projectedMonthlyProfitShare: number | null
    // Profit-share akad (Musyarakah/Mudharabah) only. The nisbah is the agreed
    // profit-sharing split; projectionBasis documents how the projected monthly
    // profit share was derived (the basis the DSR for these akad rests on).
    // Optional: absent on flat akad and on apps seeded before the akad deep-dive.
    nisbahBankPercent?: number | null
    nisbahCustomerPercent?: number | null
    projectionBasis?: string
  }
  marginRate: number | null
  documents: ApplicationDocument[]
  history: HistoryEntry[]
  analysis: FiveCSAnalysis
  riskRecommendation: RiskRecommendation
  riskNote?: string
  // ADVISORY ONLY (workflow-finetune.md §6). The AI's "Saran AI" risk hint — shown next to,
  // never inside, the authoritative riskRecommendation; never frozen into the RSK doc. RT
  // must still explicitly choose. Persisted so a reload doesn't re-call Gemini.
  aiRiskAdvisory?: {
    recommendation: 'approve' | 'conditional' | 'reject'
    rationale: string
    model: string
    generatedAt: string // ISO
  } | null
  // Grounded web-research artifact (workflow-finetune.md §7). Cited claims from authoritative
  // sources only; the citations[] are enforced at synthesis (hallucinated URLs dropped).
  exploredSources?: Array<{
    url: string
    title: string
    claim: string
    retrievedAt: string // ISO
  }> | null
  komiteVotes: KomiteVote[]
  komiteDecision?: KomiteVoteValue
  komiteDecisionNote?: string
  // Immutable audit freeze captured at the committee decision: a PDF export of
  // MUAP+RSK stored server-side. This ref carries the id + content hash (SHA-256)
  // for the audit trail; the PDFs are fetched from the checkpoint route. The frozen
  // risk policy (version + DSR/LTV/Kol thresholds in effect at decision time) is also
  // carried for the decision-audit UI — null = pre-Phase-C checkpoint / code default.
  decisionCheckpoint?: {
    id: string
    contentHash: string
    decidedAt: string
    riskPolicyVersion: number | null
    riskDsrMaxPct: number | null
    riskLtvMaxPct: number | null
    riskKolMax: number | null
  } | null
  // LA-drafted MUAP narrative (legacy free-text).
  muapNarrative?: string
  // Docs-as-source: the MUAP/RSK documents live in Google Docs (DocLinkage). These
  // mirror the last successful extraction sync onto the application aggregate so the
  // pipeline status can read "MUAP authored & synced" synchronously. In production
  // these are persisted columns on the application; here they are set when the
  // detail page observes/triggers an OK extraction. RSK pipeline status still keys
  // off riskRecommendation; rskSyncedAt is kept for symmetry + the audit freeze.
  muapSyncedAt?: Date | null
  rskSyncedAt?: Date | null
  // Stage 6 (Pencairan) disbursement sub-status. Set when an approved app
  // enters Stage 6; 'Cair' is terminal (disbursed → portfolio).
  disbursementStatus?: DisbursementStatus
  disbursementConditions?: Record<string, boolean>
  // Terminal closure. Defaults to 'active' (undefined is treated as 'active' by the repo);
  // 'closed' is terminal with a closeReason + closedAt. See ApplicationStatus / CloseReason.
  applicationStatus?: ApplicationStatus
  closeReason?: CloseReason | null
  closedAt?: Date | null
  // Nasabah response to a committee CONDITIONAL approval: 'accepted' → Pencairan (Stage 6,
  // decision stays 'conditional'); 'declined' → closed. null/undefined = awaiting response.
  conditionalResponse?: ConditionalResponse | null
  // Team discussion thread (DiscussionTab) — human + AI replies; unbounded record.
  // role · content, plus (discussion) the verified author and any @mentioned userIds (MentionUser).
  aiChatHistory: Array<{ role: 'user' | 'assistant'; content: string; authorId?: string | null; authorName?: string | null; mentions?: string[] }>
  // Dedicated AI risk-assistant Q&A (AIChatTab) — bounded to the last 10 turns; every
  // turn is PII-masked before the model and audited to AiInteraction. Optional only so
  // the seed fixtures need not list it; the repo serializer always provides [] from the DB.
  aiAssistantLog?: Array<{ role: 'user' | 'assistant'; content: string }>
  // Append-only maker-checker ladder ledger (ApprovalStep) for this application, in insertion
  // order. Drives chain state (lib/approval-chain.ts) on the document tabs + action band. Optional
  // only so seed fixtures need not list it; the repo serializer always provides [] from the DB.
  approvalSteps?: ApprovalStepRecord[]
  // The committee meeting whose agenda includes this app, if any. Resolved by the
  // repo (getApplication) so stage-5 surfaces (ActionBand, KomiteSeamCard) know the
  // scheduling/composition without re-reading a global store. Undefined on apps
  // loaded for list views (which don't need it).
  scheduledMeeting?: KomiteMeeting | null
}
