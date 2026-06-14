import { getDb } from '@/server/firebase/firestore'
import { COL, IDX } from '@/server/firebase/collections'
import type { LoanApplication } from '@/lib/types'

// Shared helpers for the *.fs.itest.ts Firestore-emulator integration tests. NOT a test file itself
// (name doesn't match the *.fs.itest.ts glob). Importing the modules under DATA_BACKEND=firestore
// routes their dispatchers to the Firestore impls.

const TOP_LEVEL = [
  COL.applications,
  COL.customers,
  COL.meetings,
  COL.deskAssignments,
  COL.sourceManifest,
  COL.users,
  COL.roles,
  COL.deskCatalog,
  COL.counters,
  COL.researchJobs,
  COL.decisionCheckpoints,
  COL.docLinkages,
  COL.docAccessGrant,
  COL.driveRefs,
  COL.driveRootGrants,
  COL.aiInteraction,
  COL.impersonationAudit,
  COL.config_templateReferenceText,
  COL.config_riskPolicy,
  COL.config_slaPolicy,
  COL.config_committeeRooms,
  COL.config_disbursementConditions,
  COL.config_holidayCalendar,
  COL.config_scheduleTemplate,
  COL.config_aiPrompt,
  COL.config_approvalRouting,
  IDX.qrTokens,
  IDX.userEmail,
  IDX.userFirebaseUid,
  IDX.roleKey,
  IDX.meetingTemplateSlot,
]

/** Wipe ALL test data (collections + their subcollections) between cases. Guards on the emulator host
 *  so it can NEVER run against a real Firestore. recursiveDelete on a collection clears its docs + subs. */
export async function clearFirestore(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('clearFirestore refused: FIRESTORE_EMULATOR_HOST unset (run via scripts/test-integration-firestore.sh)')
  }
  const db = getDb()
  await Promise.all(TOP_LEVEL.map((c) => db.recursiveDelete(db.collection(c))))
}

/** A minimal valid LoanApplication for create/save round-trips (mirrors write.fs.itest's makeApp). */
export function makeApp(id: string, overrides: Partial<LoanApplication> = {}): LoanApplication {
  const now = new Date()
  return {
    id,
    nasabahName: 'Test Nasabah',
    nasabahType: 'individual',
    phoneNumber: '0812',
    akadType: 'Murabahah',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
    stage: 1,
    assignments: [],
    enteredStageAt: now,
    createdAt: now,
    createdBy: 'tester',
    hardGates: { dsr: 0, ltv: 0, kol: 1 },
    hardGateViolations: [],
    kolEntered: false,
    financialsAssessed: false,
    stage2LegalApproval: null,
    financialInputs: {
      netMonthlyIncome: 0,
      existingMonthlyObligations: 0,
      collateralAppraisedValue: 0,
      proposedMonthlyInstallment: null,
      projectedMonthlyProfitShare: null,
    },
    marginRate: null,
    documents: [],
    history: [],
    analysis: { character: '', capacity: '', capital: '', collateral: '', condition: '', syariah: '', generated: false },
    komiteVotes: [],
    riskRecommendation: null,
    aiChatHistory: [],
    ...overrides,
  }
}
