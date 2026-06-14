import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { getActiveRiskPolicy } from './risk-policy'
import { DEFAULT_RISK_POLICY } from '@/lib/hardGates'
import { prisma } from '../db'

// Integration test (real *_test Postgres) for the versioned risk-policy resolver: the
// highest-effective-version rule, future-dating, and the behavior-preserving fallback to the
// code default when no version is seeded. (Wiring into computeViolations is a later checkpoint.)

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await prisma.riskPolicyVersion.deleteMany({})
})

after(async () => {
  await prisma.riskPolicyVersion.deleteMany({})
  await prisma.$disconnect()
})

test('getActiveRiskPolicy — no versions → falls back to the code default (OJK 40/70/1)', async () => {
  assert.deepEqual(await getActiveRiskPolicy(), { ...DEFAULT_RISK_POLICY })
})

test('getActiveRiskPolicy — returns the active version; future versions apply only later', async () => {
  await prisma.riskPolicyVersion.create({
    data: { version: 1, dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 1, effectiveFrom: new Date('2020-01-01'), createdBy: 'system' },
  })
  await prisma.riskPolicyVersion.create({
    data: { version: 2, dsrMaxPct: 35, ltvMaxPct: 65, kolMax: 1, effectiveFrom: new Date('2027-01-01'), createdBy: 'admin', reason: 'tighten appetite' },
  })

  assert.deepEqual(await getActiveRiskPolicy(new Date('2026-06-01')), { dsrMaxPct: 40, ltvMaxPct: 70, kolMax: 1 })
  assert.deepEqual(await getActiveRiskPolicy(new Date('2027-06-01')), { dsrMaxPct: 35, ltvMaxPct: 65, kolMax: 1 })
})
