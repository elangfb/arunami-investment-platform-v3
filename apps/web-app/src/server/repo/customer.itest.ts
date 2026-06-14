import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createCustomer, getCustomer, findCustomersByIdentity } from './customer'
import { resolveCustomerDedup } from '@/lib/customer-dedup'
import { prisma } from '../db'

// Integration test (real Postgres, *_test DB only — see scripts/test-integration.sh).
// Proves the Customer repo: create→read round-trip (identity + a pengurus[] aggregate
// survive) and findCustomersByIdentity returns the created row for the dedup nudge.

const NIK = '3201019999990001'
const NPWP = '099888777666555'
const NIB = '9998887776665'
const CREATED_BY = 'itest-customer'

async function clean(): Promise<void> {
  await prisma.customer.deleteMany({ where: { createdBy: CREATED_BY } })
}

before(() => {
  assert.match(process.env.DATABASE_URL ?? '', /mizan_test/, 'integration tests require a *_test DB')
})

beforeEach(clean)
after(async () => {
  await clean()
  await prisma.$disconnect()
})

test('createCustomer → getCustomer round-trips identity and a pengurus[] aggregate', async () => {
  const created = await createCustomer({
    type: 'business',
    npwp: NPWP,
    nib: NIB,
    namaUsaha: 'PT Uji Coba',
    alamat: 'Jl. Test No. 1',
    bidangUsaha: 'perdagangan',
    pengurus: [
      { nama: 'Budi', nik: '3201010101010001', jabatan: 'Direktur' },
      { nama: 'Siti', jabatan: 'Komisaris' },
    ],
    pemegangSaham: [{ nama: 'Budi', persentase: 60 }],
    createdBy: CREATED_BY,
  })
  assert.ok(created.id)
  assert.equal(created.type, 'business')

  const read = await getCustomer(created.id)
  assert.ok(read)
  assert.equal(read.npwp, NPWP)
  assert.equal(read.nib, NIB)
  assert.equal(read.namaUsaha, 'PT Uji Coba')
  assert.equal(read.bidangUsaha, 'perdagangan')
  // JSON aggregate survives the round-trip as a unit.
  assert.equal(read.pengurus?.length, 2)
  assert.equal(read.pengurus?.[0].nama, 'Budi')
  assert.equal(read.pengurus?.[0].jabatan, 'Direktur')
  assert.equal(read.pemegangSaham?.[0].persentase, 60)
})

test('getCustomer returns null for an unknown id', async () => {
  assert.equal(await getCustomer('CUST-does-not-exist'), null)
})

test('findCustomersByIdentity (business) returns the created row → resolver nudges on NPWP', async () => {
  const created = await createCustomer({ type: 'business', npwp: NPWP, nib: NIB, createdBy: CREATED_BY })

  const candidates = await findCustomersByIdentity({ type: 'business', npwp: NPWP })
  assert.ok(candidates.some((c) => c.id === created.id))

  const r = resolveCustomerDedup({ type: 'business', npwp: NPWP }, candidates)
  assert.deepEqual(r.matches.map((m) => m.id), [created.id])
  assert.equal(r.reason, 'npwp')
})

test('findCustomersByIdentity (individual) finds by NIK; no match returns empty', async () => {
  const created = await createCustomer({ type: 'individual', nik: NIK, nama: 'Budi', createdBy: CREATED_BY })

  const hit = await findCustomersByIdentity({ type: 'individual', nik: NIK })
  assert.ok(hit.some((c) => c.id === created.id))

  const miss = await findCustomersByIdentity({ type: 'individual', nik: '3201010000000000' })
  assert.equal(miss.some((c) => c.id === created.id), false)
})

test('findCustomersByIdentity returns empty when no identity key is supplied', async () => {
  await createCustomer({ type: 'individual', nik: NIK, createdBy: CREATED_BY })
  assert.deepEqual(await findCustomersByIdentity({ type: 'individual' }), [])
})
