<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

# UI/UX & Frontend — Consolidated Knowledge

## Detail Page as RM Coordination Command Center (ADR-0009)

### Structure — final (OMP S5 / session-S5 019e9dc2)
The detail page is a **Dossier** (two-pane shell): left grouped nav rail (`DossierNav`), right content (`DossierContent`). The layout replaced the earlier `DetailTabs` (batch-03, session `f6ae1e5c`).

**Top zone (above tabs):** `DetailCockpit` — hero plafond number, `ActionBand` (Tugas Anda), Proses stepper (4-phase label via `phaseLabel()`), `CoordinationPanel` (workstreams for RM). The `KomiteSeamCard` was an intermediate addition (batch-02 `39e191a2`) and was **deleted** in batch-05 (session `7866cf41`); its content merged into ActionBand subtitle + Ringkasan.

**Nav groups (always-visible, never collapsible — revert documented in ADR-0009):**
- Ringkasan (summary cockpit — RM's worktable with `CoordinationPanel`, score, hard gates, audit activity strip)
- Dokumen (uploads + legal verification + AML card)
- Data (OCR-confirmed structured fields, financials, Kol entry, appraisal)
- MUAP / RSK (doc-tab spine: provenance → document → role work zone → approval ladder)
- Diskusi
- Riwayat (history / audit)

Tabs that were **deleted** during OMP era:
- `IdentitasView` (redundant — cockpit + Data covered it)
- `AnalysisTab` / `Analisa` tab (5C+1S narrative → MUAP doc; scores auto-draft via `buildAnalysisDraft` on Stage-3 entry; deterministic scores in Ringkasan)
- `LegalSlikTab` (batch-10 `52d36006`; legal sign-off → Dokumen tab, Kol → Data tab)
- `ProsesRail` (built session `a8b25495`, deleted session `f6ae1e5c`; role moved to `RingkasanView` stepper)
- `KomiteSeamCard` (batch-05)

**ADR-0009 approved Direction C:** Upgrade Ringkasan into RM worktable (live workstream cards, do-it-early parallel streams) while keeping audit-first tabs for depth. Direction A (polish-in-place) and B (full cockpit rebuild) were evaluated and rejected.

### CoordinationPanel / workstreams.ts
- `lib/workstreams.ts` → `CoordinationPanel` — parallel workstream cards derived from engine predicates (same as `proses-steps`, no fork)
- Stage-2 shows three parallel streams: Legal ∥ Penilaian ∥ Biro (can lag into Stage 3 per ADR-0007)
- Hard-gate tiles show only after `financialsAssessed` (kills 3 empty "Belum dinilai" at intake)

### Proses stepper
- 4-phase labels via `phaseLabel()` / `phaseOf(stage)`: 1/2/3→Fase 1 (Originasi), 4→Fase 2, 5→Fase 3, 6→Fase 4
- Engine 6→4 renumber is **explicitly deferred** (organizational only, ~158 `.stage===N` sites, authz blast-radius)
- Step done/active/upcoming vocabulary (done ✓, active ●, upcoming ○) — lock glyph 🔒 was used in batch-03 session 1 then replaced with ○ immediately as "dishonest"
- `canLag: true` on Stage-2 step (session-S6): lag steps bypass the `app.stage > step.stage` shortcut; status derived from own done-predicate only — fixes false "Selesai" for Legal when RM advances 2→3 while Legal is still pending (ADR-0007 parallelism)

### defaultView routing
- Non-owners land on `ringkasan`; owners land on their work surface
- `defaultView(actor, app)` uses `effectiveRole(actor, app) ?? primaryRole(actor)` + app (migrated in batch-05 from `defaultView(role, stage)`)
- `?view=` deep-link fully enabled — every view reachable; panels own their own empty states

---

## Tugas Anda / ActionBand Grammar

### Final model (ADR-0011, S5, S6, batch-22)
`ActionBand` is a **directive, not a workspace**. Canonical grammar:

```
directive line
primary (filled button) — one forward action, exactly one
returnAction? (outline button) — optional paired send-back counterpart only
```

- **Primary** = single gated forward action. Exactly one.
- **returnAction** = inverse of the primary (Kembalikan…/Tolak…). Not a general "secondary action" slot. Absent when there is no one to return to (Stage-1 RM = originator).
- Typed as `primary` + optional `returnAction?` — `secondaries[]` array is **eliminated and type-enforced out**. The old open array allowed drift; the typed pair enforces the grammar structurally.
- **Excluded from the band:** prerequisite sub-forms (AML moved to Dokumen tab), blocker-detail walls, forms.
- A disabled primary renders one short `blockerSummary` category line (e.g. "Belum lengkap: berkas wajib · atestasi AML"). `blockerMessages` array kept for server gate + tests, never rendered verbatim in the band.
- SSOT: `docs/guides/detail-page.md` § "Tugas Anda grammar" + `apps/web-app/AGENTS.md:46`

### AML attestation relocation
- Was inline sub-form inside ActionBand → moved to "Kepatuhan (AML)" card in **Dokumen tab** (batch-21 S2, `42b65c3`)
- Server gate `stage1To2Blockers` untouched — AML remains non-bypassable
- Rationale: Dokumen is the pre-handoff clearance surface; AML is a clearance prerequisite, not a directional decision

### form-directive pattern (deleted)
- Old pattern: `ActionDescriptor.form = 'slik-handoff' | 'legal-review'` navigated to a tab, leaving the advance button buried in tab content
- Both were replaced by standard Tugas Anda primaries in session-S6 (`631b10c`):
  - Stage-2 LG: "Selesaikan Analisa Yuridis" (was in `DocumentsTab`) → Tugas Anda primary `complete-legal`
  - Stage-2 RM bureau: "Kirim ke Feasibility" (was in `SlikHandoffPanel`) → Tugas Anda primary `bureau-handoff`
  - Stage-4 RA: risk recommendation form deliberately stays in tab (3-way selector+note = a form, not a single button)
- `ActionDescriptor` extended with `workView?: DetailView` — "Buka <tab>" secondary link
- `SlikHandoffPanel` deleted from DataTab; "Selesaikan Analisa Yuridis" button removed from DocumentsTab

### Evolution
- Brainstorm era: Action Band concept introduced in session `5507eaf1` — "owners get primary action, blockers, send-back; non-owners get read-only status"
- batch-02: Legal-review + risk-recommendation forms moved into Action Band (reversed later)
- batch-05 `7866cf41`: KomiteSeamCard merged into ActionBand subtitle; two-card model (intermediate "grouped container") rejected as too tall
- batch-21 S2: Grammar formalized with `secondaries[]` → `returnAction`
- batch-22 (S5): Type enforced; old `secondaries[]` removed, 28 unit test assertions updated
- session-S6: `form`-directive pattern fully removed; Kol confirm stays separate (hard-gate field must always be human-reviewed, never auto-advanced)

---

## UI Consistency Spine (ADR-0011)

### Wave 1 findings (session-S5)
Eleven cross-cutting issues found:
- Status vocabulary fragmented: `SLAChip` hardcodes, `REC_CHIP`, inconsistent dots/charts
- Colour-only WCAG 1.4.1 violations (severity, hard gates)
- English strings leaked into UI chrome ("My TODO", "Assigned to", "Nasabah Type", "Akad Type", "Stage")
- All 46 apps visible to every role (no "Tugas saya" filter in Pipeline/Applications)
- Hidden-vs-gated inconsistency across surfaces
- Thin empty/loading/error states
- Mobile Pipeline clips at 375px
- `useRole` → `useActor` migration unfinished
- Notification firehose (all severity, no scoping)

### Wave 1 fixes (ADR-0011)
- **`StatusChip`** is canonical status/SLA vocabulary across all surfaces. `SLAChip` → thin wrapper around `StatusChip`
- **`HardGateTile`**: shared component; modes: assessed/unassessed, violation, optional inline-edit. Shows threshold text + shape-distinct pass/fail (check/emerald OK; octagon/danger breach). WCAG 1.4.1 compliant (shape + colour). `HardGateFlags` uses `StatusChip` + semantic tokens, not hardcoded `red-50`
- **`EmptyState`**: canonical primitive
- **`ConfirmDialog`**: Base UI Dialog + destructive button
- **Shared primitives**: `StatCard` (unified from two variants: portofolio + dashboard)
- **Severity shape convention (standing WCAG 1.4.1 rule):** octagon = danger, triangle = warning, circle = info — shape-distinct, colorblind-safe, icons from Lucide. Established batch-04, enforced in AGENTS.md + skill SKILL.md
- **"Tugas saya" toggle:** opt-in on Pipeline + Applications; default = all (audit-first, nothing hidden)
- **Mobile Pipeline reflow:** `md:hidden` card reflow (`ApplicationCard`); table is `md:block` only. Note: dual-render → Playwright `getByText` strict-mode with 2 matches → use `.first()`
- **Banking terms kept English:** Risk Review, Feasibility, MUAP, RSK, SLIK, Kol, Committee Decision — Hijra staff familiarity. Bahasa sweep = UI chrome only
- **`useActor` (not `useRole`)**: `RoleContext.tsx` shim deleted; `ActorProvider` canonical

### Semantic token adoption
- Defined in `globals.css` `@theme inline`; not adopted in old chips before batch-04
- `bg-success-subtle`, `text-danger`, etc. first adopted in `StatusChip` (batch-04)
- `SLAChip`/`AkadBadge`/recommendation chips all hard-coded `emerald/amber/red-50` → convergence debt (logged in `upgrade-backlog.md`)

---

## Tab / IA Structure

### DossierSection
- Introduced batch-05 (`7866cf41`): every dossier tab wears one shared frame
- Props: `{icon, title, owners:Role[], status:StepStatus, locked, note, actions, children}`
- `STATUS_META`: done→success/CheckCircle2, active→info/CircleDot, upcoming→neutral/Circle
- All 11 dossier views clean with `DossierSection` wrapper (batch-05)
- **DataTab**: responsive — `FieldRow`/`NikConfirmRow`/`KolEntryRow` use `flex-col sm:flex-row` + `break-words` (fixed at mobile 375px, batch-05)

### Tab inventory (current/OMP)
- **Ringkasan** — RM worktable, score ring, hard gates, audit activity, CoordinationPanel
- **Dokumen** — uploads (all roles), legal verification (LG), AML card (Kepatuhan), SLIK/Pefindo rows (RM-gated)
- **Data** — OCR-confirmed structured fields, financials, Kol entry (`KolPanel`), Penilaian Agunan; AML was temporarily here (D17 batch-22) but settled in Dokumen in batch-23
- **MUAP** / **RSK** — unified doc-tab spine: provenance → document → role work zone → approval ladder
- **Diskusi** — wrapped in `DossierSection` + `Card` (was frameless before batch-22 D17)
- **Riwayat** — append-only history

### DiskusiCard / ConversationMessage
- Pre-batch-22: all messages showed *viewer's* name (display bug — no per-message author stored)
- MentionUser (batch-22 D13): added `authorId`, `authorName`, `mentions: String[]` to `ConversationMessage`; attribution fixed
- `buildMentionNotifications`: derived/polling model; "disebut dalam diskusi" entries in notifications; cross-user e2e verified

---

## Hard-Gate Readability

### Vocabulary & display
- DSR, LTV, Kol — flag-not-block; never block stage advance, always flag (batch-01 `dacf63c3`)
- LTV threshold conflict: FOS = 80%, code = 70%. Flagged in batch-02, LTV 80% confirmed by FOS; `DEFAULT_RISK_POLICY = {dsrMaxPct:40, ltvMaxPct:70, kolMax:1}` (batch-07; thresholds strictly greater, boundary passes)
- Hard-gate thresholds are versioned config (`RiskPolicyVersion` table), not literals — frozen at committee decision into `DecisionCheckpoint` (batch-07 Phase C)

### Shared `HardGateTile` component (batch-22, S5)
- Replaced 4 bespoke forks: `Gate` in Ringkasan, `GateChip` in Analisa, `Stat`×2 in Identitas + KomiteVoting
- Modes: assessed/unassessed, violation, optional inline-edit
- Shows threshold value alongside metric: "DSR 35% · maks 40%"
- `HardGateFlags` uses `StatusChip` + semantic tokens

### Gate display convention
- Empty state: `—` not `0%` (batch-01 `9df2bee`)
- Amber ⚠ icon for unconfirmed OCR fields
- All 7 UI surfaces reading `app.riskPolicy ?? DEFAULT_RISK_POLICY` (config drift bug found and fixed batch-07)
- At Stage 3+: DSR/LTV/Kol badge strip at top of AnalysisTab (later Ringkasan) — GAP 6 fix from batch-01

---

## Pipeline / Kanban Model & Sorting

### Final model
- `/pipeline` — **stage-grouped table** (`PipelineTable.tsx`) with distribution strip on top (chip per stage: count + worst-SLA dot, jump-links). Columns: ID · Nasabah · Akad · Plafond · SLA · Penanggung Jawab · Skor; urgency-sorted within stage
- Kanban was deleted from `/pipeline` in batch-03 (`2c4cdaa2`, `PipelineKanban.tsx` deleted). Decision: 6-column Kanban overflows right edge; scanning/grouping is a table task
- `/dashboard` — keeps Kanban with personal drag-to-reprioritize (airy columns, colored-dot + count-pill headers, per-column scroll on desktop). Revised batch-03

### Personal Kanban / drag-persist (S5, batch-22 D15)
- `todo ↔ in_progress` drags persist via `setPersonalStatusAction` with `applyPersonalStatusMove` pure guard
- `submitted` column stays workflow-owned (locked, not draggable)
- `assignment.status` is display-only — no workflow gate reads it

### Sorting
- Pipeline: `comparePipelineRows` in `lib/pipeline-sort.ts` — worst-SLA→oldest sort
- `applicationSLAStatus` / `SLA_RANK` helpers (committed user WIP `acb312d` in session-S6)
- `formatTanggal` in `sla-utils.ts`; "Diajukan" column added to PipelineTable

### SLA display
- `SLAStatus` union includes `'done'` — disbursed (`Cair`) and rejected apps show "Selesai" instead of counting "Terlambat" (batch-03 `114f28e`)
- `SLAChip` → thin wrapper around `StatusChip` (S5)
- Seed SLA re-anchored to `daysAgo(N)` relative dates (batch-03 `2544e58`)

### Stage 2 label
- Renamed "Legal, Agunan & Biro" (Legal · Penilaian/Appraisal · Biro/SLIK-Pefindo) in S5

---

## Dashboard

- Management Dashboard: akad distribution, stage volume bars, SLA monitor, audit feed (batch-02 `dacf63c3`)
- KPI cards: number at `text-3xl`; thin accent rule; hue-specific class bug `primary-blue` (not a valid Tailwind token; was `primary`) found and fixed batch-02
- `KpiCard` → unified into `StatCard` (batch-04 `85e25d5e`)
- Dashboard Kanban modern redesign: airy columns, colored-dot + count-pill headers, rich cards, per-column scroll (batch-03 `2e73b90`)
- Management chart colours are axis-labelled + WCAG-acceptable; `KpiCard`→`StatCard` migration deferred backlog

---

## Navigation / Shell

### Sidebar / shell architecture
- Persistent shell via route group `app/(app)/layout.tsx` — renders once, survives navigation. `/login` stays outside. URLs unchanged (batch-04 `11979db7`)
- Sidebar built on shadcn `ui/sidebar.tsx` primitive. `collapsible="offcanvas"` + persistent layout + controlled provider = correct architecture
- Desktop always-open: controlled `open={true}` on `SidebarProvider`. `collapsible="none"` returns static div with NO mobile Sheet — do NOT use
- Mobile: built-in Sheet; `AppLayout.tsx` → deleted, replaced by `AppShell`

### Sidebar active state
- Final: gradient-pill (`from-primary/20 to-primary/10`). Left-accent-bar variant tried and reverted per user preference (batch-04)
- Active item: longest-prefix-match not `startsWith` — prevents `/applications/new` lighting up both entries

### Mobile top bar
- Hamburger opening `SidebarBody` in a Sheet (batch-03 `70f6466`)

### Notification badge
- Single badge with live count from `lib/notifications.ts` (batch-04); removed footer duplicate with hardcoded "3"
- Sidebar footer: user identity + plain "Ganti Peran" text link (no popup) → **replaced by Firebase auth + "Akhiri 'Bertindak sebagai…'" impersonation end button** (amber `UserMinus` icon, above logout, visible only while impersonating)

### `useIsMobile` hook
- MUST NOT read `window.innerWidth` synchronously in initializer (breaks SSR hydration). Stay `false` until mounted, set real value in effect (batch-04)

### `Page` compound component
- `Page.Root`, `Page.Header`, `Page.ActionBar` — no `'use client'` on the barrel. RSC-safe compound: adding `'use client'` makes `Page.Root` undefined in server components (batch-04)
- `Page.ActionBar`: full-width sticky bottom bar — `sticky bottom-0 z-10 backdrop-blur-md`. Glass island variant was built then reverted per user preference

---

## Notifications UI

### Design (batch-04 `85e25d5e`)
- Severity-led flat list (not date-grouped). Research-backed: grouping pays off past ~8 types
- **Shape-coded severity (WCAG 1.4.1 standing rule):** octagon = danger, triangle = warning, circle = info
- Category encoded as small muted glyph (clock/scan/file) near timestamp
- Item anatomy: colored rail + icon + title + timestamp + inline CTA
- `lib/notifications.ts`: `severity` (danger/warning/info), `category`, `appId`, `timestamp`, `cta`, `sortNotifications` (severity → newest)
- Skip terminal apps (`Cair`/`Tolak`) — false "SLA terlewati" alert bug was fixed here; count dropped 25→16

### Scoping (S5, session-S5)
- App-derived notices scoped to `canActOnDesk` (actionable-by-me)
- Mentions actor-scoped ("disebut dalam diskusi" category via `buildMentionNotifications`)
- MoM SLA notification: `'mom'` added as `NotificationCategory`

### `formatRelativeTime` — added to `lib/sla-utils.ts` (batch-04)

---

## NewApplication / Intake

### Form shape
- **Sectioned single-page form** (batch-04): beats wizard for trained AO/RM power users filing repeatedly; OJK auditor needs everything visible at once. Wizard was the early design
- FOS mockup had a single modal form (not a wizard); Mizan chose sectioned page
- Stage-1 field list: `nasabahName`, `nasabahType`, `akadType`, `collateralType`, `incomeSource`, `isMarried`, `requestedPlafond`, `requestedTenorMonths`, `purpose`, `phoneNumber`, `namaUsaha` (business-only), `whatsappNumber?`
- NIK: NOT captured at creation. OCR extracts from KTP; AO confirms in Data tab (reversal in batch-01)

### Dev autofill button
- Floating "⚡ Autofill (dev)" button via `useRegisterAutofill()` context (batch-05)
- `NODE_ENV !== production` guard; wired on intake + financial forms + DocumentsTab
- Context value stability: `useMemo(() => ({ register }), [register])` prevents infinite-loop bug (batch-05)

### Akad color-coding
- Murabahah blue / Musyarakah violet / Ijarah cyan / Mudharabah amber (batch-02 `dacf63c3`)

### `Select.Root` pattern (Base UI)
- `items={{value: label}}` map on root + plain `<SelectValue />`
- `onValueChange` passes `string | null` — state must handle null
- Hoist `ITEMS` as module-level const — inline object creates new reference every render → loop (batch-05)

---

## Admin Console

### 3-way admin desk split (batch-06, batch-07)
- `ADMIN-USERS`: users, role↔desk grants
- `ADMIN-MASTER`: products, rate tables, SLA, doc-checklist, branches
- `ADMIN-POLICY`: DSR/LTV/Kol gate thresholds — high blast-radius, segregated
- Superadmin retains break-glass + impersonation (superadmin-only permanently)
- No maker-checker for admin (single-actor + audit); deferred for `ADMIN-POLICY`

### Escalation guardrail
- Only superadmin can grant `ADMIN-*` desks or include them in role bundles — prevents privilege escalation via ADMIN-USERS desk
- `assertNoAdminDesksInBundle` + `assertNotAdminDeskEscalation` (batch-07)

### `ConfirmDialog` in Admin
- Base UI Dialog + destructive Button for delete role, demote superadmin (S5)

### canParticipate bug (batch-07)
- Was `desks.some(d => d !== 'MG')` → ADMIN-only holders counted as workflow participants (wrong)
- Fixed: `isSuperadmin || desks.some(d => STAGE_OF_DESK[d] !== null)`

---

## Portfolio Management

### Design (batch-04 `85e25d5e`)
- Health hero with real NPL ratio vs 5% threshold + Kol-composition bar (Lancar/DPK/Macet by outstanding)
- No trend sparkline — no historical NPL series exists; fabricating risk history on compliance surface is wrong
- KPI row: Macet/NPL card
- Sortable/filterable `WatchlistTable` (worst-kol-first, drill-in, empty state)
- Kol color coding: Lancar (Kol 1), DPK (Kol 2), Macet (Kol 3–5); NPL flag at Kol 4–5
- NPL computed from Kol badges; origination Kol vs monitoring Kol are separate (post-disbursement apps can degrade)

---

## Impersonation Banner

### Final model (ADR-0010, S5)
- **Superadmin is workflow-read-only.** Effective desks = `ADMIN_DESKS + MG` (console power + observer, no pipeline desks)
- `isSuperadmin` short-circuits removed from all workflow predicates: `canActOnDesk`, `canParticipate`, `effectiveRole`, `actingRolesForStage`, `hasAnyDesk`
- Superadmin acts on workflow **only by impersonating** a real role (audited "a.n. Superadmin Y")
- Komite chair-bypass removed — break-glass = impersonate actual chair user

### Impersonation UI
- Sticky `ImpersonationBanner` (existing) + **end-impersonation button** in sidebar footer (amber `UserMinus` icon, "Akhiri 'Bertindak sebagai…'", above logout, visible only while impersonating) — added S5

### Sidebar footer title
- `actorTitle()` helper (`actor-title.ts`): fallback chain `User.title` → role names (joined `UserWithAccess.roleNames`) → "Superadmin" → "Menunggu akses"
- Fixes blank sidebar role line for login-provisioned users with null `User.title` (session-S6 `2fe7175`)

---

## Decision Verbs (English)

### Final rule (batch-05 `7866cf41`, locked)
- `Approve / Conditional / Reject` **deliberately English** across all decision surfaces
- The rule is: Bahasa Indonesia for all UI copy, **except decision verbs which are intentionally English** (banking familiarity for Hijra staff)
- Three divergent label maps were unified into one canonical English source: `lib/komite.ts#decisionLabel` / `voteLabels` (previous Indonesian variants `Setuju/Bersyarat/Tolak`, `Disetujui/Bersyarat/Ditolak` deleted)
- `decisionTone`: approve→success, conditional→warning, reject→danger
- `decisionClass` helper deleted in favor of `decisionTone` + `StatusChip`
- `DecisionChip({decision, size})` + `DECISION_ICON` (check/triangle/x) in `components/komite/`

### Initial position and reversal
- Initially flagged as a "violation" of Bahasa-only rule → reversed when user confirmed English is intentional (batch-05)

---

## Pencairan Calm Panel

### Final state (batch-05 `7866cf41`)
- Gradient hero **dropped**. Semantic-token stepper
- `forceCompleted={isCair}` is **display-only** — fixes "0/4 syarat while Cair" display bug; real gating (`canAdvance`/`blockedByConditions`/`allConditionsDone`) untouched
- `disbursementConditions` for conditional items (Komite Bersyarat conditions must all be done before Cair)
- Pencairan progression: Verifikasi Final → Proses Akad → Siap Cair → Menunggu Dokumen → Cair (terminal)
- Tab: hidden until `komiteDecision` exists; always reachable for audit (deep-link relaxed, batch-03)
- In early era: batch-02 `96b5d932` introduced Pencairan as Stage 6 with emerald hero + icon stepper + metered checklist (then calm panel replaced the hero in batch-05)

---

## Secondary-Button Intent

### Canonical rule (batch-21 S2, formalized)
The secondary slot (now `returnAction?`) is **exclusively reserved for the paired send-back counterpart** of the primary forward action. It is NOT a generic "secondary action" slot.
- Only one returnAction is ever present
- The returnAction is the inverse of the primary (`Kembalikan…`/`Tolak…`)
- Type-enforced: `secondaries[]` array eliminated; `returnAction?: ActionDescriptor` on the model

### Earlier confusion
- Early batch: "1 primary + 1 secondary" framing was directionally correct but imprecise
- "Compact action bar" framing → sharpened to "paired forward/return decision control"
- Multiple intermediate proposals (grouped container, multi-card) were discarded before the paired model was finalized

---

## The mizan-design Skill

### Location and structure
- Real files: `.agents/skills/mizan-design/` — skill body + `references/design-system.md` + `references/upgrade-backlog.md`
- Symlink: `.claude/skills/mizan-design` → `../../.agents/skills/mizan-design`
- Created batch-04 `11979db7` at `.claude/skills/mizan-design/` → moved to `.agents/skills/mizan-design/` (`7103cd0`). Real files in `.agents/`.
- `AGENTS.md` and `docs/README.md` symlink `CLAUDE.md → AGENTS.md`; skill location non-obvious — must edit real target

### Living baseline rule (S5, `ed6111e`)
- Explicitly: "`mizan-design` skill is a living baseline to build on and improve, **not a ceiling**"
- Agents should extend/improve the baseline when work reveals a better pattern; code wins, doc follows

### Canonical design system
- **Palette (Refined Navy):** IBM Plex Sans (body) + IBM Plex Mono with tabular figures. Canvas `#F6F8FB` (warmer). Primary `#14418F` (richer navy). Cards: hairline border + token shadow. Old: Inter + `#1a56db` (superseded batch-03)
- **Card elevation:** `shadow-[var(--shadow-card)] + border-border/70`; intentional `border-primary/30` accent on Tugas Anda band
- **`--input: #ffffff` gotcha:** also drives `border-input` → invisible borders. Must use `border-border` when filling with `bg-input`
- **Motion:** CSS-only staggered load + hover lifts, reduced-motion aware (batch-03)
- **Favicon:** `app/icon.svg` (Next App Router file convention, auto-injects `<link>`). **NOT** `public/` + `metadata.icons`. `MizanMark` (bare glyph) + `MizanIcon` (branded tile). Rub el hizb Islamic geometric octagram (batch-15)
- Severity shapes, akad colors, SLA palette, 5C+1S chart — unchanged in Refined Navy

---

## Component Vocabulary

| Component | Purpose | Location |
|---|---|---|
| `StatusChip` | Canonical status/SLA vocabulary | `components/shared/` |
| `StatCard` | KPI cards (unified from KpiCard + portofolio StatCard) | `components/shared/` |
| `HardGateTile` | Hard-gate indicator (assessed/unassessed, violation) | `components/shared/` |
| `EmptyState` | Canonical empty state | `components/shared/` |
| `ConfirmDialog` | Destructive confirm (admin + rollback) | `components/shared/` |
| `DossierSection` | Tab frame (icon+title+status+owners+actions+note) | `components/application/` |
| `CoordinationPanel` | RM workstream worktable | `components/shared/` |
| `DecisionChip` | Calm decision indicator (colour+shape+label) | `components/komite/` |
| `DecisionResult` | Neutral result card with chip+routing+terms | `components/komite/` |
| `SLAChip` | Thin wrapper around StatusChip | existing |
| `AkadBadge` | Akad type color pill | existing |
| `MizanMark` | Bare SVG glyph | `components/` |
| `MizanIcon` | Full branded tile (gradient+shadow, `onDark` prop) | `components/` |
| `RingkasanView` | Pipeline stepper + ScoreOverview + HardGateFlags | dossier |
| `DossierLayout` | Two-pane shell (Sheet on mobile) | dossier |
| `DossierNav` | Grouped left list with status dots | dossier |
| `DetailCockpit` | Header + cockpit + task zone | dossier |
| `ApplicationCard` | Mobile reflow card for Pipeline | existing |

### Deleted components
- `ProsesRail` — built batch-03, deleted same batch (role moved to RingkasanView)
- `DetailTabs` — replaced by DossierContent
- `RiskBanner` — deleted batch-03
- `KomiteSeamCard` — deleted batch-05
- `AppLayout` — replaced by `app/(app)/layout.tsx` + AppShell
- `LegalSlikTab` — deleted batch-10

---

## nuqs Search Params

- `planning/nuqs-search-params.md` exists in `docs/planning/` as an active plan (batch-16 triage)
- `?view=` deep-linking was the initial shallow-routing mechanism: `window.history.replaceState` (batch-02 `5507eaf1`), avoiding `useSearchParams` Suspense requirement
- Deep-link guard (`?view=pencairan`) was relaxed — every view now deep-linkable; panels own their own empty states (batch-03, batch-05)
- No migration to nuqs visible in the corpus; the plan exists but was not actioned in the OMP era

---

# UI/UX — Contradictions, Reversals & Evolution

## R1 — Kanban vs Table for Pipeline
**EARLY** (batch-03 era, `2c4cdaa2`): Pipeline was a 5-column Kanban (`PipelineKanban.tsx`, batch-02).
**FINAL** (batch-03): Replaced with `PipelineTable.tsx` — "6-column Kanban overflows right edge; scanning/grouping is a table task." `PipelineKanban.tsx` deleted.
**RESOLVED.** Dashboard kept Kanban; Pipeline became table.

## R2 — ProsesRail lifecycle
**EARLY** (batch-03, session `a8b25495`): `ProsesRail.tsx` built as read-only strip above ActionBand (done ✓/active ●/upcoming ○ vocabulary).
**INTERMEDIATE:** Lock glyph 🔒 used in initial commit, replaced with ○ in same session.
**FINAL** (batch-03, session `f6ae1e5c`): `ProsesRail.tsx` **deleted**. Role moved to `RingkasanView` pipeline stepper inside the Dossier. Shared `proses-steps.ts` module and status vocabulary survived.
**RESOLVED.**

## R3 — Tab count: 10 tabs → 4 groups → Dossier
**EARLY** (batch-01 brainstorm/FOS grounding): FE spec had 10 tabs → rejected as "spec inflation."
**INTERMEDIATE** (batch-02): Collapsed to 4 groups (Berkas/Penilaian/Legal&Pencairan/Aktivitas). Then re-evaluated as interim pending MUAP/RSK stabilization.
**FINAL** (batch-03): Dossier (B+C hybrid): `DossierLayout` + `DossierNav` + `DossierContent`. Navigation stays traditional (rail-as-navigation was proposed and rejected).
**RESOLVED.**

## R4 — Collapsible nav
**INTERMEDIATE** (session-S5): 4-group collapsible nav implemented (groups collapse, active expands).
**FINAL** (session-S5, revert `4e080c6`): User: "don't use collapsible, keep it always visible." Reverted. ADR-0009 + all docs updated.
**RESOLVED.**

## R5 — ActionBand model: open secondaries[] → typed returnAction?
**EARLY** (batch-02 `5507eaf1`): "owners get primary action, blockers, send-back" — no formal grammar.
**INTERMEDIATE** (batch-05): Single `returnAction?` proposed over open `secondaries[]`.
**INTERMEDIATE** (batch-21 S2): "Compact action bar" → "paired forward/return decision control"; `secondaries[]` → `returnAction?` documented.
**FINAL** (batch-22 S5 `18b76f4`): Type-enforced in `ActionDescriptor`; 28 unit tests updated; AGENTS.md captured. AML moved to Dokumen tab.
**RESOLVED.**

## R6 — AML attestation location
**EARLY**: AML inline sub-form inside ActionBand band.
**INTERMEDIATE**: Option A proposed (compact dialog from band).
**FINAL** (batch-21 S2, `42b65c3`): "Kepatuhan (AML)" card in **Dokumen tab**. Server gate untouched.
**RESOLVED.**

## R7 — Glass island vs full-width bar for `Page.ActionBar`
**INTERMEDIATE** (batch-04 `bc52dd9`): Right-aligned floating glass island with edge highlight + blur. `.glass-surface`, `--shadow-glass` created.
**FINAL** (batch-04 `9b30028`): User preferred simpler full-width bar. Glass primitives deleted.
**RESOLVED.**

## R8 — Sidebar active state: gradient-pill vs left-accent-bar
**INTERMEDIATE** (batch-04 `ef187c5`): Left-accent bar + hover nudge replaced gradient pill.
**FINAL** (batch-04 `a86de74`): User preferred original gradient-pill. Restored.
**RESOLVED.**

## R9 — Decision verb language (Bahasa vs English)
**EARLY**: Indonesian labels (`voteLabels`=Setuju/Bersyarat/Tolak, `decisionLabel`=Disetujui/Bersyarat/Ditolak) mixed with English `recommendationLabel`.
**INTERMEDIATE** (batch-05): Inconsistency flagged as a violation of Bahasa-only rule.
**FINAL** (batch-05 `7866cf41`): User reversed — English Approve/Conditional/Reject is **intentional** exception. Unified to one canonical English source in `lib/komite.ts`. `decisionClass` deleted; `decisionTone` + `StatusChip` used.
**RESOLVED.**

## R10 — Pencairan tab: hidden→disabled→enabled
**EARLY**: Hidden until `komiteDecision` exists.
**INTERMEDIATE** (batch-03 session `a8b25495`, `1cb8e96`): Visible-but-disabled pre-decision.
**FINAL** (batch-03, `0d4a8f6`): Disabled removed — panels own their gates. Every view deep-linkable.
**RESOLVED.**

## R11 — Pencairan panel visual: gradient hero → calm panel
**EARLY** (batch-02 `96b5d932`): Emerald hero + icon stepper + metered checklist (frontend-design polish).
**FINAL** (batch-05 `7866cf41`): Gradient hero dropped; semantic-token stepper; `forceCompleted={isCair}` display-only.
**RESOLVED.**

## R12 — `KomiteSeamCard` lifecycle
**EARLY** (batch-02 `39e191a2`): KomiteSeamCard introduced between ActionBand and DetailTabs — committee lifecycle card.
**FINAL** (batch-05 `7866cf41`): Deleted. Content merged into ActionBand subtitle (meeting date/quorum) + RingkasanView (decided audit residue via `KomiteDecisionSummary`).
**RESOLVED.**

## R13 — Identitas tab and Analisa tab deletion
**EARLY**: Both tabs existed as separate dossier views.
**FINAL** (batch-22 Phase 1, `a44ff80`):
- `Identitas` tab deleted (redundant — cockpit + Data covered identity and terms)
- `Analisa` tab deleted (5C+1S narrative → MUAP doc; scores auto-draft via `buildAnalysisDraft` on Stage-3 entry; deterministic scores visible in Ringkasan)
**RESOLVED.**

## R14 — Notifications: date-grouped vs flat severity-sorted
**EARLY**: No explicit design.
**FINAL** (batch-04 `85e25d5e`): Flat severity-sorted list. "Research-backed: flat list works for ≤3 notification types; grouping pays off past ~8."
**RESOLVED.**

## R15 — Sidebar role text: badge pill vs plain text
**EARLY**: Role shown as badge pill in footer.
**FINAL** (batch-04): Flat sidebar footer; user identity + plain text role (no popup).
**RESOLVED.**

## R16 — `Page.ActionBar` shape: right-island vs full-width
See R7. Final = full-width sticky bar.
**RESOLVED.**

## R17 — STAGE_NAMES i18n (deferred across entire batch-04 era)
Stage names were English in `lib/types.ts`: `'Document Submission'`, `'Legal & SLIK'`, etc. Deferred batch-04 as "needs explicit decision, threads through many surfaces." No evidence of resolution in OMP era.
`[VERIFY-DOC]` **resolved 2026.06.08:** live `STAGE_NAMES` (`lib/types.ts`) is now **mixed ID/English** (e.g. `Pengajuan Dokumen` but `Risk Review` / `Committee Decision`), **not** pure English; the all-Indonesian phase-label system (`PHASE_NAMES`/`phaseLabel`) is the derived display that partly supersedes it. No i18n layer.
**Status:** deferred (no i18n needed for a single-locale app). ⚠️ Residual nit: mixed-language `STAGE_NAMES` vs the Jun-5 "English" decision — language direction unresolved.

## R18 — Skill location: .claude/skills → .agents/skills
**EARLY** (batch-04 `b95caee`): mizan-design skill created at `.claude/skills/mizan-design/`.
**FINAL** (batch-04 `7103cd0`): Moved to `.agents/skills/mizan-design/` with symlink at `.claude/skills/`. Real files live in `.agents/`.
**RESOLVED.**

## R19 — nuqs search params plan
`planning/nuqs-search-params.md` kept as active plan (batch-16 triage). Not actioned in OMP era. `?view=` deep-link via `window.history.replaceState` was the shipped implementation.
**OPEN — plan exists but implementation not visible.**

## R20 — LegalSlikTab deletion
**EARLY** (batch-01): `LegalSlikTab` existed with legal verification and SLIK/Kol entry.
**INTERMEDIATE**: Unified with DocumentsTab partially.
**FINAL** (batch-10 `52d36006`, `28681d8`): `LegalSlikTab` fully deleted. Legal verification → Documents tab. Kol entry → Data tab.
**RESOLVED.**

## R21 — SLIK handoff UX: SlikHandoffPanel → Tugas Anda primary
**EARLY**: "Kirim ke Feasibility" lived in `SlikHandoffPanel` inside DataTab.
**INTERMEDIATE** (session-S6): A1 adaptive combined button (confirm-Kol + advance) proposed then rejected (semantics conflict — `confirmKolAction` calls `resetSlikHandoff`).
**FINAL** (session-S6, `631b10c`): Standard Tugas Anda primary `bureau-handoff`; `SlikHandoffPanel` deleted.
**RESOLVED.**

## R22 — Superadmin workflow access
**EARLY** (batch-05): Superadmin had `isSuperadmin` short-circuits in workflow predicates (could act as any role without impersonation).
**FINAL** (S5, ADR-0010): Superadmin is workflow-read-only. `isSuperadmin` short-circuits removed from all workflow predicates. Acts via impersonation only (audited "a.n. Superadmin").
**RESOLVED.**

## R23 — `RoleContext` / `useRole` → `useActor`
**EARLY**: `RoleContext.tsx` + `localStorage mizan-demo-user-id` for role switching (prototype).
**INTERMEDIATE** (batch-05): Firebase auth replaced localStorage mock; `ActorProvider` introduced.
**FINAL** (S5): `RoleContext.tsx` shim deleted; `useRole`/`currentUser`/`isRole` no longer exist. Use `useActor()` everywhere.
**RESOLVED.**

## R24 — DossierSection: "Legal & Pencairan" nav group
**EARLY** (batch-02): "Legal & Pencairan" was a nav group.
**FINAL** (batch-10): Group deleted alongside LegalSlikTab deletion. Nav groups: Berkas · Penilaian · Pencairan · Aktivitas (then later restructured to Ringkasan + content tabs).
**RESOLVED.**

## R25 — mizan-design skill as ceiling vs living baseline
**EARLY** (batch-04): Skill created as design-system documentation. Implied as prescriptive.
**FINAL** (S5, `ed6111e`): Explicit note added — "living baseline to build on and improve, not a ceiling. Code wins, doc follows."
**RESOLVED.**
