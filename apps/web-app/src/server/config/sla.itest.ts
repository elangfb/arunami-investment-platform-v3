import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { getActiveSlaTargets } from './sla'
import { SLA_TARGETS_DAYS } from '@/lib/sla-utils'
import { prisma } from '../db'

// Integration test (real *_test Postgres) for the versioned SLA-config resolver: proves the
// Json round-trip, the highest-effective-version rule through actual rows, future-dating, and
// the behavior-preserving fallback to the code constant when no version is seeded.

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await prisma.slaPolicyVersion.deleteMany({})
})

after(async () => {
  await prisma.slaPolicyVersion.deleteMany({})
  await prisma.$disconnect()
})

test('getActiveSlaTargets — no versions → falls back to the code constant', async () => {
  const targets = await getActiveSlaTargets()
  assert.deepEqual(targets, { ...SLA_TARGETS_DAYS })
})

test('getActiveSlaTargets — returns the active version; future versions apply only later', async () => {
  await prisma.slaPolicyVersion.create({
    data: { version: 1, targets: { 1: 3, 2: 5, 3: 5, 4: 5, 5: 3, 6: 5 }, effectiveFrom: new Date('2020-01-01'), createdBy: 'system' },
  })
  await prisma.slaPolicyVersion.create({
    data: { version: 2, targets: { 1: 2, 2: 4, 3: 4, 4: 4, 5: 2, 6: 4 }, effectiveFrom: new Date('2027-01-01'), createdBy: 'admin', reason: 'tighten SLAs' },
  })

  const nowTargets = await getActiveSlaTargets(new Date('2026-06-01'))
  assert.equal(nowTargets[1], 3) // v1 still active (v2 future-dated)
  assert.equal(nowTargets[2], 5)

  const futureTargets = await getActiveSlaTargets(new Date('2027-06-01'))
  assert.equal(futureTargets[1], 2) // v2 now in effect
  assert.equal(futureTargets[6], 4)
})

test('getActiveSlaTargets — a partial version is completed per-stage from the constant', async () => {
  // An admin version that only overrides stage 1 — other stages fall back to the constant.
  await prisma.slaPolicyVersion.create({
    data: { version: 1, targets: { 1: 1 }, effectiveFrom: new Date('2020-01-01'), createdBy: 'admin' },
  })
  const targets = await getActiveSlaTargets()
  assert.equal(targets[1], 1) // overridden
  assert.equal(targets[2], SLA_TARGETS_DAYS[2]) // filled from the constant
  assert.equal(targets[6], SLA_TARGETS_DAYS[6])
})
