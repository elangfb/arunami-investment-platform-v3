import 'server-only'

import { resolveActiveVersion } from '@/lib/config/versioned'
import { SLA_TARGETS_DAYS } from '@/lib/sla-utils'
import { prisma } from '@/server/db'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { COL } from '@/server/firebase/collections'
import { configVersionDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import type { Desk } from '@/lib/desks'
import type { Stage } from '@/lib/types'
import * as prismaImpl from './sla.prisma'
import * as firestoreImpl from './sla.firestore'

// Active SLA day-targets, resolved from the versioned config (configurability-and-admin.md Phase A).
// The ROW FETCH is backend-routed; resolveActiveVersion + per-stage/desk fallback are pure. Falls
// back to the code constant when no version is seeded (behavior-preserving; v1 == constant).

/** Minimal row for resolveActiveVersion (effectiveFrom MUST be a JS Date). */
export interface SlaRow {
  version: number
  effectiveFrom: Date
  targets: unknown // Record<Stage, number>
  deskTargets: unknown // Partial<Record<Desk, number>> | null
}

export interface SlaPolicyVersionRow {
  version: number
  targets: Record<Stage, number>
  deskTargets: Partial<Record<Desk, number>>
  effectiveFrom: Date
  reason: string | null
  createdBy: string
  createdAt: Date
}

const fetchSlaRows = dispatchRead(prismaImpl.fetchSlaRows, firestoreImpl.fetchSlaRows)
const fetchSlaVersionRows = dispatchRead(prismaImpl.fetchSlaVersionRows, firestoreImpl.fetchSlaVersionRows)

// Returns a COMPLETE Stage→days map (per-stage fallback to the constant) so callers never see a hole.
export async function getActiveSlaTargets(at: Date = new Date()): Promise<Record<Stage, number>> {
  const active = resolveActiveVersion(await fetchSlaRows(), at)
  if (!active) return { ...SLA_TARGETS_DAYS }
  const raw = (active.targets ?? {}) as Record<string, number>
  const out = {} as Record<Stage, number>
  for (let s = 1 as Stage; s <= 6; s = (s + 1) as Stage) {
    const v = raw[String(s)]
    out[s] = typeof v === 'number' ? v : SLA_TARGETS_DAYS[s]
  }
  return out
}

// Active PER-DESK business-day (HK) SLA targets from the same versioned policy row. Returns {} when
// none configured, so callers' deskSlaState falls back to the per-stage clock (behavior-preserving).
export async function getActiveDeskSlaTargets(at: Date = new Date()): Promise<Partial<Record<Desk, number>>> {
  const active = resolveActiveVersion(await fetchSlaRows(), at)
  return active?.deskTargets ? ((active.deskTargets as Partial<Record<Desk, number>>) ?? {}) : {}
}

/** All SLA policy versions, newest first — for the Master tab's audit/history view. */
export async function listSlaPolicyVersions(): Promise<SlaPolicyVersionRow[]> {
  return fetchSlaVersionRows()
}

/** Append a new SLA policy version (backend-routed). Caller validates targets/deskTargets first. */
export const createSlaPolicyVersion = dispatchWrite(
  'createSlaPolicyVersion',
  async (targets: Record<string, number>, deskTargets: Record<string, number>, reason: string | null, createdBy: string) => {
    const max = await prisma.slaPolicyVersion.aggregate({ _max: { version: true } })
    await prisma.slaPolicyVersion.create({
      data: {
        version: (max._max.version ?? 0) + 1,
        targets,
        deskTargets: Object.keys(deskTargets).length ? deskTargets : undefined,
        effectiveFrom: new Date(),
        reason,
        createdBy,
      },
    })
  },
  async (targets: Record<string, number>, deskTargets: Record<string, number>, reason: string | null, createdBy: string) => {
    await fsAllocateAndCreateVersion({
      collection: COL.config_slaPolicy,
      docId: configVersionDocId,
      fields: { targets, ...(Object.keys(deskTargets).length ? { deskTargets } : {}) },
      effectiveFrom: new Date(),
      reason,
      createdBy,
    })
  },
)
