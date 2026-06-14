import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectAcceptedType } from './documents'

// Content-type spoofing guard: the stored content-type is derived from the bytes
// (file-type), and must be one of the accepted document types — the client-declared
// MIME is never trusted.

test('detectAcceptedType — returns the byte-derived MIME for accepted types', async () => {
  assert.equal(await detectAcceptedType(Buffer.from('%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\n')), 'application/pdf')
  // minimal 1x1 PNG (signature + IHDR chunk)
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  ])
  assert.equal(await detectAcceptedType(png), 'image/png')
  // JFIF JPEG
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0])
  assert.equal(await detectAcceptedType(jpg), 'image/jpeg')
})

test('detectAcceptedType — recognized but NOT-allowed type → null', async () => {
  // a real GIF (GIF89a) is a valid image but not in the document allow-list
  assert.equal(await detectAcceptedType(Buffer.from('GIF89a\x01\x00\x01\x00')), null)
})

test('detectAcceptedType — unrecognized / spoofed / empty → null (no throw)', async () => {
  assert.equal(await detectAcceptedType(Buffer.from('this is just plain text, not a document')), null)
  assert.equal(await detectAcceptedType(Buffer.from([])), null)
})
