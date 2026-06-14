# Mizan design system

The single source for Mizan's visual language. Tokens are **normative** — they mirror
`apps/web-app/src/app/globals.css`; if code and this doc disagree, the code wins and this
doc must be updated. Prose explains how to apply them. All paths are under
`apps/web-app/src/`.

## Contents
1. Identity & atmosphere
2. Tokens (colours, type, radius, shadow, motion)
3. Colours & status vocabulary
4. Typography
5. Layout & shell
6. Elevation & depth
7. Shapes
8. Components (the reuse vocabulary)
9. Do's & Don'ts (incl. hard-won gotchas)

---

## 1. Identity & atmosphere
**"Refined Navy"** — a calm, trustworthy, enterprise look for syariah financing. Navy/blue
on a warm-paper canvas; restrained, not flashy (the user consistently prefers the simpler,
calmer option — e.g. a plain blurred action bar over a glass island, an accent treatment
over loud gradients *except* the deliberately-kept sidebar active pill). Dense but legible —
the detail page is tall and information-rich. Bahasa Indonesia throughout; Rupiah currency.

Design from the **user's job**: 5 roles (RM Relationship Manager · LG Legal · RA Risk Analyst ·
CM Committee · MG Management), each arriving with a different goal, plus the
**OJK auditor** (audit-first: every surface reachable + deep-linkable via `?view=`, nothing
hidden/disabled — panels own their own actionability with empty states + role/approval gates).
The cross-role handoff is the product.

## 2. Tokens (mirror of globals.css `:root`)

### Colours — base
| Token | Hex | Role |
|---|---|---|
| `--background` | `#f6f8fb` | app canvas (warm paper) |
| `--foreground` | `#0b1f3a` | primary ink |
| `--card` / `--popover` | `#ffffff` | surfaces |
| `--card-foreground` | `#0b1f3a` | text on surfaces |
| `--primary` | `#14418f` | primary navy (buttons, active) |
| `--primary-foreground` | `#ffffff` | text on primary |
| `--secondary` | `#eef2f8` | secondary surface |
| `--secondary-foreground` | `#1e3a5f` | text on secondary |
| `--muted` | `#f1f4f9` | muted surface |
| `--muted-foreground` | `#5b7186` | secondary text |
| `--accent` | `#e8f0fe` | soft blue highlight |
| `--accent-foreground` | `#14418f` | text on accent |
| `--destructive` | `#dc2626` | destructive |
| `--border` | `#e3e8f0` | hairline border |
| `--input` | `#ffffff` | input bg |
| `--ring` | `#2d7ff9` | focus ring |

### Colours — semantic status (meanings NEVER change: info=blue, success=emerald, warning=amber, danger=red, neutral=slate)
| Token | base / `-foreground` / `-subtle` |
|---|---|
| success | `#16a34a` / `#15803d` / `#ecfdf5` |
| warning | `#d97706` / `#b45309` / `#fffbeb` |
| danger | `#dc2626` / `#b91c1c` / `#fef2f2` |
| info | `#2d7ff9` / `#1d4ed8` / `#eff6ff` |
| neutral (`--neutral-token*`) | `#64748b` / `#475569` / `#f1f5f9` |

Subtle-bg + `-foreground`-text pairs are WCAG-AA legible — use them for chips/badges. Prefer
these tokens over ad-hoc Tailwind colour classes.

### Colours — akad / chart (UNCHANGED; AkadBadge + ScoreOverview depend on them)
`--chart-1 #3b82f6` (Murabahah, blue) · `--chart-2 #8b5cf6` (Musyarakah, violet) ·
`--chart-3 #06b6d4` (Ijarah, cyan) · `--chart-4 #f59e0b` (Mudharabah, amber) ·
`--chart-5 #16a34a` (green).

### Colours — sidebar (deep navy; rendered with a gradient surface `#0b2a54 → #123667`)
`--sidebar #0b2a54` · `--sidebar-foreground rgba(255,255,255,0.72)` · `--sidebar-primary
#2d7ff9` · `--sidebar-accent rgba(45,127,249,0.22)` · `--sidebar-border rgba(255,255,255,0.1)`
· `--sidebar-ring #2d7ff9`.

### Radius — `--radius: 0.625rem` base
`-sm` ×0.6 · `-md` ×0.8 · `-lg` ×1 · `-xl` ×1.4 · `-2xl` ×1.8 · `-3xl` ×2.2 · `-4xl` ×2.6.

### Elevation
`--shadow-card: 0 1px 2px rgba(11,31,58,.04), 0 1px 3px rgba(11,31,58,.06)` ·
`--shadow-card-hover: 0 6px 16px rgba(11,31,58,.08), 0 2px 6px rgba(11,31,58,.05)`.

