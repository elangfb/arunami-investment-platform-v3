import 'server-only'

import { resolveActiveVersion } from '@/lib/config/versioned'
import { DEFAULT_COMMITTEE_ROOMS } from '@/lib/config/rooms-policy'
import { prisma } from '@/server/db'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { COL } from '@/server/firebase/collections'
import { configVersionDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import * as prismaImpl from './rooms.prisma'
import * as firestoreImpl from './rooms.firestore'

// Active committee-room list, resolved from the versioned config. Backend-routed row fetch;
// resolveActiveVersion + code-constant fallback are pure.

/** Minimal row for resolveActiveVersion (effectiveFrom MUST be a JS Date). */
export interface RoomsRow {
  version: number
  effectiveFrom: Date
  rooms: unknown
}

export interface CommitteeRoomsVersionRow {
  version: number
  rooms: string[]
  effectiveFrom: Date
  reason: string | null
  createdBy: string
  createdAt: Date
}

const fetchRoomsRows = dispatchRead(prismaImpl.fetchRoomsRows, firestoreImpl.fetchRoomsRows)
const fetchRoomsVersionRows = dispatchRead(prismaImpl.fetchRoomsVersionRows, firestoreImpl.fetchRoomsVersionRows)

export async function getActiveCommitteeRooms(at: Date = new Date()): Promise<string[]> {
  const active = resolveActiveVersion(await fetchRoomsRows(), at)
  if (!active) return [...DEFAULT_COMMITTEE_ROOMS]
  return active.rooms as string[]
}

/** All committee-room versions, newest first — for the Master tab's audit/history view. */
export async function listCommitteeRoomsVersions(): Promise<CommitteeRoomsVersionRow[]> {
  return fetchRoomsVersionRows()
}

/** Append a new committee-rooms version (backend-routed). Caller validates rooms first. */
export const createCommitteeRoomsVersion = dispatchWrite(
  'createCommitteeRoomsVersion',
  async (rooms: string[], reason: string | null, createdBy: string) => {
    const max = await prisma.committeeRoomsVersion.aggregate({ _max: { version: true } })
    await prisma.committeeRoomsVersion.create({ data: { version: (max._max.version ?? 0) + 1, rooms, effectiveFrom: new Date(), reason, createdBy } })
  },
  async (rooms: string[], reason: string | null, createdBy: string) => {
    await fsAllocateAndCreateVersion({ collection: COL.config_committeeRooms, docId: configVersionDocId, fields: { rooms }, effectiveFrom: new Date(), reason, createdBy })
  },
)
