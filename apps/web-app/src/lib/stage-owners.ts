import type { LoanApplication, Role, Stage, User } from '@/lib/types'
import { USERS } from '@/lib/seed-data/users'
import { DEFAULT_ROLES, DESK_FOR_STAGE, ROLE_OF_DESK, type Desk } from '@/lib/desks'
import { roleSopCode } from '@/lib/role-labels'

// The desks bundled into a seed user's granted default-role.
const desksForRoleKey = (key: string): Desk[] => DEFAULT_ROLES.find((r) => r.key === key)?.desks ?? []

// Resolve the seed user(s) who own a given stage — DESK-based (precise): a user owns the stage
// iff a desk in their granted bundle owns it (DESK_FOR_STAGE). Drives assignment seeding + the
// on-advance assignment push. Role alone is too coarse now (AO+LA both fold to RM), so we key on
// desks. One user per owning desk in the demo data, so this stays deterministic.
export function ownersForStage(stage: Stage): User[] {
  const stageDesks = DESK_FOR_STAGE[stage]
  return USERS.filter((u) => desksForRoleKey(u.roleKey).some((d) => stageDesks.includes(d)))
}

// A resolved stage owner (the minimal shape applyDecision needs to open an assignment).
export interface StageOwner { id: string; name: string; role: Role }

// Grant-based owner resolution: the user(s) who actually HOLD a desk owning the stage, from their
// real effective desks (role grants ∪ direct grants), NOT the static seed. Drives runtime
// auto-assignment so an admin-granted user lands the app on their Home (not just seed users). One
// assignment per user (first owning desk's role) — matches the seed `ownersForStage` cardinality.
export function ownersFromUsers(users: { id: string; name: string; desks: Desk[] }[], stage: Stage): StageOwner[] {
  const stageDesks = DESK_FOR_STAGE[stage]
  return users.flatMap((u) => {
    const owningDesk = u.desks.find((d) => stageDesks.includes(d))
    return owningDesk ? [{ id: u.id, name: u.name, role: ROLE_OF_DESK[owningDesk] }] : []
  })
}

// Display string for the user(s) currently holding the application at its
// active stage (open assignments). Two names at Stage 2.
export function activeOwnerNames(app: LoanApplication): string {
  const names = app.assignments
    .filter(assignment => assignment.stage === app.stage && assignment.submittedAt === null)
    .map(assignment => assignment.userName)
  return names.length > 0 ? names.join(', ') : '—'
}

// Open-stage owners WITH their pipeline role — for role-tagged ownership in lists/cards so a
// coordinator can see who holds what (e.g. at Stage 2, RM bureau vs LG legal/appraisal). NOTE:
// the assignment carries the pipeline ROLE, not the desk, so two LG deliverables (Legal +
// Appraisal) both read "LG"; desk-level tagging needs assignment.desk (a later refinement).
export function activeOwners(app: LoanApplication): { name: string; role: Role }[] {
  return app.assignments
    .filter((a) => a.stage === app.stage && a.submittedAt === null)
    .map((a) => ({ name: a.userName, role: a.role }))
}

// Compact role-tagged owner label, e.g. "Budi (LG), Siti (RM)". "—" when unassigned.
export function activeOwnersLabel(app: LoanApplication): string {
  const owners = activeOwners(app)
  return owners.length ? owners.map((o) => `${o.name} (${roleSopCode(o.role)})`).join(', ') : '—'
}
