import { effectiveRole, primaryRole, type Actor } from '@/lib/auth/can'
import type { LoanApplication } from '@/lib/types'
import { isAt, isAtOrAfter } from '@/lib/workflow'

// Two-level navigation model for the application detail page. The 10 original
// surfaces become nested "views" grouped under 4 top-level groups, so a user
// faces 4 choices instead of 10 (progressive disclosure, max two tab levels).
// Nothing is removed — every view stays reachable for the committee / OJK audit.

export type DetailView =
  | 'ringkasan'
  | 'data' | 'documents'
  | 'muap' | 'rsk'
  | 'pencairan'
  | 'discussion' | 'history'

export type DetailGroup = 'berkas' | 'penilaian' | 'pencairan' | 'aktivitas'

// Stage-2 "Legal, Agunan & Biro" has no standalone tab: Analisa Yuridis lives on
// Documents, while AML, appraisal path, SLIK/Kol, and bureau summary live on Data.
export const GROUPS: { id: DetailGroup; label: string; views: DetailView[] }[] = [
  { id: 'berkas', label: 'Berkas', views: ['data', 'documents'] },
  { id: 'penilaian', label: 'Penilaian', views: ['muap', 'rsk'] },
  { id: 'pencairan', label: 'Pencairan', views: ['pencairan'] },
  { id: 'aktivitas', label: 'Aktivitas', views: ['discussion', 'history'] },
]

export const VIEW_LABELS: Record<DetailView, string> = {
  ringkasan: 'Ringkasan',
  data: 'Data',
  documents: 'Dokumen',
  muap: 'MUAP',
  rsk: 'RSK',
  pencairan: 'Pencairan',
  discussion: 'Diskusi',
  history: 'Riwayat',
}

const VIEW_TO_GROUP = Object.fromEntries(
  GROUPS.flatMap(g => g.views.map(v => [v, g.id])),
) as Record<DetailView, DetailGroup>

const VIEWS_BY_GROUP = Object.fromEntries(
  GROUPS.map(g => [g.id, g.views]),
) as Record<DetailGroup, DetailView[]>

export function groupOf(view: DetailView): DetailGroup {
  return VIEW_TO_GROUP[view]
}

export function viewsOf(group: DetailGroup): DetailView[] {
  return VIEWS_BY_GROUP[group]
}

export function isDetailView(value: string): value is DetailView {
  // 'ringkasan' is a standalone landing pane, intentionally not in GROUPS (so it
  // carries no pipeline status dot), but it is still a valid deep-linkable view.
  return value === 'ringkasan' || GROUPS.some(g => g.views.includes(value as DetailView))
}

// Desk-accurate landing view. Owners land on their work surface; everyone else on the
// Ringkasan overview. Takes the Actor (not a single role) so a multi-desk user lands on the
// role they actually OWN at this stage (effectiveRole = the first owned desk's role), falling
// back to their primary role for non-owners / early landing. Pencairan is never a default.
export function defaultView(actor: Actor, app: LoanApplication): DetailView {
  const role = effectiveRole(actor, app) ?? primaryRole(actor)
  if (role === 'RM' && isAt(app, 'pencairan')) return 'pencairan'
  // LG verifies documents (per-doc legal + the sign-off live in the Documents tab now).
  if (role === 'LG') return 'documents'
  // RA's work is the RSK at Stage ≥4 (SLIK/Kol moved to RM, D1); observer otherwise.
  if (role === 'RA') return isAtOrAfter(app, 'risk') ? 'rsk' : 'ringkasan'
  if (role === 'RM' && isAt(app, 'feasibility')) return 'data'
  return 'ringkasan'
}
