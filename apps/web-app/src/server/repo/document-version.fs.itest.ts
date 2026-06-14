import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentVersion, listDocumentVersions, getDocumentVersion } from './document-version'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for DocumentVersion under DATA_BACKEND=firestore. Verifies append-only
// subcollection creates, listing, and appId-scoped by-id lookup (a versionId from another app → null).
// Parity target: document-version.prisma.ts.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

const mk = (appId: string, label: string) => ({
  applicationId: appId,
  kind: 'muap',
  docId: `doc-${label}`,
  sourceDocId: 'src',
  trigger: 'regenerate',
  label,
  createdBy: 'u-1',
  createdByName: 'RM',
})

test('create then read back by id (scoped to the app)', async () => {
  const v = await createDocumentVersion(mk('APP-1', 'snap-1'))
  assert.ok(v.id)
  assert.equal(v.applicationId, 'APP-1')
  assert.ok(v.createdAt instanceof Date)
  const got = await getDocumentVersion('APP-1', v.id)
  assert.equal(got?.label, 'snap-1')
  // A versionId from APP-1 is NOT found under APP-2's subcollection.
  assert.equal(await getDocumentVersion('APP-2', v.id), null)
})

test('listDocumentVersions returns all snapshots for the app', async () => {
  await createDocumentVersion(mk('APP-1', 'snap-1'))
  await createDocumentVersion(mk('APP-1', 'snap-2'))
  await createDocumentVersion(mk('APP-2', 'other'))
  const rows = await listDocumentVersions('APP-1')
  assert.equal(rows.length, 2)
  assert.deepEqual(new Set(rows.map((r) => r.label)), new Set(['snap-1', 'snap-2']))
})
