import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chainRoles,
  chainState,
  nextApprover,
  isChainComplete,
  validateAction,
  type ApprovalChain,
  type ApprovalRole,
  type ApprovalAction,
  type ApprovalStepEntry,
} from './approval-chain'

// Terse ledger builder: e('muap', 'muap-author', 'request', 'u1').
function e(
  chain: ApprovalChain,
  role: ApprovalRole,
  action: ApprovalAction,
  userId: string,
): ApprovalStepEntry {
  return { chain, role, action, userId }
}

test('chainRoles — ordered author then checkers, per chain (2-rung since 2026.06.12)', () => {
  assert.deepEqual(chainRoles('muap'), ['muap-author', 'muap-approve-tl'])
  assert.deepEqual(chainRoles('rsk'), ['rsk-author', 'rsk-approve-rtl'])
})

test('chainState — empty ledger is idle', () => {
  assert.deepEqual(chainState('muap', []), { status: 'idle' })
})

test('chainState — request opens the chain awaiting the first checker', () => {
  const ledger = [e('muap', 'muap-author', 'request', 'rm')]
  assert.deepEqual(chainState('muap', ledger), { status: 'awaiting', role: 'muap-approve-tl' })
  assert.equal(nextApprover('muap', ledger), 'muap-approve-tl')
})

test('chainState — the single TL approval completes MUAP', () => {
  const ledger = [e('muap', 'muap-author', 'request', 'rm')]
  assert.deepEqual(chainState('muap', ledger), { status: 'awaiting', role: 'muap-approve-tl' })

  ledger.push(e('muap', 'muap-approve-tl', 'approve', 'tl'))
  assert.deepEqual(chainState('muap', ledger), { status: 'complete' })
  assert.equal(isChainComplete('muap', ledger), true)
  assert.equal(nextApprover('muap', ledger), null)
})

test('chainState — RSK completes at the Risk Team Leader signature', () => {
  const ledger = [e('rsk', 'rsk-author', 'request', 'ra')]
  // Requested but RTL pending → not complete yet.
  assert.deepEqual(chainState('rsk', ledger), { status: 'awaiting', role: 'rsk-approve-rtl' })
  assert.equal(isChainComplete('rsk', ledger), false)

  ledger.push(e('rsk', 'rsk-approve-rtl', 'approve', 'rtl'))
  assert.equal(isChainComplete('rsk', ledger), true)
})

test('chainState — a reject sends it back; the chain is rejected, not awaiting', () => {
  const ledger = [
    e('rsk', 'rsk-author', 'request', 'ra'),
    e('rsk', 'rsk-approve-rtl', 'reject', 'rtl'),
  ]
  assert.deepEqual(chainState('rsk', ledger), { status: 'rejected', by: 'rsk-approve-rtl' })
  assert.equal(nextApprover('rsk', ledger), null)
})

test('chainState — re-request after a reject starts a fresh cycle (prior cycle ignored)', () => {
  const ledger = [
    e('muap', 'muap-author', 'request', 'rm'),
    e('muap', 'muap-approve-tl', 'reject', 'tl'),
    e('muap', 'muap-author', 'request', 'rm'), // resubmit → new doc version upstream
  ]
  assert.deepEqual(chainState('muap', ledger), { status: 'awaiting', role: 'muap-approve-tl' })
})

test('chainState — only the latest chain is read; the two chains are independent', () => {
  const ledger = [
    e('muap', 'muap-author', 'request', 'rm'),
    e('muap', 'muap-approve-tl', 'approve', 'tl'),
    e('rsk', 'rsk-author', 'request', 'ra'),
  ]
  assert.equal(isChainComplete('muap', ledger), true)
  assert.deepEqual(chainState('rsk', ledger), { status: 'awaiting', role: 'rsk-approve-rtl' })
})

test('validateAction — only the maker may request, and only when idle/rejected', () => {
  assert.equal(validateAction('muap', [], { role: 'muap-author', action: 'request', userId: 'rm' }).ok, true)
  // a checker cannot request
  assert.equal(
    validateAction('muap', [], { role: 'muap-approve-tl', action: 'request', userId: 'tl' }).ok,
    false,
  )
  // cannot re-request while a chain is mid-approval
  const open = [e('muap', 'muap-author', 'request', 'rm')]
  assert.equal(validateAction('muap', open, { role: 'muap-author', action: 'request', userId: 'rm' }).ok, false)
  // cannot request once complete
  const done = [
    e('muap', 'muap-author', 'request', 'rm'),
    e('muap', 'muap-approve-tl', 'approve', 'tl'),
  ]
  assert.equal(validateAction('muap', done, { role: 'muap-author', action: 'request', userId: 'rm' }).ok, false)
  // but may re-request after a rejection
  const rejected = [
    e('muap', 'muap-author', 'request', 'rm'),
    e('muap', 'muap-approve-tl', 'reject', 'tl'),
  ]
  assert.equal(validateAction('muap', rejected, { role: 'muap-author', action: 'request', userId: 'rm' }).ok, true)
})

