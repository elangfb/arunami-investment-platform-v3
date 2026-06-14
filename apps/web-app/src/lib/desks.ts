import type { Role, Stage } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Desks: the atomic permission unit = one (stage, function) slot. Fixed in code
// (the pipeline is fixed); the Superadmin console configures GRANTS, not the
// catalog. Each desk carries a pipeline role that feeds the existing stage+role
// action matrix (stage-action.ts) — the matrix is untouched.
//
// Note: `slik` (stage-2 SLIK upload / Kol input) is **RM-owned** (D1, 2026.06.05) — bundled under the
// RM role (relationship-manager), NOT the Risk Analyst. The RA's risk work is scoped to `rsk-author`
// (stage-4 RSK). Keeping `slik` a separate desk still lets SLIK be granted without RSK-authoring.
// ─────────────────────────────────────────────────────────────────────────────

export type Desk =
  | 'intake'
  | 'legal'
  | 'appraisal'
  | 'slik'
  | 'muap-author'
  | 'rsk-author'
  // ── Maker-checker checker rungs (folded into the MUAP/RSK document signature blocks).
  // The AUTHORS are the existing `muap-author` (MUAP) / `rsk-author` (RSK) desks; these are the
  // CHECKER rungs added on top. Gated directly by hasDesk; the ladder rules (order,
  // four-eyes, send-back) live in lib/approval-chain.ts. They act via the approval task
  // surface, NOT the legacy stageActions role-matrix. See workflow-target.md §"Model peran & desk".
  // Single checker per chain since 2026.06.12 (BM/KU, Risk Officer, CRO, DPS-signer rungs dropped).
  | 'muap-tl' // MUAP single checker (TL/SPV) → freezes MUAP
  | 'rsk-rtl' // RSK single checker (Risk Team Leader) → freezes RSK
  | 'komite'
  // komite-admin — sekretariat sidang. Administers Rapat Komite (schedule/confirm/cancel/edit
  // time + attendees) WITHOUT being a committee member: it is NOT in committeeRoster (role==='CM')
  // so a holder is never a required MoM signer, never chair-eligible, never records the decision.
  // Held by RM (the real-world coordinator). Cross-cutting non-stage desk. See ADR-0015 / Batch 8.
  | 'komite-admin'
  // DPS — Dewan Pengawas Syariah review desk. ⚠️ DESIGNED, NOT BUILT: this is only a catalog
  // entry — there is NO enforcement code reading it anywhere (the intended conditional gate keyed on
  // MUAP T63 `rekomendasi_dps_or_tidak` is unimplemented), and after the 2026.06.12 chain shortening
  // (ADR-0021) it has no seeded role/holder either. It is the *intended* sole DPS surface now that DPS
  // no longer signs the RSK ladder, but it currently enforces nothing — open compliance gap, ADR-0021 §4.
  | 'dps-review'
  | 'pencairan'
  | 'MG'
  // Cross-cutting admin desks (non-stage, like MG). Gate admin-console actions only,
  // never the workflow window. Granted least-privilege so admin work no longer needs
  // break-glass superadmin. See docs/planning/config-and-admin.md.
  | 'ADMIN-USERS'
  | 'ADMIN-MASTER'
  | 'ADMIN-POLICY'

export const DESKS: Desk[] = [
  'intake',
  'legal',
  'appraisal',
  'slik',
  'muap-author',
  'rsk-author',
  'muap-tl',
  'rsk-rtl',
  'komite',
  'komite-admin',
  'dps-review',
  'pencairan',
  'MG',
  'ADMIN-USERS',
  'ADMIN-MASTER',
  'ADMIN-POLICY',
]

/** The cross-cutting admin desks. Granting one of THESE stays superadmin-only (a fail-closed
 *  guardrail against admin self-escalation; see grantDeskAction). Everything else they own. */
export const ADMIN_DESKS: Desk[] = ['ADMIN-USERS', 'ADMIN-MASTER', 'ADMIN-POLICY']

