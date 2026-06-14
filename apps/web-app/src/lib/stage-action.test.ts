import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDecision,
  decide,
  disbursementOpen,
  docBlockers,
  legalAppraisalComplete,
  ocrBlockers,
  makerSubmitGateError,
  muapToRiskBlockers,
  resetVerificationOnReupload,
  settleLgAssignment,
  sp3FinalReady,
  CHAIN_COMPLETE_ADVANCE,
  stage1To2Blockers,
  stageActions,
  type ActionCtx,
  type TransitionConfig,
} from './stage-action'
import type { ApprovalStepEntry } from './approval-chain'
import { dispatch } from './workflow-engine'
import type { Actor } from './auth/can'
import { AML_ATTESTATION_STATEMENT, AML_GATE_MESSAGE } from './aml'
import type { AmlAttestation, ApplicationDocument, LoanApplication, Stage } from './types'

// Compliance-core: the 6-stage pipeline transition + handoff + send-back reset policies.
// decide() is pure; applyDecision() applies the Decision to the aggregate (persistence is covered
// separately by write.itest.ts). dispatch() (DualSignOff) owns the Stage 2→3 advance precondition.

const ctx: ActionCtx = {
  addHistory: (app, action, stage, reason) =>
    app.history.push({
      id: `h-${app.history.length + 1}`,
      timestamp: new Date(),
      userId: 't',
      userName: 'T',
      action,
      stage,
      reason,
    }),
}

function doc(p: Partial<ApplicationDocument>): ApplicationDocument {
  return { id: 'd', name: 'Doc', docType: 'other', status: 'uploaded', required: true, ...p }
}

function makeApp(over: Partial<LoanApplication> = {}): LoanApplication {
  const now = new Date()
  return {
    id: 'FOS-T',
    nasabahName: 'N',
    nasabahType: 'individual',
    phoneNumber: '0',
    akadType: 'Murabahah',
    requestedPlafond: 1,
    requestedTenorMonths: 12,
    purpose: 'p',
    stage: 1 as Stage,
    assignments: [],
    enteredStageAt: now,
    createdAt: now,
    createdBy: 't',
    hardGates: { dsr: 0, ltv: 0, kol: 1 },
    hardGateViolations: [],
    kolEntered: false,
    financialsAssessed: false,
    stage2LegalApproval: null,
    stage2SlikApproval: null,
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
    ...over,
  }
}

const fwd = (targetStage: Stage, action = 'Lanjutkan'): TransitionConfig => ({ action, targetStage, requireReason: false })
const sysActor: Actor = { userId: 'sys', name: 'system', avatarInitials: 'S', desks: [], isSuperadmin: true }

test('applyDecision — forward hands off: closes open prior-stage desks, opens target-stage desks, logs', () => {
  const app = makeApp({
    stage: 1,
    assignments: [
      { stage: 1, role: 'RM', userId: 'u1', userName: 'RM1', status: 'in_progress', assignedAt: new Date(), submittedAt: null },
    ],
  })
  applyDecision(app, decide(app, { kind: 'Transition', transition: fwd(2) }), ctx)

  assert.equal(app.stage, 2)
  const prior = app.assignments.find((a) => a.stage === 1 && a.userId === 'u1')!
  assert.equal(prior.status, 'submitted')
  assert.notEqual(prior.submittedAt, null)
  assert.ok(app.assignments.some((a) => a.stage === 2 && a.status === 'todo')) // target desks opened
  assert.ok(app.history.some((h) => h.action === 'Lanjutkan' && h.stage === 2)) // append-only log
})

test('applyDecision — advances enteredStageAt to the transition moment, consistent with the logged entry', () => {
  const old = new Date('2020-01-01T00:00:00Z')
  const app = makeApp({ stage: 1, enteredStageAt: old })
  const before = Date.now()
  applyDecision(app, decide(app, { kind: 'Transition', transition: fwd(2) }), ctx)
  // enteredStageAt is re-stamped at transition time (not left at the stale prior-stage value)…
  assert.notEqual(app.enteredStageAt.getTime(), old.getTime())
  assert.ok(app.enteredStageAt.getTime() >= before)
  // …and the new-stage history entry is logged no earlier than stage entry (ordering invariant).
  const entry = app.history.find((h) => h.stage === 2)!
  assert.ok(entry.timestamp.getTime() >= app.enteredStageAt.getTime())
})

test('applyDecision — send-back 2→1 resets ONLY the failed doc + clears Stage-2 handoffs', () => {
  const app = makeApp({
    stage: 2,
    stage2LegalApproval: { verifiedByLG: true },
    stage2SlikApproval: { verifiedByRT: true },
    documents: [
      doc({ id: 'bad', legalVerification: 'fail', legalVerificationReason: 'Nama tidak sesuai' }),
      doc({ id: 'good', legalVerification: 'pass' }),
    ],
  })
  applyDecision(app, decide(app, { kind: 'Transition', transition: fwd(1, 'Kembalikan ke RM') }), ctx)

  const bad = app.documents.find((d) => d.id === 'bad')!
  const good = app.documents.find((d) => d.id === 'good')!
  assert.equal(bad.status, 'missing')
  assert.equal(bad.legalVerification, null)
  assert.equal(bad.legalVerificationReason, null)
  assert.equal(good.legalVerification, 'pass') // selective — untouched
  assert.equal(app.stage2LegalApproval, null)
  assert.equal(app.stage2SlikApproval, null)
})