### Type & motion utilities
`--font-sans` = IBM Plex Sans (400/500/600/700) · `--font-mono` = IBM Plex Mono (400/500) ·
`--font-heading` = sans. Wired in `app/layout.tsx`. `.tabular` = tabular figures (currency/
IDs). `.stagger` = container whose direct children fade-rise (`mizan-rise`, 8px→0) with
indexed delays; guarded by `prefers-reduced-motion`. Dark mode exists (oklch) but the app
ships light.

## 3. Colours & status vocabulary
Status is a **single source** — never invent status colours or fork the logic.
- **Pipeline step status** (`lib/proses-steps.ts`): `done` ✓ emerald · `active` ● primary ·
  `upcoming` ○ ring. Never "locked".
- **SLA** (`lib/sla-utils.ts`): `normal` green · `at_risk` amber · `overdue` red · `done`
  slate. Terminal-aware via `slaState` (Cair → "Selesai", reject → "Ditolak"; clock stops).
  Render via `SLAChip`.
- **Akad**: always via `AkadBadge` (colour map above) — never a plain pill.
- **Recommendation** (ScoreOverview): approve emerald · conditional amber · reject red.
- **Detail-page coherence (every dossier tab)**: wrap each tab's content in `DossierSection`
  (consistent header: icon · title · status chip · owner `RoleBadge` · note · ONE lock banner;
  status from `lib/proses-steps` `statusForView`). ONE status language — `StatusChip` + semantic
  tokens, never bespoke hue hex. Decisions via `DecisionChip`/`DecisionResult` (English
  Approve/Conditional/Reject). Info has one home (identity/terms→cockpit header;
  decision residue→Ringkasan; hard-gates→`HardGateFlags`; scores→`ScoreOverview`). The
  post-hero "Tugas Anda" card shows only an actionable task (hidden for observers / when done).
- **Detail landing = coordinator's worktable** (ADR-0009): the Ringkasan command-center (`CoordinationPanel`,
  model `lib/workstreams.ts`) lists the workstreams actionable NOW — `active` (its turn) or `early` (the
  do-it-early window) — so parallel, out-of-sequence RM coordination is legible (Stage 2 Legal ∥ Penilaian ∥
  Biro; Legal lagging into Stage 3). It NAVIGATES only (the gated forward action stays in `ActionBand`) and
  derives state from the SAME engine predicates as `proses-steps` — never fork "done". Show `active`+`early`
  only; the Proses stepper keeps full orientation. Hard-gate block renders only when `financialsAssessed`.
- **Doc-tab spine** (MUAP/RSK): ONE order — provenance band → document (`DocsPanel`) → role work zone →
  approval ladder. Keep the empty-Doc "Buat Dokumen dari Template" CTA (`DocsPanel` `NoDoc`).
- **Hard-gate indicators**: `HardGateTile` is the canonical DSR/LTV/Kol read-only tile. It MUST show
  pass/fail explicitly — text label + shape-distinct icon (`CheckCircle2` success for "Lolos",
  `OctagonAlert` danger for "Terlewati") + the semantic token, never colour alone. Show the value in
  `.tabular` and the threshold inline when known (`DSR 35% · maks 40%`). `HardGateFlags` is the compact
  violation list and uses the same danger token + octagon icon — no emoji/ad-hoc red classes.
- **Semantic chip primitive**: `StatusChip` renders any status pill from the semantic tokens
  (`bg-{tone}-subtle text-{tone}-foreground ring-{tone}/15`, tone ∈ success/warning/danger/info/
  neutral). It is the canonical chip for kolektibilitas (Lancar=success/DPK=warning/Macet=danger)
  and notification severity, and **`SLAChip` now renders through it** (SLA status → tone: normal→
  success, at_risk→warning, overdue→danger, done→neutral). `AkadBadge` (intentional akad hues) and
  `RoleBadge` still hard-code their own palettes — migrate when touched (upgrade-backlog).
- **Relative time** for activity/notification feeds: `formatRelativeTime(date)` in `lib/sla-utils.ts`
  ("2 jam lalu" …). Compute on the server, pass the string to client islands (no hydration drift).

## 4. Typography
IBM Plex Sans for UI + headings; IBM Plex Mono for IDs/currency with `.tabular` so digits
align. Page title = `font-heading text-2xl font-semibold tracking-tight` via `Page.Header`.
Card title = `font-heading text-base font-medium`. Body `text-sm`; secondary
`text-muted-foreground`. Copy is Indonesian (Setujui/Bersyarat/Tolak, "Buat ulang") — never English
for generic UI chrome. Bilingual domain labels ("Karakter (Character)") are intentional, and
**familiar banking-domain terms stay English** (stage names Feasibility / Risk Review / Committee
Decision, plus MUAP / RSK / SLIK / Kol) — Hijra staff already use them; do not Bahasa-rename them.

