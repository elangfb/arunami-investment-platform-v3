import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../db'
import { getActiveApprovalRouting, createApprovalRoutingRule, listApprovalRoutingRules } from './approval-routing'
import { routingAllowsActor } from '@/lib/approval-routing'

// Integration (real Postgres, *_test DB only): per-submitter approval routing persists, resolves to
// the active version, and the STRICT gate decision computed off the live config narrows a configured
// rung to exactly the routed account while leaving unconfigured makers on the all-holders fallback.

const MAKER = 'u-itest-route-maker'
const MAKER2 = 'u-itest-route-maker-2'

async function clean(): Promise<void> {
  await prisma.approvalRoutingRule.deleteMany({ where: { makerUserId: { in: [MAKER, MAKER2] } } })
}
before(clean)
after(clean)

test('routing round-trips; the strict gate narrows a configured rung to exactly the routed account', async () => {
  await createApprovalRoutingRule({
    makerUserId: MAKER,
    chain: 'muap',
    routing: { 'muap-approve-tl': 'u-tl' },
    createdBy: 'admin',
  })
  const routing = await getActiveApprovalRouting(MAKER, 'muap')
  assert.ok(routing, 'configured maker resolves a routing map')
  assert.equal(routingAllowsActor(routing, 'muap-approve-tl', 'u-tl', false), true, 'routed TL may sign')
  assert.equal(routingAllowsActor(routing, 'muap-approve-tl', 'u-other-tl', false), false, 'a non-routed desk holder is blocked')
  assert.equal(routingAllowsActor(routing, 'rsk-approve-rtl', 'anyone', false), true, 'a rung absent from the map stays on the all-holders fallback')
})

test('an unconfigured maker resolves to null → engine falls back to all desk holders', async () => {
  assert.equal(await getActiveApprovalRouting(MAKER2, 'muap'), null)
})

test('createApprovalRoutingRule appends versions; the highest effective version wins', async () => {
  await createApprovalRoutingRule({ makerUserId: MAKER, chain: 'rsk', routing: { 'rsk-approve-rtl': 'u-rtl1' }, effectiveFrom: new Date('2020-01-01'), createdBy: 'admin' })
  await createApprovalRoutingRule({ makerUserId: MAKER, chain: 'rsk', routing: { 'rsk-approve-rtl': 'u-rtl2' }, createdBy: 'admin' })
  const routing = await getActiveApprovalRouting(MAKER, 'rsk')
  assert.equal(routing?.['rsk-approve-rtl'], 'u-rtl2', 'the latest effective version wins')

  const listed = await listApprovalRoutingRules()
  const rskVersions = listed.filter((r) => r.makerUserId === MAKER && r.chain === 'rsk').map((r) => r.version)
  assert.deepEqual([...rskVersions].sort((a, b) => a - b), [1, 2], 'both versions retained (append-only)')
})

test('createApprovalRoutingRule rejects an SoD-violating config (self-route) before writing', async () => {
  await assert.rejects(
    () => createApprovalRoutingRule({ makerUserId: MAKER, chain: 'muap', routing: { 'muap-approve-tl': MAKER }, createdBy: 'admin' }),
    /tidak valid/,
  )
})
