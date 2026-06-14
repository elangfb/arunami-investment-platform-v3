import type { Role } from '@/lib/types'
import { roleSopCode, roleSopLabel } from '@/lib/role-labels'

const ROLE_STYLES: Record<Role, string> = {
  RM: 'bg-blue-100 text-blue-800',
  LG: 'bg-teal-100 text-teal-800',
  RA: 'bg-red-100 text-red-800',
  CM: 'bg-purple-100 text-purple-800',
  MG: 'bg-orange-100 text-orange-800',
}

export function RoleBadge({ role, showFull = false }: { role: Role; showFull?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_STYLES[role]}`}>
      {showFull ? roleSopLabel(role) : roleSopCode(role)}
    </span>
  )
}
