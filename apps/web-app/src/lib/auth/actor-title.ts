/**
 * The human-facing position shown under a user's name (the sidebar identity line).
 *
 * `User.title` is an optional, hand-authored override and is only set on the seeded demo
 * personas — users provisioned at first login (and the bootstrapped superadmin) have a
 * NULL title. Without a fallback the sidebar role line renders empty for them, so the
 * label is derived: explicit title → assigned role name(s) → "Superadmin" → awaiting-access.
 *
 * Keeping `title` as the first choice preserves richer labels than the role name alone
 * (e.g. "Ketua Komite Pembiayaan" vs the plain role "Komite Pembiayaan").
 */
export function actorTitle(user: {
  title: string | null | undefined
  roleNames: readonly string[]
  isSuperadmin: boolean
}): string {
  const explicit = user.title?.trim()
  if (explicit) return explicit
  if (user.roleNames.length > 0) return user.roleNames.join(' · ')
  if (user.isSuperadmin) return 'Superadmin'
  return 'Menunggu akses'
}
