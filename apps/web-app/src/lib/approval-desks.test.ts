import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvalRoleForActor, DESK_OF_APPROVAL_ROLE } from './approval-desks'
import type { ApprovalChain, ApprovalRole, ApprovalStepEntry } from './approval-chain'
import type { Desk } from './desks'

function e(chain: ApprovalChain, role: ApprovalRole, action: 'request' | 'approve' | 'reject', userId: string): ApprovalStepEntry {
  return { chain, role, action, userId }
}

test('DESK_OF_APPROVAL_ROLE maps every ladder role to a distinct desk', () => {
  const desks = Object.values(DESK_OF_APPROVAL_ROLE)
  assert.equal(new Set(desks).size, desks.length, 'each role maps to a unique desk')
})

test('approvalRoleForActor — request resolves to the author only if its desk is held', () => {
  assert.equal(approvalRoleForActor('muap', 'request', [], ['muap-author'] as Desk[]), 'muap-author')
  assert.equal(approvalRoleForActor('muap', 'request', [], ['muap-tl'] as Desk[]), null)
  assert.equal(approvalRoleForActor('rsk', 'request', [], ['rsk-author'] as Desk[]), 'rsk-author')
})

test('approvalRoleForActor — approve resolves to the awaited rung only if that desk is held', () => {
  const ledger = [e('muap', 'muap-author', 'request', 'rm')] // awaiting muap-approve-tl
  assert.equal(approvalRoleForActor('muap', 'approve', ledger, ['muap-tl'] as Desk[]), 'muap-approve-tl')
  // RTL holds a desk from another chain's rung → null (the awaited desk must be held)
  assert.equal(approvalRoleForActor('muap', 'approve', ledger, ['rsk-rtl'] as Desk[]), null)
})

test('approvalRoleForActor — null when no chain is awaiting (idle/complete)', () => {
  assert.equal(approvalRoleForActor('muap', 'approve', [], ['muap-tl'] as Desk[]), null)
  const done = [
    e('muap', 'muap-author', 'request', 'rm'),
    e('muap', 'muap-approve-tl', 'approve', 'tl'),
  ]
  assert.equal(approvalRoleForActor('muap', 'approve', done, ['muap-tl'] as Desk[]), null)
})

test('approvalRoleForActor — a holder of all desks (superadmin) always resolves the awaited rung', () => {
  const all = Object.values(DESK_OF_APPROVAL_ROLE)
  const afterRequest = [e('rsk', 'rsk-author', 'request', 'ra')]
  assert.equal(approvalRoleForActor('rsk', 'approve', afterRequest, all), 'rsk-approve-rtl')
})
