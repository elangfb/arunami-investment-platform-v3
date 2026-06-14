import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseDriveFolderRef } from './folder-ref'

// A plausible Drive folder id (28 chars, base64url alphabet incl. `-` and `_`).
const ID = '1A2b3C4d5E6f7G8h9I-jK_lMnOpQ'

test('parses the standard /drive/folders/<id> URL', () => {
  assert.equal(parseDriveFolderRef(`https://drive.google.com/drive/folders/${ID}`), ID)
})

test('parses the /drive/u/0/folders/<id> account-scoped URL', () => {
  assert.equal(parseDriveFolderRef(`https://drive.google.com/drive/u/0/folders/${ID}`), ID)
})

test('parses a URL with a trailing query string / fragment', () => {
  assert.equal(parseDriveFolderRef(`https://drive.google.com/drive/folders/${ID}?usp=sharing`), ID)
  assert.equal(parseDriveFolderRef(`https://drive.google.com/drive/folders/${ID}#x`), ID)
})

test('parses a raw folder id on its own', () => {
  assert.equal(parseDriveFolderRef(ID), ID)
})

test('trims surrounding whitespace', () => {
  assert.equal(parseDriveFolderRef(`  ${ID}  `), ID)
  assert.equal(parseDriveFolderRef(`\n https://drive.google.com/drive/folders/${ID} \t`), ID)
})

test('returns null for junk / non-folder input', () => {
  assert.equal(parseDriveFolderRef(''), null)
  assert.equal(parseDriveFolderRef('   '), null)
  assert.equal(parseDriveFolderRef('not a url'), null)
  assert.equal(parseDriveFolderRef('hello'), null) // too short to be an id
  assert.equal(parseDriveFolderRef('https://drive.google.com/file/d/' + ID + '/view'), null) // a FILE url, not a folder
  assert.equal(parseDriveFolderRef('https://example.com/x'), null)
})

test('rejects a token that is too short or too long to be a Drive id', () => {
  assert.equal(parseDriveFolderRef('abc123'), null) // 6 chars
  assert.equal(parseDriveFolderRef('a'.repeat(45)), null) // 45 chars > 44 max
})

test('rejects a raw token containing path separators or spaces', () => {
  assert.equal(parseDriveFolderRef(`${ID}/extra`), null)
  assert.equal(parseDriveFolderRef(`${ID} ${ID}`), null)
})
