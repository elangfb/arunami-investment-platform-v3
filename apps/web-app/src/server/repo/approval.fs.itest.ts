import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { appendApprovalStep, loadApprovalSteps, verifyQrToken } from './approval'
import { createApplication, ConcurrencyError } from './write'
import { clearFirestore, makeApp } from './fs-test-helpers'

// Firestore-emulator itest for the append-only approval ledger (scripts/test-integration-firestore.sh).

const APP = 'FS-APPR-1'
before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(async () => {
  await clearFirestore()
  await createApplication(makeApp(APP, { stage: 3 }))
})

test('appendApprovalStep — request+approve mint a qrToken, reject mints none; append-only + version bump', async () => {
  const r1 = await appendApprovalStep({ appId: APP, expectedVersion: 0, chain: 'muap', role: 'muap-author', action: 'request', userId: 'rm1', userName: 'RM', audit: { action: 'MUAP diajukan', stage: 3 } })
  assert.equal(r1.version, 1)
  const r2 = await appendApprovalStep({ appId: APP, expectedVersion: 1, chain: 'muap', role: 'muap-approve-tl', action: 'approve', userId: 'tl1', userName: 'TL', audit: { action: 'MUAP disetujui', stage: 3 } })
  assert.equal(r2.version, 2)

  const steps = await loadApprovalSteps(APP, 'muap')
  assert.deepEqual(steps.map((s) => s.action), ['request', 'approve'])
  assert.ok((steps[0].qrToken?.length ?? 0) >= 20, 'request mints an unguessable qrToken')
  assert.ok((steps[1].qrToken?.length ?? 0) >= 20, 'approve mints an unguessable qrToken')

  const r3 = await appendApprovalStep({ appId: APP, expectedVersion: 2, chain: 'muap', role: 'muap-approve-tl', action: 'reject', userId: 'tl1', userName: 'TL', reason: 'kurang dokumen', audit: { action: 'MUAP ditolak', stage: 3 } })
  assert.equal(r3.version, 3)
  const after = await loadApprovalSteps(APP, 'muap')
  assert.equal(after.length, 3) // append-only: every action kept
  assert.equal(after[2].qrToken, null) // reject is not a signature
})

test('verifyQrToken — resolves a minted token to its step + application', async () => {
  await appendApprovalStep({ appId: APP, expectedVersion: 0, chain: 'rsk', role: 'rsk-author', action: 'request', userId: 'ra1', userName: 'RA', audit: { action: 'RSK diajukan', stage: 4 } })
  const steps = await loadApprovalSteps(APP, 'rsk')
  const token = steps[0].qrToken!
  const v = await verifyQrToken(token)
  assert.equal(v?.applicationId, APP)
  assert.equal(v?.step.action, 'request')
  assert.equal(v?.nasabahName, 'Test Nasabah')
  assert.equal(await verifyQrToken('unknown-token'), null)
})

test('appendApprovalStep — stale expectedVersion → ConcurrencyError, no extra step', async () => {
  await appendApprovalStep({ appId: APP, expectedVersion: 0, chain: 'muap', role: 'muap-author', action: 'request', userId: 'rm1', userName: 'RM', audit: { action: 'a', stage: 3 } }) // → v1
  await assert.rejects(
    () => appendApprovalStep({ appId: APP, expectedVersion: 0, chain: 'muap', role: 'muap-approve-tl', action: 'approve', userId: 'tl1', userName: 'TL', audit: { action: 'b', stage: 3 } }),
    ConcurrencyError,
  )
  assert.equal((await loadApprovalSteps(APP, 'muap')).length, 1) // the rejected append wrote nothing
})
