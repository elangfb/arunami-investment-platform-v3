import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApplication, loadApplicationForWrite, appendConversationMessages, ConcurrencyError } from './write'
import { listUnansweredMentions } from './applications'
import { prisma } from '../db'
import type { LoanApplication } from '@/lib/types'

// Integration test (real Postgres, *_test DB only — see scripts/test-integration.sh).
// Proves the ConversationMessage append write path: version-guarded appends,
// per-surface seq allocation, optional audit HistoryEntry, and aggregate hydration.

const ID = 'ITEST-CONVO-1'
const now = new Date()

function makeApp(id: string): LoanApplication {
  return {
    id,
    nasabahName: 'Test Nasabah',
    nasabahType: 'individual',
    phoneNumber: '0812',
    akadType: 'Murabahah',
    requestedPlafond: 100_000_000,
    requestedTenorMonths: 12,
    purpose: 'modal kerja',
    stage: 1,
    assignments: [],
    enteredStageAt: now,
    createdAt: now,
    createdBy: 'tester',
    hardGates: { dsr: 0, ltv: 0, kol: 1 },
    hardGateViolations: [],
    kolEntered: false,
    financialsAssessed: false,
    stage2LegalApproval: null,
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
  }
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(async () => {
  await prisma.application.deleteMany({ where: { id: ID } }) // cascade clears children
  await createApplication(makeApp(ID))
})

after(async () => {
  await prisma.application.deleteMany({ where: { id: ID } })
  await prisma.$disconnect()
})

test('appendConversationMessages — discussion append persists message, audit, and bumps version', async () => {
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)
  assert.equal(app.version, 0)

  const returned = await appendConversationMessages({
    appId: ID,
    expectedVersion: app.version ?? 0,
    surface: 'discussion',
    messages: [{ role: 'user', content: 'halo' }],
    audit: { userId: 'u1', userName: 'AO1', action: 'Pesan diskusi dikirim', stage: 1 },
  })

  assert.equal(returned.version, 1)
  assert.deepEqual(returned.aiChatHistory, [{ role: 'user', content: 'halo', authorId: null, authorName: null, mentions: [] }])
  assert.ok(returned.history.some((h) => h.action === 'Pesan diskusi dikirim'))
  assert.equal(await prisma.conversationMessage.count({ where: { applicationId: ID, surface: 'discussion' } }), 1)
})

test('appendConversationMessages — second discussion append increments seq and version', async () => {
  const first = await loadApplicationForWrite(ID)
  assert.ok(first)
  await appendConversationMessages({
    appId: ID,
    expectedVersion: first.version ?? 0,
    surface: 'discussion',
    messages: [{ role: 'user', content: 'halo' }],
    audit: { userId: 'u1', userName: 'AO1', action: 'Pesan diskusi dikirim', stage: 1 },
  })

  const reloaded = await loadApplicationForWrite(ID)
  assert.ok(reloaded)
  const returned = await appendConversationMessages({
    appId: ID,
    expectedVersion: reloaded.version ?? 0,
    surface: 'discussion',
    messages: [{ role: 'assistant', content: 'balasan' }],
    audit: { userId: 'u1', userName: 'AO1', action: 'Pesan diskusi dikirim', stage: 1 },
  })

  const rows = await prisma.conversationMessage.findMany({
    where: { applicationId: ID, surface: 'discussion' },
    orderBy: { seq: 'asc' },
    select: { seq: true },
  })
  assert.deepEqual(rows.map((r) => r.seq), [0, 1])
  assert.equal(returned.version, 2)
})

test('appendConversationMessages — assistant append persists messages without history entry', async () => {
  const baseline = await prisma.historyEntry.count({ where: { applicationId: ID } })
  const app = await loadApplicationForWrite(ID)
  assert.ok(app)

  const returned = await appendConversationMessages({
    appId: ID,
    expectedVersion: app.version ?? 0,
    surface: 'assistant',
    messages: [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ],
  })

  assert.equal(await prisma.conversationMessage.count({ where: { applicationId: ID, surface: 'assistant' } }), 2)
  assert.equal(await prisma.historyEntry.count({ where: { applicationId: ID } }), baseline)
  assert.deepEqual(returned.aiAssistantLog, [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'a' },
  ])
  assert.equal(returned.version, 1)
})

test('appendConversationMessages — stale concurrent append is rejected', async () => {
  const a = await loadApplicationForWrite(ID)
  const b = await loadApplicationForWrite(ID)
  assert.ok(a && b)

  await appendConversationMessages({
    appId: ID,
    expectedVersion: a.version ?? 0,
    surface: 'discussion',
    messages: [{ role: 'user', content: 'halo' }],
    audit: { userId: 'u1', userName: 'AO1', action: 'Pesan diskusi dikirim', stage: 1 },
  })

  await assert.rejects(
    () =>
      appendConversationMessages({
        appId: ID,
        expectedVersion: b.version ?? 0,
        surface: 'discussion',
        messages: [{ role: 'assistant', content: 'stale' }],
      }),
    ConcurrencyError,
  )

  assert.equal(await prisma.conversationMessage.count({ where: { applicationId: ID, surface: 'discussion' } }), 1)
})

test('mentions — author + mentions persist; listUnansweredMentions surfaces one notice, resolves on reply', async () => {
  // U1 posts a message @mentioning U2 → U2 has one unanswered mention on this app.
  const a1 = await loadApplicationForWrite(ID)
  assert.ok(a1)
  await appendConversationMessages({
    appId: ID,
    expectedVersion: a1.version ?? 0,
    surface: 'discussion',
    messages: [{ role: 'user', content: 'tolong cek agunannya ya', authorId: 'U1', authorName: 'User Satu', mentions: ['U2'] }],
  })
  // Persisted authorship + mentions round-trip into the domain shape.
  const hydrated = await loadApplicationForWrite(ID)
  const last = hydrated!.aiChatHistory.at(-1)!
  assert.equal(last.authorName, 'User Satu')
  assert.deepEqual(last.mentions, ['U2'])

  let notices = await listUnansweredMentions('U2')
  const mine = notices.filter((n) => n.appId === ID)
  assert.equal(mine.length, 1)
  assert.equal(mine[0].byName, 'User Satu')
  // The mentioner is not self-notified.
  assert.equal((await listUnansweredMentions('U1')).filter((n) => n.appId === ID).length, 0)

  // U2 replies in the thread → the mention self-resolves (no separate read-state).
  const a2 = await loadApplicationForWrite(ID)
  await appendConversationMessages({
    appId: ID,
    expectedVersion: a2!.version ?? 0,
    surface: 'discussion',
    messages: [{ role: 'user', content: 'sudah saya cek, aman', authorId: 'U2', authorName: 'User Dua' }],
  })
  notices = await listUnansweredMentions('U2')
  assert.equal(notices.filter((n) => n.appId === ID).length, 0)
})
