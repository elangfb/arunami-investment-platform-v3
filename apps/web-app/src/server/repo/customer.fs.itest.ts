import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  createCustomer,
  getCustomer,
  updateCustomerContextMd,
  findCustomersByIdentity,
  listCustomers,
  getCustomerWithApplications,
  findCustomerDedupMatches,
} from './customer'
import { createApplication } from './write'
import { clearFirestore, makeApp } from './fs-test-helpers'

// Firestore-emulator itest for the customer repo (scripts/test-integration-firestore.sh).

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('createCustomer → getCustomer round-trip incl. JSON aggregates', async () => {
  const c = await createCustomer({
    type: 'business',
    npwp: '01.234.567.8-901.000',
    nib: 'NIB-1',
    namaUsaha: 'PT Maju',
    pengurus: [{ nama: 'Budi', jabatan: 'Direktur' }],
    pemegangSaham: [{ nama: 'Budi', persentase: 60 }],
    createdBy: 'rm1',
  })
  const got = await getCustomer(c.id)
  assert.equal(got?.namaUsaha, 'PT Maju')
  assert.deepEqual(got?.pengurus, [{ nama: 'Budi', jabatan: 'Direktur' }])
  assert.deepEqual(got?.pemegangSaham, [{ nama: 'Budi', persentase: 60 }])
  assert.equal(got?.extractionExtras, null) // omit-when-null asymmetry → absent → null (critique #1)
})

test('findCustomersByIdentity — per-key match, unioned; empty when no key', async () => {
  const ind = await createCustomer({ type: 'individual', nik: '3201xxx', nama: 'Siti', createdBy: 'rm1' })
  const biz = await createCustomer({ type: 'business', npwp: 'NP-9', nib: 'NIB-9', namaUsaha: 'CV X', createdBy: 'rm1' })

  const byNik = await findCustomersByIdentity({ type: 'individual', nik: '3201xxx' })
  assert.ok(byNik.some((m) => m.id === ind.id))
  const byNib = await findCustomersByIdentity({ type: 'business', npwp: 'NP-9', nib: 'NIB-9' })
  assert.ok(byNib.some((m) => m.id === biz.id))
  assert.deepEqual(await findCustomersByIdentity({ type: 'individual' }), []) // no key → []
})

test('updateCustomerContextMd — blank normalises to null', async () => {
  const c = await createCustomer({ type: 'individual', nik: 'n1', nama: 'A', createdBy: 'rm1' })
  const u1 = await updateCustomerContextMd(c.id, '  catatan penting  ')
  assert.equal(u1.contextMd, '  catatan penting  ')
  const u2 = await updateCustomerContextMd(c.id, '   ')
  assert.equal(u2.contextMd, null)
})

test('listCustomers + getCustomerWithApplications — applicationCount via aggregate; apps use BARE loader (#13)', async () => {
  const c = await createCustomer({ type: 'individual', nik: 'nX', nama: 'Nasabah', createdBy: 'rm1' })
  await createApplication(makeApp('FS-CUST-APP-1'), { customerId: c.id })
  await createApplication(makeApp('FS-CUST-APP-2'), { customerId: c.id })

  const list = await listCustomers()
  assert.equal(list.find((r) => r.id === c.id)?.applicationCount, 2)

  const withApps = await getCustomerWithApplications(c.id)
  assert.equal(withApps?.applications.length, 2)
  // Bare loader parity: no checkpoint / no enrichment attached (unlike getApplication).
  assert.equal(withApps?.applications[0].decisionCheckpoint, null)
  assert.equal(withApps?.applications[0].scheduledMeeting, undefined)
  assert.equal(withApps?.applications[0].slaTargetDays, undefined)

  const dedup = await findCustomerDedupMatches({ type: 'individual', nik: 'nX' })
  assert.equal(dedup.find((m) => m.id === c.id)?.applicationCount, 2)
})
