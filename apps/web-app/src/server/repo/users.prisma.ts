import 'server-only'

import { prisma } from '@/server/db'
import { DESKS, type Desk } from '@/lib/desks'

// Identity repo: first-login provisioning + effective-desk resolution.
// Effective desks = ⋃(desks of each assigned role) ∪ direct desk grants. Superadmin
// elevation is bootstrapped from the SUPERADMIN_EMAILS allowlist; thereafter it is
// managed in the Superadmin console (Phase 5). Phase 5 adds listUsers + grant CRUD.

export interface UserWithAccess {
  id: string
  email: string | null
  firebaseUid: string | null
  name: string
  avatarInitials: string
  title: string | null
  isSuperadmin: boolean
  /** Names of the user's ASSIGNED roles (job positions), e.g. "Relationship Manager".
   *  Drives the actor's display title fallback when `title` is null. See lib/auth/actor-title. */
  roleNames: string[]
  /** Flattened effective desk set (role desks ∪ direct grants). */
  desks: Desk[]
}

const USER_ACCESS_INCLUDE = {
  roles: { include: { role: { include: { desks: true } } } },
  desks: true,
} as const

type UserRow = {
  id: string
  email: string | null
  firebaseUid: string | null
  name: string
  avatarInitials: string
  title: string | null
  isSuperadmin: boolean
  roles: { role: { name: string; desks: { desk: string }[] } }[]
  desks: { desk: string }[]
}

function toUserWithAccess(row: UserRow): UserWithAccess {
  const set = new Set<string>()
  for (const ur of row.roles) for (const rd of ur.role.desks) set.add(rd.desk)
  for (const ud of row.desks) set.add(ud.desk)
  return {
    id: row.id,
    email: row.email,
    firebaseUid: row.firebaseUid,
    name: row.name,
    avatarInitials: row.avatarInitials,
    title: row.title,
    roleNames: row.roles.map((ur) => ur.role.name),
    isSuperadmin: row.isSuperadmin,
    desks: [...set] as Desk[],
  }
}

function superadminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Load a user by Firebase UID with their flattened effective desks, or null. */
export async function getUserByFirebaseUid(uid: string): Promise<UserWithAccess | null> {
  const row = await prisma.user.findUnique({
    where: { firebaseUid: uid },
    include: USER_ACCESS_INCLUDE,
  })
  return row ? toUserWithAccess(row as UserRow) : null
}

/**
 * First-login provisioning. Resolves the Firebase identity to a Mizan User:
 *  1. match by firebaseUid → existing user;
 *  2. else match by email an existing user → ADOPT it (re-point firebaseUid). Covers a
 *     seeded user that has no uid yet AND a row whose uid went STALE (e.g. the Auth
 *     Emulator regenerated its localId, so step 1 no longer resolves). Email is the
 *     stable @unique identity for a verified login, so re-linking is correct — and it
 *     avoids a duplicate `create` that would fail the email unique constraint (→ 401);
 *  3. else CREATE a new user with ZERO grants (→ "awaiting access" until granted).
 * Superadmin is bootstrapped (never auto-demoted) from the SUPERADMIN_EMAILS allowlist.
 */
export async function ensureUser(input: {
  email: string | null
  firebaseUid: string
  name?: string | null
  picture?: string | null
}): Promise<UserWithAccess> {
  const email = input.email?.toLowerCase() ?? null
  const allowlisted = email ? superadminEmails().includes(email) : false
  const name = input.name?.trim() || email || 'Pengguna Baru'

  // 1. Existing by firebaseUid.
  const byUid = await prisma.user.findUnique({
    where: { firebaseUid: input.firebaseUid },
    include: USER_ACCESS_INCLUDE,
  })
  if (byUid) {
    // Bootstrap-elevate only (console manages thereafter; never auto-demote).
    if (allowlisted && !byUid.isSuperadmin) {
      const updated = await prisma.user.update({
        where: { id: byUid.id },
        data: { isSuperadmin: true },
        include: USER_ACCESS_INCLUDE,
      })
      return toUserWithAccess(updated as UserRow)
    }
    return toUserWithAccess(byUid as UserRow)
  }

  // 2. Adopt an existing user that shares this email: link a not-yet-linked seeded user,
  //    OR re-point a row whose firebaseUid went stale (step 1 already returned null, so no
  //    user holds the incoming uid — re-linking can never clash with a live identity).
  if (email) {
    const byEmail = await prisma.user.findUnique({
      where: { email },
      include: USER_ACCESS_INCLUDE,
    })
    if (byEmail) {
      const linked = await prisma.user.update({
        where: { id: byEmail.id },
        data: {
          firebaseUid: input.firebaseUid,
          isSuperadmin: byEmail.isSuperadmin || allowlisted,
        },
        include: USER_ACCESS_INCLUDE,
      })
      return toUserWithAccess(linked as UserRow)
    }
  }

  // 3. Brand-new user — zero grants (awaiting access), unless allowlisted superadmin.
  const created = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      firebaseUid: input.firebaseUid,
      name,
      avatarInitials: initialsFrom(name),
      isSuperadmin: allowlisted,
    },
    include: USER_ACCESS_INCLUDE,
  })
  return toUserWithAccess(created as UserRow)
}

// ─────────────────────────────────────────────────────────────────────────────
// Superadmin console (Phase 5): user/role/desk administration + impersonation
// target resolution. All callers are gated to a superadmin in server/actions/admin.ts
// — these repo fns assume that check already passed.
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminRoleRef {
  id: string
  key: string
  name: string
}

