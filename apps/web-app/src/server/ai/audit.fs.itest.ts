import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { recordAiInteraction } from './audit'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { clearFirestore } from '@/server/repo/fs-test-helpers'

// Firestore-emulator itest for the AI-interaction audit writer under DATA_BACKEND=firestore. Verifies
// the dispatcher routes recordAiInteraction to audit.firestore.ts (append-only, masked fields, server
// timestamp). Parity target: ai/audit.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('recordAiInteraction appends a masked audit row', async () => {
  await recordAiInteraction({
    appId: 'APP-1',
    userId: 'u-1',
    surface: 'narrative',
    maskedPrompt: 'prompt [REDACTED]',
    maskedReply: 'reply [REDACTED]',
    model: 'gemini-2.0',
  })
  const snap = await getDb().collection(COL.aiInteraction).where('applicationId', '==', 'APP-1').get()
  assert.equal(snap.size, 1)
  const d = snap.docs[0].data()
  assert.equal(d.userId, 'u-1')
  assert.equal(d.surface, 'narrative')
  assert.equal(d.maskedPrompt, 'prompt [REDACTED]')
  assert.equal(d.maskedReply, 'reply [REDACTED]')
  assert.equal(d.model, 'gemini-2.0')
  assert.ok(d.createdAt, 'createdAt server timestamp set')
})

test('each call appends a new row (append-only, never overwrites)', async () => {
  await recordAiInteraction({ appId: 'APP-2', userId: 'u-1', surface: 'assistant', maskedPrompt: 'a', maskedReply: 'b', model: 'm' })
  await recordAiInteraction({ appId: 'APP-2', userId: 'u-1', surface: 'assistant', maskedPrompt: 'c', maskedReply: 'd', model: 'm' })
  const snap = await getDb().collection(COL.aiInteraction).where('applicationId', '==', 'APP-2').get()
  assert.equal(snap.size, 2)
})
