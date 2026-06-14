import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { appendScanEntries, listManifest, latestPerDocType } from './source-manifest'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for the source-doc manifest repo (scripts/test-integration-firestore.sh).

const APP = { applicationId: 'FS-MAN-APP-1' }
const CUST = { customerId: 'FS-MAN-CUST-1' }

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('appendScanEntries — dedups by (docType, sha256) within a scope', async () => {
  const r1 = await appendScanEntries(APP, 'u1', [
    { docType: 'ktp', fullPath: '/a/ktp.pdf', sha256: 'sha-a' },
    { docType: 'npwp', fullPath: '/a/npwp.pdf', sha256: 'sha-b' },
  ])
  assert.deepEqual(r1, { added: 2, deduped: 0 })

  // Re-scanning unchanged bytes → all deduped (content-addressed doc-id collision pre-read).
  const r2 = await appendScanEntries(APP, 'u1', [
    { docType: 'ktp', fullPath: '/a/ktp.pdf', sha256: 'sha-a' },
    { docType: 'npwp', fullPath: '/a/npwp.pdf', sha256: 'sha-b' },
  ])
  assert.deepEqual(r2, { added: 0, deduped: 2 })
})

test('latestPerDocType — a CHANGED sha is a new version; head is the newest', async () => {
  await appendScanEntries(APP, 'u1', [{ docType: 'slik', fullPath: '/s1', sha256: 'v1' }])
  await appendScanEntries(APP, 'u1', [{ docType: 'slik', fullPath: '/s2', sha256: 'v2' }])
  const all = await listManifest(APP)
  assert.equal(all.filter((m) => m.docType === 'slik').length, 2) // both versions kept
  const head = await latestPerDocType(APP)
  assert.equal(head.get('slik')?.sha256, 'v2') // newest wins
})

test('listManifest — oldest-first', async () => {
  await appendScanEntries(APP, 'u1', [{ docType: 'a', fullPath: '/a', sha256: '1' }])
  await appendScanEntries(APP, 'u1', [{ docType: 'b', fullPath: '/b', sha256: '2' }])
  const rows = await listManifest(APP)
  assert.deepEqual(rows.map((r) => r.docType), ['a', 'b'])
})

test('scope isolation — same (docType, sha) under app vs customer scope are NOT deduped', async () => {
  await appendScanEntries(APP, 'u1', [{ docType: 'ktp', fullPath: '/x', sha256: 'same' }])
  const r = await appendScanEntries(CUST, 'u1', [{ docType: 'ktp', fullPath: '/x', sha256: 'same' }])
  assert.deepEqual(r, { added: 1, deduped: 0 })
  assert.equal((await listManifest(APP)).length, 1)
  assert.equal((await listManifest(CUST)).length, 1)
})
