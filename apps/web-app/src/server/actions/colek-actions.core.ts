import 'server-only'

import { loadApplicationForWrite, saveApplication } from '@/server/repo/write'
import { appendHistory } from '@/lib/history'
import {
  canActOnDesk,
  hasDesk,
  auditUserName,
  AuthzError,
  type Actor,
} from '@/lib/auth/can'
import type { Desk } from '@/lib/desks'
import { listUsers } from '@/server/repo/users'
import { resolveColekAssignee, type ColekCandidate } from '@/lib/colek'
import {
  createColek,
  getColek,
  activeColekForDesk,
  activeDealCountsByDesk,
  completeColek,
  rejectColek,
  reassignColek,
  listColeksForApp,
  type ColekRow,
} from '@/server/repo/colek'

// Actor-injected cores of the COLEK server actions (RM-led redesign, design Follow-up-decisions
// "A1 colek"). Kept OUT of the 'use server' module so the actor-trusting entry points are NOT
// registered as public server actions (a forged Actor over the wire) — colek-actions.ts resolves +
// gates the real actor, then delegates here. server-only (never bundled to the client). This split
// also makes the gated logic itest-able with a test Actor (mirrors discovery-actions.core.ts).
//
// COLEK = an in-app directed work request: one desk nudges another desk to do work on an application.
// The PURE first-assignment decision (load-balance + sticky) lives in lib/colek.ts; persistence +
// caseload reads in server/repo/colek.ts. The OJK audit row is a HistoryEntry on the Application,
// written here through the load/save aggregate path (load the aggregate JUST to append the history
// row — the colek itself is NOT on the aggregate, mirroring the discovery design).

/** Audit one colek event onto the application's HistoryEntry ledger (the load/save aggregate path).
 *  Loads the aggregate only to append the row; never mutates other fields. Tolerates a missing app
 *  (audit is best-effort — a colek action must not 500 because the app vanished mid-flight). */
async function auditOnApp(actor: Actor, appId: string, action: string, reason?: string): Promise<void> {
  const app = await loadApplicationForWrite(appId)
  if (!app) return
  appendHistory(app, {
    userId: actor.userId,
    userName: auditUserName(actor),
    action,
    stage: app.stage,
    ...(reason ? { reason } : {}),
  })
  await saveApplication(app)
}

/** Build the resolver inputs: every holder of `targetDesk` (from their effective desks), decorated
 *  with their active colek caseload + last-assigned time. A holder with no active colek defaults to
 *  { activeDeals: 0, lastAssignedAt: null } (never assigned = most available). */
async function buildCandidates(targetDesk: Desk): Promise<ColekCandidate[]> {
  const [users, counts] = await Promise.all([listUsers(), activeDealCountsByDesk(targetDesk)])
  return users
    .filter((u) => u.desks.includes(targetDesk))
    .map((u) => {
      const c = counts.get(u.id)
      return {
        userId: u.id,
        name: u.name,
        activeDeals: c?.count ?? 0,
        lastAssignedAt: c?.lastAssignedAt ?? null,
      }
    })
}

/**
 * COLEK an application's `targetDesk`: a participant requests cross-desk work. STICKY — if an active
 * colek already exists for this app×desk, return it (don't duplicate). Else load-balance: enumerate
 * the desk's holders, pick the candidate with the fewest active deals (tie → least-recently-assigned),
 * create the colek to them, and audit on the application. Gate: the actor must be able to act on the
 * app at its current stage (a participant) OR hold the RM `intake` desk (the originator).
 */
export async function colekDeskForActor(
  actor: Actor,
  appId: string,
  targetDesk: Desk,
  description: string,
): Promise<ColekRow> {
  // Gate the requester: a participant on the app OR RM intake (a participant requests work).
  const app = await loadApplicationForWrite(appId)
  if (!app) throw new Error(`Application ${appId} not found`)
  if (!canActOnDesk(actor, app) && !hasDesk(actor, 'intake')) {
    throw new AuthzError('Tindakan ditolak: Anda tidak dapat mengajukan colek untuk pengajuan ini.')
  }

  // STICKY per app×desk start-to-end: reuse an open colek instead of creating a second.
  const existing = await activeColekForDesk(appId, targetDesk)
  if (existing) return existing

  // First assignment: load-balance across the desk's holders (no sticky on first).
  const candidates = await buildCandidates(targetDesk)
  const chosen = resolveColekAssignee(candidates)
  if (!chosen) {
    throw new AuthzError(`Tindakan ditolak: tidak ada pengguna yang memegang desk ${targetDesk}.`)
  }

  const colek = await createColek({
    applicationId: appId,
    targetDesk,
    assigneeUserId: chosen.userId,
    assigneeName: chosen.name,
    requestedBy: actor.userId,
    requestedByName: auditUserName(actor),
    description,
  })
  await auditOnApp(actor, appId, `Colek ${targetDesk} → ${chosen.name}: ${description}`)
  return colek
}

