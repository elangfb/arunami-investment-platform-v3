// E2E fixture endpoint. POST { stage, overrides? } → persists a minimal Application at
// the target stage and returns its row. Gated by e2eFixturesEnabled() (E2E_MODE=1 AND a throwaway
// backend — *_e2e DB or Firestore emulator); returns 404 in dev/prod so the route can never be hit
// outside scenarios — important now that its writes dispatch through the real Firestore seam.
//
// Bypasses desk gating + actor identity on purpose — factories are setup machinery,
// not workflow exercises. The UI's auth still runs against the Firebase emulator when
// scenarios drive the browser. Each scenario should still verify the surfaces it cares
// about against the real action handlers; this route only stages the starting state.
import { NextResponse } from 'next/server'
import { createApplication, loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { e2eFixturesEnabled } from '@/server/auth/e2e-fixtures'
import { buildAmlAttestation } from '@/lib/aml'
import type { LoanApplication, Stage } from '@/lib/types'

interface FixtureInput {
  stage?: Stage
  overrides?: Partial<LoanApplication>
}

const SYSTEM_USER_ID = 'fixture-system'
const SYSTEM_USER_NAME = 'E2E fixture'

function defaultApp(): LoanApplication {
  const now = new Date()
  const id = `FIX-${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`
  return {
    id,
    nasabahName: 'Nasabah Fixture',
    nasabahType: 'individual',
    phoneNumber: '0812-0000-0000',
    akadType: 'Murabahah',
    collateralType: 'vehicle',
    incomeSource: 'karyawan',
    isMarried: false,
    requestedPlafond: 200_000_000,
    requestedTenorMonths: 24,
    purpose: 'E2E fixture seed',
    stage: 1,
    assignments: [
      { stage: 1, role: 'RM', userId: SYSTEM_USER_ID, userName: SYSTEM_USER_NAME, status: 'in_progress', assignedAt: now, submittedAt: null },
    ],
    enteredStageAt: now,
    createdAt: now,
    createdBy: SYSTEM_USER_ID,
    hardGates: { dsr: 0, ltv: 0, kol: 1 },
    hardGateViolations: [],
    kolEntered: false,
    financialsAssessed: false,
    stage2LegalApproval: null,
    financialInputs: {
      netMonthlyIncome: 0,
      existingMonthlyObligations: 0,
      collateralAppraisedValue: 0,
      proposedMonthlyInstallment: 0,
      projectedMonthlyProfitShare: 0,
    },
    documents: [],
    history: [],
    riskRecommendation: null,
    marginRate: null,
    analysis: { character: '', capacity: '', capital: '', condition: '', collateral: '', syariah: '', generated: false },
    komiteVotes: [],
    aiChatHistory: [],
  }
}

async function advanceTo(appId: string, targetStage: Stage): Promise<LoanApplication> {
  // Fixture fast-forward: directly set the stage field and append a single history
  // entry per hop. Real transition rules (RM-coordinated gates, hard-gate checks) are
  // intentionally NOT enforced here — that's what the scenarios exercise.
  for (let next = 2; next <= targetStage; next++) {
    const app = await loadApplicationForWrite(appId)
    if (!app) throw new Error(`fixture: app ${appId} disappeared between hops`)
    app.stage = next as Stage
    app.enteredStageAt = new Date()
    app.history.push({
      id: `fixture-${appId}-s${next}`,
      stage: next as Stage,
      userId: SYSTEM_USER_ID,
      userName: SYSTEM_USER_NAME,
      action: `Fixture fast-forward to stage ${next}`,
      timestamp: new Date(),
    })
    await saveApplication(app)
  }
  // Fast-forwarding past a gate-bearing stage means the prerequisites that gate the NEXT desk's
  // maker action must already be in place — otherwise the ladder scenarios are blocked by setup
  // state, not by the behaviour under test. Set them by target stage:
  //   stage ≥ 3 → MUAP→Risk submit gate (makerSubmitGateError('muap') / muapToRiskBlockers):
  //               Legal+Appraisal done (ADR-0007) AND the Initial-AML attestation (relocated intake
  //               gate, ADR-0020 §2). documents: [] makes the per-doc legal check vacuously satisfied.
  //   stage ≥ 4 → RSK ladder request gate (makerSubmitGateError('rsk')): a recorded risk
  //               recommendation. Default 'approve'; a scenario can override it (e.g. conditional).
  if (targetStage >= 3) {
    const app = await loadApplicationForWrite(appId)
    if (app) {
      app.stage2LegalApproval = { verifiedByLG: true, notes: 'Fixture: Analisa Yuridis selesai.' }
      app.appraisalPath = 'internal'
      app.amlAttestation = buildAmlAttestation(SYSTEM_USER_ID, SYSTEM_USER_NAME)
      if (targetStage >= 4) app.riskRecommendation = 'approve'
      await saveApplication(app)
    }
  }
  const final = await loadApplicationForWrite(appId)
  if (!final) throw new Error(`fixture: app ${appId} missing after advance`)
  return final
}

export async function POST(request: Request) {
  if (!e2eFixturesEnabled()) return new NextResponse('Not found', { status: 404 })
  const body = (await request.json().catch(() => ({}))) as FixtureInput
  const targetStage = (body.stage ?? 1) as Stage

  const overrides = body.overrides ?? {}
  const seed = { ...defaultApp(), ...overrides }
  // Ensure a unique id if the caller didn't override (overrides win).
  const created = await createApplication(seed)
  let final = targetStage > 1 ? await advanceTo(created.id, targetStage) : created
  // Re-apply overrides through the UPDATE path so post-decision fields createApplication
  // does not map (riskRecommendation, komiteDecision, applicationStatus, conditionalResponse,
  // disbursementStatus, …) are persisted for scenarios that stage decided / terminal states.
  if (Object.keys(overrides).length) {
    const app = await loadApplicationForWrite(created.id)
    if (app) {
      Object.assign(app, overrides)
      app.stage = final.stage // advanceTo wins over any stage in overrides
      final = await saveApplication(app)
    }
  }
  return NextResponse.json({ id: final.id, stage: final.stage, application: final })
}
