import type { Role } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// SSOT for how pipeline roles are PRESENTED (Hijra SOP vocabulary). Since the role fold
// (AO+LA→RM, RT→RA), the `Role` enum IS the SOP role — this stays the single place for the
// display strings so badges / headers / copy never drift. Desk ids (intake, legal, slik, …) stay
// stable; the role they carry is RM/RA per ROLE_OF_DESK.
// ─────────────────────────────────────────────────────────────────────────────

/** Short badge code. */
export const ROLE_SOP_CODE: Record<Role, string> = {
  RM: 'RM',
  LG: 'Legal',
  RA: 'RA',
  CM: 'Komite',
  MG: 'Manajemen',
}

/** Full role name for headings / labels. */
export const ROLE_SOP_LABEL: Record<Role, string> = {
  RM: 'Relationship Manager',
  LG: 'Legal Officer',
  RA: 'Risk Analyst',
  CM: 'Komite Pembiayaan',
  MG: 'Manajemen',
}

export const roleSopCode = (role: Role): string => ROLE_SOP_CODE[role]
export const roleSopLabel = (role: Role): string => ROLE_SOP_LABEL[role]

/** Dedupe a list of owner roles by their presentation, preserving first-seen order. Identity now
 *  (each role has a unique code), kept for callers that assemble owner lists. */
export function dedupeOwnersBySop(owners: Role[]): Role[] {
  const seen = new Map<string, Role>()
  for (const r of owners) {
    const code = ROLE_SOP_CODE[r]
    if (!seen.has(code)) seen.set(code, r)
  }
  return [...seen.values()]
}
