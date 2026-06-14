import 'server-only'
import { randomUUID } from 'node:crypto'
import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL, IDX } from '@/server/firebase/collections'
import { DESKS, type Desk } from '@/lib/desks'
import { NotFoundError, isAlreadyExists, isNotFound } from './errors'
import type { UserWithAccess, AdminUser, AdminRole, DeskCatalogRow } from './users.prisma'

// Firestore impl of the identity/access repo — parity with users.prisma.ts. users/{id} carries
// roleIds[] + direct desks[]; roles/{id} carries desks[]; effective desks = ⋃(role.desks) ∪ direct.
// Readers DEFENSIVELY omit dangling roleIds (a role deleted mid-flight) — critique #18, which is what
// makes the non-atomic deleteRole cascade safe. (Per-grant grantedAt/grantedBy metadata from the
// Prisma join tables is dropped — the domain access model never exposed it.)
//
// NOTE: ensureUser is query-based (find-by-uid → find-by-email-adopt → create). Index-doc race
// hardening (index_userEmail/index_userFirebaseUid tx.create per critique #17) is a follow-up; the
// sequential adopt path already prevents duplicate rows (the users.itest count==1 case).

type Data = Record<string, unknown>

const KNOWN_DESKS = new Set<string>(DESKS)
function assertKnownDesk(desk: string): asserts desk is Desk {
  if (!KNOWN_DESKS.has(desk)) throw new Error(`Desk tidak dikenal: ${desk}`)
}
function superadminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
function roleKeyFrom(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `role-${Date.now()}`
}

interface RoleData {
  id: string
  key: string
  name: string
  isSystem: boolean
  desks: Desk[]
}
function snapToRole(s: DocumentSnapshot): RoleData {
  const d = (s.data() ?? {}) as Data
  return {
    id: s.id,
    key: d.key as string,
    name: d.name as string,
    isSystem: (d.isSystem as boolean | undefined) ?? false,
    desks: ((d.desks as string[] | undefined) ?? []) as Desk[],
  }
}

// Resolve a user doc → UserWithAccess. `rolesById` lets list paths avoid an N+1 role fan-out.
function buildUserWithAccess(userSnap: DocumentSnapshot, roles: RoleData[]): UserWithAccess {
  const u = (userSnap.data() ?? {}) as Data
  const directDesks = ((u.desks as string[] | undefined) ?? []) as Desk[]
  const set = new Set<string>()
  for (const r of roles) for (const d of r.desks) set.add(d)
  for (const d of directDesks) set.add(d)
  return {
    id: userSnap.id,
    email: (u.email as string | null | undefined) ?? null,
    firebaseUid: (u.firebaseUid as string | null | undefined) ?? null,
    name: u.name as string,
    avatarInitials: u.avatarInitials as string,
    title: (u.title as string | null | undefined) ?? null,
    isSuperadmin: (u.isSuperadmin as boolean | undefined) ?? false,
    roleNames: roles.map((r) => r.name),
    desks: [...set] as Desk[],
  }
}

// Read the role docs for a user's roleIds, omitting dangling ids (critique #18). Order preserved.
async function rolesForUser(userSnap: DocumentSnapshot): Promise<RoleData[]> {
  const ids = ((userSnap.data()?.roleIds as string[] | undefined) ?? [])
  if (ids.length === 0) return []
  const snaps = await getDb().getAll(...ids.map((id) => getDb().collection(COL.roles).doc(id)))
  return snaps.filter((s) => s.exists).map(snapToRole)
}

async function resolveUser(userSnap: DocumentSnapshot): Promise<UserWithAccess> {
  return buildUserWithAccess(userSnap, await rolesForUser(userSnap))
}

export async function getUserByFirebaseUid(uid: string): Promise<UserWithAccess | null> {
  const snap = await getDb().collection(COL.users).where('firebaseUid', '==', uid).limit(1).get()
  return snap.empty ? null : resolveUser(snap.docs[0])
}