test('applyDecision — send-back 3→1 resets ALL legal verifications + Stage-2 handoffs', () => {
  const app = makeApp({
    stage: 3,
    stage2LegalApproval: { verifiedByLG: true },
    stage2SlikApproval: { verifiedByRT: true },
    documents: [doc({ id: 'a', legalVerification: 'pass', legalVerificationReason: 'old' }), doc({ id: 'b', legalVerification: 'pass' })],
  })
  applyDecision(app, decide(app, { kind: 'Transition', transition: fwd(1, 'Kembalikan ke RM') }), ctx)

  assert.ok(app.documents.every((d) => d.legalVerification === null))
  assert.ok(app.documents.every((d) => d.legalVerificationReason == null))
  assert.equal(app.stage2LegalApproval, null)
  assert.equal(app.stage2SlikApproval, null)
})

// ── Stage-1 Initial-AML attestation gate (OJK APU-PPT) ───────────────────────

const attestation = (): AmlAttestation => ({
  attestedBy: 'u-001',
  attestedByName: 'Siti Rahma',
  attestedAt: new Date().toISOString(),
  statement: AML_ATTESTATION_STATEMENT,
})

// ── RM-led redesign (ADR-0020 §2): the intake hard gates RELOCATE from 1→2 to MUAP→Risk ─────
// docs/docs/decisions/0020-customer-entity-and-rm-led-pipeline.md §2. The intra-Inisiasi 1→2 advance
// is now FREE — `stage1To2Blockers` no longer blocks it (the symbol survives as [] so callers don't
// break). The same 4 blockers (docs · intake OCR · NIK-mismatch · AML) now gate the MUAP→Risk submit
// via `muapToRiskBlockers` / `makerSubmitGateError('muap')`. NOTHING is silently un-gated.

test('stage1To2Blockers — RELOCATED: the 1→2 advance is now free (always returns [])', () => {
  // Unattested, no docs, a NIK mismatch — none of these block the intra-Inisiasi advance anymore.
  assert.deepEqual(stage1To2Blockers(makeApp()), [])
  assert.deepEqual(stage1To2Blockers(makeApp({ amlAttestation: attestation() })), [])
  const withMismatch = makeApp({
    documents: [doc({ id: 'ktp', docType: 'ktp', status: 'missing' })],
    extractionSources: { nik: 'ocr_suggested' },
    extractionMismatches: { nik: { existingValue: '320', ocrValue: '321', provenance: 'ocr_confirmed', docType: 'ktp', detectedAt: 'now' } },
  })
  assert.deepEqual(stage1To2Blockers(withMismatch), [], 'docs/OCR/NIK no longer gate the free advance')
})

test('stageActions — RM/Stage-1 "Kirim …" is ENABLED even unattested (intake gate relocated to MUAP→Risk)', () => {
  const unattested = stageActions(makeApp(), 'RM').primary!
  assert.equal(unattested.disabled, false, 'free intra-Inisiasi advance — no longer gated by intake blockers')
  assert.equal(unattested.blockerMessages.includes(AML_GATE_MESSAGE), false)

  const attested = stageActions(makeApp({ amlAttestation: attestation() }), 'RM').primary!
  assert.equal(attested.disabled, false)
})

test('applyDecision — send-back 2→1 clears the AML attestation (re-attest before re-advancing)', () => {
  const app = makeApp({ stage: 2, stage2LegalApproval: { verifiedByLG: true }, stage2SlikApproval: { verifiedByRT: true }, amlAttestation: attestation(), documents: [] })
  applyDecision(app, decide(app, { kind: 'Transition', transition: fwd(1, 'Kembalikan ke RM') }), ctx)
  assert.equal(app.amlAttestation, null)
})

test('applyDecision — send-back 3→1 clears the AML attestation (re-attest before re-advancing)', () => {
  const app = makeApp({ stage: 3, stage2LegalApproval: { verifiedByLG: true }, stage2SlikApproval: { verifiedByRT: true }, amlAttestation: attestation(), documents: [] })
  applyDecision(app, decide(app, { kind: 'Transition', transition: fwd(1, 'Kembalikan ke RM') }), ctx)
  assert.equal(app.amlAttestation, null)
})

test('docBlockers — Stage-1 gate counts RM-intake docs, never RM bureau-data docs', () => {
  const app = makeApp({
    documents: [
      doc({ id: 'ktp', docType: 'ktp', status: 'missing' }),
      doc({ id: 'slik', docType: 'slik_report', status: 'missing' }), // RM bureau-data job at Stage 2
    ],
  })
  const ids = docBlockers(app).map((d) => d.id)
  assert.deepEqual(ids, ['ktp'], 'SLIK excluded from the intake advance gate')
})

test('ocrBlockers — desk-scoped: a stage gate counts ONLY its own desk\'s unconfirmed suggestions', () => {
  const app = makeApp({
    extractionSources: {
      'nik': 'ocr_suggested', // intake
      'financialInputs.netMonthlyIncome': 'ocr_suggested', // muap-author
      'hardGates.kol': 'ocr_confirmed', // RM bureau-data, already confirmed
    },
  })
  // The intake desk is NOT blocked by income (muap-author's job) — the original bug: it counted every suggestion.
  assert.deepEqual(ocrBlockers(app, 'intake'), ['NIK'])
  assert.deepEqual(ocrBlockers(app, 'muap-author'), ['Pendapatan Bersih/bulan'])
  assert.deepEqual(ocrBlockers(app, 'slik'), []) // kol already confirmed
  // Global (no desk) = the Stage-4 pre-committee backstop: every still-suggested field.
  assert.deepEqual(ocrBlockers(app).sort(), ['NIK', 'Pendapatan Bersih/bulan'].sort())
})