## 5. Layout & shell
- **Shell** lives once in the route group `app/(app)/layout.tsx` → `components/layout/
  AppShell.tsx` (`SidebarProvider` + `AppSidebar` + `SidebarInset` + scroll `<main>`),
  persistent across navigation. `/login` + `/api` stay outside the group. Sidebar is
  offcanvas-collapsible (cookie-persisted) with a floating reopen trigger; mobile uses the
  Sheet. Breakpoint is **md** (768).
- **Page** (`components/layout/Page.tsx`, namespace compound — see Do's/Don'ts for the RSC
  reason it's a plain object, no `'use client'`): `<Page.Root>` (content container,
  `space-y-6`; `className` tunes width — full-bleed for tables/lists, `mx-auto max-w-4xl`
  for forms/reading), `<Page.Header eyebrow title description>{actions}</Page.Header>`,
  `<Page.ActionBar>` (sticky blurred footer). Every page uses `Page.Root` + `Page.Header`.
- **Forms** (`components/ui/form-section.tsx`): `FormSection` (icon-chip header + responsive
  2-col grid), `Field` (label/control/hint; `full` spans 2 cols), `SegmentedToggle` (2–3
  binary choices). Currency inputs: Rp prefix + `.tabular` + thousands grouping.
- **Responsive**: desktop-first + tablet-friendly; CM/Komite must work on mobile (sidebar →
  Sheet). Watch density.

## 6. Elevation & depth
Use the shadow tokens, not ad-hoc shadows: `shadow-[var(--shadow-card)]` for resting cards,
`shadow-[var(--shadow-card-hover)]` for hover lift. Glass is used sparingly and restrained —
the surviving idiom is `ring-1 ring-inset … backdrop-blur` (see `PencairanTab`); a heavier
"glass island" was tried and removed in favour of a plain `backdrop-blur-md` bar. Don't
reach for `shadow-lg`.

## 7. Shapes
Cards/sections `rounded-xl`. Inputs/buttons `rounded-lg`. Pills/avatars/badges
`rounded-full` (badge uses `rounded-4xl`). Sidebar nav items `rounded-md`. Match the radius
scale; don't introduce arbitrary radii.

## 8. Components — the reuse vocabulary (reuse, don't reinvent)
| Need | Use | Path |
|---|---|---|
| Page scaffold | `Page.Root/Header/ActionBar` | `components/layout/Page.tsx` |
| App shell / sidebar | `AppShell`, `AppSidebar` | `components/layout/` |
| Brand glyph (no tile) | `MizanMark` (rub el hizb octagram; `currentColor` so it inverts — `text-primary` on light, white on dark; for inline lockups e.g. the mobile bar) | `components/shared/MizanMark.tsx` |
| Brand app-icon (tiled) | `MizanIcon` (navy-gradient tile + white octagram; Helium proportions — full-bleed, rounding ~26% = rx8.4/32, octagram ~63%; matches favicon `app/icon.svg` exactly; `onDark` prop swaps to the lighter gradient + glow for the sidebar — gradient & matching shadow are coupled in the component, not passed raw; size via className) | `components/shared/MizanIcon.tsx` |
| Grouped form | `FormSection` / `Field` / `SegmentedToggle` | `components/ui/form-section.tsx` |
| Status chip (semantic tokens) | `StatusChip` (`tone` success/warning/danger/info/neutral; dot/icon/pulse) | `components/shared/StatusChip.tsx` |
| Empty state | `EmptyState` (icon + title + optional description + action; canonical — never a hand-rolled dashed box) | `components/ui/empty-state.tsx` |
| Confirm gate (destructive) | `ConfirmDialog` (controlled; destructive-tinted; for delete-role / superadmin toggle and any irreversible admin action) | `components/ui/confirm-dialog.tsx` |
| KPI / stat card | `StatCard` (icon + value + sub; `tone`, `emphasizeValue`) | `components/shared/StatCard.tsx` |
| SLA chip | `SLAChip` (renders via `StatusChip`: normal→success · at_risk→warning · overdue→danger · done→neutral) | `components/shared/SLAChip.tsx` |
| Akad badge | `AkadBadge` | `components/shared/AkadBadge.tsx` |
| Hard-gate tile / flags (DSR/LTV/Kol) | `HardGateTile` + `HardGateFlags` (pass/fail token + shape icon + threshold; no emoji/ad-hoc red) | `components/shared/HardGateTile.tsx`, `components/shared/HardGateFlags.tsx` |
| Role badge / role-tagged owner | `RoleBadge`; `activeOwnersLabel` (name + role code, e.g. "Budi (LG), Siti (RM)" for list ownership) | `components/shared/RoleBadge.tsx`, `lib/stage-owners.ts` |
| 5C+1S score viz | `ScoreOverview` | `components/application/ScoreOverview.tsx` |
| Dossier tab frame (EVERY detail tab) | `DossierSection` (icon·title·status chip·owner RoleBadge·note·one lock banner; status via proses-steps `statusForView`) | `components/application/DossierSection.tsx` |
| Coordination worktable (Ringkasan "Alur kerja") | `CoordinationPanel` + `lib/workstreams.ts` (active/early streams; navigates only; reuses engine predicates, never forks `done`) | `components/application/CoordinationPanel.tsx` |
| Decision chip / result card | `DecisionChip` / `DecisionResult` (English Approve/Conditional/Reject + shape icon; calm-chip) | `components/komite/DecisionResult.tsx` |
| Primitives (shadcn/Base UI) | button, card, input, select (`items` prop), dialog, sheet, sidebar, dropdown-menu, tabs, badge, tooltip, avatar, progress, separator, scroll-area, skeleton, sonner | `components/ui/` |
| Pipeline status / SLA / scoring | reuse, never fork | `lib/proses-steps.ts`, `lib/sla-utils.ts`, `lib/scoring.ts` |
| Detail nav / deep-link | `lib/detail-nav.ts` (`?view=`) | — |
| Identity / authz (client) | `useActor()` — the full `Actor` (userId/name/avatarInitials/title/desks/superadmin/impersonating); `hasDesk`/`canActOnDesk` gates. The legacy `useRole`/`currentUser` shim is GONE. | `context/ActorProvider.tsx` |

