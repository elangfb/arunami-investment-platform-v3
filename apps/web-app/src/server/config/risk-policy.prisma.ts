import 'server-only'
import { prisma } from '@/server/db'
import type { RiskPolicyRow, RiskPolicyVersionRow } from './risk-policy'

// Prisma fetch sibling for the risk-policy config (the ROW FETCH only — resolveActiveVersion + the
// DEFAULT fallback stay in risk-policy.ts and run on whatever rows the dispatched fetch returns).

export async function fetchRiskPolicyRows(): Promise<RiskPolicyRow[]> {
  return prisma.riskPolicyVersion.findMany({
    select: { version: true, effectiveFrom: true, dsrMaxPct: true, ltvMaxPct: true, kolMax: true },
  })
}

export async function fetchRiskPolicyVersionRows(): Promise<RiskPolicyVersionRow[]> {
  return prisma.riskPolicyVersion.findMany({ orderBy: { version: 'desc' } })
}
