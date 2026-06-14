import { z } from 'zod'

export const ApplicationDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  docType: z.string(),
  status: z.enum(['missing', 'uploaded']),
  required: z.boolean(),
  uploadedAt: z.date().optional(),
  uploadedBy: z.string().optional(),
  fileName: z.string().optional(),
  legalVerification: z.enum(['pass', 'fail']).nullable().optional(),
  legalVerificationReason: z.string().nullable().optional(),
})

export const HistoryEntrySchema = z.object({
  id: z.string(),
  timestamp: z.date(),
  userId: z.string(),
  userName: z.string(),
  action: z.string(),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  reason: z.string().optional(),
})

export const FiveCSAnalysisSchema = z.object({
  character: z.string(),
  capacity: z.string(),
  capital: z.string(),
  condition: z.string(),
  collateral: z.string(),
  syariah: z.string(),
  generated: z.boolean(),
})

export const KomiteVoteSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  vote: z.enum(['approve', 'conditional', 'reject']),
  comment: z.string().optional(),
  timestamp: z.date(),
  isEarlyVote: z.boolean().optional(),
})

export const HardGatesSchema = z.object({
  dsr: z.number(),
  ltv: z.number(),
  kol: z.number(),
})

const StageAssignmentSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  role: z.enum(['AO', 'LA', 'LG', 'RT', 'CM', 'MG']),
  userId: z.string(),
  userName: z.string(),
  status: z.enum(['todo', 'in_progress', 'submitted']),
  assignedAt: z.date(),
  submittedAt: z.date().nullable(),
})
const FlatAkadSchema = z.enum(['Murabahah', 'Ijarah'])
const ProfitShareAkadSchema = z.enum(['Musyarakah', 'Mudharabah'])
const Stage1HardGatesSchema = z.object({ dsr: z.literal(0), ltv: z.literal(0), kol: z.literal(1) })
const Stage2HardGatesSchema = z.object({ dsr: z.literal(0), ltv: z.literal(0), kol: z.number().int().min(1).max(5) })
const KolDefaultHardGatesSchema = z.object({ dsr: z.literal(0), ltv: z.literal(0), kol: z.literal(1) })
const Stage2LegalPendingSchema = z.union([
  z.null(),
  z.object({ verifiedByLG: z.literal(false), notes: z.string().optional() }),
])
const Stage2LegalApprovalVerifiedSchema = z.object({ verifiedByLG: z.literal(true), notes: z.string().optional() })
const Stage2SlikPendingSchema = z.union([
  z.null(),
  z.object({ verifiedByRT: z.literal(false), notes: z.string().optional() }),
])
const Stage2SlikApprovalVerifiedSchema = z.object({ verifiedByRT: z.literal(true), notes: z.string().optional() })
const Stage2SlikAnySchema = z.union([Stage2SlikPendingSchema, Stage2SlikApprovalVerifiedSchema])
// Stage-1 Initial-AML attestation. attestedAt is an ISO string (JSON-column timestamp
// convention). Nullable + optional, mirroring the sibling stage2SlikApproval sign-off.
const AmlAttestationSchema = z.object({
  attestedBy: z.string(),
  attestedByName: z.string(),
  attestedAt: z.string(),
  statement: z.string(),
})
const FinancialInputsSchema = z.object({
  netMonthlyIncome: z.number(),
  existingMonthlyObligations: z.number(),
  collateralAppraisedValue: z.number(),
  proposedMonthlyInstallment: z.number().nullable(),
  projectedMonthlyProfitShare: z.number().nullable(),
  nisbahBankPercent: z.number().nullable().optional(),
  nisbahCustomerPercent: z.number().nullable().optional(),
  projectionBasis: z.string().optional(),
})
const ZeroFinancialInputsSchema = z.object({
  netMonthlyIncome: z.literal(0),
  existingMonthlyObligations: z.literal(0),
  collateralAppraisedValue: z.literal(0),
  proposedMonthlyInstallment: z.literal(0),
  projectedMonthlyProfitShare: z.literal(0),
})
const EmptyAnalysisSchema = z.object({
  character: z.literal(''),
  capacity: z.literal(''),
  capital: z.literal(''),
  condition: z.literal(''),
  collateral: z.literal(''),
  syariah: z.literal(''),
  generated: z.literal(false),
})
const GeneratedAnalysisSchema = FiveCSAnalysisSchema.extend({ generated: z.literal(true) })

