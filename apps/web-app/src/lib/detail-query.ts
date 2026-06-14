import { parseAsStringEnum } from 'nuqs'
import { GROUPS, type DetailView } from '@/lib/detail-nav'

// All valid DetailView values: 'ringkasan' + every view in GROUPS.
// Matches isDetailView() semantics from detail-nav.ts.
const ALL_VIEWS: DetailView[] = [
  'ringkasan',
  ...GROUPS.flatMap(g => g.views),
]

// URL parser for ?view= — rejects any unknown value (returns null).
// Default history mode is 'replace' (nuqs default), matching the existing
// history.replaceState behavior.
export const viewParser = parseAsStringEnum<DetailView>(ALL_VIEWS)
