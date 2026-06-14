import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getApplication, listApplications, getLineage, lineageHead, listUnansweredMentions } from './applications'
import { createApplication, appendConversationMessages } from './write'
import { clearFirestore, makeApp } from './fs-test-helpers'

// Firestore-emulator itest for the application READ paths (scripts/test-integration-firestore.sh).

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('getApplication — round-trip + live enrichment (sla/risk/release defaults; no meeting/checkpoint)', async () => {
  await createApplication(makeApp('FS-RD-1'))
  const app = await getApplication('FS-RD-1')
  assert.equal(app?.id, 'FS-RD-1')
  assert.equal(app?.version, 0)
  assert.equal(typeof app?.slaTargetDays, 'number') // resolved from versioned config (code default)
  assert.ok(app?.riskPolicy && typeof app.riskPolicy.dsrMaxPct === 'number')
  assert.ok(Array.isArray(app?.releaseConditions))
  assert.equal(app?.scheduledMeeting, null) // no meeting
  assert.equal(app?.decisionCheckpoint, null) // none frozen
})

test('listApplications — returns all, createdAt asc, no checkpoint', async () => {
  await createApplication(makeApp('FS-LIST-A', { createdAt: new Date('2026-01-01') }))
  await createApplication(makeApp('FS-LIST-B', { createdAt: new Date('2026-02-01') }))
  const all = await listApplications()
  assert.deepEqual(all.map((a) => a.id), ['FS-LIST-A', 'FS-LIST-B'])
  assert.equal(all[0].decisionCheckpoint, null)
  assert.equal(typeof all[0].slaTargetDays, 'number')
})

test('getLineage / lineageHead — walks the sourceApplicationId chain', async () => {
  await createApplication(makeApp('FS-ROOT'))
  await createApplication(makeApp('FS-CHILD', { sourceApplicationId: 'FS-ROOT', createdAt: new Date('2026-03-01') }))
  const chain = await getLineage('FS-CHILD')
  assert.deepEqual(chain.map((a) => a.id), ['FS-ROOT', 'FS-CHILD']) // root-first
  const head = await lineageHead('FS-ROOT')
  assert.equal(head?.id, 'FS-CHILD') // newest cycle
})

test('listUnansweredMentions — surfaces a mention, self-resolves when the user replies', async () => {
  await createApplication(makeApp('FS-MENTION'))
  // userA mentions userB
  const r1 = await appendConversationMessages({
    appId: 'FS-MENTION', expectedVersion: 0, surface: 'discussion',
    messages: [{ role: 'user', content: 'hai @b tolong cek', authorId: 'userA', authorName: 'A', mentions: ['userB'] }],
  })
  const notices = await listUnansweredMentions('userB')
  assert.equal(notices.length, 1)
  assert.equal(notices[0].appId, 'FS-MENTION')
  assert.equal(notices[0].byName, 'A')

  // userB replies → mention resolved
  await appendConversationMessages({
    appId: 'FS-MENTION', expectedVersion: r1.version ?? 0, surface: 'discussion',
    messages: [{ role: 'user', content: 'sudah dicek', authorId: 'userB', authorName: 'B', mentions: [] }],
  })
  assert.equal((await listUnansweredMentions('userB')).length, 0)
})
