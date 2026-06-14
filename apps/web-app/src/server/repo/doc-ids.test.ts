import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pad7,
  historyDocId,
  historyId,
  conversationDocId,
  approvalStepDocId,
  assignmentDocId,
  manifestDocId,
  meetingTemplateSlotId,
  aiPromptDocId,
  approvalRoutingDocId,
  configVersionDocId,
  meetingId,
} from './doc-ids'

test('pad7 — 7-digit zero pad so lexical order == numeric order', () => {
  assert.equal(pad7(1), '0000001')
  assert.equal(pad7(42), '0000042')
  assert.equal(pad7(1234567), '1234567')
  // lexical sort matches numeric sort across a magnitude jump
  assert.deepEqual([pad7(2), pad7(10), pad7(1)].sort(), ['0000001', '0000002', '0000010'])
})

test('historyDocId is padded seq; historyId is the h-<seq>-<appId> field (separate concerns)', () => {
  assert.equal(historyDocId(3), '0000003')
  assert.equal(historyId(3, 'FOS-2026-001'), 'h-0000003-FOS-2026-001')
})

test('conversationDocId — surface-scoped padded seq (0-based)', () => {
  assert.equal(conversationDocId('discussion', 0), 'discussion__0000000')
  assert.equal(conversationDocId('assistant', 12), 'assistant__0000012')
})

test('approvalStepDocId — padded seq for [createdAt asc] total order', () => {
  assert.equal(approvalStepDocId(0), '0000000')
  assert.equal(approvalStepDocId(5), '0000005')
})

test('assignmentDocId — per-save index suffix prevents same-ms collisions (critique #30)', () => {
  const at = new Date('2026-06-13T00:00:00.000Z')
  const a = assignmentDocId(2, 'u-1', at, 0)
  const b = assignmentDocId(2, 'u-1', at, 1) // same stage/user/ms, different array position
  assert.notEqual(a, b)
  assert.equal(a, `2__u-1__${at.getTime()}__0`)
})

test('manifestDocId — content-addressed per scope; same (scope,docType,sha) collides (=dedupe)', () => {
  const appScope = { applicationId: 'FOS-1' }
  const custScope = { customerId: 'C-1' }
  const sha = 'abc123'
  assert.equal(manifestDocId(appScope, 'slik_report', sha), 'app_FOS-1__slik_report__abc123')
  // same scope+docType+sha → identical id (dedupe); different scope → different id (isolation)
  assert.equal(manifestDocId(appScope, 'ktp', sha), manifestDocId(appScope, 'ktp', sha))
  assert.notEqual(manifestDocId(appScope, 'ktp', sha), manifestDocId(custScope, 'ktp', sha))
  // docType with an unsafe char is slugged
  assert.equal(manifestDocId(appScope, 'akta/pendirian', sha), 'app_FOS-1__akta_pendirian__abc123')
})

test('meetingTemplateSlotId — (template, calendar date) idempotency key', () => {
  assert.equal(meetingTemplateSlotId('weekly-komite', new Date('2026-06-15T00:00:00.000Z')), 'weekly-komite__2026-06-15')
})

test('config doc-ids', () => {
  assert.equal(aiPromptDocId('narrative_muap', 2), 'narrative_muap__2')
  assert.equal(approvalRoutingDocId('u-5', 'muap', 3), 'u-5__muap__3')
  assert.equal(configVersionDocId(7), '7')
})

test('meetingId — MTG-YYYY-NNN', () => {
  assert.equal(meetingId(2026, 1), 'MTG-2026-001')
  assert.equal(meetingId(2026, 123), 'MTG-2026-123')
})