/// Which desks own a given pipeline stage (drives the gate/owner logic; replaces
/// STAGE_OWNERS for authz). Stage 2 is RM-coordinated: Legal & Appraisal produce
/// tracked deliverables, while RM bureau-data (`slik`) controls the 2→3 handoff.
/// The Legal/Appraisal deliverables gate MUAP→Risk, not the stage-2 advance.
export const DESK_FOR_STAGE: Record<Stage, Desk[]> = {
  1: ['intake'],
  2: ['legal', 'slik', 'appraisal'],
  3: ['muap-author'],
  4: ['rsk-author'],
  5: ['komite'],
  6: ['pencairan'],
}

/// The pipeline stage each desk owns (null for the cross-stage observer desk MG).
/// Drives the early-work window (lib/auth/can.ts canWorkStage).
export const STAGE_OF_DESK: Record<Desk, Stage | null> = {
  'intake': 1,
  'legal': 2,
  'appraisal': 2,
  'slik': 2,
  'muap-author': 3,
  'rsk-author': 4,
  'muap-tl': 3,
  'rsk-rtl': 4,
  'komite': 5,
  'komite-admin': null, // session administration, not a workflow window — never gates a stage
  'dps-review': 5,
  'pencairan': 6,
  MG: null,
  // Admin desks are non-stage: they never gate the workflow window (canWorkStage ignores null).
  'ADMIN-USERS': null,
  'ADMIN-MASTER': null,
  'ADMIN-POLICY': null,
}

/// Pipeline role (function) carried by each desk — fed to stageActions(app, role). AO + LA folded
/// into RM (one person per SOP); RT → RA (Risk Analyst). Desk codes stay stable internal ids.
export const ROLE_OF_DESK: Record<Desk, Role> = {
  'intake': 'RM',
  'legal': 'LG',
  'appraisal': 'LG',
  'slik': 'RM',
  'muap-author': 'RM',
  'rsk-author': 'RA',
  // Checker rungs act via the approval surface (approval-chain), NOT the legacy role-matrix,
  // so they carry the inert 'MG' pipeline role — it is never consulted because they are absent
  // from DESK_FOR_STAGE. hasDesk gates them directly.
  'muap-tl': 'MG',
  'rsk-rtl': 'MG',
  'komite': 'CM',
  // komite-admin carries no pipeline role (inert 'MG' placeholder, like the admin desks): it is
  // not in STAGE_OF_DESK, so this is never consulted. RM holds it, but it grants NO pipeline membership.
  'komite-admin': 'MG',
  // DPS reviewers carry the CM role for stage-context purposes (they participate at
  // Stage 5 alongside committee voting). Their decision surface is the dps_* token
  // block in RSK + the conditional gate hook.
  'dps-review': 'CM',
  'pencairan': 'RM',
  MG: 'MG',
  // Admin desks carry no pipeline role; map to MG (read-only observer) as an inert
  // placeholder — they never enter a stage/role context (not in DESK_FOR_STAGE), so this
  // never grants pipeline participation. ROLE_OF_DESK must be exhaustive over Desk.
  'ADMIN-USERS': 'MG',
  'ADMIN-MASTER': 'MG',
  'ADMIN-POLICY': 'MG',
}

export interface DeskCatalogEntry {
  desk: Desk
  label: string
  stage: Stage | null
  pipelineRole: Role
  description: string
  sortOrder: number
}

