'use server'

import { requireActor } from '@/server/auth/session'
import { assertDesk } from '@/lib/auth/can'
import { parseSlaTargets, parseDeskSlaTargets } from '@/lib/config/sla-policy'
import { parseRooms } from '@/lib/config/rooms-policy'
import { parseDisbursementConditions } from '@/lib/config/disbursement-conditions'
import { createSlaPolicyVersion } from '@/server/config/sla'
import { createCommitteeRoomsVersion } from '@/server/config/rooms'
import { createDisbursementConditionsVersion } from '@/server/config/disbursement'
import { createHolidayCalendarVersion, refreshHolidaysFromApi } from '@/server/config/holidays'

// Master (reference-data) admin write actions. Gated on the ADMIN-MASTER desk (superadmin passes —
// it holds all desks). Append-only + audited per configurability-and-admin.md: each save writes a NEW
// version row (who/when/why) — never edits in place. The DB write is backend-routed through the
// server/config writers (Prisma or Firestore by DATA_BACKEND); this layer keeps the actor gate + the
// validate-before-persist guard.

export async function createSlaPolicyVersionAction(
  targetsInput: Record<string, number>,
  reason?: string,
  deskTargetsInput: Record<string, number> = {},
): Promise<void> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-MASTER')
  const targets = parseSlaTargets(targetsInput) // validate before it can become a version
  const deskTargets = parseDeskSlaTargets(deskTargetsInput)
  await createSlaPolicyVersion(targets, deskTargets, reason?.trim() || null, actor.userId)
}

export async function createCommitteeRoomsVersionAction(rooms: string[], reason?: string): Promise<void> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-MASTER')
  await createCommitteeRoomsVersion(parseRooms(rooms), reason?.trim() || null, actor.userId)
}

export async function createDisbursementConditionsVersionAction(conditions: string[], reason?: string): Promise<void> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-MASTER')
  await createDisbursementConditionsVersion(parseDisbursementConditions(conditions), reason?.trim() || null, actor.userId)
}

// Holiday-calendar overrides (jakarta-holiday-calendar.md): admin add/remove dates over the bundled
// national snapshot, versioned + append-only. ADMIN-MASTER (reference data).
export async function createHolidayCalendarVersionAction(
  added: string[],
  removed: string[],
  reason?: string,
): Promise<void> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-MASTER')
  await createHolidayCalendarVersion({ added, removed, reason, createdBy: actor.userId })
}

// Refresh the national holidays for `year` from the public API (best-effort). NOTE: still Prisma-bound
// (reads the active version via Prisma) — a documented firestore-mode admin gap.
export async function refreshHolidaysFromApiAction(year: number): Promise<{ ok: boolean }> {
  const actor = await requireActor()
  assertDesk(actor, 'ADMIN-MASTER')
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('Tahun tidak valid.')
  return { ok: await refreshHolidaysFromApi(year, actor.userId) }
}