/** A user as shown in the admin Users tab: assigned roles + DIRECT desk grants +
 *  the flattened effective set (roles ∪ direct). */
export interface AdminUser extends UserWithAccess {
  roles: AdminRoleRef[]
  directDesks: Desk[]
}

/** A configurable role (job position) with its desk membership + assignment count. */
export interface AdminRole {
  id: string
  key: string
  name: string
  isSystem: boolean
  desks: Desk[]
  userCount: number
}

export interface DeskCatalogRow {
  desk: Desk
  label: string
  stage: number | null
  pipelineRole: string
  description: string | null
  sortOrder: number
}

const ADMIN_USER_INCLUDE = {
  roles: { include: { role: { include: { desks: true } } } },
  desks: true,
} as const

type AdminUserRow = Omit<UserRow, 'roles'> & {
  roles: { role: { id: string; key: string; name: string; desks: { desk: string }[] } }[]
}

function toAdminUser(row: AdminUserRow): AdminUser {
  const base = toUserWithAccess(row)
  return {
    ...base,
    roles: row.roles.map((ur) => ({ id: ur.role.id, key: ur.role.key, name: ur.role.name })),
    directDesks: row.desks.map((d) => d.desk as Desk),
  }
}

/** All users with their roles, direct grants, and effective desks (admin Users tab). */
export async function listUsers(): Promise<AdminUser[]> {
  const rows = await prisma.user.findMany({
    include: ADMIN_USER_INCLUDE,
    orderBy: [{ isSuperadmin: 'desc' }, { name: 'asc' }],
  })
  return rows.map((r) => toAdminUser(r as AdminUserRow))
}

/** Load one user's effective access by id (impersonation target resolution). */
export async function getUserAccessById(userId: string): Promise<UserWithAccess | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, include: USER_ACCESS_INCLUDE })
  return row ? toUserWithAccess(row as UserRow) : null
}

/** The login email for a user id — the Google identity used for Drive permission grants
 *  (server/docs/access.ts). Null for seeded demo actors that never logged in. */
export async function getUserEmailById(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return row?.email ?? null
}

/** All configurable roles with desk membership + how many users hold each (Roles tab). */
export async function listRoles(): Promise<AdminRole[]> {
  const rows = await prisma.role.findMany({
    include: { desks: true, _count: { select: { users: true } } },
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  })
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    isSystem: r.isSystem,
    desks: r.desks.map((d) => d.desk as Desk),
    userCount: r._count.users,
  }))
}

/** The desk catalog (read-only Desks tab). */
export async function listDeskCatalog(): Promise<DeskCatalogRow[]> {
  const rows = await prisma.deskCatalog.findMany({ orderBy: { sortOrder: 'asc' } })
  return rows.map((r) => ({
    desk: r.desk as Desk,
    label: r.label,
    stage: r.stage,
    pipelineRole: r.pipelineRole,
    description: r.description,
    sortOrder: r.sortOrder,
  }))
}

const KNOWN_DESKS = new Set<string>(DESKS)
function assertKnownDesk(desk: string): asserts desk is Desk {
  if (!KNOWN_DESKS.has(desk)) throw new Error(`Desk tidak dikenal: ${desk}`)
}

// ── grant/revoke (idempotent) ───────────────────────────────────────────────

export async function grantRole(userId: string, roleId: string, grantedBy: string): Promise<void> {
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    create: { userId, roleId, grantedBy },
    update: {},
  })
}

export async function revokeRole(userId: string, roleId: string): Promise<void> {
  await prisma.userRole.deleteMany({ where: { userId, roleId } })
}

export async function grantDesk(userId: string, desk: string, grantedBy: string): Promise<void> {
  assertKnownDesk(desk)
  await prisma.userDesk.upsert({
    where: { userId_desk: { userId, desk } },
    create: { userId, desk, grantedBy },
    update: {},
  })
}

export async function revokeDesk(userId: string, desk: string): Promise<void> {
  await prisma.userDesk.deleteMany({ where: { userId, desk } })
}

export async function setSuperadmin(userId: string, value: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { isSuperadmin: value } })
}

// ── role CRUD ────────────────────────────────────────────────────────────────

function roleKeyFrom(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `role-${Date.now()}`
}

/** Create a custom (non-system) role with the given desk membership. */
export async function createRole(name: string, desks: string[]): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Nama peran tidak boleh kosong')
  desks.forEach(assertKnownDesk)
  let key = roleKeyFrom(trimmed)
  if (await prisma.role.findUnique({ where: { key } })) key = `${key}-${Date.now()}`
  await prisma.role.create({
    data: { key, name: trimmed, isSystem: false, desks: { create: desks.map((desk) => ({ desk })) } },
  })
}

/** Replace a role's desk membership (system roles included — editing membership is
 *  allowed; only DELETION of system roles is blocked). */
export async function updateRoleDesks(roleId: string, desks: string[]): Promise<void> {
  desks.forEach(assertKnownDesk)
  await prisma.$transaction([
    prisma.roleDesk.deleteMany({ where: { roleId } }),
    prisma.roleDesk.createMany({ data: desks.map((desk) => ({ roleId, desk })) }),
  ])
}

/** Delete a custom role. System roles (isSystem) are protected. */
export async function deleteRole(roleId: string): Promise<void> {
  const role = await prisma.role.findUnique({ where: { id: roleId } })
  if (!role) throw new Error('Peran tidak ditemukan')
  if (role.isSystem) throw new Error('Peran sistem tidak dapat dihapus.')
  await prisma.role.delete({ where: { id: roleId } })
}