test('resetVerificationOnReupload — re-uploading a verified doc clears its verify + LG handoff', () => {
  const app = makeApp({
    stage: 2,
    stage2LegalApproval: { verifiedByLG: true },
    documents: [doc({ id: 'a', legalVerification: 'pass', legalVerificationReason: 'old' }), doc({ id: 'b', legalVerification: 'pass' })],
    assignments: [{ stage: 2, role: 'LG', userId: 'lg', userName: 'LG', status: 'submitted', assignedAt: new Date(), submittedAt: new Date() }],
  })
  resetVerificationOnReupload(app, 'a')
  assert.equal(app.documents.find((d) => d.id === 'a')!.legalVerification, null)
  assert.equal(app.documents.find((d) => d.id === 'a')!.legalVerificationReason, null)
  assert.equal(app.documents.find((d) => d.id === 'b')!.legalVerification, 'pass', 'other docs untouched')
  assert.equal(app.stage2LegalApproval!.verifiedByLG, false, 'LG must re-verify')
  assert.equal(app.assignments[0].status, 'in_progress', 'LG assignment reopens')
  assert.equal(app.assignments[0].submittedAt, null)
})

test('resetVerificationOnReupload — no-op on a never-verified doc (Stage-1 upload)', () => {
  const app = makeApp({ stage: 1, documents: [doc({ id: 'a', legalVerification: null })] })
  resetVerificationOnReupload(app, 'a')
  assert.equal(app.documents.find((d) => d.id === 'a')!.legalVerification, null)
  assert.equal(app.stage2LegalApproval, null, 'no handoff to clear')
})

test('dispatch (DualSignOff) — 2nd explicit handoff (both complete) carries Stage 2 → 3', () => {
  const app = makeApp({
    stage: 2,
    kolEntered: true,
    stage2LegalApproval: { verifiedByLG: true },
    stage2SlikApproval: { verifiedByRT: true },
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })],
    assignments: [{ stage: 2, role: 'LG', userId: 'lg', userName: 'LG', status: 'in_progress', assignedAt: new Date(), submittedAt: null }],
  })
  const { autoSkipped: advanced } = dispatch(app, { kind: 'DualSignOff' }, sysActor)
  assert.equal(advanced, true)
  assert.equal(app.stage, 3)
  assert.ok(app.assignments.some((a) => a.stage === 3 && a.status === 'todo'), 'Stage-3 desks opened')
  assert.ok(app.history.some((h) => h.stage === 3 && /Data biro & kolektibilitas lengkap/.test(h.action)), 'unified transition log')
})

test('dispatch (DualSignOff) — only one handoff → does NOT advance', () => {
  const app = makeApp({ stage: 2, kolEntered: true, stage2LegalApproval: { verifiedByLG: true }, stage2SlikApproval: { verifiedByRT: false }, documents: [] })
  assert.equal(dispatch(app, { kind: 'DualSignOff' }, sysActor).autoSkipped, false)
  assert.equal(app.stage, 2)
})

test('dispatch (DualSignOff) — ADR-0007: advances on RM bureau data (SLIK + Kol) even before Legal', () => {
  // The 2→3 advance is RM-coordinated; Legal (Analisa Yuridis) is NOT a prerequisite — it completes in
  // parallel and gates MUAP→Risk instead. So the SLIK handoff + Kol alone carries Stage 2 → 3.
  const app = makeApp({
    stage: 2,
    kolEntered: true,
    stage2SlikApproval: { verifiedByRT: true },
    stage2LegalApproval: null, // Legal NOT done yet
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: null })], // not legally verified yet
    assignments: [{ stage: 2, role: 'RM', userId: 'rm', userName: 'RM', status: 'in_progress', assignedAt: new Date(), submittedAt: null }],
  })
  assert.equal(dispatch(app, { kind: 'DualSignOff' }, sysActor).autoSkipped, true)
  assert.equal(app.stage, 3)
})

test('legalAppraisalComplete — ADR-0007 MUAP→Risk gate: needs Analisa Yuridis (LG + docs) AND Penilaian', () => {
  const base = {
    stage: 3 as Stage,
    stage2LegalApproval: { verifiedByLG: true },
    appraisalPath: 'internal' as const,
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })],
  }
  assert.equal(legalAppraisalComplete(makeApp(base)), true)
  assert.equal(legalAppraisalComplete(makeApp({ ...base, appraisalPath: null })), false, 'no Penilaian')
  assert.equal(legalAppraisalComplete(makeApp({ ...base, stage2LegalApproval: null })), false, 'no Analisa Yuridis handoff')
  assert.equal(
    legalAppraisalComplete(makeApp({ ...base, documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'fail' })] })),
    false,
    'a required doc not legally verified',
  )
})

// ── P3-D structured deliverables (design §4): "Completion gates; the verdict doesn't." ──────────────
// The structured Analisa Yuridis opinion is a SIGNAL Risk/Komite weigh, NEVER an auto-blocker. The gate
// (legalAppraisalComplete) reads ONLY verifiedByLG (completion) + appraisalPath + docs — never the opinion
// VALUE. These guards pin that a 'tidak-layak' opinion still COMPLETES the deliverable and adds NO blocker.

test('P3-D gate-preserved — legalAppraisalComplete is identical with a structured opinion present (incl. tidak-layak)', () => {
  const base = {
    stage: 3 as Stage,
    appraisalPath: 'internal' as const,
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })],
  }
  // Same completion (verifiedByLG=true) → same TRUE result regardless of the opinion value.
  for (const opinion of ['layak', 'layak-dengan-catatan', 'tidak-layak'] as const) {
    assert.equal(
      legalAppraisalComplete(makeApp({ ...base, stage2LegalApproval: { verifiedByLG: true, opinion, catatan: ['x'] } })),
      true,
      `opinion '${opinion}' still completes the deliverable (verdict does not gate)`,
    )
  }
  // And the legacy bare shape (no opinion) is byte-identical in behaviour.
  assert.equal(legalAppraisalComplete(makeApp({ ...base, stage2LegalApproval: { verifiedByLG: true } })), true)
})