export const BaseApplicationSchema = z.object({
  id: z.string(),
  nasabahName: z.string(),
  nasabahType: z.enum(['individual', 'business']),
  nik: z.string().min(1),
  phoneNumber: z.string(),
  whatsappNumber: z.string().optional(),
  extractionSources: z.record(z.string(), z.enum(['human_entered', 'ocr_suggested', 'ocr_confirmed', 'ocr_overridden'])).optional(),
  extractionMismatches: z.record(z.string(), z.object({
    existingValue: z.string(),
    ocrValue: z.string(),
    provenance: z.enum(['human_entered', 'ocr_suggested', 'ocr_confirmed', 'ocr_overridden']),
    docType: z.string(),
    detectedAt: z.string(),
  })).optional(),
  akadType: z.enum(['Murabahah', 'Musyarakah', 'Ijarah', 'Mudharabah']),
  requestedPlafond: z.number(),
  requestedTenorMonths: z.number(),
  purpose: z.string(),
  namaUsaha: z.string().optional(),
  incomeSource: z.enum(['karyawan', 'wiraswasta']).optional(),
  isMarried: z.boolean().optional(),
  collateralType: z.enum(['none', 'fixed_asset', 'vehicle', 'guarantor']).optional(),
  createdAt: z.date(),
  createdBy: z.string(),
  assignments: z.array(StageAssignmentSchema),
  enteredStageAt: z.date(),
  documents: z.array(ApplicationDocumentSchema),
  history: z.array(HistoryEntrySchema),
  aiChatHistory: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
  muapNarrative: z.string().optional(),
  amlAttestation: AmlAttestationSchema.nullable().optional(),
})

const Absent = z.undefined().optional()
const HardGateViolationSchema = z.array(z.enum(['dsr', 'ltv', 'kol']))

const riskNoteSchema = (riskRecommendation: 'approve' | 'conditional' | 'reject') =>
  riskRecommendation === 'approve' ? z.string().optional() : z.string().min(1)

const komiteDecisionNoteSchema = (komiteDecision: 'approve' | 'conditional' | 'reject') =>
  komiteDecision === 'approve' ? z.string().optional() : z.string().min(1)

