# Upgrade backlog — known mismatches to fix opportunistically

Per the "upgrade, never downgrade" rule: when you touch one of these surfaces (or have spare
scope), bring it up to standard. Keep this list current — remove items when fixed, add new
mismatches you discover.

## Done — detail-page coherence + Full-Mizan Wave 1 rework (do not redo)
- Detail-page tabs unified onto `DossierSection` + `StatusChip`/semantic tokens (was 6 bespoke
  colour systems / 4 lock patterns). `RoleBadge` now used (owner badges). Komite decision verbs
  standardised to English Approve/Conditional/Reject via shared `DecisionChip`/`DecisionResult`.
- **Komite hub** (`MeetingList`/`MeetingScheduler`/`KomiteVoting`) brought up to the same bar:
  status `Badge` → `StatusChip` (shape icon + label), chair/quorum amber → primary/`warning`
  tokens, slate surfaces → muted/border. Chair picker is now a `Select` (was pill-select). No
  bespoke hue hex left in `components/komite/`.
- **Multi-desk landing**: `defaultView(actor, app)` resolves from the Actor; `useRole` shim
  dropped from the detail page.
- **Cockpit stickiness**: user decided NOT to make "Tugas Anda" sticky (keep it a prominent
  scrolling post-hero card; section nav rail is already sticky). Don't reopen.
- **Full-Mizan Wave 1 (2026.06.07):** `SLAChip` migrated onto `StatusChip`/semantic tokens (SLA
  status → tone). New canonical `EmptyState` (`components/ui/empty-state.tsx`) — use instead of
  hand-rolled dashed boxes.

## Open
- **Hue-hard-coded chips → migrate onto `StatusChip` / semantic tokens.** `StatusChip`
  (`components/shared/StatusChip.tsx`) is now the canonical semantic-token chip (adopted by
  portofolio kolektibilitas + notification severity). These still hard-code `emerald/amber/red`:
  `AkadBadge`, `RoleBadge`, the ScoreOverview recommendation chip, `HardGateFlags`, and the
  Management Dashboard SLA metric/table hues. Bring them onto `StatusChip`/tokens when touched.
  (Pipeline `REC_CHIP`/score chip + the stage-strip SLA dots are DONE — on `StatusChip`/tokens.)
- **Dashboard `KpiCard` → shared `StatCard`.** `components/shared/StatCard.tsx` is now the
  canonical KPI card (portofolio adopted). The Management Dashboard still has its own `KpiCard`
  variant — converge it onto `StatCard`.
- **Audit for any surface not yet on `Page`** — every top-level page should use
  `Page.Root` + `Page.Header`. Detail/sub-pages render inside the shell `<main>` directly
  (no `Page` wrapper needed) but should still use `Page.Header` where a header fits.
- **`HardGateTile` adoption — two more surfaces.** Ringkasan/Identitas/Analisa unified onto
  `components/shared/HardGateTile.tsx`, but `components/komite/KomiteVoting.tsx` (local `Stat`) and
  `components/application/DataTab.tsx` (DSR/LTV via `FieldRow`) still render gates bespoke. Distinct
  contexts so not forced; adopt the tile (read-only DSR/LTV) when touched. Severity: low.
- **Notifications case-grouping (Full-Mizan Wave 2 remainder).** `/notifications` is actionable-by-me +
  badge (Wave 1); the optional per-app/case grouping of the feed is the only Wave-2 item left. Wave 2's
  home/pipeline reshape was deliberately NOT taken (the real gap shipped as grant-based auto-assignment,
  ADR-0012); `CoordinationPanel`/`lib/workstreams.ts` remains the precedent if a cockpit is ever revisited.

## Watch (verify, not yet confirmed debt)
- Mixed shadow usage — **dossier RESOLVED 2026.06.05**: the hand-rolled card surfaces
  (`DetailCockpit` hero, `ActionBand` container + single card, `DossierLayout` nav rail) now use
  `shadow-[var(--shadow-card)]` + `border-border/70`, matching the `Card` primitive. Remaining
  `shadow-sm` lives in shadcn/Base UI primitives (form-section toggle, floating/inset sidebar,
  tabs) — legit. Still prefer the card token over `shadow-sm`/`shadow-md` on any new card-like surface.
- Any remaining `text-2xl font-bold` page titles that predate `Page.Header`'s
  `font-heading text-2xl font-semibold`.

## Done (history — do not redo)
- All 7 top-level pages migrated to `Page`/`Page.Header`; "Management Dashboard" → "Dashboard
  Manajemen".
- Sidebar rebuilt on the shadcn primitive (persistent route-group shell, offcanvas,
  gradient-pill active, single live notification badge, flat footer with role-as-text).
- New-application form redesigned (FormSection/Field/SegmentedToggle, Rp currency, tenor chips).
- **`STAGE_NAMES` Bahasa vs English — DECIDED 2026.06.07: do NOT blanket-rename.** Stages 1/2/6 are
  Bahasa (`'Pengajuan Dokumen'` / `'Legal, Agunan & Biro'` / `'Pencairan'`); 3/4/5 stay English
  (`'Feasibility / MUAP (5C+1S)'` / `'Risk Review'` / `'Committee Decision'`) — familiar banking terms
  Hijra staff already use. Their action verbs (`'Kirim ke Risk Review'`, `'… ke Feasibility'`) stay
  English too. The Bahasa sweep targets generic UI chrome only ('My TODO', 'Assigned to', 'At Risk',
  'Compliance'), never banking-domain vocabulary.
- **PersonalKanban drag persistence — DONE 2026.06.07.** Pure guard `applyPersonalStatusMove`
  (`lib/personal-status.ts`, unit-tested) + `setPersonalStatusAction` (`server/actions/personal-status.ts`)
  persist a todo↔in_progress move; the submitted column stays workflow-owned + locked. Wired into
  PersonalKanban with optimistic update + revert-on-error. Live-proven (drag → reload → persisted).
