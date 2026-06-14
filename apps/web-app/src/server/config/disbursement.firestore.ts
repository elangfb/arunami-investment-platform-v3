import 'server-only'
import { COL } from '@/server/firebase/collections'
import { fetchVersionedConfigDocs } from './versioned-firestore'
import type { DisbursementRow, DisbursementConditionsVersionRow } from './disbursement'

export async function fetchDisbursementRows(): Promise<DisbursementRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_disbursementConditions)
  return rows.map((d) => ({
    version: d.version as number,
    effectiveFrom: d.effectiveFrom as Date,
    conditions: (d.conditions as string[]) ?? [],
  }))
}

export async function fetchDisbursementVersionRows(): Promise<DisbursementConditionsVersionRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_disbursementConditions)
  return rows
    .map((d) => ({
      version: d.version as number,
      conditions: (d.conditions as string[]) ?? [],
      effectiveFrom: d.effectiveFrom as Date,
      reason: (d.reason as string | null | undefined) ?? null,
      createdBy: d.createdBy as string,
      createdAt: d.createdAt as Date,
    }))
    .sort((a, b) => b.version - a.version)
}