const Stage1ApplicationSchema = BaseApplicationSchema.extend({
  nik: z.string().optional(),
  stage: z.literal(1),
  hardGates: Stage1HardGatesSchema,
  hardGateViolations: z.tuple([]),
  kolEntered: z.literal(false),
  financialsAssessed: z.literal(false),
  stage2LegalApproval: z.null(),
  stage2SlikApproval: z.null(),
  financialInputs: ZeroFinancialInputsSchema,
  marginRate: z.null(),
  analysis: EmptyAnalysisSchema,
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const Stage2AwaitingBothSchema = BaseApplicationSchema.extend({
  stage: z.literal(2),
  hardGates: KolDefaultHardGatesSchema,
  hardGateViolations: z.tuple([]),
  kolEntered: z.literal(false),
  financialsAssessed: z.literal(false),
  stage2LegalApproval: Stage2LegalPendingSchema,
  stage2SlikApproval: Stage2SlikPendingSchema,
  financialInputs: ZeroFinancialInputsSchema,
  marginRate: z.null(),
  analysis: EmptyAnalysisSchema,
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const Stage2KolDoneSchema = BaseApplicationSchema.extend({
  stage: z.literal(2),
  hardGates: Stage2HardGatesSchema,
  hardGateViolations: z.array(z.literal('kol')),
  kolEntered: z.literal(true),
  financialsAssessed: z.literal(false),
  stage2LegalApproval: Stage2LegalPendingSchema,
  stage2SlikApproval: Stage2SlikAnySchema,
  financialInputs: ZeroFinancialInputsSchema,
  marginRate: z.null(),
  analysis: EmptyAnalysisSchema,
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const Stage2LegalDoneSchema = BaseApplicationSchema.extend({
  stage: z.literal(2),
  hardGates: KolDefaultHardGatesSchema,
  hardGateViolations: z.tuple([]),
  kolEntered: z.literal(false),
  financialsAssessed: z.literal(false),
  stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
  stage2SlikApproval: Stage2SlikPendingSchema,
  financialInputs: ZeroFinancialInputsSchema,
  marginRate: z.null(),
  analysis: EmptyAnalysisSchema,
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const Stage2ReadySchema = BaseApplicationSchema.extend({
  stage: z.literal(2),
  hardGates: Stage2HardGatesSchema,
  hardGateViolations: z.array(z.literal('kol')),
  kolEntered: z.literal(true),
  financialsAssessed: z.literal(false),
  stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
  stage2SlikApproval: Stage2SlikAnySchema,
  financialInputs: ZeroFinancialInputsSchema,
  marginRate: z.null(),
  analysis: EmptyAnalysisSchema,
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const Stage3FlatAkadSchema = BaseApplicationSchema.extend({
  stage: z.literal(3),
  akadType: FlatAkadSchema,
  hardGates: HardGatesSchema,
  hardGateViolations: HardGateViolationSchema,
  kolEntered: z.literal(true),
  financialsAssessed: z.boolean(),
  stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
  stage2SlikApproval: Stage2SlikApprovalVerifiedSchema,
  financialInputs: FinancialInputsSchema,
  marginRate: z.number().nullable(),
  analysis: z.union([EmptyAnalysisSchema, FiveCSAnalysisSchema]),
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const Stage3ProfitShareAkadSchema = BaseApplicationSchema.extend({
  stage: z.literal(3),
  akadType: ProfitShareAkadSchema,
  hardGates: HardGatesSchema,
  hardGateViolations: HardGateViolationSchema,
  kolEntered: z.literal(true),
  financialsAssessed: z.boolean(),
  stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
  stage2SlikApproval: Stage2SlikApprovalVerifiedSchema,
  financialInputs: FinancialInputsSchema,
  marginRate: z.null(),
  analysis: z.union([EmptyAnalysisSchema, FiveCSAnalysisSchema]),
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const Stage4PendingFlatAkadSchema = BaseApplicationSchema.extend({
  stage: z.literal(4),
  akadType: FlatAkadSchema,
  hardGates: HardGatesSchema,
  hardGateViolations: HardGateViolationSchema,
  kolEntered: z.literal(true),
  financialsAssessed: z.literal(true),
  stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
  stage2SlikApproval: Stage2SlikApprovalVerifiedSchema,
  financialInputs: FinancialInputsSchema,
  marginRate: z.number(),
  analysis: GeneratedAnalysisSchema,
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const Stage4PendingProfitShareAkadSchema = BaseApplicationSchema.extend({
  stage: z.literal(4),
  akadType: ProfitShareAkadSchema,
  hardGates: HardGatesSchema,
  hardGateViolations: HardGateViolationSchema,
  kolEntered: z.literal(true),
  financialsAssessed: z.literal(true),
  stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
  stage2SlikApproval: Stage2SlikApprovalVerifiedSchema,
  financialInputs: FinancialInputsSchema,
  marginRate: z.null(),
  analysis: GeneratedAnalysisSchema,
  riskRecommendation: z.null(),
  riskNote: Absent,
  komiteVotes: z.tuple([]),
  komiteDecision: Absent,
  komiteDecisionNote: Absent,
})

const createStage4RecommendedSchema = (
  riskRecommendation: 'approve' | 'conditional' | 'reject',
  akadSchema: typeof FlatAkadSchema | typeof ProfitShareAkadSchema,
  marginRateSchema: z.ZodNumber | z.ZodNull,
) => {
  return BaseApplicationSchema.extend({
    stage: z.literal(4),
    akadType: akadSchema,
    hardGates: HardGatesSchema,
    hardGateViolations: HardGateViolationSchema,
    kolEntered: z.literal(true),
    financialsAssessed: z.literal(true),
    stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
    stage2SlikApproval: Stage2SlikApprovalVerifiedSchema,
    financialInputs: FinancialInputsSchema,
    marginRate: marginRateSchema,
    analysis: GeneratedAnalysisSchema,
    riskRecommendation: z.literal(riskRecommendation),
    riskNote: riskNoteSchema(riskRecommendation),
    komiteVotes: z.tuple([]),
    komiteDecision: Absent,
    komiteDecisionNote: Absent,
  })
}

const createStage5VotingSchema = (
  riskRecommendation: 'approve' | 'conditional',
  akadSchema: typeof FlatAkadSchema | typeof ProfitShareAkadSchema,
  marginRateSchema: z.ZodNumber | z.ZodNull,
) => {
  return BaseApplicationSchema.extend({
    stage: z.literal(5),
    akadType: akadSchema,
    hardGates: HardGatesSchema,
    hardGateViolations: HardGateViolationSchema,
    kolEntered: z.literal(true),
    financialsAssessed: z.literal(true),
    stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
    stage2SlikApproval: Stage2SlikApprovalVerifiedSchema,
    financialInputs: FinancialInputsSchema,
    marginRate: marginRateSchema,
    analysis: GeneratedAnalysisSchema,
    riskRecommendation: z.literal(riskRecommendation),
    riskNote: riskNoteSchema(riskRecommendation),
    komiteVotes: z.array(KomiteVoteSchema).max(3),
    komiteDecision: Absent,
    komiteDecisionNote: Absent,
  })
}

const createStage5DecidedSchema = (
  riskRecommendation: 'approve' | 'conditional',
  komiteDecision: 'approve' | 'conditional' | 'reject',
  akadSchema: typeof FlatAkadSchema | typeof ProfitShareAkadSchema,
  marginRateSchema: z.ZodNumber | z.ZodNull,
) => {
  const approvedFields = komiteDecision === 'reject'
    ? { approvedPlafond: Absent, approvedTenorMonths: Absent, approvedMarginRate: Absent }
    : { approvedPlafond: z.number(), approvedTenorMonths: z.number(), approvedMarginRate: marginRateSchema }

  return BaseApplicationSchema.extend({
    stage: z.literal(5),
    akadType: akadSchema,
    hardGates: HardGatesSchema,
    hardGateViolations: HardGateViolationSchema,
    kolEntered: z.literal(true),
    financialsAssessed: z.literal(true),
    stage2LegalApproval: Stage2LegalApprovalVerifiedSchema,
    stage2SlikApproval: Stage2SlikApprovalVerifiedSchema,
    financialInputs: FinancialInputsSchema,
    marginRate: marginRateSchema,
    analysis: GeneratedAnalysisSchema,
    riskRecommendation: z.literal(riskRecommendation),
    riskNote: riskNoteSchema(riskRecommendation),
    komiteVotes: z.array(KomiteVoteSchema).min(1).max(3),
    ...approvedFields,
    komiteDecision: z.literal(komiteDecision),
    komiteDecisionNote: komiteDecisionNoteSchema(komiteDecision),
  })
}

const Stage4ApproveFlatAkadSchema = createStage4RecommendedSchema('approve', FlatAkadSchema, z.number())
const Stage4ApproveProfitShareAkadSchema = createStage4RecommendedSchema('approve', ProfitShareAkadSchema, z.null())
const Stage4ConditionalFlatAkadSchema = createStage4RecommendedSchema('conditional', FlatAkadSchema, z.number())
const Stage4ConditionalProfitShareAkadSchema = createStage4RecommendedSchema('conditional', ProfitShareAkadSchema, z.null())
const Stage4RejectFlatAkadSchema = createStage4RecommendedSchema('reject', FlatAkadSchema, z.number())
const Stage4RejectProfitShareAkadSchema = createStage4RecommendedSchema('reject', ProfitShareAkadSchema, z.null())

const Stage5VotingApproveFlatAkadSchema = createStage5VotingSchema('approve', FlatAkadSchema, z.number())
const Stage5VotingApproveProfitShareAkadSchema = createStage5VotingSchema('approve', ProfitShareAkadSchema, z.null())
const Stage5VotingConditionalFlatAkadSchema = createStage5VotingSchema('conditional', FlatAkadSchema, z.number())
const Stage5VotingConditionalProfitShareAkadSchema = createStage5VotingSchema('conditional', ProfitShareAkadSchema, z.null())

const Stage5ApproveApproveFlatAkadSchema = createStage5DecidedSchema('approve', 'approve', FlatAkadSchema, z.number())
const Stage5ApproveApproveProfitShareAkadSchema = createStage5DecidedSchema('approve', 'approve', ProfitShareAkadSchema, z.null())
const Stage5ApproveConditionalFlatAkadSchema = createStage5DecidedSchema('approve', 'conditional', FlatAkadSchema, z.number())
const Stage5ApproveConditionalProfitShareAkadSchema = createStage5DecidedSchema('approve', 'conditional', ProfitShareAkadSchema, z.null())
const Stage5ApproveRejectFlatAkadSchema = createStage5DecidedSchema('approve', 'reject', FlatAkadSchema, z.number())
const Stage5ApproveRejectProfitShareAkadSchema = createStage5DecidedSchema('approve', 'reject', ProfitShareAkadSchema, z.null())
const Stage5ConditionalApproveFlatAkadSchema = createStage5DecidedSchema('conditional', 'approve', FlatAkadSchema, z.number())
const Stage5ConditionalApproveProfitShareAkadSchema = createStage5DecidedSchema('conditional', 'approve', ProfitShareAkadSchema, z.null())
const Stage5ConditionalConditionalFlatAkadSchema = createStage5DecidedSchema('conditional', 'conditional', FlatAkadSchema, z.number())
const Stage5ConditionalConditionalProfitShareAkadSchema = createStage5DecidedSchema('conditional', 'conditional', ProfitShareAkadSchema, z.null())
const Stage5ConditionalRejectFlatAkadSchema = createStage5DecidedSchema('conditional', 'reject', FlatAkadSchema, z.number())
const Stage5ConditionalRejectProfitShareAkadSchema = createStage5DecidedSchema('conditional', 'reject', ProfitShareAkadSchema, z.null())

export const ApplicationSchema = z.union([
  Stage1ApplicationSchema,
  Stage2AwaitingBothSchema,
  Stage2KolDoneSchema,
  Stage2LegalDoneSchema,
  Stage2ReadySchema,
  Stage3FlatAkadSchema,
  Stage3ProfitShareAkadSchema,
  Stage4PendingFlatAkadSchema,
  Stage4PendingProfitShareAkadSchema,
  Stage4ApproveFlatAkadSchema,
  Stage4ApproveProfitShareAkadSchema,
  Stage4ConditionalFlatAkadSchema,
  Stage4ConditionalProfitShareAkadSchema,
  Stage4RejectFlatAkadSchema,
  Stage4RejectProfitShareAkadSchema,
  Stage5VotingApproveFlatAkadSchema,
  Stage5VotingApproveProfitShareAkadSchema,
  Stage5VotingConditionalFlatAkadSchema,
  Stage5VotingConditionalProfitShareAkadSchema,
  Stage5ApproveApproveFlatAkadSchema,
  Stage5ApproveApproveProfitShareAkadSchema,
  Stage5ApproveConditionalFlatAkadSchema,
  Stage5ApproveConditionalProfitShareAkadSchema,
  Stage5ApproveRejectFlatAkadSchema,
  Stage5ApproveRejectProfitShareAkadSchema,
  Stage5ConditionalApproveFlatAkadSchema,
  Stage5ConditionalApproveProfitShareAkadSchema,
  Stage5ConditionalConditionalFlatAkadSchema,
  Stage5ConditionalConditionalProfitShareAkadSchema,
  Stage5ConditionalRejectFlatAkadSchema,
  Stage5ConditionalRejectProfitShareAkadSchema,
])

export type ApplicationSchemaType = z.infer<typeof ApplicationSchema>