export async function ensureUser(input: {
  email: string | null
  firebaseUid: string
  name?: string | null
  picture?: string | null
}): Promise<UserWithAccess> {
  const db = getDb()
  const email = input.email?.toLowerCase() ?? null
  const allowlisted = email ? superadminEmails().includes(email) : false
  const name = input.name?.trim() || email || 'Pengguna Baru'

  // 1. Existing by firebaseUid.
  const byUid = await db.collection(COL.users).where('firebaseUid', '==', input.firebaseUid).limit(1).get()
  if (!byUid.empty) {
    const ref = byUid.docs[0].ref
    if (allowlisted && !((byUid.docs[0].data() as Data).isSuperadmin as boolean)) await ref.update({ isSuperadmin: true })
    return resolveUser(await ref.get())
  }

  // 2. Adopt an existing user sharing this email (seeded with null uid, OR a stale uid) — re-link.
  if (email) {
    const byEmail = await db.collection(COL.users).where('email', '==', email).limit(1).get()
    if (!byEmail.empty) {
      const ref = byEmail.docs[0].ref
      const wasSuper = ((byEmail.docs[0].data() as Data).isSuperadmin as boolean | undefined) ?? false
      await ref.update({ firebaseUid: input.firebaseUid, isSuperadmin: wasSuper || allowlisted })
      return resolveUser(await ref.get())
    }
  }

  // 3. Brand-new user — zero grants (awaiting access), unless allowlisted superadmin.
  const id = randomUUID()
  const ref = db.collection(COL.users).doc(id)
  await ref.set({
    email,
    firebaseUid: input.firebaseUid,
    name,
    avatarInitials: initialsFrom(name),
    isSuperadmin: allowlisted,
    roleIds: [],
    desks: [],
    createdAt: new Date(),
  })
  return resolveUser(await ref.get())
}

export async function getUserAccessById(userId: string): Promise<UserWithAccess | null> {
  const s = await getDb().collection(COL.users).doc(userId).get()
  return s.exists ? resolveUser(s) : null
}

export async function getUserEmailById(userId: string): Promise<string | null> {
  const s = await getDb().collection(COL.users).doc(userId).get()
  return s.exists ? (((s.data() as Data).email as string | null | undefined) ?? null) : null
}

function buildAdminUser(userSnap: DocumentSnapshot, roles: RoleData[]): AdminUser {
  const base = buildUserWithAccess(userSnap, roles)
  const directDesks = (((userSnap.data() as Data).desks as string[] | undefined) ?? []) as Desk[]
  return { ...base, roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name })), directDesks }
}

export async function listUsers(): Promise<AdminUser[]> {
  const db = getDb()
  const [userSnap, roleSnap] = await Promise.all([
    db.collection(COL.users).orderBy('isSuperadmin', 'desc').orderBy('name', 'asc').get(),
    db.collection(COL.roles).get(),
  ])
  const rolesById = new Map(roleSnap.docs.map((s) => [s.id, snapToRole(s)]))
  return userSnap.docs.map((u) => {
    const ids = ((u.data() as Data).roleIds as string[] | undefined) ?? []
    const roles = ids.map((id) => rolesById.get(id)).filter((r): r is RoleData => r !== undefined)
    return buildAdminUser(u, roles)
  })
}

export async function listRoles(): Promise<AdminRole[]> {
  const db = getDb()
  const snap = await db.collection(COL.roles).orderBy('isSystem', 'desc').orderBy('name', 'asc').get()
  const counts = await Promise.all(
    snap.docs.map((s) => db.collection(COL.users).where('roleIds', 'array-contains', s.id).count().get()),
  )
  return snap.docs.map((s, i) => {
    const r = snapToRole(s)
    return { id: r.id, key: r.key, name: r.name, isSystem: r.isSystem, desks: r.desks, userCount: counts[i].data().count }
  })
}

export async function listDeskCatalog(): Promise<DeskCatalogRow[]> {
  const snap = await getDb().collection(COL.deskCatalog).orderBy('sortOrder', 'asc').get()
  return snap.docs.map((s) => {
    const d = s.data() as Data
    return {
      desk: s.id as Desk,
      label: d.label as string,
      stage: (d.stage as number | null | undefined) ?? null,
      pipelineRole: d.pipelineRole as string,
      description: (d.description as string | null | undefined) ?? null,
      sortOrder: d.sortOrder as number,
    }
  })
}

