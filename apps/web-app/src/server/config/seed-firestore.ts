import 'server-only'
import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/server/firebase/firestore'
import { COL, IDX } from '@/server/firebase/collections'
import { aiPromptDocId, configVersionDocId } from '@/server/repo/doc-ids'
import { tsFromDate } from '@/server/firebase/timestamps'
import { DEFAULT_RISK_POLICY } from '@/lib/hardGates'
import { SLA_TARGETS_DAYS } from '@/lib/sla-utils'
import { DEFAULT_COMMITTEE_ROOMS } from '@/lib/config/rooms-policy'
import { DEFAULT_DISBURSEMENT_CONDITIONS } from '@/lib/config/disbursement-conditions'
import { AI_PROMPT_KEYS, DEFAULT_AI_PROMPTS } from '@/lib/ai-prompts'
import { DESK_CATALOG, DEFAULT_ROLES } from '@/lib/desks'

// Idempotent Firestore config seeder — the Firestore analog of prisma/seed-config.ts. Writes
// config_*/{1} == today's code constants so reads resolve a version:1 (not the code-default fallback),
// and freeze-at-decision records riskPolicyVersion:1 (not null). effectiveFrom = epoch so v1 is always
// effective; admin edits then start at v2. Idempotent: skips a config that already has its v1 doc.

const EPOCH = new Date(0)

function meta(extra: Record<string, unknown>): Record<string, unknown> {
  return { ...extra, version: 1, effectiveFrom: tsFromDate(EPOCH), reason: 'seed v1 (code defaults)', createdBy: 'system', createdAt: FieldValue.serverTimestamp() }
}

export async function seedFirestoreConfig(): Promise<{ seeded: string[]; skipped: string[] }> {
  const db = getDb()
  const seeds: Array<[string, Record<string, unknown>]> = [
    [`${COL.config_riskPolicy}/${configVersionDocId(1)}`, meta({ dsrMaxPct: DEFAULT_RISK_POLICY.dsrMaxPct, ltvMaxPct: DEFAULT_RISK_POLICY.ltvMaxPct, kolMax: DEFAULT_RISK_POLICY.kolMax })],
    [`${COL.config_slaPolicy}/${configVersionDocId(1)}`, meta({ targets: SLA_TARGETS_DAYS })],
    [`${COL.config_committeeRooms}/${configVersionDocId(1)}`, meta({ rooms: DEFAULT_COMMITTEE_ROOMS })],
    [`${COL.config_disbursementConditions}/${configVersionDocId(1)}`, meta({ conditions: DEFAULT_DISBURSEMENT_CONDITIONS })],
    ...AI_PROMPT_KEYS.map((k): [string, Record<string, unknown>] => [
      `${COL.config_aiPrompt}/${aiPromptDocId(k, 1)}`,
      meta({ promptKey: k, systemInstruction: DEFAULT_AI_PROMPTS[k] }),
    ]),
  ]
  const seeded: string[] = []
  const skipped: string[] = []
  for (const [path, data] of seeds) {
    const ref = db.doc(path)
    if ((await ref.get()).exists) {
      skipped.push(path)
      continue
    }
    await ref.set(data)
    seeded.push(path)
  }
  return { seeded, skipped }
}

// ── Factory defaults beyond versioned config: desk catalog + system role bundles ────────────────
// The Firestore analog of prisma/seed-config.ts's desk + role seeding. Required for ANY greenfield
// Firestore (roles/desks gate the whole auth/permission system). Idempotent + prod-safe: touches no
// users/applications/meetings/audits.

/** deskCatalog/{desk} mirrors the fixed code catalog (display data, not grants). Upsert the current
 *  set, prune any desk no longer in code so the collection stays a faithful mirror. */
export async function seedFirestoreDesks(): Promise<{ upserted: number; pruned: number }> {
  const db = getDb()
  const batch = db.batch()
  for (const d of DESK_CATALOG) {
    batch.set(db.collection(COL.deskCatalog).doc(d.desk), {
      label: d.label,
      stage: d.stage ?? null,
      pipelineRole: d.pipelineRole,
      description: d.description ?? null,
      sortOrder: d.sortOrder,
    })
  }
  await batch.commit()
  const keep = new Set<string>(DESK_CATALOG.map((d) => d.desk))
  const all = await db.collection(COL.deskCatalog).get()
  const stale = all.docs.filter((s) => !keep.has(s.id))
  if (stale.length) {
    const b = db.batch()
    stale.forEach((s) => b.delete(s.ref))
    await b.commit()
  }
  return { upserted: DESK_CATALOG.length, pruned: stale.length }
}

/** roles/{key} (deterministic doc-id = role key) + index_roleKey/{key} mirror the default SYSTEM role
 *  bundles, so grants reference stable ids and re-seed is idempotent. Prunes retired SYSTEM roles +
 *  their key-index docs; never touches admin-created roles (isSystem:false). */
export async function seedFirestoreRoles(): Promise<{ upserted: number; pruned: number }> {
  const db = getDb()
  const keepKeys = new Set<string>(DEFAULT_ROLES.map((r) => r.key))
  const batch = db.batch()
  for (const r of DEFAULT_ROLES) {
    batch.set(db.collection(COL.roles).doc(r.key), { key: r.key, name: r.name, isSystem: true, desks: r.desks })
    batch.set(db.collection(IDX.roleKey).doc(r.key), { roleId: r.key })
  }
  await batch.commit()
  const sys = await db.collection(COL.roles).where('isSystem', '==', true).get()
  const stale = sys.docs.filter((s) => !keepKeys.has(((s.data().key as string | undefined) ?? s.id)))
  if (stale.length) {
    const b = db.batch()
    for (const s of stale) {
      b.delete(s.ref)
      b.delete(db.collection(IDX.roleKey).doc((s.data().key as string | undefined) ?? s.id))
    }
    await b.commit()
  }
  return { upserted: DEFAULT_ROLES.length, pruned: stale.length }
}

/** Full greenfield factory seed (Firestore analog of seedConfig): desk catalog + role bundles + every
 *  config table's v1 baseline. Idempotent + prod-safe. Run on a fresh Firestore before first use. */
export async function seedFirestoreFactory(): Promise<{
  desks: { upserted: number; pruned: number }
  roles: { upserted: number; pruned: number }
  config: { seeded: string[]; skipped: string[] }
}> {
  const desks = await seedFirestoreDesks()
  const config = await seedFirestoreConfig()
  const roles = await seedFirestoreRoles()
  return { desks, roles, config }
}
