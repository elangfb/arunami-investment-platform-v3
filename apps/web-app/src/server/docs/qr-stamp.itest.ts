import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Stub docs provider — set before any docsClient() call (node's --test isolates each file in its
// own process, so this does not leak to other itests). No DB needed.
process.env.DOCS_PROVIDER = 'stub'

import { stampSignatureQr } from './qr-stamp'
import { seedStubDoc, clearStubDocsState, stubInlineImages } from '../google/stub-clients'

beforeEach(() => clearStubDocsState())

test('stampSignatureQr — inserts the QR image at the signature NamedRange', async () => {
  const docId = seedStubDoc({ kind: 'muap', namedRanges: { nama_rm: 'RM', tanggal_ttd_tl: '' } })

  const ok = await stampSignatureQr({
    documentId: docId,
    namedRangeName: 'tanggal_ttd_tl',
    token: 'tok-xyz',
    baseUrl: 'https://mizan.hijra.id',
  })

  assert.equal(ok, true)
  const imgs = stubInlineImages(docId)
  assert.equal(imgs.length, 1, 'one inline image inserted')
  assert.ok(imgs[0].uri.includes('api.qrserver.com'), 'uses the external QR render API')
  assert.ok(
    imgs[0].uri.includes(encodeURIComponent('https://mizan.hijra.id/qr/tok-xyz')),
    'encodes the opaque verify URL as the QR payload',
  )
  assert.ok(imgs[0].index >= 1, 'placed at a resolved doc index')
})

test('stampSignatureQr — no-op (false) when the NamedRange is absent', async () => {
  const docId = seedStubDoc({ kind: 'muap', namedRanges: { nama_rm: 'RM' } })
  const ok = await stampSignatureQr({
    documentId: docId,
    namedRangeName: 'nonexistent_slot',
    token: 't',
    baseUrl: 'https://mizan.hijra.id',
  })
  assert.equal(ok, false)
  assert.equal(stubInlineImages(docId).length, 0, 'nothing inserted')
})