test('validateAction — only the awaited rung may approve', () => {
  const ledger = [e('muap', 'muap-author', 'request', 'rm')]
  // the author role is not the awaited checker rung
  assert.equal(
    validateAction('muap', ledger, { role: 'muap-author', action: 'approve', userId: 'x' }).ok,
    false,
  )
  // TL (the awaited rung) can
  assert.equal(
    validateAction('muap', ledger, { role: 'muap-approve-tl', action: 'approve', userId: 'tl' }).ok,
    true,
  )
})

test('validateAction — approvers must be distinct from the maker (four-eyes: RM≠TL, RA≠RTL)', () => {
  // the RM maker cannot approve their own MUAP request as TL
  const muapRequested = [e('muap', 'muap-author', 'request', 'rm')]
  assert.equal(
    validateAction('muap', muapRequested, { role: 'muap-approve-tl', action: 'approve', userId: 'rm' }).ok,
    false,
  )
  // a distinct TL is fine
  assert.equal(
    validateAction('muap', muapRequested, { role: 'muap-approve-tl', action: 'approve', userId: 'tl' }).ok,
    true,
  )
  // the RA maker cannot sign their own RSK as RTL
  const rskRequested = [e('rsk', 'rsk-author', 'request', 'ra')]
  assert.equal(
    validateAction('rsk', rskRequested, { role: 'rsk-approve-rtl', action: 'approve', userId: 'ra' }).ok,
    false,
  )
  // a distinct RTL is fine
  assert.equal(
    validateAction('rsk', rskRequested, { role: 'rsk-approve-rtl', action: 'approve', userId: 'rtl' }).ok,
    true,
  )
})

test('validateAction — reject is allowed only for the awaited rung, and never when idle', () => {
  assert.equal(
    validateAction('rsk', [], { role: 'rsk-approve-rtl', action: 'reject', userId: 'rtl' }).ok,
    false,
  )
  const open = [e('rsk', 'rsk-author', 'request', 'ra')]
  // a non-awaited role cannot reject
  assert.equal(
    validateAction('rsk', open, { role: 'rsk-author', action: 'reject', userId: 'ra' }).ok,
    false,
  )
  // the awaited RTL can reject
  assert.equal(
    validateAction('rsk', open, { role: 'rsk-approve-rtl', action: 'reject', userId: 'rtl' }).ok,
    true,
  )
})

test('chainState — a reset invalidates a complete chain → idle (revise made the doc stale)', () => {
  const ledger = [
    e('muap', 'muap-author', 'request', 'rm'),
    e('muap', 'muap-approve-tl', 'approve', 'tl'), // complete
    e('muap', 'muap-author', 'reset', 'rm'), // proposal revised → invalidate
  ]
  assert.equal(isChainComplete('muap', ledger), false)
  assert.deepEqual(chainState('muap', ledger), { status: 'idle' })
})

test('chainState — after a reset, a fresh request starts a new cycle awaiting the first checker', () => {
  const ledger = [
    e('muap', 'muap-author', 'request', 'rm'),
    e('muap', 'muap-approve-tl', 'approve', 'tl'),
    e('muap', 'muap-author', 'reset', 'rm'),
    e('muap', 'muap-author', 'request', 'rm'), // re-drafted + re-submitted
  ]
  assert.deepEqual(chainState('muap', ledger), { status: 'awaiting', role: 'muap-approve-tl' })
})

test('validateAction — a user may never propose a reset (system-only invalidation)', () => {
  const r = validateAction('muap', [], { role: 'muap-author', action: 'reset', userId: 'rm' })
  assert.equal(r.ok, false)
})

// ── SP3 single-reviewer chain (N1, docs/designs/rm-led-pipeline-redesign.md §4) ──

test('chainRoles — SP3 is a single-reviewer chain: author then one Legal reviewer', () => {
  assert.deepEqual(chainRoles('sp3'), ['sp3-author', 'sp3-legal-review'])
})

test('isChainComplete(sp3) — false before the Legal review, true after the single approve', () => {
  // requested only → awaiting the single reviewer, not complete.
  const requested = [e('sp3', 'sp3-author', 'request', 'rm')]
  assert.deepEqual(chainState('sp3', requested), { status: 'awaiting', role: 'sp3-legal-review' })
  assert.equal(isChainComplete('sp3', requested), false)
  // the single Legal reviewer approves → complete (one checker = single-reviewer chain).
  const reviewed = [...requested, e('sp3', 'sp3-legal-review', 'approve', 'lg')]
  assert.equal(isChainComplete('sp3', reviewed), true)
  assert.equal(nextApprover('sp3', reviewed), null)
})

test('validateAction(sp3) — four-eyes: the SP3 author cannot self-review', () => {
  const requested = [e('sp3', 'sp3-author', 'request', 'rm')]
  // same person who drafted/requested may not act as the Legal reviewer.
  assert.equal(
    validateAction('sp3', requested, { role: 'sp3-legal-review', action: 'approve', userId: 'rm' }).ok,
    false,
  )
  // a distinct Legal reviewer is fine.
  assert.equal(
    validateAction('sp3', requested, { role: 'sp3-legal-review', action: 'approve', userId: 'lg' }).ok,
    true,
  )
})
