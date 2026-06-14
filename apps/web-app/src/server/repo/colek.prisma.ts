import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'

// COLEK repo (RM-led redesign, design Follow-up-decisions "A1 colek"). Create + read + lifecycle of
// the cross-desk DeskAssignment work-request rows. server-only (never bundled to the client). Mirrors
// the customer.ts repo conventions: a domain ColekRow shape + a single row→domain serializer; JSON
// cast at the write boundary. The PURE first-assignment decision lives in lib/colek.ts
// (resolveColekAssignee) — this repo only persists/reads and supplies its caseload inputs
// (activeDealCountsByDesk). The OJK audit row is the paired HistoryEntry on the Application, written
// by the action layer (server/actions/colek-actions.core.ts) — NOT here.

// JSON cast at the write boundary (the reassignmentLog array lacks Prisma's implicit index signature).
const jsonOrNull = (v: unknown) => (v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue))

/** A colek lifecycle status. pending/in_progress are NON-TERMINAL (live); completed/rejected TERMINAL. */
export type ColekStatus = 'pending' | 'in_progress' | 'completed' | 'rejected'

/** Non-terminal statuses — a colek that still counts as active work (sticky + caseload lookups). */
export const ACTIVE_COLEK_STATUSES: ColekStatus[] = ['pending', 'in_progress']

/** One admin-reassignment audit entry, appended to reassignmentLog on each reassign. */
export interface ColekReassignmentEntry {
  from: string // prior assigneeUserId
  to: string // new assigneeUserId
  by: string // admin actor userId
  reason: string
  at: string // ISO timestamp
}

/** The domain shape the repo reads/writes. Mirrors the Prisma DeskAssignment model. */
export interface ColekRow {
  id: string
  applicationId: string
  targetDesk: string
  assigneeUserId: string
  assigneeName: string
  requestedBy: string
  requestedByName: string
  description: string
  status: ColekStatus
  createdAt: Date
  completedAt: Date | null
  reassignmentLog: ColekReassignmentEntry[] | null
}

/** Fields accepted on create (id/timestamps/status are server-assigned). */
export interface CreateColekInput {
  applicationId: string
  targetDesk: string
  assigneeUserId: string
  assigneeName: string
  requestedBy: string
  requestedByName: string
  description: string
}

type DeskAssignmentRow = Prisma.DeskAssignmentGetPayload<Record<string, never>>

function rowToColek(row: DeskAssignmentRow): ColekRow {
  return {
    id: row.id,
    applicationId: row.applicationId,
    targetDesk: row.targetDesk,
    assigneeUserId: row.assigneeUserId,
    assigneeName: row.assigneeName,
    requestedBy: row.requestedBy,
    requestedByName: row.requestedByName,
    description: row.description,
    status: row.status as ColekStatus,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    reassignmentLog: (row.reassignmentLog as ColekReassignmentEntry[] | null) ?? null,
  }
}

/** Persist a new colek (status 'pending'); returns the freshly-read domain row. */
export async function createColek(input: CreateColekInput): Promise<ColekRow> {
  const row = await prisma.deskAssignment.create({
    data: {
      applicationId: input.applicationId,
      targetDesk: input.targetDesk,
      assigneeUserId: input.assigneeUserId,
      assigneeName: input.assigneeName,
      requestedBy: input.requestedBy,
      requestedByName: input.requestedByName,
      description: input.description,
      status: 'pending',
    },
  })
  return rowToColek(row)
}

/** Read one colek by id, or null. */
export async function getColek(id: string): Promise<ColekRow | null> {
  const row = await prisma.deskAssignment.findUnique({ where: { id } })
  return row ? rowToColek(row) : null
}

/** Every colek raised on an application, newest first (the per-app colek history). */
export async function listColeksForApp(applicationId: string): Promise<ColekRow[]> {
  const rows = await prisma.deskAssignment.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(rowToColek)
}

/** The sticky lookup: the active (non-terminal) colek for an app×desk, or null. There is at most one
 *  live colek per app×desk (the action layer reuses this instead of creating a second) — if more than
 *  one ever exists, the newest is returned. */
