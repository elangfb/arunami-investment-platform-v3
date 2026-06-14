import 'server-only'

import { prisma } from '@/server/db'

// ExtractionRun persistence — Prisma impl, routed behind extraction-run.ts by DATA_BACKEND; the
// Firestore twin is extraction-run.firestore.ts. The append-only doc→snapshot extraction run log.
// `report`/`snapshot` are JSON strings (the extraction code JSON.parses them). getApplicationDocs reads
// the latest run (any) for the report and the latest OK run with a snapshot. Consumer: server/docs/service.ts.

export interface CreateExtractionRunInput {
  applicationId: string
  runId: string
  extractedAt: Date
  ok: boolean
  report: string
  snapshot: string | null
}

export interface ExtractionRunRow {
  applicationId: string
  runId: string
  extractedAt: Date
  ok: boolean
  report: string
  snapshot: string | null
  createdAt: Date
}

export async function createExtractionRun(input: CreateExtractionRunInput): Promise<void> {
  await prisma.extractionRun.create({ data: { ...input } })
}

export async function getLatestExtractionRun(applicationId: string): Promise<ExtractionRunRow | null> {
  return prisma.extractionRun.findFirst({ where: { applicationId }, orderBy: { createdAt: 'desc' } })
}

export async function getLatestOkExtractionRun(applicationId: string): Promise<ExtractionRunRow | null> {
  return prisma.extractionRun.findFirst({
    where: { applicationId, ok: true, snapshot: { not: null } },
    orderBy: { createdAt: 'desc' },
  })
}