test('P3-D verdict-does-not-gate — a tidak-layak opinion adds NO blocker to muapToRiskBlockers', () => {
  const ready = {
    stage: 3 as Stage,
    amlAttestation: attestation(),
    appraisalPath: 'internal' as const,
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })],
  }
  const layak = muapToRiskBlockers(makeApp({ ...ready, stage2LegalApproval: { verifiedByLG: true, opinion: 'layak' } }))
  const tidakLayak = muapToRiskBlockers(makeApp({ ...ready, stage2LegalApproval: { verifiedByLG: true, opinion: 'tidak-layak', catatan: ['agunan bermasalah'] } }))
  assert.deepEqual(layak, [], 'a fully-ready app has no blockers')
  assert.deepEqual(tidakLayak, [], 'a tidak-layak opinion adds NO blocker — it is a signal, not a stop')
  assert.deepEqual(tidakLayak, layak, 'byte-identical blocker list regardless of the opinion verdict')
})

// ── P3-D AML fresh-attest hook is INERT for original apps (design §4) ────────────────────────────────
// muapToRiskBlockers must be byte-identical to before for an 'original' app (the only origin P3-D creates).
// The fresh-attest hook (amlReattestRequired) is NOT wired into the gate in a way that changes this.

test('P3-D fresh-attest inert — an original app muapToRiskBlockers is unchanged by originType', () => {
  const ready = {
    stage: 3 as Stage,
    amlAttestation: attestation(),
    stage2LegalApproval: { verifiedByLG: true, opinion: 'layak' as const },
    appraisalPath: 'internal' as const,
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })],
  }
  const noOrigin = muapToRiskBlockers(makeApp(ready)) // originType absent → treated as 'original'
  const original = muapToRiskBlockers(makeApp({ ...ready, originType: 'original' }))
  assert.deepEqual(noOrigin, [], 'absent originType: ready app clears')
  assert.deepEqual(original, noOrigin, 'explicit original is byte-identical to absent')
  // And an UNATTESTED original still blocks on the existing AML gate (only that message; nothing new).
  const unattested = muapToRiskBlockers(makeApp({ ...ready, originType: 'original', amlAttestation: null }))
  assert.deepEqual(unattested, [AML_GATE_MESSAGE], 'unattested original blocks ONLY on the existing AML gate')
})

// ── Batch 6 / RELOCATED: an unresolved NIK cross-check conflict now blocks MUAP→Risk (not 1→2) ─────
// The identity-integrity stop is preserved — it simply fires at the MUAP submit instead of the free
// intra-Inisiasi advance. (Predicate + message unchanged; only the gate location moved.)
test('muapToRiskBlockers — an unresolved NIK OCR mismatch blocks the MUAP→Risk submit (identity integrity)', () => {
  // A MUAP-ready app (Legal + Appraisal complete, AML attested) EXCEPT a NIK mismatch.
  const ready = {
    stage: 3 as Stage,
    nik: '3201234567890123',
    amlAttestation: attestation(),
    stage2LegalApproval: { verifiedByLG: true },
    appraisalPath: 'internal' as const,
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })],
  }
  // no mismatch → no NIK blocker (everything else satisfied → clear)
  assert.deepEqual(muapToRiskBlockers(makeApp(ready)), [])
  // a recorded NIK mismatch → blocker present at the MUAP→Risk gate
  const withMismatch = makeApp({ ...ready, extractionMismatches: { nik: { existingValue: '3201234567890123', ocrValue: '3209999999999999', provenance: 'ocr_confirmed', docType: 'ktp', detectedAt: '2026-06-10T00:00:00Z' } } })
  assert.ok(muapToRiskBlockers(withMismatch).some((m) => /NIK berbeda/.test(m)), 'NIK conflict gates the MUAP submit')
  assert.notEqual(makerSubmitGateError('muap', withMismatch), null, 'and the maker-submit gate fires')
})

// ── Batch 1: LG assignment follows its deliverables, not the stage advance ────
// ADR-0007: the 2→3 advance is RM-coordinated (SLIK + Kol). LG's deliverables (Analisa Yuridis +
// Penilaian) gate MUAP→Risk and may lag into Stage 3 — the force-submit must NOT fabricate a
// "submitted" LG never did, and the LG card must settle exactly when both deliverables are in.

test('Batch 1 / T1 — advance 2→3 does NOT force-submit an LG assignment whose deliverables are owed', () => {
  const app = makeApp({
    stage: 2,
    kolEntered: true,
    stage2SlikApproval: { verifiedByRT: true },
    stage2LegalApproval: null, // Analisa Yuridis NOT done
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: null })],
    assignments: [
      { stage: 2, role: 'RM', userId: 'rm', userName: 'RM', status: 'in_progress', assignedAt: new Date(), submittedAt: null },
      { stage: 2, role: 'LG', userId: 'lg', userName: 'LG', status: 'in_progress', assignedAt: new Date(), submittedAt: null },
    ],
  })
  dispatch(app, { kind: 'DualSignOff' }, sysActor)
  assert.equal(app.stage, 3)
  const lg = app.assignments.find((a) => a.stage === 2 && a.role === 'LG')!
  assert.equal(lg.submittedAt, null, 'LG card stays in Tugas Saya — work still owed')
  assert.notEqual(lg.status, 'submitted')
  const rm = app.assignments.find((a) => a.stage === 2 && a.role === 'RM')!
  assert.equal(rm.status, 'submitted', 'RM (the gate) still closes on advance')
})

