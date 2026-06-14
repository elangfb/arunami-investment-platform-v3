// DEMO / SAMPLE DATA (dev only). Seeded users (historical actors, cannot log in), the prototype
// applications, and committee meetings. Non-destructive: fixture replacement is scoped to the
// seeded application/meeting ids — never wipes real users, sessions, other apps, or audits.
// Requires seedConfig() to have run first (roles must exist). REFUSES to run in production.
import { prisma, Prisma, json } from './seed-client'

const { computeViolations } = await import('../src/lib/hardGates')
const { deriveWorkflowSnapshot } = await import('../src/lib/workflow')
const { APPLICATIONS } = await import('../src/lib/seed-data/applications')
const { USERS } = await import('../src/lib/seed-data/users')
const { MEETINGS } = await import('../src/lib/seed-data/meetings')
// (seed grants are by per-user roleKey now; the legacy Role→key map was removed in the role fold)
const { DEMO_LOGINS, demoInitials } = await import('../src/lib/seed-data/demo-logins')
const { DEMO_APPROVAL_ROUTING } = await import('../src/lib/seed-data/approval-routing')

export async function seedDummy(): Promise<void> {
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
    throw new Error('seedDummy refused: NODE_ENV=production. Production seeds config only (run seed.ts --config-only).')
  }

  // Role ids by key — seedConfig already created the roles; look them up rather than threading state.
  const roles = await prisma.role.findMany({ select: { id: true, key: true } })
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]))

  // Users (seeded actors). No email/firebaseUid → they can't log in; they're historical actors
  // referenced by applications. Each gets the default role matching its legacy role.
  for (const u of USERS) {
    const roleId = roleIdByKey.get(u.roleKey)
    await prisma.user.upsert({
      where: { id: u.id },
      update: { name: u.name, avatarInitials: u.avatarInitials, title: u.title, tagline: u.tagline },
      create: { id: u.id, name: u.name, avatarInitials: u.avatarInitials, title: u.title, tagline: u.tagline, isSuperadmin: false },
    })
    if (roleId) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: u.id, roleId } },
        update: {},
        create: { userId: u.id, roleId },
      })
    }
  }

  // Prune stale seed/demo identities. ALL demo & smoke logins use the reserved
  // @example.com test domain (never a real inbox — see data/demo-logins.ts); real users
  // have real emails, so scoping the delete to @example.com can never touch a real user.
  // We drop every @example.com user whose email is NOT in the current DEMO_LOGINS roster:
  //   • smoke-*@example.com cruft left by automated smoke runs, AND
  //   • demo personas dropped from the roster (e.g. retired signer personas u-demo-bm/
  //     u-demo-ro/u-demo-cro/u-demo-dps) that a prior re-seed created but no longer lists.
  // Their UserRole/UserDesk/MeetingAttendee grants cascade away on user delete (schema).
  // Without this, the roster upsert ADDS new personas but never removes dropped ones, so
  // retired demo accounts (and their role grants) persist across re-seeds.
  const rosterEmails = DEMO_LOGINS.map((d) => d.email)
  const stale = await prisma.user.deleteMany({
    where: { email: { endsWith: '@example.com', notIn: rosterEmails } },
  })
  if (stale.count) console.log(`Removed ${stale.count} stale @example.com demo/smoke user(s) absent from the roster.`)

  // Demo logins (dev only) — attach login emails so an emulator sign-in links to the
  // right persona by email (server/repo/users.ts ensureUser step 2), and create the
  // brand-new "variety" personas. The matching emulator accounts are provisioned by
  // scripts/seed-emulator-users.ts (`pnpm seed:emu`). Single source: data/demo-logins.ts.
  for (const d of DEMO_LOGINS) {
    if (d.userId) {
      // Existing seeded actor: only add the email (role/desks come from its seed entry).
      await prisma.user.update({ where: { id: d.userId }, data: { email: d.email } })
      continue
    }
    // New persona: upsert by email so it coexists with any row a prior login created.
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: { name: d.name, isSuperadmin: d.isSuperadmin ?? false },
      create: {
        id: d.id ?? crypto.randomUUID(),
        email: d.email,
        name: d.name,
        avatarInitials: demoInitials(d.name),
        isSuperadmin: d.isSuperadmin ?? false,
      },
    })
    for (const key of d.roleKeys ?? []) {
      const roleId = roleIdByKey.get(key)
      if (roleId) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId } },
          update: {},
          create: { userId: user.id, roleId },
        })
      }
    }
    for (const desk of d.directDesks ?? []) {
      await prisma.userDesk.upsert({
        where: { userId_desk: { userId: user.id, desk } },
        update: {},
        create: { userId: user.id, desk },
      })
    }
  }

  // Applications + nested children (scoped replace).
  const seedAppIds = APPLICATIONS.map((a) => a.id)
  await prisma.application.deleteMany({ where: { id: { in: seedAppIds } } })
  for (const app of APPLICATIONS) {
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
        // Persisted WorkflowSnapshot read-model (ADR-0004 §3 Phase 3a) — reseed backfill.
        workflowSnapshot: json(deriveWorkflowSnapshot(app)),
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
        // Derived read-cache: recompute from hardGates so seed data can't drift from the
        // gate logic (the hardcoded arrays in applications.ts are vestigial input).
        hardGateViolations: computeViolations(app.hardGates),
        financialInputs: app.financialInputs,
        analysis: json(app.analysis),
        extractionSources: app.extractionSources ?? Prisma.JsonNull,
        stage2LegalApproval: app.stage2LegalApproval ?? Prisma.JsonNull,
        disbursementConditions: app.disbursementConditions ?? Prisma.JsonNull,
        amlAttestation: app.amlAttestation ? json(app.amlAttestation) : Prisma.JsonNull,
        stage2SlikApproval: app.stage2SlikApproval ?? Prisma.JsonNull,
        // Appraisal desk (LG) records the valuation method at Stage 2; apps already past it
        // (Stage 3+) realistically used the in-house path. Non-gating (see lib/desks.ts).
        appraisalPath: app.appraisalPath ?? (app.stage >= 3 ? 'internal' : null),
        applicationStatus: app.applicationStatus ?? 'active',
        closeReason: app.closeReason ?? null,
        closedAt: app.closedAt ?? null,
        conditionalResponse: app.conditionalResponse ?? null,
        documents: {
          create: app.documents.map((d) => ({
            id: d.id,
            name: d.name,
            docType: d.docType,
            status: d.status,
            required: d.required,
            uploadedAt: d.uploadedAt ?? null,
            uploadedBy: d.uploadedBy ?? null,
            fileName: d.fileName ?? null,
            legalVerification: d.legalVerification ?? null,
          })),
        },
        history: {
          create: app.history.map((h, i) => ({
            id: h.id,
            seq: i + 1,
            timestamp: h.timestamp,
            userId: h.userId,
            userName: h.userName,
            action: h.action,
            stage: h.stage,
            reason: h.reason ?? null,
          })),
        },
        assignments: {
          create: app.assignments.map((a) => ({
            stage: a.stage,
            role: a.role,
            userId: a.userId,
            userName: a.userName,
            status: a.status,
            assignedAt: a.assignedAt,
            submittedAt: a.submittedAt ?? null,
          })),
        },
        komiteVotes: {
          create: app.komiteVotes.map((v) => ({
            userId: v.userId,
            userName: v.userName,
            vote: v.vote,
            comment: v.comment ?? null,
            timestamp: v.timestamp,
            isEarlyVote: v.isEarlyVote ?? false,
          })),
        },
        // Maker-checker ladder ledger (MUAP/RSK) + committee MoM signatures (chain='mom').
        approvalSteps: {
          create: (app.approvalSteps ?? []).map((s) => ({
            chain: s.chain,
            role: s.role,
            action: s.action,
            userId: s.userId,
            userName: s.userName,
            reason: s.reason ?? null,
            qrToken: s.qrToken ?? null,
            createdAt: s.createdAt,
          })),
        },
        // Conversation streams now live in ConversationMessage (was aiChatHistory/aiAssistantLog).
        conversation: {
          create: [
            ...(app.aiChatHistory ?? []).map((m, i) => ({
              surface: 'discussion',
              seq: i,
              role: m.role,
              content: m.content,
              authorId: m.authorId ?? null,
              authorName: m.authorName ?? (m.role === 'assistant' ? 'MIZAN AI' : null),
              mentions: m.mentions ?? [],
            })),
            ...(app.aiAssistantLog ?? []).map((m, i) => ({
              surface: 'assistant',
              seq: i,
              role: m.role,
              content: m.content,
            })),
          ],
        },
      },
    })
  }

  // Committee meetings (scoped replace).
  const seedMeetingIds = MEETINGS.map((m) => m.id)
  await prisma.komiteMeeting.deleteMany({ where: { id: { in: seedMeetingIds } } })
  for (const m of MEETINGS) {
    await prisma.komiteMeeting.create({
      data: {
        id: m.id,
        date: m.date,
        time: m.time,
        room: m.room ?? null,
        meetingUrl: m.meetingUrl ?? null,
        chairUserId: m.chairUserId,
        notes: m.notes ?? null,
        minutes: m.minutes ?? null,
        minutesRecordedAt: m.minutesRecordedAt ?? null,
        minutesRecordedBy: m.minutesRecordedBy ?? null,
        status: m.status,
        createdBy: m.createdBy,
        createdAt: m.createdAt,
        // Agenda + attendees now live in join tables (was agendaAppIds/attendeeUserIds arrays).
        agendaItems: { create: m.agendaAppIds.map((applicationId) => ({ applicationId })) },
        attendees: { create: m.attendeeUserIds.map((userId) => ({ userId })) },
      },
    })
  }

  // Demo approval routing (dev only) — makes STRICT per-submitter routing demonstrable out of the
  // box (approval-routing-config.md). Scoped replace by seeded maker id so re-seed is idempotent and
  // real (non-seed) makers' routing is never touched. Production stays unconfigured → fallback.
  const routingMakerIds = DEMO_APPROVAL_ROUTING.map((r) => r.makerUserId)
  await prisma.approvalRoutingRule.deleteMany({ where: { makerUserId: { in: routingMakerIds } } })
  for (const r of DEMO_APPROVAL_ROUTING) {
    await prisma.approvalRoutingRule.create({
      data: {
        makerUserId: r.makerUserId,
        chain: r.chain,
        version: 1,
        routing: json(r.routing),
        effectiveFrom: new Date('2026-01-01'),
        reason: 'Seeded demo routing — strict routing demonstrable (approval-routing-config.md)',
        createdBy: 'seed',
      },
    })
  }

  const counts = {
    users: await prisma.user.count(),
    applications: await prisma.application.count(),
    meetings: await prisma.komiteMeeting.count(),
  }
  console.log('Dummy data seeded:', counts)
}
