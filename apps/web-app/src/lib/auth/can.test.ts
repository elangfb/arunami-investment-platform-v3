import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type Actor,
  AuthzError,
  actingRolesForStage,
  assertCanActOnStage,
  assertCanParticipate,
  assertCanWorkDesk,
  assertDesk,
  auditUserName,
  canActOnDesk,
  canParticipate,
  canWorkDeskNow,
  canWorkStage,
  effectiveRole,
  hasAnyDesk,
  hasDesk,
  primaryRole,
} from './can'
import { ADMIN_DESKS, type Desk } from '../desks'
import type { LoanApplication } from '../types'

const actor = (desks: Desk[], isSuperadmin = false): Actor => ({
  userId: 'u-1',
  name: 'Tester',
  avatarInitials: 'T',
  desks,
  isSuperadmin,
})
const superadmin = actor([...ADMIN_DESKS, 'MG'], true)
const app = (stage: number) => ({ stage } as unknown as LoanApplication)

test('hasDesk / hasAnyDesk: holder yes, non-holder no; superadmin holds admin desks not pipeline', () => {
  const lg = actor(['legal'])
  assert.equal(hasDesk(lg, 'legal'), true)
  assert.equal(hasDesk(lg, 'slik'), false)
  assert.equal(hasAnyDesk(lg, 'slik', 'legal'), true)
  assert.equal(hasAnyDesk(lg, 'slik', 'rsk-author'), false)
  assert.equal(hasDesk(superadmin, 'rsk-author'), false)
  assert.equal(hasAnyDesk(superadmin, 'komite'), false)
  assert.equal(hasAnyDesk(superadmin, 'ADMIN-USERS', 'legal'), true)
})

test('canActOnDesk: holds an owning desk for the stage; read-only superadmin never does', () => {
  assert.equal(canActOnDesk(actor(['intake']), app(1)), true)
  assert.equal(canActOnDesk(actor(['intake']), app(3)), false)
  // Stage 2 is owned by Legal/Appraisal plus RM bureau-data.
  assert.equal(canActOnDesk(actor(['legal']), app(2)), true)
  assert.equal(canActOnDesk(actor(['slik']), app(2)), true)
  assert.equal(canActOnDesk(actor(['muap-author']), app(2)), false)
  assert.equal(canActOnDesk(superadmin, app(5)), false)
})

test('effectiveRole: role of the owning desk; LG-preferred at stage 2; null when not owning', () => {
  assert.equal(effectiveRole(actor(['intake']), app(1)), 'RM')
  assert.equal(effectiveRole(actor(['muap-author']), app(3)), 'RM')
  assert.equal(effectiveRole(actor(['rsk-author']), app(4)), 'RA')
  // Holds only the SLIK desk at stage 2 → RM (SLIK is RM-owned, D1); only Legal → LG.
  assert.equal(effectiveRole(actor(['slik']), app(2)), 'RM')
  assert.equal(effectiveRole(actor(['legal']), app(2)), 'LG')
  // Holds BOTH stage-2 desks → deterministic LG preference (listed first).
  assert.equal(effectiveRole(actor(['legal', 'slik']), app(2)), 'LG')
  // Not an owner of the stage → null (band renders read-only).
  assert.equal(effectiveRole(actor(['intake']), app(3)), null)
})

test('assertDesk: passes for the desk holder; superadmin passes admin desks but not workflow desks', () => {
  assert.doesNotThrow(() => assertDesk(actor(['legal']), 'legal'))
  assert.throws(() => assertDesk(superadmin, 'rsk-author'), AuthzError)
  assert.doesNotThrow(() => assertDesk(superadmin, 'ADMIN-MASTER'))
  assert.doesNotThrow(() => assertDesk(actor(['pencairan']), 'intake', 'pencairan'))
  assert.throws(() => assertDesk(actor(['legal']), 'slik'), AuthzError)
})

test('assertDesk: Batch 8 desk split — komite-admin (session admin) is distinct from komite (membership)', () => {
  // The RM-as-sekretariat holds komite-admin (manages sessions) but NOT komite (never a member/signer).
  assert.doesNotThrow(() => assertDesk(actor(['komite-admin']), 'komite-admin'))
  // A pure Komite member cannot administer sessions…
  assert.throws(() => assertDesk(actor(['komite']), 'komite-admin'), AuthzError)
  // …and the session admin is not granted committee membership by holding komite-admin.
  assert.throws(() => assertDesk(actor(['komite-admin']), 'komite'), AuthzError)
})

test('assertCanActOnStage: throws AuthzError when actor does not own the stage', () => {
  assert.doesNotThrow(() => assertCanActOnStage(actor(['komite']), app(5)))
  assert.throws(() => assertCanActOnStage(actor(['komite']), app(1)), AuthzError)
})

