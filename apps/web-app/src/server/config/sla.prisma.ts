import 'server-only'
import { prisma } from '@/server/db'
import type { SlaRow, SlaPolicyVersionRow } from './sla'

// Prisma fetch siblings for the SLA config (row fetch only; resolveActiveVersion + per-stage/desk
// fallback stay in sla.ts).
export async function fetchSlaRows(): Promise<SlaRow[]> {
  return prisma.slaPolicyVersion.findMany({
    select: { version: true, effectiveFrom: true, targets: true, deskTargets: true },
  }) as Promise<SlaRow[]>
}

export async function fetchSlaVersionRows(): Promise<SlaPolicyVersionRow[]> {
  const rows = await prisma.slaPolicyVersion.findMany({ orderBy: { version: 'desc' } })
  return rows.map((r) => ({
    version: r.version,
    targets: r.targets as SlaPolicyVersionRow['targets'],
    deskTargets: (r.deskTargets as SlaPolicyVersionRow['deskTargets']) ?? {},
    effectiveFrom: r.effectiveFrom,
    reason: r.reason,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }))
}