test('Batch 1 / T2 — settleLgAssignment: submitted ⇔ BOTH deliverables recorded (works at stage 2 or 3)', () => {
  const lgAssign = () => ({ stage: 2 as Stage, role: 'LG' as const, userId: 'lg', userName: 'LG', status: 'in_progress' as const, assignedAt: new Date(), submittedAt: null })

  // legal-only → still open
  const legalOnly = makeApp({ stage: 3, stage2LegalApproval: { verifiedByLG: true }, appraisalPath: null, documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })], assignments: [lgAssign()] })
  settleLgAssignment(legalOnly)
  assert.equal(legalOnly.assignments[0].submittedAt, null, 'Penilaian still owed → LG stays open')

  // legal + appraisal → submitted (at stage 3, the late-finish case)
  const both = makeApp({ stage: 3, stage2LegalApproval: { verifiedByLG: true }, appraisalPath: 'internal', documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })], assignments: [lgAssign()] })
  settleLgAssignment(both)
  assert.equal(both.assignments[0].status, 'submitted', 'both deliverables in → LG settles at stage 3')
  assert.notEqual(both.assignments[0].submittedAt, null)
})

test('Batch 1 / T4 — re-upload at stage 3 reopens the settled LG assignment', () => {
  const app = makeApp({
    stage: 3,
    stage2LegalApproval: { verifiedByLG: true },
    documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })],
    assignments: [{ stage: 2, role: 'LG', userId: 'lg', userName: 'LG', status: 'submitted', assignedAt: new Date(), submittedAt: new Date() }],
  })
  resetVerificationOnReupload(app, 'ktp') // re-upload invalidates legal verify → resetLegalHandoff
  const lg = app.assignments.find((a) => a.stage === 2 && a.role === 'LG')!
  assert.equal(lg.submittedAt, null, 'LG re-opens — work is owed again at stage 3')
  assert.equal(lg.status, 'in_progress')
})

// ── Risk recommendation routing (Stage 4, RT) ────────────────────────────────
// Batch 3 T5 (#13): the ONLY 4→5 path is a complete RSK ladder (auto-advance). approve/conditional
// no longer expose a manual "Kirim ke Komite" transition — the band directs the RA into the RSK tab
// to sign the ladder. reject still returns to RM (Stage 1). Rework always available as the secondary.

test('stageActions — RT/Stage-4 approve/conditional: NO manual 4→5 transition (ladder is the only path)', () => {
  for (const rec of ['approve', 'conditional'] as const) {
    const model = stageActions(makeApp({ stage: 4, riskRecommendation: rec }), 'RA')
    assert.equal(model.primary?.transition, undefined, `${rec}: no manual Kirim-ke-Komite transition`)
    assert.match(model.primary?.href ?? '', /view=rsk/, `${rec}: band directs into the RSK tab`)
    assert.equal(model.returnAction?.transition?.targetStage, 3, 'rework → analyst still available')
  }
})

test('stageActions — RT/Stage-4 reject recommendation returns to RM (Stage 1)', () => {
  const app = makeApp({ stage: 4, riskRecommendation: 'reject' })
  assert.equal(stageActions(app, 'RA').primary?.transition?.targetStage, 1)
})

// ── Batch 3 T5: maker submit-to-checker gate (RSK request needs a recommendation, #14) ──
test('makerSubmitGateError — RSK request is blocked until a risk recommendation is recorded', () => {
  // RSK: no recommendation → blocked (the gate that, with ladder-only advance, closes #13/#14)
  assert.match(makerSubmitGateError('rsk', makeApp({ stage: 4, riskRecommendation: null })) ?? '', /rekomendasi risiko/)
  assert.equal(makerSubmitGateError('rsk', makeApp({ stage: 4, riskRecommendation: 'approve' })), null, 'recommendation present → allowed')

  // MUAP: incomplete legal/appraisal blocks the request (now one of the union of relocated blockers)
  assert.match(makerSubmitGateError('muap', makeApp({ stage: 3, stage2LegalApproval: null, amlAttestation: attestation() })) ?? '', /Analisa Yuridis/)
  const muapReady = makeApp({ stage: 3, amlAttestation: attestation(), stage2LegalApproval: { verifiedByLG: true }, appraisalPath: 'internal', documents: [doc({ id: 'ktp', docType: 'ktp', legalVerification: 'pass' })] })
  assert.equal(makerSubmitGateError('muap', muapReady), null)
})

