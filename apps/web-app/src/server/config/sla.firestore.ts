import 'server-only'
import { COL } from '@/server/firebase/collections'
import { fetchVersionedConfigDocs } from './versioned-firestore'
import type { SlaRow, SlaPolicyVersionRow } from './sla'

// Firestore fetch siblings for the SLA config (config_slaPolicy/{version}).
export async function fetchSlaRows(): Promise<SlaRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_slaPolicy)
  return rows.map((d) => ({
    version: d.version as number,
    effectiveFrom: d.effectiveFrom as Date,
    targets: d.targets,
    deskTargets: d.deskTargets,
  }))
}

export async function fetchSlaVersionRows(): Promise<SlaPolicyVersionRow[]> {
  const rows = await fetchVersionedConfigDocs(COL.config_slaPolicy)
  return rows
    .map((d) => ({
      version: d.version as number,
      targets: (d.targets as SlaPolicyVersionRow['targets']) ?? ({} as SlaPolicyVersionRow['targets']),
      deskTargets: (d.deskTargets as SlaPolicyVersionRow['deskTargets']) ?? {},
      effectiveFrom: d.effectiveFrom as Date,
      reason: (d.reason as string | null | undefined) ?? null,
      createdBy: d.createdBy as string,
      createdAt: d.createdAt as Date,
    }))
    .sort((a, b) => b.version - a.version)
}
