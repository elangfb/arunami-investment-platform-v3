import 'server-only'
import { prisma } from '@/server/db'
import type { DisbursementRow, DisbursementConditionsVersionRow } from './disbursement'

export async function fetchDisbursementRows(): Promise<DisbursementRow[]> {
  return prisma.disbursementConditionsVersion.findMany({
    select: { version: true, effectiveFrom: true, conditions: true },
  }) as Promise<DisbursementRow[]>
}

export async function fetchDisbursementVersionRows(): Promise<DisbursementConditionsVersionRow[]> {
  const rows = await prisma.disbursementConditionsVersion.findMany({ orderBy: { version: 'desc' } })
  return rows.map((r) => ({
    version: r.version,
    conditions: r.conditions as string[],
    effectiveFrom: r.effectiveFrom,
    reason: r.reason,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }))
}
