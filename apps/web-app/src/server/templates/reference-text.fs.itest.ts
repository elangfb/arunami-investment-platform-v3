import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { getReferenceText, getReferenceTextsBulk, upsertReferenceText, countReferenceTexts } from './reference-text'
import { clearFirestore } from '@/server/repo/fs-test-helpers'

// Firestore-emulator itest for the v2 reference-text cache under DATA_BACKEND=firestore. Verifies the
// router lazy-loads reference-text.firestore.ts: deterministic-id upsert (= set, idempotent), per-token
// + bulk reads, count() aggregation, and unknown-token rejection. Parity: reference-text.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('upsert then read one token', async () => {
  await upsertReferenceText({ templateId: 'muap', tokenName: 'nama_perusahaan', text: '[Nama Perusahaan]' })
  assert.equal(await getReferenceText('muap', 'nama_perusahaan'), '[Nama Perusahaan]')
  assert.equal(await getReferenceText('muap', 'nama_grup_usaha'), null, 'uncached token → null')
})

test('upsert is idempotent (same docId overwrites, no duplicate)', async () => {
  await upsertReferenceText({ templateId: 'muap', tokenName: 'nama_grup_usaha', text: 'v1' })
  await upsertReferenceText({ templateId: 'muap', tokenName: 'nama_grup_usaha', text: 'v2' })
  assert.equal(await getReferenceText('muap', 'nama_grup_usaha'), 'v2')
  assert.equal(await countReferenceTexts('muap'), 1)
})

test('bulk fetch returns only cached tokens', async () => {
  await upsertReferenceText({ templateId: 'muap', tokenName: 'nama_perusahaan', text: 'A' })
  await upsertReferenceText({ templateId: 'muap', tokenName: 'nama_grup_usaha', text: 'B' })
  const m = await getReferenceTextsBulk('muap', ['nama_perusahaan', 'nama_grup_usaha', 'alamat_kantor_nib'])
  assert.equal(m.size, 2)
  assert.equal(m.get('nama_perusahaan'), 'A')
  assert.equal(m.get('nama_grup_usaha'), 'B')
  assert.equal(m.has('alamat_kantor_nib'), false)
})

test('count is scoped per template', async () => {
  await upsertReferenceText({ templateId: 'muap', tokenName: 'nama_perusahaan', text: 'A' })
  await upsertReferenceText({ templateId: 'rsk', tokenName: 'nama_grup_usaha', text: 'B' })
  assert.equal(await countReferenceTexts('muap'), 1)
  assert.equal(await countReferenceTexts('rsk'), 1)
})

test('upsert rejects an unknown token (registry validation in the router)', async () => {
  await assert.rejects(
    () => upsertReferenceText({ templateId: 'muap', tokenName: 'not_a_real_token_xyz', text: 'x' }),
    /unknown token/,
  )
})