**Sidebar active state**: the kept signature is the gradient pill —
`bg-gradient-to-r from-[#2d7ff9] to-[#3b82f6] text-white shadow-[0_2px_10px_rgba(45,127,249,0.35)]`.

## 9. Do's & Don'ts
**Do**
- Reuse the components/logic above; match existing density and tokens.
- Bahasa Indonesia for UI chrome; keep familiar banking-domain terms English (see §4).
- CSS-only motion (`.stagger`, `tw-animate-css`); respect `prefers-reduced-motion`.
- Verify WCAG-AA contrast on any new bg/text pair.
- Never encode meaning by colour alone (WCAG 1.4.1): pair status colour with a text label
  and/or a **shape-distinct** icon. Severity convention: octagon = danger, triangle = warning,
  circle = info (see `NotificationsList`) — distinguishable for colour-blind users.
- Read `apps/web-app/node_modules/next/dist/docs/` before writing Next APIs (this is **modified Next 16**).
- List surfaces (Pipeline / Aplikasi / Notifikasi): default to the FULL set (audit-first), add an
  opt-in "Tugas saya" filter (`canActOnDesk`); role-tag owners (`activeOwnersLabel`); reflow dense
  tables to stacked `ApplicationCard`s below `md`. Notifications (personal) scope to actionable-by-me.

**Don't**
- Don't invent status colours or fork `proses-steps`/`sla-utils`/`scoring`.
- Don't use English for generic UI chrome (but KEEP familiar banking-domain terms — see §4).
- Don't use `useSearchParams` for `?view=` — use `window.location.search` +
  `history.replaceState` (avoids forcing a Suspense boundary).
- Don't render akad as a plain pill — use `AkadBadge`.
- Don't disable tabs/surfaces — keep them reachable; gate actions inside the panel.
- Don't iframe a Google Doc `/edit` (frame-blocked) — embed `/preview`.
- Don't add a new animation dependency (no framer-motion).

**Gotchas learned (cost real debugging — heed them)**
- **Favicon location**: use Next App Router's `app/icon.svg` convention. Do not add `public/favicon.ico`, manual `<link>` tags, or `metadata.icons` for the Mizan mark unless raster fallbacks are explicitly required later.
- **RSC client boundary**: `Page.tsx` is a plain shared module exporting
  `const Page = { Root, Header, ActionBar }` with **no `'use client'`**. A static/`.Header`
  on a `'use client'` export becomes a client-reference whose props read `undefined` in a
  Server Component → "Element type is invalid" crash. typecheck won't catch it; only
  runtime/Playwright. Keep compound parts as real exports of a non-client module.
- **`useIsMobile` must be SSR-safe** (`false` until mounted) — reading `window` in the
  initializer diverges from SSR → hydration mismatch.
- **`.stagger` replays on remount** — only put it where the container is stable; the shell
  is now persistent (route-group layout) so this is safe there, but mount-triggered reveals
  on per-page-remounted surfaces will replay each navigation.
- **Badge/element alignment with custom row heights**: primitive badges use
  `peer-data-[size]:top-*` tuned for default heights; on taller rows centre with
  `top-1/2! -translate-y-1/2!` (important, to beat the variant).
- **Notifications count** comes from `lib/notifications.ts` (`unreadCount`) — single source
  for the sidebar badge and the page; don't hardcode.