export async function activeColekForDesk(applicationId: string, targetDesk: string): Promise<ColekRow | null> {
  const row = await prisma.deskAssignment.findFirst({
    where: { applicationId, targetDesk, status: { in: ACTIVE_COLEK_STATUSES } },
    orderBy: { createdAt: 'desc' },
  })
  return row ? rowToColek(row) : null
}

/** A user's open coleks (status pending/in_progress assigned to them), newest first — the per-user
 *  incoming-colek panel + the derived-notification source. */
export async function listPendingColeksForUser(userId: string): Promise<ColekRow[]> {
  const rows = await prisma.deskAssignment.findMany({
    where: { assigneeUserId: userId, status: { in: ACTIVE_COLEK_STATUSES } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(rowToColek)
}

/** Per-candidate active (non-terminal) colek caseload + most-recent assignment time, keyed by user id.
 *  Feeds the resolver's ColekCandidate inputs (lib/colek.ts resolveColekAssignee). Terminal coleks
 *  (completed/rejected) are EXCLUDED from both the count and the lastAssignedAt. A user with no active
 *  colek is simply absent from the map (the action layer defaults them to { count: 0, lastAssignedAt:
 *  null } — never assigned = most available). */
export async function activeDealCountsByDesk(
  targetDesk: string,
): Promise<Map<string, { count: number; lastAssignedAt: string | null }>> {
  const rows = await prisma.deskAssignment.findMany({
    where: { targetDesk, status: { in: ACTIVE_COLEK_STATUSES } },
    select: { assigneeUserId: true, createdAt: true },
  })
  const map = new Map<string, { count: number; lastAssignedAt: string | null }>()
  for (const r of rows) {
    const prev = map.get(r.assigneeUserId)
    const at = r.createdAt.toISOString()
    if (!prev) {
      map.set(r.assigneeUserId, { count: 1, lastAssignedAt: at })
    } else {
      prev.count += 1
      if (prev.lastAssignedAt == null || at > prev.lastAssignedAt) prev.lastAssignedAt = at
    }
  }
  return map
}

/** Mark a colek completed (sets completedAt). */
export async function completeColek(id: string): Promise<ColekRow> {
  const row = await prisma.deskAssignment.update({
    where: { id },
    data: { status: 'completed', completedAt: new Date() },
  })
  return rowToColek(row)
}

/** Mark a colek rejected (the assignee declines). Sets completedAt (terminal). `reason` is part of
 *  the API contract but is NOT a row column — the rejection reason is audited on the Application's
 *  HistoryEntry ledger by the action layer (colek-actions.core.ts rejectColekForActor). Kept in the
 *  signature so callers pass it through one place; `void` marks it intentionally repo-unused. */
export async function rejectColek(id: string, reason: string): Promise<ColekRow> {
  void reason
  const row = await prisma.deskAssignment.update({
    where: { id },
    data: { status: 'rejected', completedAt: new Date() },
  })
  return rowToColek(row)
}

/** Admin reassign: append to reassignmentLog, repoint the assignee, KEEP status 'pending' (the new
 *  assignee starts fresh). Reads the current row first to preserve the prior log + capture `from`. */
export async function reassignColek(
  id: string,
  newAssignee: { id: string; name: string },
  by: string,
  reason: string,
): Promise<ColekRow> {
  const current = await prisma.deskAssignment.findUnique({ where: { id } })
  if (!current) throw new Error(`Colek ${id} not found`)
  const log = ((current.reassignmentLog as ColekReassignmentEntry[] | null) ?? []).concat({
    from: current.assigneeUserId,
    to: newAssignee.id,
    by,
    reason,
    at: new Date().toISOString(),
  })
  const row = await prisma.deskAssignment.update({
    where: { id },
    data: {
      assigneeUserId: newAssignee.id,
      assigneeName: newAssignee.name,
      status: 'pending',
      reassignmentLog: jsonOrNull(log),
    },
  })
  return rowToColek(row)
}