// THE headline Phase 3 guarantee: the reason legal, slik (RM bureau), and rsk-author
// are separate desks. A bureau-only user can do stage-2 SLIK work but CANNOT perform
// legal verification, and CANNOT draft the RSK at stage 4.
test('S2-RM-bureau-only actor: SLIK yes; legal-verify NO; RSK NO', () => {
  const slikOnly = actor(['slik'])
  assert.equal(canActOnDesk(slikOnly, app(2)), true) // can act at stage 2
  assert.doesNotThrow(() => assertDesk(slikOnly, 'slik')) // uploadSlik/confirmKol
  assert.throws(() => assertDesk(slikOnly, 'legal'), AuthzError) // verifyDocument denied
  assert.throws(() => assertDesk(slikOnly, 'rsk-author'), AuthzError) // saveRsk denied
})

test('canWorkStage: stages 1-4 allow early work (appStage <= owner); 5-6 are strictly at-stage', () => {
  // Stage-3 owner (LA) can work early at 1,2,3; locked once past.
  assert.equal(canWorkStage(1, 3), true)
  assert.equal(canWorkStage(3, 3), true)
  assert.equal(canWorkStage(4, 3), false)
  // Stage-2 owner can work at 1,2; not after.
  assert.equal(canWorkStage(1, 2), true)
  assert.equal(canWorkStage(3, 2), false)
  // Stages 5 & 6 strictly at-stage (no early committee/disbursement).
  assert.equal(canWorkStage(4, 5), false)
  assert.equal(canWorkStage(5, 5), true)
  assert.equal(canWorkStage(5, 6), false)
  assert.equal(canWorkStage(6, 6), true)
})

// RM-led redesign (ADR-0020 §2): the Inisiasi desks (intake · slik · legal · appraisal · muap-author)
// now work PHASE-WIDE across the whole Inisiasi phase (stages 1–3, phaseOf===1), replacing the
// narrower per-stage windows and the legal/appraisal Stage-2-3 special case. Desks at stage 4–6
// (rsk-author / komite / pencairan) are UNCHANGED. hasDesk still gates.
test('canWorkDeskNow: Inisiasi desks work phase-wide (stages 1–3); RSK/Komite/Pencairan unchanged', () => {
  // intake now spans the whole Inisiasi phase (1–3), not just Stage 1.
  assert.equal(canWorkDeskNow(actor(['intake']), app(1), 'intake'), true)
  assert.equal(canWorkDeskNow(actor(['intake']), app(2), 'intake'), true) // widened
  assert.equal(canWorkDeskNow(actor(['intake']), app(3), 'intake'), true) // widened
  assert.equal(canWorkDeskNow(actor(['intake']), app(4), 'intake'), false) // locked past Inisiasi
  // slik (RM bureau) spans Inisiasi 1–3, locks at Stage 4.
  assert.equal(canWorkDeskNow(actor(['slik']), app(1), 'slik'), true)
  assert.equal(canWorkDeskNow(actor(['slik']), app(3), 'slik'), true) // widened (was false)
  assert.equal(canWorkDeskNow(actor(['slik']), app(4), 'slik'), false) // past Inisiasi
  // legal/appraisal now ALSO open at Stage 1 (phase-wide), still locked at Stage 4.
  assert.equal(canWorkDeskNow(actor(['legal']), app(1), 'legal'), true) // widened (was false)
  assert.equal(canWorkDeskNow(actor(['legal']), app(2), 'legal'), true)
  assert.equal(canWorkDeskNow(actor(['legal']), app(3), 'legal'), true)
  assert.equal(canWorkDeskNow(actor(['legal']), app(4), 'legal'), false)
  assert.equal(canWorkDeskNow(actor(['appraisal']), app(1), 'appraisal'), true) // widened (was false)
  assert.equal(canWorkDeskNow(actor(['appraisal']), app(3), 'appraisal'), true)
  assert.equal(canWorkDeskNow(actor(['appraisal']), app(4), 'appraisal'), false)
  // muap-author spans Inisiasi 1–3, locks at Stage 4.
  assert.equal(canWorkDeskNow(actor(['muap-author']), app(1), 'muap-author'), true)
  assert.equal(canWorkDeskNow(actor(['muap-author']), app(3), 'muap-author'), true)
  assert.equal(canWorkDeskNow(actor(['muap-author']), app(4), 'muap-author'), false)
  // UNCHANGED — stage 4–6 desks keep their windows.
  assert.equal(canWorkDeskNow(actor(['rsk-author']), app(2), 'rsk-author'), true) // early
  assert.equal(canWorkDeskNow(actor(['rsk-author']), app(5), 'rsk-author'), false) // past
  // hasDesk still gates: a muap-author does NOT hold legal.
  assert.equal(canWorkDeskNow(actor(['muap-author']), app(1), 'legal'), false) // not held
  assert.doesNotThrow(() => assertCanWorkDesk(actor(['muap-author']), app(1), 'muap-author')) // early ok
  assert.throws(() => assertCanWorkDesk(actor(['muap-author']), app(4), 'muap-author'), AuthzError) // past
})

