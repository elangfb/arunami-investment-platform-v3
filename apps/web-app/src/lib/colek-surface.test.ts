import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildColekNotifications, unreadCount, type ColekNotice } from './notifications'
import { colekTargetForStream } from './colek-streams'
import type { LoanApplication } from './types'

// Pure COLEK SURFACE helpers (RM-led redesign, design Follow-up-decisions "A1 colek"): the derived
// notification builder + the stream→target-desk map that drives the Alur-kerja colek control. Pure +
// deterministic — the server resolver (server/notifications/colek-notices.ts) + the actor gate + the
// repo are covered by the action-core itests; here we lock the pure derivation a reader can reason about.

const notice = (over: Partial<ColekNotice> = {}): ColekNotice => ({
  colekId: 'colek-1',
  appId: 'FOS-001',
  nasabahName: 'Budi Santoso',
  targetDesk: 'legal',
  requestedByName: 'Rina (RM)',
  description: 'Mohon kerjakan Analisa Yuridis.',
  at: new Date('2026-06-11T03:00:00.000Z'),
  ...over,
})

test('buildColekNotifications maps one info item per open colek, keyed by colekId', () => {
  const items = buildColekNotifications([notice(), notice({ colekId: 'colek-2', targetDesk: 'appraisal' })])
  assert.equal(items.length, 2)
  assert.equal(items[0].id, 'colek-1-colek')
  assert.equal(items[0].category, 'colek')
  assert.equal(items[0].severity, 'info')
  assert.equal(items[0].appId, 'FOS-001')
  assert.equal(items[0].nasabahName, 'Budi Santoso')
  assert.equal(items[0].cta, 'Buka')
  assert.match(items[0].title, /legal/)
  assert.match(items[0].description, /Rina \(RM\)/)
  assert.match(items[0].href, /FOS-001\?view=ringkasan/)
})

test('unreadCount adds the coleks count', () => {
  const apps: LoanApplication[] = []
  const coleks = buildColekNotifications([notice(), notice({ colekId: 'c2' })])
  assert.equal(unreadCount(apps, [], [], [], undefined, coleks), 2)
  // Coleks param is optional — omitting it must not change the prior behaviour.
  assert.equal(unreadCount(apps), 0)
})

test('colekTargetForStream maps only the non-RM streams; RM/Komite streams are not colek-able', () => {
  assert.equal(colekTargetForStream('legal')?.desk, 'legal')
  assert.equal(colekTargetForStream('penilaian')?.desk, 'appraisal')
  assert.equal(colekTargetForStream('rsk')?.desk, 'rsk-author')
  // RM-owned + Komite streams carry no target (you do not colek RM's own work nor administered Komite).
  for (const id of ['dokumen', 'biro', 'analisa', 'muap', 'komite', 'pencairan']) {
    assert.equal(colekTargetForStream(id), null, `${id} should not be colek-able`)
  }
})