/// Display catalog (seeded to the DeskCatalog table for the Superadmin console).
export const DESK_CATALOG: DeskCatalogEntry[] = [
  { desk: 'intake', label: 'Intake (Pengajuan Dokumen)', stage: 1, pipelineRole: 'RM', description: 'Unggah dokumen & kirim ke Legal, Agunan & Biro', sortOrder: 1 },
  { desk: 'legal', label: 'Analisa Yuridis', stage: 2, pipelineRole: 'LG', description: 'Verifikasi keaslian/keabsahan dokumen untuk MUAP', sortOrder: 2 },
  { desk: 'appraisal', label: 'Penilaian Agunan', stage: 2, pipelineRole: 'LG', description: 'Penilaian agunan internal/KJPP — catat jalur + nilai untuk MUAP', sortOrder: 3 },
  { desk: 'slik', label: 'Biro Data & Kolektibilitas', stage: 2, pipelineRole: 'RM', description: 'Unggah SLIK/Pefindo dan input Kol (RM-coordinated)', sortOrder: 3 },
  { desk: 'muap-author', label: 'Analisa 5C+1S & MUAP', stage: 3, pipelineRole: 'RM', description: 'Susun analisa kelayakan & MUAP', sortOrder: 4 },
  { desk: 'rsk-author', label: 'Kajian Risiko & RSK', stage: 4, pipelineRole: 'RA', description: 'Rekomendasi risiko & susun RSK', sortOrder: 5 },
  { desk: 'muap-tl', label: 'Persetujuan MUAP — TL/SPV', stage: 3, pipelineRole: 'MG', description: 'Persetujuan MUAP (Team Leader / Supervisor) → MUAP beku', sortOrder: 12 },
  { desk: 'rsk-rtl', label: 'Persetujuan RSK — Risk Team Leader', stage: 4, pipelineRole: 'MG', description: 'Persetujuan RSK (Risk Team Leader) → RSK beku', sortOrder: 13 },
  { desk: 'komite', label: 'Rapat Komite', stage: 5, pipelineRole: 'CM', description: 'Voting keputusan komite', sortOrder: 6 },
  { desk: 'komite-admin', label: 'Sekretariat Rapat Komite', stage: null, pipelineRole: 'MG', description: 'Atur jadwal/agenda/peserta sidang Komite (RM) — bukan anggota/penanda-tangan', sortOrder: 17 },
  { desk: 'dps-review', label: 'DPS Review', stage: 5, pipelineRole: 'CM', description: 'Sign-off Dewan Pengawas Syariah (conditional gate)', sortOrder: 7 },
  { desk: 'pencairan', label: 'Pencairan', stage: 6, pipelineRole: 'RM', description: 'Proses pencairan dana', sortOrder: 7 },
  { desk: 'MG', label: 'Manajemen (Observer)', stage: null, pipelineRole: 'MG', description: 'Akses baca-saja lintas tahap', sortOrder: 8 },
  { desk: 'ADMIN-USERS', label: 'Admin — Pengguna & Peran', stage: null, pipelineRole: 'MG', description: 'Kelola pengguna, hibah desk/peran (kecuali desk Admin & Superadmin)', sortOrder: 9 },
  { desk: 'ADMIN-MASTER', label: 'Admin — Data Master', stage: null, pipelineRole: 'MG', description: 'Kelola data referensi: produk, rate, SLA', sortOrder: 10 },
  { desk: 'ADMIN-POLICY', label: 'Admin — Kebijakan Risiko', stage: null, pipelineRole: 'MG', description: 'Kelola ambang hard-gate & aturan checklist dokumen', sortOrder: 11 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Roles: editable named bundles of desks (job positions). Seeded with defaults
// that reproduce the prototype's role→behaviour 1:1; Superadmin can edit/add.
// ─────────────────────────────────────────────────────────────────────────────

export interface DefaultRole {
  key: string
  name: string
  desks: Desk[]
}

export const DEFAULT_ROLES: DefaultRole[] = [
  { key: 'relationship-manager', name: 'Relationship Manager', desks: ['intake', 'slik', 'muap-author', 'pencairan', 'komite-admin'] },
  { key: 'legal', name: 'Legal & Appraisal', desks: ['legal', 'appraisal'] },
  { key: 'risk-team', name: 'Risk Analyst', desks: ['rsk-author'] },
  { key: 'committee', name: 'Komite Pembiayaan', desks: ['komite'] },
  { key: 'management', name: 'Management', desks: ['MG'] },
  { key: 'team-leader', name: 'Team Leader / Supervisor', desks: ['muap-tl'] },
  { key: 'risk-team-leader', name: 'Risk Team Leader', desks: ['rsk-rtl'] },
]
