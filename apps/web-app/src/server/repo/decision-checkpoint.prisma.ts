import 'server-only'

import { prisma } from '@/server/db'

// DecisionCheckpoint WRITE persistence — Prisma impl, routed behind decision-checkpoint.ts by
// DATA_BACKEND; the Firestore twin is decision-checkpoint.firestore.ts. The immutable committee-decision
// freeze (frozen MUAP+RSK PDFs in object storage + a SHA-256 over both for OJK tamper-evidence). The
// READ side that feeds the application aggregate (latestCheckpoint) already lives in serialize.*; this
// module owns the create + the checkpoint-PDF-refs read (audit download links). Consumer:
// server/docs/service.ts. NOTE: new checkpoints store PDF bytes in object storage (keys only here) —
// the legacy inline Bytes columns are never written (Firestore's 1 MB doc limit; greenfield has none).

export interface CreateCheckpointInput {
  applicationId: string
  decision: string
  decidedAt: Date
  muapDocId: string
  rskDocId: string
  muapStorageKey: string | null
  rskStorageKey: string | null
  muapSizeBytes: number | null
  rskSizeBytes: number | null
  contentHash: string
  riskPolicyVersion: number | null
  riskDsrMaxPct: number | null
  riskLtvMaxPct: number | null
  riskKolMax: number | null
  exploredSources: unknown
}

export interface CheckpointPdfRefs {
  muapStorageKey: string | null
  rskStorageKey: string | null
  muapPdf: Uint8Array | null
  rskPdf: Uint8Array | null
}

export async function createDecisionCheckpoint(input: CreateCheckpointInput): Promise<{ id: string }> {
  const cp = await prisma.decisionCheckpoint.create({
    data: {
      applicationId: input.applicationId,
      decision: input.decision,
      decidedAt: input.decidedAt,
      muapDocId: input.muapDocId,
      rskDocId: input.rskDocId,
      muapStorageKey: input.muapStorageKey,
      rskStorageKey: input.rskStorageKey,
      muapSizeBytes: input.muapSizeBytes,
      rskSizeBytes: input.rskSizeBytes,
      contentHash: input.contentHash,
      riskPolicyVersion: input.riskPolicyVersion,
      riskDsrMaxPct: input.riskDsrMaxPct,
      riskLtvMaxPct: input.riskLtvMaxPct,
      riskKolMax: input.riskKolMax,
      exploredSources: (input.exploredSources ?? undefined) as never,
    },
    select: { id: true },
  })
  return cp
}

export async function getLatestCheckpointPdfRefs(applicationId: string): Promise<CheckpointPdfRefs | null> {
  const cp = await prisma.decisionCheckpoint.findFirst({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
    select: { muapStorageKey: true, rskStorageKey: true, muapPdf: true, rskPdf: true },
  })
  return cp ?? null
}