// ── CRITICAL COMPLIANCE GUARD (RM-led redesign, ADR-0020 §2): the intake gates RELOCATE intact ──
// The compliance invariant: NOTHING that blocked the 1→2 advance becomes silently un-gated. The SAME
// blockers — a required intake doc · an unconfirmed intake OCR (NIK) · a NIK cross-check mismatch · the
// Initial-AML attestation — now gate the MUAP→Risk submit, alongside the pre-existing legal/appraisal
// gate. Each missing-in-turn fixture must make `makerSubmitGateError('muap', app)` fire; all-satisfied → null.
test('makerSubmitGateError(muap) — RELOCATED intake gates: each blocker fires at MUAP→Risk, none dropped', () => {
  // The all-satisfied baseline: a MUAP-ready app with every relocated blocker cleared.
  const ready = (): LoanApplication => makeApp({
    stage: 3,
    nik: '3201234567890123',
    amlAttestation: attestation(),
    stage2LegalApproval: { verifiedByLG: true },
    appraisalPath: 'internal',
    documents: [doc({ id: 'ktp', docType: 'ktp', status: 'uploaded', legalVerification: 'pass' })],
  })
  assert.equal(makerSubmitGateError('muap', ready()), null, 'all 5 conditions satisfied → MUAP submit allowed')

  // (a) a required INTAKE doc missing → docBlockers fires
  const missingDoc = ready()
  missingDoc.documents = [doc({ id: 'ktp', docType: 'ktp', status: 'missing', legalVerification: 'pass' })]
  assert.notEqual(makerSubmitGateError('muap', missingDoc), null, 'missing intake doc must gate MUAP→Risk')

  // (b) an unconfirmed INTAKE OCR (NIK still ocr_suggested) → ocrBlockers('intake') fires
  const unconfirmedOcr = ready()
  unconfirmedOcr.extractionSources = { nik: 'ocr_suggested' }
  assert.notEqual(makerSubmitGateError('muap', unconfirmedOcr), null, 'unconfirmed intake OCR must gate MUAP→Risk')

  // (c) a NIK cross-check mismatch → identity-integrity blocker fires
  const nikMismatch = ready()
  nikMismatch.extractionMismatches = { nik: { existingValue: '3201234567890123', ocrValue: '3209999999999999', provenance: 'ocr_confirmed', docType: 'ktp', detectedAt: 'now' } }
  assert.notEqual(makerSubmitGateError('muap', nikMismatch), null, 'NIK mismatch must gate MUAP→Risk')

  // (d) AML attestation absent → AML blocker fires
  const noAml = ready()
  noAml.amlAttestation = null
  assert.notEqual(makerSubmitGateError('muap', noAml), null, 'unattested AML must gate MUAP→Risk')

  // (e) legal/appraisal incomplete → the pre-existing legalAppraisalComplete blocker fires
  const noLegal = ready()
  noLegal.stage2LegalApproval = null
  assert.notEqual(makerSubmitGateError('muap', noLegal), null, 'incomplete Legal/Appraisal must gate MUAP→Risk')
})

// The 1→2 advance is FREE: a Stage-1 app missing every relocated blocker dispatches the Transition
// without throwing (the trigger stays; only the BLOCKING moved). Proves blocking ≠ triggering.
test('dispatch(Transition 1→2) — RELOCATED: free advance even with no docs / no AML / a NIK mismatch', () => {
  const rmActor: Actor = { userId: 'rm', name: 'RM', avatarInitials: 'R', desks: ['intake'], isSuperadmin: false }
  const app = makeApp({
    stage: 1,
    documents: [doc({ id: 'ktp', docType: 'ktp', status: 'missing' })], // required intake doc missing
    extractionSources: { nik: 'ocr_suggested' }, // unconfirmed intake OCR
    extractionMismatches: { nik: { existingValue: '320', ocrValue: '321', provenance: 'ocr_confirmed', docType: 'ktp', detectedAt: 'now' } },
    amlAttestation: null, // unattested
    assignments: [{ stage: 1, role: 'RM', userId: 'rm', userName: 'RM', status: 'in_progress', assignedAt: new Date(), submittedAt: null }],
  })
  assert.doesNotThrow(() =>
    dispatch(app, { kind: 'Transition', transition: { action: 'Kirim ke Legal, Agunan & Biro', targetStage: 2, requireReason: false } }, rmActor),
  )
  assert.equal(app.stage, 2, 'the intra-Inisiasi advance is free — the intake blockers relocated to MUAP→Risk')
})

// ── SLIK/Kol is RM-owned at Stage 2 (D1): forward-only handoff, no decline ────

test('stageActions — RM/Stage-2 bureau handoff is a forward-only primary (no return; RM is originator)', () => {
  const app = makeApp({ stage: 2, stage2SlikApproval: null })
  const model = stageActions(app, 'RM')
  assert.equal(model.primary?.action, 'bureau-handoff', 'RM owns the bureau handoff at Stage 2')
  assert.equal(model.primary?.workView, 'data', 'the gated work (Kol entry) lives on the Data tab')
  assert.equal(model.returnAction, undefined, 'no "decline to RM" — RM cannot send back to itself')
})

test('stageActions — RA is not a Stage-2 owner (risk work scoped to Stage-4 RSK)', () => {
  const app = makeApp({ stage: 2, stage2SlikApproval: null })
  assert.equal(stageActions(app, 'RA').isOwner, false)
})

test('stageActions — RM/Stage-2 after bureau handoff: primary drops (work done)', () => {
  const app = makeApp({ stage: 2, stage2SlikApproval: { verifiedByRT: true } })
  const model = stageActions(app, 'RM')
  assert.equal(model.primary, undefined)
  assert.equal(model.returnAction, undefined)
})

test('stageActions — LG/Stage-2 Analisa Yuridis is a complete-legal primary into the Dokumen tab', () => {
  const app = makeApp({ stage: 2, stage2LegalApproval: null })
  const model = stageActions(app, 'LG')
  assert.equal(model.primary?.action, 'complete-legal')
  assert.equal(model.primary?.workView, 'documents')
  assert.ok(model.returnAction, 'LG keeps the "Kembalikan ke RM" send-back')
})

test('stageActions — LG Analisa Yuridis PERSISTS at Stage 3 (does not vanish after the RM 2→3 advance)', () => {
  // 2→3 fires on the RM SLIK handoff regardless of legal; the LG ACTION must stay until done.
  const stage3 = makeApp({ stage: 3, stage2LegalApproval: null })
  assert.equal(stageActions(stage3, 'LG').primary?.action, 'complete-legal', 'still actionable at Stage 3')

  const done = makeApp({ stage: 3, stage2LegalApproval: { verifiedByLG: true } })
  assert.equal(stageActions(done, 'LG').primary, undefined, 'primary drops once Analisa Yuridis is complete')
})

