import 'server-only'
import { FieldValue, type BulkWriter, type Firestore } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL, IDX, SUB, appRef, subCol } from '@/server/firebase/collections'
import { tsFromDate } from '@/server/firebase/timestamps'
import { computeViolations } from '@/lib/hardGates'
import type { LoanApplication } from '@/lib/types'
import {
  coreAppFields,
  docFields,
  assignmentFields,
  voteFields,
  historyFields,
} from '@/server/repo/write.firestore'
import { pad7, assignmentDocId, approvalStepDocId, conversationDocId, approvalRoutingDocId } from '@/server/repo/doc-ids'
import { fsAllocateAndCreateVersion } from './versioned-write'
import { USERS } from '@/lib/seed-data/users'
import { APPLICATIONS } from '@/lib/seed-data/applications'
import { MEETINGS } from '@/lib/seed-data/meetings'
import { DEMO_LOGINS, demoInitials } from '@/lib/seed-data/demo-logins'
import { DEMO_APPROVAL_ROUTING } from '@/lib/seed-data/approval-routing'

// Firestore analog of prisma/seed-dummy.ts — the DEMO data layer (seeded actors + login personas,
// the FOS-2026-* prototype applications, committee meetings, demo approval routing) the Cucumber e2e
// suite reads. Requires seedFirestoreFactory() to have run first (roles/desks/config must exist).
//
// PARITY NOTES vs seed-dummy:
//   • Users carry roleIds[] (role doc-id == role key, from seedFirestoreRoles) + direct desks[]; the
//     effective-desk union is resolved on read (users.firestore.buildUserWithAccess). Seeded actors
//     get their email from the DEMO_LOGINS roster so an emulator login adopts them by email
//     (ensureUser step 2) — firebaseUid stays null until first login.
//   • Application aggregates are written through the SAME field maps as the runtime write seam
//     (write.firestore coreAppFields/docFields/… exported for this) so the seed shape can never drift
//     from what serialize.firestore reads back. Root version = 0 (a freshly-created app).
//   • Meetings are written with their fixed MTG-YYYY-NNN ids (createMeeting can't force an id); the
//     per-year meetingId counter is then advanced past them so a subsequent createMeeting (fixture
//     meetings) allocates max+1 — parity with the Postgres max-scan allocation.
//   • Demo approval routing goes through fsAllocateAndCreateVersion (the exact versioned-config
//     writer) → version 1 on a fresh/cleared Firestore.
// Dev-only: never call against a production project (the e2e reset guards on FIRESTORE_EMULATOR_HOST).

