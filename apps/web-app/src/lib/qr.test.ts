import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrVerifyUrl, qrImageUrl } from './qr'

test('qrVerifyUrl — relative for in-app links, absolute for the QR payload', () => {
  assert.equal(qrVerifyUrl('abc'), '/qr/abc')
  assert.equal(qrVerifyUrl('abc', 'https://mizan.hijra.id'), 'https://mizan.hijra.id/qr/abc')
  // trailing slash on the base is normalized
  assert.equal(qrVerifyUrl('abc', 'https://mizan.hijra.id/'), 'https://mizan.hijra.id/qr/abc')
})

test('qrImageUrl — encodes the absolute verify URL into the render-API query', () => {
  const url = qrImageUrl('tok123', 'https://mizan.hijra.id', 300)
  assert.match(url, /^https:\/\/api\.qrserver\.com\/v1\/create-qr-code\/\?size=300x300&data=/)
  // the verify URL is URL-encoded as the data payload (opaque, no PII)
  assert.ok(url.includes(encodeURIComponent('https://mizan.hijra.id/qr/tok123')))
})