// ── Committee conditional: nasabah-response branch + terminal closure ─────────

test('disbursementOpen — approve OR accepted-conditional only', () => {
  assert.equal(disbursementOpen({ komiteDecision: 'approve', conditionalResponse: null }), true)
  assert.equal(disbursementOpen({ komiteDecision: 'conditional', conditionalResponse: 'accepted' }), true)
  assert.equal(disbursementOpen({ komiteDecision: 'conditional', conditionalResponse: null }), false)
  assert.equal(disbursementOpen({ komiteDecision: 'conditional', conditionalResponse: 'declined' }), false)
  assert.equal(disbursementOpen({ komiteDecision: 'reject', conditionalResponse: null }), false)
})

test('stageActions — accepted-conditional at Stage 6 routes AO into Pencairan (like approve)', () => {
  const app = makeApp({ stage: 6, komiteDecision: 'conditional', conditionalResponse: 'accepted' })
  const model = stageActions(app, 'RM')
  assert.equal(model.isOwner, true)
  assert.match(model.primary?.href ?? '', /view=pencairan/)
})

test('stageActions — awaiting-conditional routes AO to record the nasabah response', () => {
  const app = makeApp({ stage: 1, komiteDecision: 'conditional', conditionalResponse: null })
  const model = stageActions(app, 'RM')
  assert.equal(model.isOwner, true)
  assert.match(model.taskTitle, /respons nasabah/i)
})

test('stageActions — closed application is terminal: no task for anyone', () => {
  const app = makeApp({ stage: 1, komiteDecision: 'conditional', conditionalResponse: 'declined', applicationStatus: 'closed', closeReason: 'nasabah-decline' })
  const model = stageActions(app, 'RM')
  assert.equal(model.isOwner, false)
  assert.match(model.statusLine, /ditutup/i)
})

test('stageActions — reject routes AO to communicate & close', () => {
  const app = makeApp({ stage: 1, komiteDecision: 'reject' })
  assert.match(stageActions(app, 'RM').taskTitle, /tutup pengajuan/i)
})

// ── decide() — the pure command reducer (Phase 3 engine core) ────────────────

test('decide — forward transition: target stage + verbatim action, no resets', () => {
  const d = decide(makeApp({ stage: 3 }), { kind: 'Transition', transition: { action: 'Kirim ke Risk Review', targetStage: 4, requireReason: false } })
  assert.equal(d.stage, 4)
  assert.equal(d.historyAction, 'Kirim ke Risk Review')
  assert.equal(d.docReset, 'none')
  assert.equal(d.clearStage2Handoffs, false)
  assert.equal(d.clearAmlAttestation, false)
  assert.equal(d.runStage3Entry, false)
})

test('decide — send-back 2→1 clears Stage-2 + AML, resets only failed docs', () => {
  const d = decide(makeApp({ stage: 2 }), { kind: 'Transition', transition: { action: 'Kembalikan ke RM', targetStage: 1, requireReason: true } })
  assert.equal(d.docReset, 'failed-only')
  assert.equal(d.clearStage2Handoffs, true)
  assert.equal(d.clearAmlAttestation, true)
})

test('decide — send-back 3→1 clears Stage-2 + AML, resets ALL legal verifications', () => {
  const d = decide(makeApp({ stage: 3 }), { kind: 'Transition', transition: { action: 'Kembalikan ke RM', targetStage: 1, requireReason: true } })
  assert.equal(d.docReset, 'all')
  assert.equal(d.clearStage2Handoffs, true)
  assert.equal(d.clearAmlAttestation, true)
})

test('decide — entering Stage 3 flags the stage-3 entry effect', () => {
  const d = decide(makeApp({ stage: 2 }), { kind: 'Transition', transition: { action: 'x', targetStage: 3, requireReason: false } })
  assert.equal(d.runStage3Entry, true)
})

test('decide — RA reject 4→1 is a clean restart: clears Stage-2 + AML, resets ALL docs', () => {
  // Stage 4 (Risk Review) RA "Tolak & Kembalikan ke RM" sends the deal back to intake (stage 1).
  // A 4→1 send-back must reset like 3→1: re-attest AML (APU-PPT periodic re-screening), redo the
  // Stage-2 handoffs, and re-validate ALL docs — never leave a stale AML attestation behind.
  const d = decide(makeApp({ stage: 4 }), { kind: 'Transition', transition: { action: 'Tolak & Kembalikan ke RM', targetStage: 1, requireReason: true } })
  assert.equal(d.clearAmlAttestation, true)
  assert.equal(d.clearStage2Handoffs, true)
  assert.equal(d.docReset, 'all')
})

test('decide — reject maps to the audit-friendly history action', () => {
  const d = decide(makeApp({ stage: 4 }), { kind: 'Transition', transition: { action: 'Tolak & Kembalikan ke RM', targetStage: 1, requireReason: true } })
  assert.match(d.historyAction, /Ditolak oleh Risk Analyst/)
})

