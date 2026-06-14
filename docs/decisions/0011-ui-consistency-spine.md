# ADR-0011: App-wide UI consistency spine (full-Mizan Wave 1)

- **Status:** accepted
- **Date:** 2026.06.07

## Context

The full-Mizan UI/UX audit (`docs/planning/full-mizan-ui-ux-review.md`, Direction C) found the detail page had been rebuilt around Hijra's real practice (ADR-0009) while the surrounding app stayed a generic stage-pipeline shell with drifting consistency: fragmented status vocabulary, recurring WCAG colour-only encodings, English UI chrome, no role-scoped views, thin empty/loading states, non-mobile data tables, a working-but-transitional `useRole` shim, and unguarded destructive admin actions. Direction C sequences the fix as **Wave 1 = the consistency spine** (this ADR) then **Wave 2 = the coordination cockpit**.

## Decision

Wave 1 establishes these durable, app-wide conventions:

1. **One status vocabulary.** `StatusChip` + semantic tokens is the single chip language. `SLAChip` and the Pipeline recommendation/score chips now render through it (SLA status → tone: normal→success, at_risk→warning, overdue→danger, done→neutral); ad-hoc emerald/amber/red and colour-only dots are retired. WCAG 1.4.1 everywhere — colour is always paired with text and/or a shape-distinct icon. (Remaining hue migrations — `AkadBadge`/`RoleBadge` intentional, Management SLA hues — tracked in the backlog.)
2. **Bahasa for UI chrome; English for familiar banking-domain terms.** Generic chrome is Indonesian (Tugas Saya, Berisiko, Kepatuhan, …); banking terms Hijra staff already use stay English (stage names Feasibility / Risk Review / Committee Decision, plus MUAP / RSK / SLIK / Kol) — including their audit-trail action verbs. (User decision, 2026.06.07.)
3. **Role-first without hiding.** Lists keep the full set as the default (audit-first: nothing hidden) and add an opt-in "Tugas saya" filter (`canActOnDesk`). Ownership is role-tagged everywhere (`activeOwnersLabel` → "Budi (LG), Siti (RM)"). Notifications — the inherently-personal surface — scope to actionable-by-me by default (page + sidebar badge).
4. **Canonical states.** `EmptyState` (icon + title + description + action) replaces hand-rolled dashed boxes; `ConfirmDialog` gates irreversible admin actions (delete role, grant/revoke superadmin).
5. **Mobile-real data surfaces.** The dense Pipeline table is md+ only; below md each stage reflows to stacked `ApplicationCard`s (no horizontal scroll).
6. **`useActor` is the only client identity/authz hook.** The transitional `useRole()`/`currentUser`/`isRole` shim and `RoleContext.tsx` are deleted; all consumers read the `Actor` directly.

## Consequences

- Every surface now shares one status language, one empty/confirm vocabulary, role-scoped opt-ins, and works on mobile — the foundation Wave 2's cockpit reuses.
- New primitives live in `components/ui/empty-state.tsx`, `components/ui/confirm-dialog.tsx`; conventions are in the `mizan-design` skill baseline (`.agents/skills/mizan-design`).
- **Deferred (backlog, deliberate):** PersonalKanban drag persistence (needs a dedicated, safety-verified `setPersonalStatusAction`); Management SLA hue→token + `KpiCard`→`StatCard` migration.
- The full-Mizan plan stays ACTIVE (Wave 2 pending); it retires — promoting the Direction-C decision in full — in its closing batch.
- Verified: typecheck · lint 0-err · 348 unit · 42 integration · 21 e2e (136 steps) · live 1280 + 375, zero console errors.
