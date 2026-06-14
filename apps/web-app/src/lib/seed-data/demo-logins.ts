import type { Desk } from '@/lib/desks'

// Demo login roster — the single source of truth for "who can log in locally via the
// Firebase Auth Emulator". Consumed by BOTH:
//   • prisma/seed-dummy.ts  — writes the `email` (and creates the brand-new demo users)
//     onto the Mizan DB users, so ensureUser() can link an emulator login to the right
//     persona by email (server/repo/users.ts → step 2 "link a seeded user by email").
//   • scripts/seed-emulator-users.ts — creates a matching google.com account in the
//     emulator for each email, so it appears in the Google sign-in chooser.
//
// Keep the two in sync by editing ONLY this file. Login is Google-popup only (see
// login/page.tsx), so emulator accounts must be google.com IDP accounts; the emulator
// de-dupes by email, so reruns are idempotent. All emails use @example.com (a reserved
// test domain — never a real inbox). Dev-only: seed-dummy refuses NODE_ENV=production.

export interface DemoLogin {
  /** Existing seeded actor (src/lib/seed-data/users.ts) to attach this email to. When set,
   *  the user's role/desks come from that seed entry — only the email is added here.
   *  Omit for a brand-new demo persona (then `id` + access fields below apply). */
  userId?: string
  /** Id for a brand-new demo user (ignored when `userId` is set). */
  id?: string
  /** Login email. Must be unique across the roster (User.email is @unique). */
  email: string
  /** Display name shown in the emulator account chooser; also User.name for new users. */
  name: string
  /** Stable Google `sub` → keeps the emulator account's federatedId identical across
   *  reruns. Not load-bearing (the emulator de-dupes by email) but keeps things tidy. */
  sub: string
  /** Bootstrap a superadmin (full desks). Also belongs in SUPERADMIN_EMAILS so a real
   *  login self-elevates; seeding it makes the persona exist before first login too. */
  isSuperadmin?: boolean
  /** Role keys to grant a NEW user (existing users keep their seeded role). */
  roleKeys?: string[]
  /** Direct (exception) desk grants for a NEW user, on top of any roles. */
  directDesks?: Desk[]
}

export const DEMO_LOGINS: DemoLogin[] = [
  // ── Existing seeded actors → give each a login email (role stays as seeded) ──────
  { userId: 'u-001', name: 'Siti Rahma', email: 'siti.ao@example.com', sub: 'demo-u-001' }, // AO
  { userId: 'u-002', name: 'Budi Santoso', email: 'budi.la@example.com', sub: 'demo-u-002' }, // LA
  { userId: 'u-003', name: 'Ahmad Fauzi', email: 'ahmad.rt@example.com', sub: 'demo-u-003' }, // RT
  { userId: 'u-006', name: 'Laila Ahmadi', email: 'laila.lg@example.com', sub: 'demo-u-006' }, // LG
  { userId: 'u-004', name: 'Dewi Kirana', email: 'dewi.cm@example.com', sub: 'demo-u-004' }, // CM (chair)
  { userId: 'u-007', name: 'Rizky Hadiman', email: 'rizky.cm@example.com', sub: 'demo-u-007' }, // CM
  { userId: 'u-008', name: 'Nur Fatimah', email: 'nur.cm@example.com', sub: 'demo-u-008' }, // CM
  { userId: 'u-005', name: 'Pak Hendra', email: 'hendra.mg@example.com', sub: 'demo-u-005' }, // MG

  // ── New variety personas (created fresh; exercise the access edges) ──────────────
  // Superadmin: full access + the impersonation/admin controls. (Also in SUPERADMIN_EMAILS.)
  {
    id: 'u-demo-superadmin',
    name: 'Super Admin',
    email: 'superadmin@example.com',
    sub: 'demo-superadmin',
    isSuperadmin: true,
  },
  // Cross-desk power user: an AO who also does Legal — exercises multi-role union.
  {
    id: 'u-demo-multi',
    name: 'Sari Wijaya',
    email: 'sari.multi@example.com',
    sub: 'demo-multi',
    roleKeys: ['relationship-manager', 'legal'],
  },
  // Admin-only operator: holds the three non-stage admin desks, no pipeline desk —
  // exercises the ADMIN-* console without being a workflow participant.
  {
    id: 'u-demo-admin',
    name: 'Operator Admin',
    email: 'operator.admin@example.com',
    sub: 'demo-admin',
    directDesks: ['ADMIN-USERS', 'ADMIN-MASTER', 'ADMIN-POLICY'],
  },
  // Brand-new hire: zero grants → lands on /awaiting-access until a desk is granted.
  {
    id: 'u-demo-newcomer',
    name: 'Pengguna Baru',
    email: 'newcomer@example.com',
    sub: 'demo-newcomer',
  },

  // ── Maker-checker approvers (the MUAP & RSK signature chains) ─────────────────────
  // Distinct people from the makers so the four-eyes rule is demonstrable end-to-end.
  { id: 'u-demo-tl', name: 'Teguh Laksana', email: 'teguh.tl@example.com', sub: 'demo-tl', roleKeys: ['team-leader'] },
  { id: 'u-demo-rtl', name: 'Rini Tania Lestari', email: 'rini.rtl@example.com', sub: 'demo-rtl', roleKeys: ['risk-team-leader'] },
]

/** Initials from a display name (mirrors server/repo/users.ts initialsFrom). */
export function demoInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