// ── CRITICAL invariant (RM-led OCR-widening, design §3): advisory fields NEVER gate ──
// An app carrying advisory OCR values (omzet/labaBersih/…) — including a MISMATCH cross-check —
// must NOT have any advisory key appear in stage1To2Blockers or ocrBlockers. NIK stays the SOLE
// 1→2 identity blocker (proven by the dedicated NIK-mismatch case below).
test('advisory OCR fields never enter stage1To2Blockers / ocrBlockers (NIK stays the sole blocker)', () => {
  const advisoryValues = {
    omzet: { value: 1_200_000_000, label: 'Omzet / Penjualan', docType: 'laporan_keuangan', detectedAt: 'now' },
    labaBersih: { value: 150_000_000, label: 'Laba Bersih', docType: 'laporan_keuangan', detectedAt: 'now' },
    pendapatanSpt: {
      value: 50_000_000, label: 'Penghasilan Kena Pajak (SPT)', docType: 'spt_tahunan', detectedAt: 'now',
      crossCheck: { against: 'spt_vs_lapkeu', status: 'mismatch' as const, note: 'berbeda material (advisory)' },
    },
    bakiDebet: { value: 300_000_000, label: 'Baki Debet', docType: 'slik_report', detectedAt: 'now' },
  }
  // A fully clear Stage-1 app (NIK confirmed, AML attested, no required intake docs) EXCEPT it carries
  // advisory values. The only thing that could possibly block is an advisory leak — assert none does.
  const app = makeApp({
    stage: 1,
    nik: '3201234567890123',
    documents: [],
    extractionSources: { nik: 'human_entered' },
    amlAttestation: { attestedBy: 'u', attestedByName: 'RM', attestedAt: 'now', statement: 's' },
    advisoryExtractions: advisoryValues,
  })

  // muapToRiskBlockers is the relocated home of the NIK identity gate — advisory keys must not leak there either.
  const muapReady = makeApp({ ...app, stage: 3, stage2LegalApproval: { verifiedByLG: true }, appraisalPath: 'internal', documents: [] })
  const blockerStrings = [...ocrBlockers(app, 'intake'), ...ocrBlockers(app), ...muapToRiskBlockers(muapReady)].join(' | ').toLowerCase()
  for (const key of Object.keys(advisoryValues)) {
    assert.ok(!blockerStrings.includes(key.toLowerCase()), `advisory key ${key} must never appear in a blocker set`)
  }
  // The 1→2 advance is now free regardless of advisory presence (intake gate relocated to MUAP→Risk).
  assert.deepEqual(stage1To2Blockers(app), [], 'the 1→2 advance is free')

  // Contrast: a NIK cross-check mismatch remains the sole identity blocker — now at the MUAP→Risk gate.
  const withNikMismatch = makeApp({
    ...muapReady,
    extractionMismatches: { nik: { existingValue: '3201234567890123', ocrValue: '3209999999999999', provenance: 'human_entered', docType: 'ktp', detectedAt: 'now' } },
  })
  assert.ok(muapToRiskBlockers(withNikMismatch).some((m) => /NIK berbeda/.test(m)), 'NIK mismatch remains the sole identity blocker (relocated to MUAP→Risk)')
})

// ── N1: SP3 dual-prerequisite disbursement gate (docs/designs/rm-led-pipeline-redesign.md §4) ──

// Terse sp3-ledger builder mirroring the approval-chain reducer's shape.
function sp3Step(role: 'sp3-author' | 'sp3-legal-review', action: 'request' | 'approve', userId: string): ApprovalStepEntry {
  return { chain: 'sp3', role, action, userId }
}

const SP3_COMPLETE: ApprovalStepEntry[] = [
  sp3Step('sp3-author', 'request', 'rm'),
  sp3Step('sp3-legal-review', 'approve', 'lg'),
]
const SP3_INCOMPLETE: ApprovalStepEntry[] = [sp3Step('sp3-author', 'request', 'rm')]

test('sp3FinalReady — false while the SP3 Legal-review chain is incomplete (even if disburse-open)', () => {
  const app = makeApp({ komiteDecision: 'approve' }) // disburse-open
  assert.equal(disbursementOpen(app), true)
  assert.equal(sp3FinalReady(app, SP3_INCOMPLETE), false, 'SP3 not yet Legal-approved → not ready')
  assert.equal(sp3FinalReady(app, []), false, 'no SP3 chain at all → not ready')
})

test('sp3FinalReady — true once disburse-open AND the SP3 chain is complete', () => {
  const approved = makeApp({ komiteDecision: 'approve' })
  assert.equal(sp3FinalReady(approved, SP3_COMPLETE), true)
  // accepted-conditional is also disburse-open.
  const conditional = makeApp({ komiteDecision: 'conditional', conditionalResponse: 'accepted' })
  assert.equal(sp3FinalReady(conditional, SP3_COMPLETE), true)
})

test('sp3FinalReady — false when NOT disburse-open, regardless of a complete SP3 chain', () => {
  // A complete SP3 chain must NOT open disbursement on its own — the MoM-final routing (Stage 6 /
  // disburse-open) is the other independent prerequisite.
  const notOpen = makeApp({ komiteDecision: 'conditional', conditionalResponse: null })
  assert.equal(disbursementOpen(notOpen), false)
  assert.equal(sp3FinalReady(notOpen, SP3_COMPLETE), false)
})

test('CARDINAL: sp3 is NOT a stage-advance gate — absent from CHAIN_COMPLETE_ADVANCE', () => {
  // The SP3 chain completing must NEVER advance the stage; only the maker-checker doc chains do.
  assert.deepEqual(Object.keys(CHAIN_COMPLETE_ADVANCE).sort(), ['muap', 'rsk'])
  assert.equal(('sp3' in CHAIN_COMPLETE_ADVANCE), false, 'sp3 must not have an advance row')
  // The two real advances are unchanged (MoM-final 5→6 stays its own untouched path).
  assert.equal(CHAIN_COMPLETE_ADVANCE.muap.config.targetStage, 4)
  assert.equal(CHAIN_COMPLETE_ADVANCE.rsk.config.targetStage, 5)
})
