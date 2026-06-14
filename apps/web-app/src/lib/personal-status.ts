import type { LoanApplication } from './types'

export type PersonalMoveResult = { ok: true } | { ok: false; reason: 'no-assignment' | 'submitted' }

// Pure guard for a Home Kanban move (Tugas Saya ↔ Sedang Diproses). `assignment.status` is a personal
// organiser marker the workflow SETS but never GATES on, so a manual todo↔in_progress change is safe.
// Refuses a SUBMITTED assignment (workflow-owned via submittedAt — the "Terkirim" column is locked) or
// a user with no assignment. Targets the user's LATEST assignment (matches the board's selection).
// Mutates the app on ok; the caller persists.
export function applyPersonalStatusMove(
  app: LoanApplication,
  userId: string,
  status: 'todo' | 'in_progress',
): PersonalMoveResult {
  const assignment = app.assignments.filter((a) => a.userId === userId).at(-1)
  if (!assignment) return { ok: false, reason: 'no-assignment' }
  if (assignment.submittedAt !== null) return { ok: false, reason: 'submitted' }
  assignment.status = status
  return { ok: true }
}
