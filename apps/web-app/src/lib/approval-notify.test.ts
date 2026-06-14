import { test } from 'node:test'
import assert from 'node:assert/strict'
import { awaitingApprovalNotices } from './approval-notify'
import type { ApprovalStepEntry } from './approval-chain'
import type { RoutingMap } from './approval-routing'

// The awaiting-signature notice resolver: surfaces a notice to the actor iff they hold the awaited
// rung's desk AND (the rung is unconfigured → any holder, OR the routed account is the actor).

// A MUAP chain awaiting its single checker (muap-approve-tl): a request by the maker, nothing signed.
const muapAwaitingTl: ApprovalStepEntry[] = [{ chain: 'muap', role: 'muap-author', action: 'request', userId: 'u-rm' }]

function app(approvalSteps: ApprovalStepEntry[]) {
  return [{ id: 'A1', nasabahName: 'Budi', enteredStageAt: new Date('2026-06-01'), approvalSteps }]
}
const noRouting = () => null

test('unconfigured rung → any holder of the rung desk is notified', () => {
  const notices = awaitingApprovalNotices(app(muapAwaitingTl), { userId: 'u-tl', desks: ['muap-tl'] }, noRouting)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].chain, 'muap')
  assert.equal(notices[0].role, 'muap-approve-tl')
})

test('a user who does NOT hold the awaited rung desk gets no notice', () => {
  assert.equal(awaitingApprovalNotices(app(muapAwaitingTl), { userId: 'u-rtl', desks: ['rsk-rtl'] }, noRouting).length, 0)
})

test('configured rung → only the routed account is notified', () => {
  const routingFor = (): RoutingMap => ({ 'muap-approve-tl': 'u-tl-routed' })
  assert.equal(awaitingApprovalNotices(app(muapAwaitingTl), { userId: 'u-tl-routed', desks: ['muap-tl'] }, routingFor).length, 1, 'routed TL notified')
  assert.equal(awaitingApprovalNotices(app(muapAwaitingTl), { userId: 'u-tl-other', desks: ['muap-tl'] }, routingFor).length, 0, 'a different TL desk holder is NOT notified')
})

test('an idle chain (no request) raises no notice', () => {
  assert.equal(awaitingApprovalNotices(app([]), { userId: 'u-tl', desks: ['muap-tl'] }, noRouting).length, 0)
})

test('a complete chain raises no notice', () => {
  const complete: ApprovalStepEntry[] = [
    { chain: 'muap', role: 'muap-author', action: 'request', userId: 'u-rm' },
    { chain: 'muap', role: 'muap-approve-tl', action: 'approve', userId: 'u-tl' },
  ]
  assert.equal(awaitingApprovalNotices(app(complete), { userId: 'u-tl', desks: ['muap-tl'] }, noRouting).length, 0)
})

test('RSK chain awaiting the RTL notifies an rsk-rtl desk holder', () => {
  const rskAwaitingRtl: ApprovalStepEntry[] = [{ chain: 'rsk', role: 'rsk-author', action: 'request', userId: 'u-ra' }]
  const notices = awaitingApprovalNotices(app(rskAwaitingRtl), { userId: 'u-rtl', desks: ['rsk-rtl'] }, noRouting)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].role, 'rsk-approve-rtl')
})

// N1: the SP3 single-reviewer Legal chain must push the awaited rung to the Legal-desk reviewer —
// they are not a stage owner of the deal, so the notice is the only way it surfaces on their Home.
test('SP3 chain awaiting the reviewer notifies a legal desk holder', () => {
  const sp3AwaitingLegal: ApprovalStepEntry[] = [{ chain: 'sp3', role: 'sp3-author', action: 'request', userId: 'u-rm' }]
  const notices = awaitingApprovalNotices(app(sp3AwaitingLegal), { userId: 'u-lg', desks: ['legal'] }, noRouting)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].chain, 'sp3')
  assert.equal(notices[0].role, 'sp3-legal-review')
})

test('a complete SP3 chain raises no notice (single reviewer approved)', () => {
  const sp3Complete: ApprovalStepEntry[] = [
    { chain: 'sp3', role: 'sp3-author', action: 'request', userId: 'u-rm' },
    { chain: 'sp3', role: 'sp3-legal-review', action: 'approve', userId: 'u-lg' },
  ]
  assert.equal(awaitingApprovalNotices(app(sp3Complete), { userId: 'u-lg', desks: ['legal'] }, noRouting).length, 0)
})
