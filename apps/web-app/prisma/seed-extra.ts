/**
 * Non-destructive seed for the state-coverage apps (FOS-035..037) added to
 * src/lib/seed-data/applications.ts. Unlike prisma/seed.ts (which deletes everything),
 * this ONLY (re)creates the listed ids — safe to run against a live DB without
 * wiping users/sessions/other apps. Idempotent: it deletes just those ids first.
 *
 * Run from apps/web-app:
 *   cd apps/web-app && set -a; . .env.local; set +a; pnpm exec tsx prisma/seed-extra.ts
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Prisma as PrismaT } from '@prisma/client'

const json = (v: unknown) => v as PrismaT.InputJsonValue

const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../.env.local') })

const { PrismaClient, Prisma } = await import('@prisma/client')
const { PrismaPg } = await import('@prisma/adapter-pg')
const { APPLICATIONS } = await import('../src/lib/seed-data/applications')

const NEW_IDS = ['FOS-2026-035', 'FOS-2026-036', 'FOS-2026-037']

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function main() {
  const apps = APPLICATIONS.filter((a) => NEW_IDS.includes(a.id))
  console.log(`Seeding ${apps.length} state-coverage apps: ${apps.map((a) => a.id).join(', ')}`)
  // Scoped reset (cascades to children) so this is safe to re-run.
  await prisma.application.deleteMany({ where: { id: { in: NEW_IDS } } })

  for (const app of apps) {
    await prisma.application.create({
      data: {
        id: app.id,
        nasabahName: app.nasabahName,
        nasabahType: app.nasabahType,
        nik: app.nik ?? null,
        phoneNumber: app.phoneNumber,
        whatsappNumber: app.whatsappNumber ?? null,
        namaUsaha: app.namaUsaha ?? null,
        incomeSource: app.incomeSource ?? null,
        isMarried: app.isMarried ?? null,
        akadType: app.akadType,
        requestedPlafond: BigInt(app.requestedPlafond),
        requestedTenorMonths: app.requestedTenorMonths,
        approvedPlafond: app.approvedPlafond != null ? BigInt(app.approvedPlafond) : null,
        approvedTenorMonths: app.approvedTenorMonths ?? null,
        approvedMarginRate: app.approvedMarginRate ?? null,
        marginRate: app.marginRate ?? null,
        purpose: app.purpose,
        collateralType: app.collateralType ?? null,
        stage: app.stage,
        enteredStageAt: app.enteredStageAt,
        createdAt: app.createdAt,
        createdBy: app.createdBy,
        kolEntered: app.kolEntered,
        financialsAssessed: app.financialsAssessed,
        riskRecommendation: app.riskRecommendation ?? null,
        riskNote: app.riskNote ?? null,
        komiteDecision: app.komiteDecision ?? null,
        komiteDecisionNote: app.komiteDecisionNote ?? null,
        muapNarrative: app.muapNarrative ?? null,
        muapSyncedAt: app.muapSyncedAt ?? null,
        rskSyncedAt: app.rskSyncedAt ?? null,
        disbursementStatus: app.disbursementStatus ?? null,
        hardGates: json(app.hardGates),
        hardGateViolations: app.hardGateViolations ?? [],
        financialInputs: app.financialInputs,
        analysis: json(app.analysis),
        extractionSources: app.extractionSources ?? Prisma.JsonNull,
        stage2LegalApproval: app.stage2LegalApproval ?? Prisma.JsonNull,
        appraisalPath: app.appraisalPath ?? (app.stage >= 3 ? 'internal' : null),
        disbursementConditions: app.disbursementConditions ?? Prisma.JsonNull,
        documents: {
          create: app.documents.map((d) => ({
            id: d.id, name: d.name, docType: d.docType, status: d.status, required: d.required,
            uploadedAt: d.uploadedAt ?? null, uploadedBy: d.uploadedBy ?? null,
            fileName: d.fileName ?? null, legalVerification: d.legalVerification ?? null,
          })),
        },
        history: {
          create: app.history.map((h, i) => ({
            id: h.id, seq: i + 1, timestamp: h.timestamp, userId: h.userId,
            userName: h.userName, action: h.action, stage: h.stage, reason: h.reason ?? null,
          })),
        },
        assignments: {
          create: app.assignments.map((a) => ({
            stage: a.stage, role: a.role, userId: a.userId, userName: a.userName,
            status: a.status, assignedAt: a.assignedAt, submittedAt: a.submittedAt ?? null,
          })),
        },
        komiteVotes: {
          create: app.komiteVotes.map((v) => ({
            userId: v.userId, userName: v.userName, vote: v.vote,
            comment: v.comment ?? null, timestamp: v.timestamp, isEarlyVote: v.isEarlyVote ?? false,
          })),
        },
        conversation: {
          create: (app.aiChatHistory ?? []).map((m, i) => ({
            surface: 'discussion', seq: i, role: m.role, content: m.content,
          })),
        },
      },
    })
    console.log(`  ✓ ${app.id}`)
  }
  console.log('Done.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
