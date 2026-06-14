import { test, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { seedFirestoreConfig, seedFirestoreFactory } from '@/server/config/seed-firestore'
import { listRoles, listDeskCatalog } from '@/server/repo/users'
import { DESK_CATALOG, DEFAULT_ROLES } from '@/lib/desks'
import { getActiveRiskPolicyDetailed, createRiskPolicyVersion } from '@/server/config/risk-policy'
import { getActiveSlaTargets, createSlaPolicyVersion } from '@/server/config/sla'
import { getActiveCommitteeRooms, createCommitteeRoomsVersion } from '@/server/config/rooms'
import { getActiveDisbursementConditions, createDisbursementConditionsVersion } from '@/server/config/disbursement'
import { getActivePrompt, appendAiPromptVersion } from '@/server/config/ai-prompts'
import { createHolidayCalendarVersion, listHolidayCalendarVersions } from '@/server/config/holidays'
import { getActiveApprovalRouting } from '@/server/config/approval-routing'
import { AI_PROMPT_KEYS } from '@/lib/ai-prompts'
import { clearFirestore } from './fs-test-helpers'

// Firestore-emulator itest for the versioned-config seam (readers + seed + writers) — verifies the
// backend-routed dispatch + the fsAllocateAndCreateVersion writer + seedFirestoreConfig end-to-end.

before(() => assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'requires the Firestore emulator'))
beforeEach(clearFirestore)

test('with NO config seeded, readers fall back to code defaults (version null)', async () => {
  const rp = await getActiveRiskPolicyDetailed()
  assert.equal(rp.version, null) // code-default fallback
  assert.ok(typeof (await getActiveSlaTargets())[1] === 'number')
  assert.ok(Array.isArray(await getActiveCommitteeRooms()))
  assert.equal(await getActiveApprovalRouting('rm-x', 'muap'), null) // unconfigured → null
})

test('seedFirestoreConfig — idempotent; readers then resolve version 1', async () => {
  const r1 = await seedFirestoreConfig()
  assert.ok(r1.seeded.length > 0)
  assert.equal(r1.skipped.length, 0)
  const rp = await getActiveRiskPolicyDetailed()
  assert.equal(rp.version, 1) // freeze-at-decision now records v1, not null
  assert.ok(rp.dsrMaxPct > 0)
  for (const k of AI_PROMPT_KEYS) assert.ok((await getActivePrompt(k)).length > 0)
  // re-running is a no-op (skips existing)
  const r2 = await seedFirestoreConfig()
  assert.equal(r2.seeded.length, 0)
  assert.equal(r2.skipped.length, r1.seeded.length)
})

test('createRiskPolicyVersion — allocates v2 over the seeded v1, becomes active', async () => {
  await seedFirestoreConfig()
  await createRiskPolicyVersion({ dsrMaxPct: 35, ltvMaxPct: 65, kolMax: 2 }, 'tighten', 'admin-1')
  const rp = await getActiveRiskPolicyDetailed()
  assert.equal(rp.version, 2)
  assert.equal(rp.dsrMaxPct, 35)
  assert.equal(rp.ltvMaxPct, 65)
  assert.equal(rp.kolMax, 2)
})

test('createSlaPolicyVersion / rooms / disbursement writers allocate the next version + take effect', async () => {
  await createSlaPolicyVersion({ '1': 9, '2': 9, '3': 9, '4': 9, '5': 9, '6': 9 }, {}, 'sla v1', 'admin-1')
  assert.equal((await getActiveSlaTargets())[1], 9)

  await createCommitteeRoomsVersion(['Ruang A', 'Ruang B'], 'rooms v1', 'admin-1')
  assert.deepEqual(await getActiveCommitteeRooms(), ['Ruang A', 'Ruang B'])

  await createDisbursementConditionsVersion(['Akad ditandatangani'], 'disb v1', 'admin-1')
  assert.deepEqual(await getActiveDisbursementConditions(), ['Akad ditandatangani'])
})

test('appendAiPromptVersion writer — new instruction becomes active for the key', async () => {
  const key = AI_PROMPT_KEYS[0]
  await appendAiPromptVersion({ promptKey: key, systemInstruction: 'Instruksi kustom yang cukup panjang.', effectiveFrom: new Date(), reason: null, createdBy: 'admin-1' })
  assert.equal(await getActivePrompt(key), 'Instruksi kustom yang cukup panjang.')
})

test('createHolidayCalendarVersion writer — persists the added override version', async () => {
  await createHolidayCalendarVersion({ added: ['2026-08-17'], removed: [], createdBy: 'admin-1' })
  const versions = await listHolidayCalendarVersions()
  assert.equal(versions.length, 1)
  assert.equal(versions[0].version, 1)
  assert.ok(versions[0].added.includes('2026-08-17'))
})

test('seedFirestoreFactory — greenfield seeds desks + roles + config v1; readers resolve them', async () => {
  const r = await seedFirestoreFactory()
  assert.equal(r.desks.upserted, DESK_CATALOG.length)
  assert.equal(r.roles.upserted, DEFAULT_ROLES.length)
  assert.ok(r.config.seeded.length > 0)

  const desks = await listDeskCatalog()
  assert.equal(desks.length, DESK_CATALOG.length)
  assert.deepEqual(desks.map((d) => d.desk).sort(), DESK_CATALOG.map((d) => d.desk).sort())

  const roles = await listRoles()
  assert.equal(roles.length, DEFAULT_ROLES.length)
  const rm = roles.find((x) => x.key === 'relationship-manager')
  assert.ok(rm?.isSystem)
  assert.deepEqual([...rm.desks].sort(), [...(DEFAULT_ROLES.find((d) => d.key === 'relationship-manager')?.desks ?? [])].sort())

  // config v1 resolved (not the code-default fallback)
  const rp = await getActiveRiskPolicyDetailed()
  assert.equal(rp.version, 1)
})

test('seedFirestoreFactory — idempotent re-run (no duplicate desks/roles, config skipped)', async () => {
  await seedFirestoreFactory()
  const r2 = await seedFirestoreFactory()
  assert.equal(r2.desks.pruned, 0)
  assert.equal(r2.roles.pruned, 0)
  assert.equal(r2.config.seeded.length, 0) // all config already present
  assert.equal((await listDeskCatalog()).length, DESK_CATALOG.length)
  assert.equal((await listRoles()).length, DEFAULT_ROLES.length)
})
