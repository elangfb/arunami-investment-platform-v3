import { test } from 'node:test'
import assert from 'node:assert/strict'
import { type Actor } from './can'
import { canEditDoc, canViewDoc, driveRoleForDoc, isDocFrozen } from './doc-access'
import type { Desk } from '../desks'
import type { LoanApplication } from '../types'

const actor = (desks: Desk[], impersonating?: Actor['impersonating']): Actor => ({
  userId: 'u-1',
  name: 'Tester',
  avatarInitials: 'T',
  desks,
  isSuperadmin: false,
  impersonating,
})
const app = (stage: number, komiteDecision?: LoanApplication['komiteDecision']) =>
  ({ stage, komiteDecision } as Pick<LoanApplication, 'stage' | 'komiteDecision'>)

test('MUAP: muap-author is writer ONLY at Stage 3 (exact-stage), reader otherwise', () => {
  const rm = actor(['muap-author'])
  assert.equal(driveRoleForDoc(rm, app(1), 'muap'), 'reader') // not yet authored — viewer, not writer
  assert.equal(driveRoleForDoc(rm, app(2), 'muap'), 'reader')
  assert.equal(driveRoleForDoc(rm, app(3), 'muap'), 'writer') // the one editable window
  assert.equal(driveRoleForDoc(rm, app(4), 'muap'), 'reader') // FROZEN on advance to Risk → viewer
  assert.equal(canEditDoc(rm, app(3), 'muap'), true)
  assert.equal(canEditDoc(rm, app(4), 'muap'), false)
})

test('READ is universal (2026.06.10): EVERY authenticated desk has at least read on both docs', () => {
  // Every desk — even unrelated ones (pencairan, intake, MG observer) — gets a non-null role on both
  // docs. The detail nav is audit-first; least-privilege now lives in the writer gate + account
  // provisioning, not per-doc ACLs. (Makers get writer in their window; everyone else reader.)
  for (const d of ['rsk-author', 'komite', 'muap-tl', 'rsk-rtl', 'pencairan', 'intake', 'MG'] as Desk[]) {
    assert.notEqual(driveRoleForDoc(actor([d]), app(3), 'muap'), null, `${d} can read MUAP`)
    assert.notEqual(driveRoleForDoc(actor([d]), app(4), 'rsk'), null, `${d} can read RSK`)
  }
  // Non-maker desks get exactly reader (no accidental write); canViewDoc is universally true.
  assert.equal(driveRoleForDoc(actor(['pencairan']), app(3), 'muap'), 'reader')
  assert.equal(driveRoleForDoc(actor(['intake']), app(4), 'rsk'), 'reader')
  assert.equal(canViewDoc(actor(['intake']), 'muap'), true)
  assert.equal(canViewDoc(actor(['pencairan']), 'rsk'), true)
})

test('RSK: rsk-author is writer ONLY at Stage 4 until submitted (exact-stage), reader otherwise', () => {
  const ra = actor(['rsk-author'])
  assert.equal(driveRoleForDoc(ra, app(1), 'rsk'), 'reader') // do-it-early RSK editing is gone
  assert.equal(driveRoleForDoc(ra, app(3), 'rsk'), 'reader') // RSK is grounded in the FINAL MUAP, not Stage 3
  assert.equal(driveRoleForDoc(ra, app(4), 'rsk'), 'writer') // the one editable window
  assert.equal(driveRoleForDoc(ra, app(5), 'rsk'), 'reader') // submitted to committee (stage ≥ 5)
  assert.equal(driveRoleForDoc(ra, app(4, 'approve'), 'rsk'), 'reader') // decision recorded → frozen
})

test('isDocFrozen — MUAP freezes after Stage 3; RSK after Stage 4 or a recorded decision (Batch 3 T2)', () => {
  assert.equal(isDocFrozen(app(3), 'muap'), false, 'MUAP editable at Stage 3')
  assert.equal(isDocFrozen(app(4), 'muap'), true, 'MUAP frozen once advanced to Risk')
  assert.equal(isDocFrozen(app(4), 'rsk'), false, 'RSK editable at Stage 4')
  assert.equal(isDocFrozen(app(3), 'rsk'), true, 'RSK frozen at Stage 3 (T7: re-froze on a send-back regress)')
  assert.equal(isDocFrozen(app(5), 'rsk'), true, 'RSK frozen at committee')
  assert.equal(isDocFrozen(app(4, 'approve'), 'rsk'), true, 'RSK frozen once a decision is recorded')
})

test('one-editable-doc: at every stage, an actor holding BOTH maker desks can edit at most one doc', () => {
  const both = actor(['muap-author', 'rsk-author'])
  for (let stage = 1; stage <= 6; stage++) {
    const editable = (['muap', 'rsk'] as const).filter((k) => canEditDoc(both, app(stage), k))
    assert.ok(editable.length <= 1, `stage ${stage}: ${editable.join('+')} editable simultaneously`)
  }
  // and the windows are exactly Stage 3 (MUAP) and Stage 4 (RSK)
  assert.deepEqual((['muap', 'rsk'] as const).filter((k) => canEditDoc(both, app(3), k)), ['muap'])
  assert.deepEqual((['muap', 'rsk'] as const).filter((k) => canEditDoc(both, app(4), k)), ['rsk'])
})

test('RSK: the RTL checker + DPS reviewer + komite read — and so does the MUAP-author (universal read)', () => {
  for (const d of ['komite', 'rsk-rtl', 'dps-review'] as Desk[]) {
    assert.equal(driveRoleForDoc(actor([d]), app(4), 'rsk'), 'reader', `${d} reads RSK`)
  }
  // The MUAP-author (RM) now READS the RSK (reader) — the fix for the "request access" wall — but
  // still cannot EDIT it (writer stays rsk-author-at-Stage-4). Independence is preserved on editing.
  assert.equal(driveRoleForDoc(actor(['muap-author']), app(4), 'rsk'), 'reader')
  assert.equal(canEditDoc(actor(['muap-author']), app(4), 'rsk'), false)
})

// Impersonation: the WRITER/READER decision is made from the desks the superadmin is
// acting AS (the impersonated identity carries the target's desks). Resolving the grant
// to the real superadmin's email is the server's job (server/docs/access.ts itest).
test('impersonation: role follows the impersonated desks, not the superadmin flag', () => {
  const asMuapAuthor = actor(['muap-author'], { realSuperadminId: 'sa-1', realName: 'Luthfi' })
  assert.equal(driveRoleForDoc(asMuapAuthor, app(3), 'muap'), 'writer') // exact-stage edit window
  // Impersonating a pure observer desk → reader (universal read), exactly like a real holder of it.
  const asObserver = actor(['MG'], { realSuperadminId: 'sa-1', realName: 'Luthfi' })
  assert.equal(driveRoleForDoc(asObserver, app(3), 'muap'), 'reader')
})