/**
 * Read every colek raised on an application (newest-first) — the per-app colek history that drives the
 * Alur kerja colek-status affordance. GATED like a colek request: the actor must be a participant on the
 * app OR hold RM `intake` (the originator). Read-only; never mutates. Returns [] if the app vanished.
 */
export async function listColeksForAppForActor(actor: Actor, appId: string): Promise<ColekRow[]> {
  const app = await loadApplicationForWrite(appId)
  if (!app) return []
  if (!canActOnDesk(actor, app) && !hasDesk(actor, 'intake')) {
    throw new AuthzError('Tindakan ditolak: Anda tidak dapat melihat colek untuk pengajuan ini.')
  }
  return listColeksForApp(appId)
}

/** The actor may close a colek if they are the assignee OR they hold the target desk (a desk peer can
 *  pick up or close the work). Colek lifecycle is desk-scoped — NOT gated on stage ownership. */
async function requireColekParticipation(
  actor: Actor,
  colek: { targetDesk: string; assigneeUserId: string },
): Promise<void> {
  if (actor.userId === colek.assigneeUserId) return
  if (hasDesk(actor, colek.targetDesk as Desk)) return
  throw new AuthzError('Tindakan ditolak: hanya penerima colek atau pemegang desk yang dapat menutupnya.')
}

/** Read one colek row by id or throw (repo by-id getter). */
async function loadColekOrThrow(colekId: string): Promise<ColekRow> {
  const colek = await getColek(colekId)
  if (!colek) throw new Error(`Colek ${colekId} not found`)
  return colek
}

/** The ASSIGNEE (or a desk peer) marks a colek done. */
export async function completeColekForActor(actor: Actor, colekId: string): Promise<ColekRow> {
  const colek = await loadColekOrThrow(colekId)
  await requireColekParticipation(actor, colek)
  const done = await completeColek(colekId)
  await auditOnApp(actor, colek.applicationId, `Colek ${colek.targetDesk} selesai: ${colek.description}`)
  return done
}

/** The ASSIGNEE (or a desk peer) declines a colek with a reason. */
export async function rejectColekForActor(actor: Actor, colekId: string, reason: string): Promise<ColekRow> {
  const colek = await loadColekOrThrow(colekId)
  await requireColekParticipation(actor, colek)
  const rejected = await rejectColek(colekId, reason)
  await auditOnApp(actor, colek.applicationId, `Colek ${colek.targetDesk} ditolak: ${colek.description}`, reason)
  return rejected
}

/**
 * ADMIN reassign a colek to a different user. Gate: the actor is a superadmin OR holds the
 * `komite-admin` (sekretariat/admin) desk. Resolves the new user's display name from the user
 * directory, repoints the assignee (status back to pending, log appended), and audits on the app.
 */
export async function reassignColekForActor(
  actor: Actor,
  colekId: string,
  newUserId: string,
  reason: string,
): Promise<ColekRow> {
  if (!actor.isSuperadmin && !hasDesk(actor, 'komite-admin')) {
    throw new AuthzError('Tindakan ditolak: hanya admin yang dapat menugaskan ulang colek.')
  }
  const colek = await loadColekOrThrow(colekId)
  const users = await listUsers()
  const newUser = users.find((u) => u.id === newUserId)
  if (!newUser) throw new Error(`Pengguna ${newUserId} tidak ditemukan`)
  // Desk-holder invariant: the new assignee MUST hold the colek's target desk (same constraint the
  // load-balanced first-assign enforces) — never reassign desk work to someone who cannot perform it.
  if (!newUser.desks.includes(colek.targetDesk as Desk)) {
    throw new AuthzError(`Tindakan ditolak: ${newUser.name} tidak memegang desk ${colek.targetDesk}.`)
  }

  const reassigned = await reassignColek(colekId, { id: newUser.id, name: newUser.name }, actor.userId, reason)
  await auditOnApp(
    actor,
    colek.applicationId,
    `Colek ${colek.targetDesk} ditugaskan ulang → ${newUser.name}`,
    reason,
  )
  return reassigned
}
