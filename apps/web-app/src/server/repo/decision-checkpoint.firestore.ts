import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL } from '@/server/firebase/collections'
import { tsFromDate } from '@/server/firebase/timestamps'
import type { CreateCheckpointInput, CheckpointPdfRefs } from './decision-checkpoint.prisma'

// Firestore impl of the DecisionCheckpoint WRITE — parity with decision-checkpoint.prisma.ts. Top-level
// decisionCheckpoints/{auto} (matches the existing P2 read serialize.firestore.latestCheckpoint:
// where applicationId == … orderBy createdAt desc). Field names mirror the read. PDF BYTES ARE NEVER
// WRITTEN (only object-storage keys) — Firestore caps a doc at 1 MB, and frozen PDFs live in Cloud
// Storage; the legacy inline-bytes path is Postgres-only history. exploredSources is stored natively
// (null when absent, so the doc is queryable / the field is explicit).

export async function createDecisionCheckpoint(input: CreateCheckpointInput): Promise<{ id: string }> {
  const ref = await getDb().collection(COL.decisionCheckpoints).add({
    applicationId: input.applicationId,
    decision: input.decision,
    decidedAt: tsFromDate(input.decidedAt),
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
    exploredSources: input.exploredSources ?? null,
    createdAt: FieldValue.serverTimestamp(),
  })
  return { id: ref.id }
}

export async function getLatestCheckpointPdfRefs(applicationId: string): Promise<CheckpointPdfRefs | null> {
  const snap = await getDb()
    .collection(COL.decisionCheckpoints)
    .where('applicationId', '==', applicationId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
  if (snap.empty) return null
  const d = snap.docs[0].data()
  return {
    muapStorageKey: (d.muapStorageKey as string | null | undefined) ?? null,
    rskStorageKey: (d.rskStorageKey as string | null | undefined) ?? null,
    muapPdf: null, // Firestore never stores inline PDF bytes (1 MB doc cap) — keys only
    rskPdf: null,
  }
}