export async function grantRole(userId: string, roleId: string, _grantedBy: string): Promise<void> {
  await getDb().collection(COL.users).doc(userId).update({ roleIds: FieldValue.arrayUnion(roleId) })
}
export async function revokeRole(userId: string, roleId: string): Promise<void> {
  // Silent no-op on a missing user, parity with Prisma userRole.deleteMany (update() throws NOT_FOUND).
  try {
    await getDb().collection(COL.users).doc(userId).update({ roleIds: FieldValue.arrayRemove(roleId) })
  } catch (e) {
    if (!isNotFound(e)) throw e
  }
}
export async function grantDesk(userId: string, desk: string, _grantedBy: string): Promise<void> {
  assertKnownDesk(desk)
  await getDb().collection(COL.users).doc(userId).update({ desks: FieldValue.arrayUnion(desk) })
}
export async function revokeDesk(userId: string, desk: string): Promise<void> {
  try {
    await getDb().collection(COL.users).doc(userId).update({ desks: FieldValue.arrayRemove(desk) })
  } catch (e) {
    if (!isNotFound(e)) throw e
  }
}
export async function setSuperadmin(userId: string, value: boolean): Promise<void> {
  await getDb().collection(COL.users).doc(userId).update({ isSuperadmin: value })
}

const KEY_TAKEN = Symbol('role-key-taken')

export async function createRole(name: string, desks: string[]): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Nama peran tidak boleh kosong')
  desks.forEach(assertKnownDesk)
  const db = getDb()
  const roleId = randomUUID()
  // The role `key` uniqueness anchor is a deterministic index doc (mirrors qrToken/meeting-slot),
  // claimed in the SAME transaction as the role create — the Firestore stand-in for Prisma's
  // Role.key @unique. The in-tx read handles the sequential case; tx.create's write-conflict retry
  // handles the race (on retry the read sees the claim → KEY_TAKEN → suffix). Replaces the old
  // best-effort where('key','==') pre-check that left two roles able to share a key.
  const base = roleKeyFrom(trimmed)
  for (let attempt = 0; attempt < 6; attempt++) {
    const key = attempt === 0 ? base : `${base}-${Date.now()}-${attempt}`
    try {
      await db.runTransaction(async (tx) => {
        const idxRef = db.collection(IDX.roleKey).doc(key)
        if ((await tx.get(idxRef)).exists) throw KEY_TAKEN
        tx.create(idxRef, { roleId })
        tx.set(db.collection(COL.roles).doc(roleId), { key, name: trimmed, isSystem: false, desks })
      })
      return
    } catch (e) {
      if (e === KEY_TAKEN || isAlreadyExists(e)) continue // key clash → retry with a fresh suffix
      throw e
    }
  }
  throw new Error('Gagal mengalokasikan kunci peran unik')
}

export async function updateRoleDesks(roleId: string, desks: string[]): Promise<void> {
  desks.forEach(assertKnownDesk)
  await getDb().collection(COL.roles).doc(roleId).update({ desks })
}

export async function deleteRole(roleId: string): Promise<void> {
  const db = getDb()
  const roleSnap = await db.collection(COL.roles).doc(roleId).get()
  if (!roleSnap.exists) throw new NotFoundError('Peran tidak ditemukan')
  const data = roleSnap.data() as Data
  if (data.isSystem) throw new Error('Peran sistem tidak dapat dihapus.')
  await db.collection(COL.roles).doc(roleId).delete()
  // Release the key reservation so the name can be reused (don't leak the index_roleKey doc).
  const key = data.key as string | undefined
  if (key) await db.collection(IDX.roleKey).doc(key).delete().catch(() => undefined)
  // Scrub the dangling roleId from every holder (non-atomic fan-out; readers also defend — #18).
  const holders = await db.collection(COL.users).where('roleIds', 'array-contains', roleId).get()
  await Promise.all(holders.docs.map((h) => h.ref.update({ roleIds: FieldValue.arrayRemove(roleId) })))
}
