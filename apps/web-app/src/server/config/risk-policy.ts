import 'server-only'

import { resolveActiveVersion } from '@/lib/config/versioned'
import { DEFAULT_RISK_POLICY, type RiskPolicy } from '@/lib/hardGates'
import { prisma } from '@/server/db'
import { dispatchRead, dispatchWrite } from '@/server/repo/dispatch'
import { COL } from '@/server/firebase/collections'
import { configVersionDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import * as prismaImpl from './risk-policy.prisma'
import * as firestoreImpl from './risk-policy.firestore'

// Active OJK hard-gate thresholds resolved from versioned config (configurability-and-admin.md
// Phase C), WITH the version number — used both for live computation (recompute-live for in-flight
// apps) and to FREEZE the applied version into DecisionCheckpoint at the committee decision. Falls
// back to the code default (version null) when nothing is seeded; v1 is seeded equal to the default,
// so cutover is behavior-preserving.
//
// The ROW FETCH is backend-routed (dispatchRead → risk-policy.prisma|firestore); resolveActiveVersion
// + the DEFAULT fallback are pure and run on whichever rows come back. effectiveFrom/createdAt arrive
// as JS Date from BOTH siblings (the Firestore sibling toDate()s Timestamps), so the resolver's
// .getTime() compare is always valid.

/** The minimal row shape resolveActiveVersion needs (effectiveFrom MUST be a JS Date). */
export interface RiskPolicyRow {
  version: number
  effectiveFrom: Date
  dsrMaxPct: number
  ltvMaxPct: number
  kolMax: number
}

export interface RiskPolicyVersionRow {
  version: number
  dsrMaxPct: number
  ltvMaxPct: number
  kolMax: number
  effectiveFrom: Date
  reason: string | null
  createdBy: string
  createdAt: Date
}

export interface ActiveRiskPolicy extends RiskPolicy {
  /** The resolved version number, or null when falling back to the code default. */
  version: number | null
}

const fetchRiskPolicyRows = dispatchRead(prismaImpl.fetchRiskPolicyRows, firestoreImpl.fetchRiskPolicyRows)
const fetchRiskPolicyVersionRows = dispatchRead(prismaImpl.fetchRiskPolicyVersionRows, firestoreImpl.fetchRiskPolicyVersionRows)

export async function getActiveRiskPolicyDetailed(at: Date = new Date()): Promise<ActiveRiskPolicy> {
  const rows = await fetchRiskPolicyRows()
  const active = resolveActiveVersion(rows, at)
  if (!active) return { version: null, ...DEFAULT_RISK_POLICY }
  return { version: active.version, dsrMaxPct: active.dsrMaxPct, ltvMaxPct: active.ltvMaxPct, kolMax: active.kolMax }
}

/** Just the thresholds — for computeViolations (live recompute). */
export async function getActiveRiskPolicy(at: Date = new Date()): Promise<RiskPolicy> {
  const d = await getActiveRiskPolicyDetailed(at)
  return { dsrMaxPct: d.dsrMaxPct, ltvMaxPct: d.ltvMaxPct, kolMax: d.kolMax }
}

/** All risk-policy versions, newest first — for the Policy tab's audit/history view. */
export async function listRiskPolicyVersions(): Promise<RiskPolicyVersionRow[]> {
  return fetchRiskPolicyVersionRows()
}

/** Append a new risk-policy version (backend-routed). Caller validates the thresholds first. */
export const createRiskPolicyVersion = dispatchWrite(
  'createRiskPolicyVersion',
  async (policy: RiskPolicy, reason: string | null, createdBy: string) => {
    const max = await prisma.riskPolicyVersion.aggregate({ _max: { version: true } })
    await prisma.riskPolicyVersion.create({
      data: { version: (max._max.version ?? 0) + 1, dsrMaxPct: policy.dsrMaxPct, ltvMaxPct: policy.ltvMaxPct, kolMax: policy.kolMax, effectiveFrom: new Date(), reason, createdBy },
    })
  },
  async (policy: RiskPolicy, reason: string | null, createdBy: string) => {
    await fsAllocateAndCreateVersion({
      collection: COL.config_riskPolicy,
      docId: configVersionDocId,
      fields: { dsrMaxPct: policy.dsrMaxPct, ltvMaxPct: policy.ltvMaxPct, kolMax: policy.kolMax },
      effectiveFrom: new Date(),
      reason,
      createdBy,
    })
  },
)
