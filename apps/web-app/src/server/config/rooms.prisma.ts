import 'server-only'
import { prisma } from '@/server/db'
import type { RoomsRow, CommitteeRoomsVersionRow } from './rooms'

export async function fetchRoomsRows(): Promise<RoomsRow[]> {
  return prisma.committeeRoomsVersion.findMany({
    select: { version: true, effectiveFrom: true, rooms: true },
  }) as Promise<RoomsRow[]>
}

export async function fetchRoomsVersionRows(): Promise<CommitteeRoomsVersionRow[]> {
  const rows = await prisma.committeeRoomsVersion.findMany({ orderBy: { version: 'desc' } })
  return rows.map((r) => ({
    version: r.version,
    rooms: r.rooms as string[],
    effectiveFrom: r.effectiveFrom,
    reason: r.reason,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }))
}
