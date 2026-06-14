import 'server-only'

import { resolveActiveVersion } from '@/lib/config/versioned'
import { DEFAULT_DISBURSEMENT_CONDITIONS } from '@/lib/config/disbursement-conditions'
import { prisma } from '@/server/db'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { COL } from '@/server/firebase/collections'
import { configVersionDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import * as prismaImpl from './disbursement.prisma'
import * as firestoreImpl from './disbursement.firestore'

// Active disbursement release-condition list, resolved from the versioned config. Backend-routed
// row fetch; resolveActiveVersion + code-constant fallback are pure.

/** Minimal row for resolveActiveVersion (effectiveFrom MUST be a JS Date). */
export interface DisbursementRow {
  version: number
  effectiveFrom: Date
  conditions: string[]
}

export interface DisbursementConditionsVersionRow {
  version: number
  conditions: string[]
  effectiveFrom: Date
  reason: string | null
  createdBy: string
  createdAt: Date
}

const fetchDisbursementRows = dispatchRead(prismaImpl.fetchDisbursementRows, firestoreImpl.fetchDisbursementRows)
const fetchDisbursementVersionRows = dispatchRead(prismaImpl.fetchDisbursementVersionRows, firestoreImpl.fetchDisbursementVersionRows)

export async function getActiveDisbursementConditions(at: Date = new Date()): Promise<string[]> {
  const active = resolveActiveVersion(await fetchDisbursementRows(), at)
  if (!active) return [...DEFAULT_DISBURSEMENT_CONDITIONS]
  return active.conditions
}

/** All disbursement-condition versions, newest first — for the Master tab's audit/history view. */
export async function listDisbursementConditionsVersions(): Promise<DisbursementConditionsVersionRow[]> {
  return fetchDisbursementVersionRows()
}

/** Append a new disbursement-conditions version (backend-routed). Caller validates conditions first. */
export const createDisbursementConditionsVersion = dispatchWrite(
  'createDisbursementConditionsVersion',
  async (conditions: string[], reason: string | null, createdBy: string) => {
    const max = await prisma.disbursementConditionsVersion.aggregate({ _max: { version: true } })
    await prisma.disbursementConditionsVersion.create({ data: { version: (max._max.version ?? 0) + 1, conditions, effectiveFrom: new Date(), reason, createdBy } })
  },
  async (conditions: string[], reason: string | null, createdBy: string) => {
    await fsAllocateAndCreateVersion({ collection: COL.config_disbursementConditions, docId: configVersionDocId, fields: { conditions }, effectiveFrom: new Date(), reason, createdBy })
  },
)
