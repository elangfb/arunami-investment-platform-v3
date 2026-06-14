import 'server-only'
import { COL } from '@/server/firebase/collections'
import { fetchVersionedConfigDocs } from './versioned-firestore'
import type { RoomsRow, CommitteeRoomsVersionRow } from './rooms'

export async function fetchRoomsRows(): Promise<RoomsRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_committeeRooms)
  return rows.map((d) => ({ version: d.version as number, effectiveFrom: d.effectiveFrom as Date, rooms: d.rooms }))
}

export async function fetchRoomsVersionRows(): Promise<CommitteeRoomsVersionRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_committeeRooms)
  return rows
    .map((d) => ({
      version: d.version as number,
      rooms: (d.rooms as string[]) ?? [],
      effectiveFrom: d.effectiveFrom as Date,
      reason: (d.reason as string | null | undefined) ?? null,
      createdBy: d.createdBy as string,
      createdAt: d.createdAt as Date,
    }))
    .sort((a, b) => b.version - a.version)
}
