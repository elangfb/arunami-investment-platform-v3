import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { storeDocumentFile, getDocument } from './documents'
import { ensureBucket, putDocument, sha256 } from './s3'

// Cloud Storage integration test (Firebase Storage emulator) for the document-storage path under
// STORAGE_PROVIDER=firebase — the GCS analog of documents.itest.ts (which targets S3/SeaweedFS).
// Proves the SAME functions the upload action + retrieval proxy call (storeDocumentFile → object
// store + integrity facts → getDocument) preserve bytes + SHA-256 + size + the byte-derived
// content-type across a real round-trip on Cloud Storage, that the namespaced key scheme is
// honored, and that a spoofed file is rejected BEFORE anything is stored.
//
// Run via scripts/test-integration-storage.sh (boots the storage emulator; STORAGE_PROVIDER=firebase).
// The guard refuses to run unless the emulator host is set, so it can NEVER hit real GCS.

// This file needs the Cloud Storage emulator + STORAGE_PROVIDER=firebase (scripts/test-integration-storage.sh).
// The Firestore harness (scripts/test-integration-firestore.sh) sweeps it in via the recursive **/*.fs.itest.ts
// glob but runs STORAGE_PROVIDER=stub with no storage emulator — so skip the whole suite there (not fail).
const STORAGE_READY = process.env.STORAGE_PROVIDER === 'firebase'

const APP = 'FS-DOCSTORE-1'

// A minimal but VALID single-pixel PNG (file-type needs the IHDR chunk to recognize it).
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)
const PDF_BYTES = Buffer.from('%PDF-1.4\n' + 'mizan fs itest document body '.repeat(64) + '\n%%EOF')

before(() => {
  if (!STORAGE_READY) return // suite is skipped under the Firestore harness; nothing to assert
  assert.ok(
    process.env.FIREBASE_STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST,
    'requires the Firebase Storage emulator (run via scripts/test-integration-storage.sh)',
  )
  assert.equal(process.env.STORAGE_PROVIDER, 'firebase', 'STORAGE_PROVIDER must be firebase')
})

test('ensureBucket on Cloud Storage does not throw', { skip: !STORAGE_READY }, async () => {
  await ensureBucket()
})

test('storeDocumentFile → getDocument: bytes + SHA-256 + size + content-type intact', { skip: !STORAGE_READY }, async () => {
  const docId = `${APP}-pdf`
  const file = new File([PDF_BYTES], 'ktp scan.pdf', { type: 'application/pdf' })

  // store exactly like the upload action (byte-derived content-type, not the spoofable declared one).
  const stored = await storeDocumentFile(APP, docId, file)
  assert.equal(stored.contentType, 'application/pdf')
  assert.equal(stored.sizeBytes, PDF_BYTES.length)
  assert.equal(stored.sha256, sha256(PDF_BYTES))
  assert.match(stored.storageKey, new RegExp(`^applications/${APP}/${docId}/\\d+-ktp_scan\\.pdf$`))

  // retrieve exactly like the authed proxy route.
  const fetched = await getDocument(stored.storageKey)
  assert.ok(fetched.equals(PDF_BYTES), 'retrieved bytes are byte-identical to the upload')
})

test('raw putDocument/getDocument round-trip + overwrite is last-writer-wins', { skip: !STORAGE_READY }, async () => {
  const key = `applications/${APP}/raw/object.bin`
  const v1 = Buffer.from('version one payload')
  const v2 = Buffer.from('version two payload, longer')

  const r1 = await putDocument(key, v1, 'application/octet-stream')
  assert.equal(r1.sha256, sha256(v1))
  assert.equal(r1.size, v1.length)
  assert.ok((await getDocument(key)).equals(v1))

  const r2 = await putDocument(key, v2, 'application/octet-stream')
  assert.equal(r2.sha256, sha256(v2))
  assert.ok((await getDocument(key)).equals(v2), 'overwrite replaces the object bytes')
})

test('storeDocumentFile rejects a spoofed/unsupported file BEFORE storing', { skip: !STORAGE_READY }, async () => {
  // PNG bytes named .pdf → stored as image/png (type from bytes, not the .pdf name).
  const spoof = new File([PNG_BYTES], 'malware.pdf', { type: 'application/pdf' })
  const stored = await storeDocumentFile(APP, `${APP}-spoof`, spoof)
  assert.equal(stored.contentType, 'image/png')

  // plain text is unsupported → rejected outright, nothing stored.
  const bad = new File([Buffer.from('just some text, not a document')], 'notes.pdf', { type: 'application/pdf' })
  await assert.rejects(() => storeDocumentFile(APP, `${APP}-bad`, bad), /tidak didukung|tidak cocok/)
})

test('storeDocumentFile rejects an empty file', { skip: !STORAGE_READY }, async () => {
  const empty = new File([], 'empty.pdf', { type: 'application/pdf' })
  await assert.rejects(() => storeDocumentFile(APP, `${APP}-empty`, empty), /kosong/)
})

test('getDocument throws for a missing key', { skip: !STORAGE_READY }, async () => {
  await assert.rejects(() => getDocument(`applications/${APP}/does-not-exist/nope.bin`))
})
