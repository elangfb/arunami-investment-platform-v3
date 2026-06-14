'use server'

import { after } from 'next/server'
import { requireActor } from '@/server/auth/session'
import { syncRootGrantForUser } from '@/server/docs/root-share'
import { AuthzError, assertDesk, type Actor } from '@/lib/auth/can'
import { ADMIN_DESKS, type Desk } from '@/lib/desks'
import {
  createRole as repoCreateRole,
  deleteRole as repoDeleteRole,
  grantDesk as repoGrantDesk,
  grantRole as repoGrantRole,
  revokeDesk as repoRevokeDesk,
  revokeRole as repoRevokeRole,
  setSuperadmin as repoSetSuperadmin,
  updateRoleDesks as repoUpdateRoleDesks,
} from '@/server/repo/users'

// Admin console write actions. EVERY action re-checks authz server-side (POST-reachable).
// An actor that is impersonating is NOT a superadmin (isSuperadmin is forced false during
// impersonation) and holds only the impersonated desks, so it cannot reach admin actions —
// admin changes require stepping out of impersonation first.
//
// Phase B (configurability-and-admin.md): user/role management is owned by the ADMIN-USERS
// desk (superadmin passes — it holds every desk). Break-glass powers (setSuperadmin) stay
// superadmin-only. GUARDRAIL: granting/revoking an ADMIN-* desk stays superadmin-only too, so
// an ADMIN-USERS holder cannot self-escalate to ADMIN-POLICY/MASTER (fail-closed; flagged for
// review — relax to ADMIN-USERS if the bank wants delegated admin-desk granting).

/** ADR-0019 §3: converge the target's root "Mizan" folder read grant with their NEW effective
 *  access (admitted → grant; zero-desk non-superadmin → revoke), so a user admitted or offboarded
 *  mid-session doesn't wait for their next login / the reconcile sweep. Fire-and-forget
 *  (post-response via after(); syncRootGrantForUser never throws) — admin actions must not block
 *  on Drive. */
function queueRootGrantSync(userId: string): void {
  try {
    after(() => syncRootGrantForUser(userId))
  } catch {
    void syncRootGrantForUser(userId)
  }
}

async function requireSuperadmin(): Promise<Actor> {
  const actor = await requireActor()
  if (!actor.isSuperadmin) throw new AuthzError('Tindakan ditolak: hanya Superadmin.')
  return actor
}

/** Require the given admin desk (superadmin always passes — it resolves to all desks). */
async function requireAdminDesk(desk: Desk): Promise<Actor> {
  const actor = await requireActor()
  assertDesk(actor, desk) // throws AuthzError if the actor lacks it
  return actor
}

export async function grantRoleAction(userId: string, roleId: string): Promise<void> {
  const actor = await requireAdminDesk('ADMIN-USERS')
  await repoGrantRole(userId, roleId, actor.userId)
  queueRootGrantSync(userId) // newly-admitted user gets root Drive read without re-login
}

export async function revokeRoleAction(userId: string, roleId: string): Promise<void> {
  await requireAdminDesk('ADMIN-USERS')
  await repoRevokeRole(userId, roleId)
  queueRootGrantSync(userId) // offboarded-to-zero-desk user loses root Drive read
}

export async function grantDeskAction(userId: string, desk: string): Promise<void> {
  const actor = await requireAdminDesk('ADMIN-USERS')
  assertNotAdminDeskEscalation(actor, desk)
  await repoGrantDesk(userId, desk, actor.userId)
  queueRootGrantSync(userId) // newly-admitted user gets root Drive read without re-login
}

export async function revokeDeskAction(userId: string, desk: string): Promise<void> {
  const actor = await requireAdminDesk('ADMIN-USERS')
  assertNotAdminDeskEscalation(actor, desk)
  await repoRevokeDesk(userId, desk)
  queueRootGrantSync(userId) // offboarded-to-zero-desk user loses root Drive read
}

/** Guardrail: only a superadmin may grant/revoke the cross-cutting ADMIN-* desks. */
function assertNotAdminDeskEscalation(actor: Actor, desk: string): void {
  if ((ADMIN_DESKS as string[]).includes(desk) && !actor.isSuperadmin) {
    throw new AuthzError('Tindakan ditolak: hibah/cabut desk Admin hanya oleh Superadmin.')
  }
}

/** Same guardrail for role BUNDLES: an ADMIN-USERS holder can't smuggle an ADMIN-* desk
 *  into a role and grant that (escalation via the role path). Superadmin-only. */
function assertNoAdminDesksInBundle(actor: Actor, desks: string[]): void {
  if (!actor.isSuperadmin && desks.some((d) => (ADMIN_DESKS as string[]).includes(d))) {
    throw new AuthzError('Tindakan ditolak: peran yang memuat desk Admin hanya oleh Superadmin.')
  }
}

export async function setSuperadminAction(userId: string, value: boolean): Promise<void> {
  const actor = await requireSuperadmin()
  // Guard: a superadmin cannot remove their OWN elevation (avoid locking out the
  // last admin by self-demotion; revoke another admin instead).
  if (!value && userId === actor.userId) {
    throw new AuthzError('Anda tidak dapat mencabut status Superadmin Anda sendiri.')
  }
  await repoSetSuperadmin(userId, value)
  queueRootGrantSync(userId) // elevation admits; demotion may offboard (zero-desk → revoke)
}

export async function createRoleAction(name: string, desks: string[]): Promise<void> {
  const actor = await requireAdminDesk('ADMIN-USERS')
  assertNoAdminDesksInBundle(actor, desks)
  await repoCreateRole(name, desks)
}

export async function updateRoleDesksAction(roleId: string, desks: string[]): Promise<void> {
  const actor = await requireAdminDesk('ADMIN-USERS')
  assertNoAdminDesksInBundle(actor, desks)
  await repoUpdateRoleDesks(roleId, desks)
}

export async function deleteRoleAction(roleId: string): Promise<void> {
  await requireAdminDesk('ADMIN-USERS')
  await repoDeleteRole(roleId)
}
