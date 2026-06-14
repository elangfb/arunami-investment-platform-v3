// Standalone runner for the per-scenario reset used by scripts/test-e2e.sh +
// apps/web-app-e2e/support/db.ts. Two steps:
//
//   1. TRUNCATE every app-scoped table (CASCADE flushes the relational tail). Config
//      tables (Desk, Role, *Version) are NOT truncated — seedConfig owns them and
//      scenarios don't mutate them.
//   2. seedDummy() — restore fixture applications, meetings, demo personas.
//
// Refuses to run unless DATABASE_URL names a *_e2e database. The harness already
// guards this; the in-process check is belt-and-braces in case the runner is invoked
// directly.
import { prisma } from './seed-client'
import { seedDummy } from './seed-dummy'

const APP_SCOPED_TABLES = [
  '"AiInteraction"',
  '"DecisionCheckpoint"',
  '"ExtractionRun"',
  '"ApplicationDocumentFill"',
  '"ApplicationDocument"',
  '"ConversationMessage"',
  '"HistoryEntry"',
  '"StageAssignment"',
  '"KomiteVote"',
  '"DocLinkage"',
  '"ResearchStep"',
  '"ResearchJob"',
  '"MeetingAgendaItem"',
  '"MeetingAttendee"',
  '"KomiteMeeting"',
  '"Application"',
  '"ImpersonationAudit"',
]

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.includes('mizan_e2e')) {
    throw new Error('run-seed-dummy refused: DATABASE_URL must name a *_e2e database')
  }
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${APP_SCOPED_TABLES.join(', ')} RESTART IDENTITY CASCADE`,
  )
  await seedDummy()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