function seedUsers(bulk: BulkWriter, db: Firestore): void {
  const emailByUserId = new Map<string, string>()
  for (const d of DEMO_LOGINS) if (d.userId) emailByUserId.set(d.userId, d.email)

  // Seeded actors (historical): id + role from USERS, login email from the roster (or null → can't log in).
  for (const u of USERS) {
    bulk.set(db.collection(COL.users).doc(u.id), {
      email: emailByUserId.get(u.id) ?? null,
      firebaseUid: null,
      name: u.name,
      avatarInitials: u.avatarInitials,
      title: u.title ?? null,
      isSuperadmin: false,
      roleIds: [u.roleKey], // role doc-id == role key (seedFirestoreRoles)
      desks: [],
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  // Brand-new variety personas (created fresh; exercise the access edges).
  for (const d of DEMO_LOGINS) {
    if (d.userId) continue
    bulk.set(db.collection(COL.users).doc(d.id as string), {
      email: d.email,
      firebaseUid: null,
      name: d.name,
      avatarInitials: demoInitials(d.name),
      title: null,
      isSuperadmin: d.isSuperadmin ?? false,
      roleIds: d.roleKeys ?? [],
      desks: d.directDesks ?? [],
      createdAt: FieldValue.serverTimestamp(),
    })
  }
}

function seedApplication(bulk: BulkWriter, db: Firestore, app: LoanApplication): void {
  // hardGateViolations cache from the DEFAULT policy — matches seed-dummy's computeViolations(hardGates).
  const hgv = computeViolations(app.hardGates)

  bulk.set(appRef(db, app.id), {
    ...coreAppFields(app, hgv),
    // Apps past Stage 2 realistically used the in-house appraisal path — parity with seed-dummy.ts:153
    // (overrides coreAppFields' plain `app.appraisalPath ?? null`). Non-gating (see lib/desks.ts).
    appraisalPath: app.appraisalPath ?? (app.stage >= 3 ? 'internal' : null),
    id: app.id,
    createdAt: tsFromDate(app.createdAt),
    version: app.version ?? 0,
    updatedAt: FieldValue.serverTimestamp(),
  })

  for (const d of app.documents) bulk.set(subCol(db, app.id, SUB.documents).doc(d.id), docFields(d))

  // history: 1-based seq, docId = pad7(seq) (append-only backstop) — same as write.firestore.createApplication.
  app.history.forEach((h, i) => bulk.set(subCol(db, app.id, SUB.history).doc(pad7(i + 1)), historyFields(h, i + 1)))

  app.assignments.forEach((a, i) =>
    bulk.set(subCol(db, app.id, SUB.assignments).doc(assignmentDocId(a.stage, a.userId, a.assignedAt, i)), assignmentFields(a)),
  )

  for (const v of app.komiteVotes) bulk.set(subCol(db, app.id, SUB.komiteVotes).doc(v.userId), voteFields(v)) // docId=userId ⇒ one-vote-per-member

  // approvalSteps: 0-based monotonic seq, docId = pad7(seq) (read-back order == [createdAt,id]); each
  // approve/request step's qrToken anchors an index_qrTokens lookup. (Shape mirrors approval.firestore.)
  ;(app.approvalSteps ?? []).forEach((s, i) => {
    const stepId = approvalStepDocId(i)
    bulk.set(subCol(db, app.id, SUB.approvalSteps).doc(stepId), {
      seq: i,
      chain: s.chain,
      role: s.role,
      action: s.action,
      userId: s.userId,
      userName: s.userName,
      reason: s.reason ?? null,
      qrToken: s.qrToken ?? null,
      createdAt: tsFromDate(s.createdAt),
    })
    if (s.qrToken) bulk.set(db.collection(IDX.qrTokens).doc(s.qrToken), { appId: app.id, stepId })
  })

  // conversation: aiChatHistory → 'discussion' surface, aiAssistantLog → 'assistant' surface (0-based
  // per-surface seq), denormalized applicationId for the listUnansweredMentions collection-group query.
  ;(app.aiChatHistory ?? []).forEach((m, i) =>
    bulk.set(subCol(db, app.id, SUB.conversation).doc(conversationDocId('discussion', i)), {
      applicationId: app.id,
      surface: 'discussion',
      seq: i,
      role: m.role,
      content: m.content,
      authorId: m.authorId ?? null,
      authorName: m.authorName ?? (m.role === 'assistant' ? 'MIZAN AI' : null),
      mentions: m.mentions ?? [],
      createdAt: tsFromDate(app.createdAt),
    }),
  )
  ;(app.aiAssistantLog ?? []).forEach((m, i) =>
    bulk.set(subCol(db, app.id, SUB.conversation).doc(conversationDocId('assistant', i)), {
      applicationId: app.id,
      surface: 'assistant',
      seq: i,
      role: m.role,
      content: m.content,
      authorId: null,
      authorName: null,
      mentions: [],
      createdAt: tsFromDate(app.createdAt),
    }),
  )
}

function seedMeetings(bulk: BulkWriter, db: Firestore): void {
  let maxN = 0
  let year = new Date().getFullYear()
  for (const m of MEETINGS) {
    bulk.set(db.collection(COL.meetings).doc(m.id), {
      id: m.id,
      date: m.date,
      time: m.time,
      room: m.room, // undefined → dropped (ignoreUndefinedProperties); meetings use absent→undefined
      meetingUrl: m.meetingUrl,
      chairUserId: m.chairUserId,
      notes: m.notes,
      minutes: m.minutes,
      minutesRecordedAt: m.minutesRecordedAt ? tsFromDate(m.minutesRecordedAt) : undefined,
      minutesRecordedBy: m.minutesRecordedBy,
      status: m.status,
      createdBy: m.createdBy,
      createdAt: tsFromDate(m.createdAt),
      agendaAppIds: m.agendaAppIds,
      agendaReasons: m.agendaReasons ?? {},
      attendeeUserIds: m.attendeeUserIds,
    })
    const parts = m.id.split('-') // MTG-YYYY-NNN
    year = parseInt(parts[1], 10) || year
    const n = parseInt(parts[2] ?? '0', 10) || 0
    if (n > maxN) maxN = n
  }
  // Advance the per-year meeting-id counter past the seeded ids so the next createMeeting allocates
  // MTG-YYYY-(maxN+1) instead of colliding with a seeded id (parity with Postgres max+1).
  if (MEETINGS.length) bulk.set(db.collection(COL.counters).doc(`meetingId-${year}`), { next: maxN }, { merge: true })
}

async function seedApprovalRouting(): Promise<void> {
  for (const r of DEMO_APPROVAL_ROUTING) {
    await fsAllocateAndCreateVersion({
      collection: COL.config_approvalRouting,
      scope: { makerUserId: r.makerUserId, chain: r.chain },
      docId: (v) => approvalRoutingDocId(r.makerUserId, r.chain, v),
      fields: { routing: r.routing },
      effectiveFrom: new Date('2026-01-01'),
      reason: 'Seeded demo routing (e2e) — strict routing demonstrable',
      createdBy: 'seed',
    })
  }
}

// Drop @example.com demo users no longer in the roster (parity with seed-dummy's prune of dropped
// personas). @example.com is a reserved test domain, so this can never touch a real user. The e2e
// reset clears the whole emulator first, so this is a no-op there — it matters only for a standalone
// re-seed against a non-empty Firestore.
async function pruneStaleDemoUsers(db: Firestore): Promise<number> {
  const rosterIds = new Set<string>([
    ...USERS.map((u) => u.id),
    ...DEMO_LOGINS.filter((d) => !d.userId).map((d) => d.id as string),
  ])
  const snap = await db.collection(COL.users).get()
  const stale = snap.docs.filter((s) => {
    const email = ((s.data().email as string | null | undefined) ?? '').toLowerCase()
    return email.endsWith('@example.com') && !rosterIds.has(s.id)
  })
  if (!stale.length) return 0
  const b = db.batch()
  stale.forEach((s) => b.delete(s.ref))
  await b.commit()
  return stale.length
}

/**
 * Seed the demo data layer into Firestore. Run AFTER seedFirestoreFactory (roles/desks/config).
 * @param opts.clean When not false, scope-deletes the seed apps/meetings first (idempotent standalone
 *   re-seed). The e2e reset clears the whole emulator before calling, so it passes `clean:false` to
 *   skip the redundant per-app recursiveDelete (and the prune).
 */
export async function seedFirestoreDemo(
  opts: { clean?: boolean } = {},
): Promise<{ users: number; applications: number; meetings: number; routing: number; pruned: number }> {
  // Dev-only — never write demo users/apps/meetings into a production project (parity with
  // prisma/seed-dummy.ts's production refusal; seedFirestoreFactory stays prod-safe — config only).
  if ((process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
    throw new Error('seedFirestoreDemo refused: NODE_ENV=production. Production seeds config only (seedFirestoreFactory).')
  }
  const db = getDb()
  const clean = opts.clean !== false

  if (clean) {
    for (const app of APPLICATIONS) await db.recursiveDelete(appRef(db, app.id))
    const mdel = db.batch()
    for (const m of MEETINGS) mdel.delete(db.collection(COL.meetings).doc(m.id))
    await mdel.commit()
  }

  const bulk = db.bulkWriter()
  seedUsers(bulk, db)
  for (const app of APPLICATIONS) seedApplication(bulk, db, app)
  seedMeetings(bulk, db)
  await bulk.close()

  await seedApprovalRouting()
  const pruned = clean ? await pruneStaleDemoUsers(db) : 0

  return {
    users: USERS.length + DEMO_LOGINS.filter((d) => !d.userId).length,
    applications: APPLICATIONS.length,
    meetings: MEETINGS.length,
    routing: DEMO_APPROVAL_ROUTING.length,
    pruned,
  }
}