test('canParticipate: observer (MG only) is read-only; only a pipeline-desk holder participates', () => {
  assert.equal(canParticipate(actor(['MG'])), false)
  assert.equal(canParticipate(actor(['muap-author'])), true)
  assert.equal(canParticipate(actor(['MG', 'muap-author'])), true)
  assert.equal(canParticipate(superadmin), false)
})

test('assertCanParticipate: throws AuthzError for a pure observer, passes otherwise', () => {
  assert.throws(() => assertCanParticipate(actor(['MG'])), AuthzError)
  assert.throws(() => assertCanParticipate(actor([])), AuthzError) // deskless = read-only
  assert.doesNotThrow(() => assertCanParticipate(actor(['muap-author'])))
  assert.throws(() => assertCanParticipate(superadmin), AuthzError) // read-only superadmin = observer
})

test('actingRolesForStage: stage-2 holder of both desks → both roles deduped; none-owned → []', () => {
  assert.deepEqual(actingRolesForStage(actor(['legal', 'slik']), app(2)), ['LG', 'RM'])
  assert.deepEqual(actingRolesForStage(actor(['slik']), app(2)), ['RM'])
  assert.deepEqual(actingRolesForStage(actor(['muap-author']), app(3)), ['RM'])
  assert.deepEqual(actingRolesForStage(actor(['intake']), app(3)), []) // not a stage-3 owner
  assert.deepEqual(actingRolesForStage(superadmin, app(2)), []) // read-only superadmin owns no stage
})

// Compliance-core: the OJK audit trail must show WHO really acted under impersonation.
test('auditUserName: plain name normally; "(a.n. Superadmin <real>)" while impersonating', () => {
  assert.equal(auditUserName(actor(['muap-author'])), 'Tester')
  const impersonating: Actor = {
    ...actor(['muap-author']),
    name: 'Budi',
    impersonating: { realSuperadminId: 's-1', realName: 'Luthfi' },
  }
  assert.equal(auditUserName(impersonating), 'Budi (a.n. Superadmin Luthfi)')
})

// Phase B (configurability-and-admin): the cross-cutting ADMIN-* desks are non-stage and
// orthogonal to the pipeline — they must NOT grant any workflow power.
test('admin desks: non-stage, cannot act on any stage, are NOT workflow participants', () => {
  const adminUsers = actor(['ADMIN-USERS'])
  const adminMaster = actor(['ADMIN-MASTER'])
  // No stage ownership → cannot act on any application stage.
  for (let s = 1; s <= 6; s++) {
    assert.equal(canActOnDesk(adminUsers, app(s)), false)
  }
  // Not workflow participants (would otherwise wrongly pass the AI/discussion/doc gates).
  assert.equal(canParticipate(adminUsers), false)
  assert.equal(canParticipate(adminMaster), false)
  // But an actor who holds BOTH an admin desk and a pipeline desk still participates.
  assert.equal(canParticipate(actor(['ADMIN-USERS', 'muap-author'])), true)
  // A read-only superadmin (admin + MG desks) is NOT a participant and acts on no stage.
  assert.equal(canParticipate(superadmin), false)
  assert.equal(canActOnDesk(superadmin, app(3)), false)
})

// ADR (superadmin read-only): a real superadmin holds ONLY the ADMIN-* desks + MG observer, so it is
// read-only across the whole pipeline (acts only by impersonating). It RETAINS admin power + the view.
test('superadmin: read-only on the workflow, retains admin desks + observer view', () => {
  for (let s = 1; s <= 6; s++) assert.equal(canActOnDesk(superadmin, app(s)), false)
  assert.equal(canParticipate(superadmin), false)
  assert.equal(effectiveRole(superadmin, app(2)), null)
  assert.deepEqual(actingRolesForStage(superadmin, app(3)), [])
  assert.throws(() => assertDesk(superadmin, 'legal'), AuthzError)
  assert.throws(() => assertDesk(superadmin, 'komite'), AuthzError)
  // Admin gates pass via the held ADMIN-* desks; the MG observer view is retained.
  assert.doesNotThrow(() => assertDesk(superadmin, 'ADMIN-USERS'))
  assert.doesNotThrow(() => assertDesk(superadmin, 'ADMIN-MASTER'))
  assert.doesNotThrow(() => assertDesk(superadmin, 'ADMIN-POLICY'))
  assert.equal(hasDesk(superadmin, 'MG'), true)
})

test('primaryRole: MG wins; else lowest-stage desk role; deskless → MG (read-only)', () => {
  assert.equal(primaryRole(actor(['MG', 'intake'])), 'MG') // MG dominates even with a pipeline desk
  assert.equal(primaryRole(actor(['intake', 'pencairan'])), 'RM') // lowest stage (1) wins
  assert.equal(primaryRole(actor(['rsk-author'])), 'RA')
  assert.equal(primaryRole(actor([])), 'MG') // deskless falls back to read-only
  assert.equal(primaryRole(superadmin), 'MG') // holds MG via full desk set
})
