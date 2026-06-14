import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ownersFromUsers } from './stage-owners'
import { DESK_FOR_STAGE, ROLE_OF_DESK, type Desk } from './desks'
import type { Stage } from './types'

// Grant-based auto-assignment resolver (Wave 2). The whole point: resolve stage owners from a
// user's ACTUAL effective desks, so an admin-granted user — NOT just a seed user — lands the app on
// their Home Kanban when it enters a stage they own.

test('ownersFromUsers — a holder of a stage-owning desk is returned with that desk role; non-holders excluded', () => {
  for (let s = 1; s <= 6; s++) {
    const stage = s as Stage
    const owningDesk = DESK_FOR_STAGE[stage][0]
    const holder = { id: `u${s}`, name: `u${s}`, desks: [owningDesk] }
    const stranger = { id: 'x', name: 'x', desks: ['ADMIN-MASTER' as Desk] }
    assert.deepEqual(
      ownersFromUsers([holder, stranger], stage),
      [{ id: `u${s}`, name: `u${s}`, role: ROLE_OF_DESK[owningDesk] }],
      `stage ${s}: only the desk-holder owns it, with the desk's role`,
    )
  }
})

test('ownersFromUsers — grant-based, not seed: an arbitrary (non-seed) user holding the desk is resolved', () => {
  const owningDesk = DESK_FOR_STAGE[1][0]
  assert.deepEqual(
    ownersFromUsers([{ id: 'brand-new-uid', name: 'Pengguna Baru', desks: [owningDesk] }], 1),
    [{ id: 'brand-new-uid', name: 'Pengguna Baru', role: ROLE_OF_DESK[owningDesk] }],
  )
})

test('ownersFromUsers — admin-only desks own no stage; one assignment per user', () => {
  assert.deepEqual(ownersFromUsers([{ id: 'a', name: 'a', desks: ['ADMIN-USERS', 'ADMIN-POLICY'] }], 3), [])
  // Two distinct Stage-2 desk holders → two owners (one each).
  const s2 = DESK_FOR_STAGE[2]
  if (s2.length >= 2) {
    const owners = ownersFromUsers([{ id: 'p', name: 'p', desks: [s2[0]] }, { id: 'q', name: 'q', desks: [s2[1]] }], 2)
    assert.equal(owners.length, 2)
  }
})
