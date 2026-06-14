// FACTORY DEFAULTS (config). The desk catalog, default role bundles, and each config table's v1
// baseline (= the code constant, behavior-preserving). Idempotent + PROD-SAFE: every write is an
// upsert/scoped to system config; it touches NO users, applications, meetings, sessions, or audits.
// Run on every deploy. This is the ONLY seed prod runs (see seed.ts --config-only).
import { prisma } from './seed-client'

const { DESK_CATALOG, DEFAULT_ROLES } = await import('../src/lib/desks')
const { SLA_TARGETS_DAYS } = await import('../src/lib/sla-utils')
const { DEFAULT_COMMITTEE_ROOMS } = await import('../src/lib/config/rooms-policy')
const { DEFAULT_DISBURSEMENT_CONDITIONS } = await import('../src/lib/config/disbursement-conditions')
const { DEFAULT_RISK_POLICY } = await import('../src/lib/hardGates')
const { AI_PROMPT_KEYS, DEFAULT_AI_PROMPTS } = await import('../src/lib/ai-prompts')

const BASELINE_FROM = new Date('2020-01-01') // far past → v1 is always the active baseline
const baseline = (reason: string) => ({ effectiveFrom: BASELINE_FROM, reason, createdBy: 'system' })

export async function seedConfig(): Promise<void> {
  // Desk catalog — display mirror of the fixed code catalog. Upsert the current set, then prune
  // any desk no longer in the code catalog (e.g. after a code rename) so the table stays a faithful
  // mirror. Prod-safe: DeskCatalog is config display, not user data (grants live in RoleDesk).
  for (const d of DESK_CATALOG) {
    await prisma.deskCatalog.upsert({
      where: { desk: d.desk },
      update: { label: d.label, stage: d.stage, pipelineRole: d.pipelineRole, description: d.description, sortOrder: d.sortOrder },
      create: { desk: d.desk, label: d.label, stage: d.stage, pipelineRole: d.pipelineRole, description: d.description, sortOrder: d.sortOrder },
    })
  }
  await prisma.deskCatalog.deleteMany({ where: { desk: { notIn: DESK_CATALOG.map((d) => d.desk) } } })

  // Versioned config v1 = the code constants. Idempotent: only creates v1 if absent; never
  // overwrites v1 or any admin-authored later version.
  await prisma.slaPolicyVersion.upsert({
    where: { version: 1 },
    update: {},
    create: { version: 1, targets: SLA_TARGETS_DAYS, ...baseline('Seed v1 — baseline from code constant') },
  })
  await prisma.committeeRoomsVersion.upsert({
    where: { version: 1 },
    update: {},
    create: { version: 1, rooms: DEFAULT_COMMITTEE_ROOMS, ...baseline('Seed v1 — baseline from code constant') },
  })
  await prisma.disbursementConditionsVersion.upsert({
    where: { version: 1 },
    update: {},
    create: { version: 1, conditions: DEFAULT_DISBURSEMENT_CONDITIONS, ...baseline('Seed v1 — baseline from code constant') },
  })
  await prisma.riskPolicyVersion.upsert({
    where: { version: 1 },
    update: {},
    create: {
      version: 1,
      dsrMaxPct: DEFAULT_RISK_POLICY.dsrMaxPct,
      ltvMaxPct: DEFAULT_RISK_POLICY.ltvMaxPct,
      kolMax: DEFAULT_RISK_POLICY.kolMax,
      ...baseline('Seed v1 — baseline OJK thresholds from code default'),
    },
  })

  // AI system prompts v1 = the code defaults (lib/ai-prompts.ts DEFAULT_AI_PROMPTS). One row
  // per known prompt key. Idempotent: never overwrites v1 or any admin-authored later version.
  for (const key of AI_PROMPT_KEYS) {
    await prisma.aiPromptVersion.upsert({
      where: { promptKey_version: { promptKey: key, version: 1 } },
      update: {},
      create: {
        promptKey: key,
        version: 1,
        systemInstruction: DEFAULT_AI_PROMPTS[key],
        ...baseline(`Seed v1 — baseline ${key} from code default`),
      },
    })
  }

  // Default roles + their desks. Deterministic keys so user grants reference them.
  for (const r of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      update: { name: r.name, isSystem: true },
      create: { key: r.key, name: r.name, isSystem: true },
    })
    await prisma.roleDesk.deleteMany({ where: { roleId: role.id } })
    await prisma.roleDesk.createMany({ data: r.desks.map((desk) => ({ roleId: role.id, desk })) })
  }
  // Prune retired SYSTEM roles (e.g. branch-manager/risk-officer/cro/dps after the 2026.06.12 chain
  // shortening) so a re-seed converges instead of leaving orphan roles whose RoleDesk rows point at
  // desks no longer in the catalog. Cascades to RoleDesk + UserRole. Admin-created roles (isSystem:
  // false) are never touched.
  await prisma.role.deleteMany({
    where: { isSystem: true, key: { notIn: DEFAULT_ROLES.map((r) => r.key) } },
  })

  const counts = { desks: await prisma.deskCatalog.count(), roles: await prisma.role.count() }
  console.log('Config seeded (idempotent):', counts)
}
