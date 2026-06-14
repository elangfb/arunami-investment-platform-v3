import 'server-only'
import type { Prisma } from '@prisma/client'
import type { LoanApplication } from '@/lib/types'
import { buildLoanApplication, type CheckpointRef } from './serialize.shared'

// The Prisma ADAPTER for the application read boundary. The backend-agnostic assembly (the
// null/undefined map, child mapping, conversation split) lives in serialize.shared.ts; this file
// only owns the Prisma-specific row TYPE + the include/select shapes, then delegates to
// buildLoanApplication. The Prisma row is structurally a NormalizedApp (Date dates, bigint plafond,
// JsonValue→unknown, included children), so it passes straight through.

// Re-exported so existing importers (applications/write/approval/customer + index barrel) are unchanged.
export { toCheckpointRef, ASSISTANT_WINDOW } from './serialize.shared'
export type { CheckpointRef } from './serialize.shared'

export type ApplicationRow = Prisma.ApplicationGetPayload<{
  include: { documents: true; history: true; assignments: true; komiteVotes: true; conversation: true; approvalSteps: true }
}>

// One source of truth for the DecisionCheckpoint columns the aggregate carries + their mapping, so
// the two loaders (applications.latestCheckpoint, write.loadApplicationForWrite) can't drift.
export const CHECKPOINT_SELECT = {
  id: true,
  contentHash: true,
  decidedAt: true,
  riskPolicyVersion: true,
  riskDsrMaxPct: true,
  riskLtvMaxPct: true,
  riskKolMax: true,
} as const

// Prisma row → the exact LoanApplication shape, via the shared assembler. Tested: serialize.test.ts.
export function rowToLoanApplication(
  row: ApplicationRow,
  checkpoint?: CheckpointRef | null,
): LoanApplication {
  return buildLoanApplication(row, checkpoint)
}

// The relations to include for a full aggregate read, ordered to match the former in-memory
// insertion order (components re-sort history newest-first at render).
export const APPLICATION_INCLUDE = {
  documents: true,
  history: { orderBy: { seq: 'asc' } },
  assignments: { orderBy: { assignedAt: 'asc' } },
  komiteVotes: { orderBy: { timestamp: 'asc' } },
  conversation: { orderBy: [{ surface: 'asc' }, { seq: 'asc' }] },
  approvalSteps: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ApplicationInclude
