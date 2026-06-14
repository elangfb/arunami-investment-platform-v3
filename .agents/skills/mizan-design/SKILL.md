---
name: mizan-design
description: >-
  The UI/UX playbook for the Mizan financing-origination app (apps/web-app). Load this
  whenever you design, build, rethink, redesign, refine, restyle, or review any Mizan
  screen, page, component, layout, navigation, animation, or interaction — and whenever
  the user says things like "rethink the X page", "redesign this component", "make the UI
  consistent", "improve the UX", "this feels off / too compact / not aligned", or asks for
  a new view. It carries Mizan's design system (tokens, identity, component vocabulary) AND
  the method for approaching, researching, and shipping on-brand, consistent UI. Use it
  before touching any UI even if the user doesn't name it — it prevents reinventing
  patterns, drifting from the design language, or downgrading the standard.
---

# Mizan UI/UX design

You are designing for **Mizan** — a syariah (Islamic) financing-origination system for
Hijra Bank: a 5-role, audit-first, Bahasa-Indonesia enterprise app. Good design here is not
decoration; it's helping a specific role make a specific decision, and making the cross-role
handoff legible to the next role and to an OJK auditor.

This skill is the **how**. The **what/why** (every token, the component vocabulary, the
rules) lives in `references/design-system.md` — read it; do not work from memory or guess
hex values. Known inconsistencies you should fix opportunistically are in
`references/upgrade-backlog.md`.

> **Living baseline, not a ceiling.** This skill and `references/design-system.md` capture the
> *current best-known* state of Mizan's design language — they are a starting point to build on and
> improve, **not** a fixed rulebook to merely conform to. When the work reveals a better pattern,
> **raise the bar and update these docs in the same batch** (Method step 7): code wins, the reference
> follows. Treat tokens/components as the vocabulary to extend, not a constraint. Future agents: keep
> evolving this — a redesign that improves the language *and* records the improvement here is the goal.

## The prime directive
**Design from the user's job, not the data model.** Start every surface from a role's
arrival goal — *who is this, what are they here to do, what must they decide* — not from the
entities/fields. The 5 roles (RM/LG/RA/CM/MG) are distinct users; the **cross-role
handoff is the product**, so optimize the seams, not just single screens. The OJK auditor is
a first-class user too (audit-first: everything reachable, nothing hidden).

## Standards bar — upgrade, never downgrade
This is non-negotiable and the reason the skill exists. When you touch a surface:
- Hold or **raise** the bar. Implement the best practice; don't match a weaker neighbour.
- If you find a component that's behind the standard (ad-hoc colours instead of tokens,
  English copy, a bespoke header instead of `Page.Header`, a forked status pill), **bring it
  up to standard** as part of the work, or log it in `references/upgrade-backlog.md`.
- If you improve a shared primitive, **propagate** the improvement to its consumers.
A redesign that leaves the app *less* consistent has failed, even if the one screen looks nicer.

## Method
Follow these in order. Skip steps only when genuinely trivial, and say so.

### 1. Load context
Read `references/design-system.md` and the target surface's current code (page + the
components it renders). Name the role(s)/persona the surface serves and their arrival goal.
For routing/shell work, remember this is **modified Next 16** — read
`apps/web-app/node_modules/next/dist/docs/` before writing Next APIs.

### 2. Audit the current surface + find the canonical in-app pattern
Before inventing anything, grep for how Mizan already solves this. Almost always there's an
established idiom to reuse — `Page`/`Page.Header`/`Page.ActionBar`, `FormSection`/`Field`/
`SegmentedToggle`, `SLAChip`, `AkadBadge`, `HardGateFlags`, `RoleBadge`, `ScoreOverview`,
the status vocabulary in `lib/proses-steps.ts`/`lib/sla-utils.ts`. Reuse beats reinvention;
it's what keeps the app coherent. Note every mismatch you spot (for the upgrade rule above).

### 3. Research & explore references
For the specific component/page type, web-search modern references to ground taste — e.g.
Dribbble for the visual pattern, Apple HIG / Material / shadcn patterns / reputable SaaS-UX
writing for behaviour and accessibility. You're calibrating against the current best, then
**translating to Mizan's restrained-navy enterprise identity** — not copying a flashy
consumer look. While researching, explicitly check: WCAG AA contrast (4.5:1 text),
**use of colour (1.4.1 — never colour alone; pair status colour with a text label and/or a
shape-distinct icon so it reads for colour-blind users)**, `prefers-reduced-motion`,
keyboard/focus, and any Next/RSC constraints (see Do's & Don'ts in the reference). Cite the
references you used.

### 4. Decide with the human
Design has genuine forks (layout direction, how far to push an effect, IA trade-offs). For
those, use **AskUserQuestion with previews** (ASCII mockups or option snippets) — take a
clear position and say *why* (and why-not the alternatives), per-persona when it helps. Make
small, reversible calls yourself and just say what you chose. Pause and flag anything that
needs the human (compliance, scope, irreversible).

### 5. Build on the primitives
Implement with shadcn + Base UI per the documented API + the shared components + the design
tokens. CSS-only motion (the `.stagger` utility / `tw-animate-css`; no new animation deps).
Bahasa-Indonesia copy throughout. Never fork scoring or pipeline-status logic. Match the
density and rhythm of the rest of the app.

### 6. Verify end-to-end (don't claim "done" without this)
- `pnpm typecheck` + `pnpm lint`; add `pnpm build` if you touched routing/layouts.
- Playwright: drive the real app. Authenticated role-specific UI requires a real
  `SUPERADMIN_EMAILS` login and footer impersonation ("Bertindak sebagai..."). Check the
  affected role(s) + breakpoints **1280 and 375**. Confirm **zero console/hydration errors**.
  Screenshot and actually look at it.
- Report with artifacts (paths, commit hash, what was proven vs not). Honestly surface
  anything skipped.

### 7. Record (adaptive learning — keep knowledge current)
Commit to `main` in small batches (Solo-mode protocol; push waits for the user). Docs are part
of the work: in the SAME batch, update every knowledge surface so the next agent starts at your
baseline and never repeats a solved mistake —
- `references/design-system.md` (tokens/patterns) + `references/upgrade-backlog.md` (mismatches:
  add new, remove fixed) so they never drift from the code;
- `apps/web-app/AGENTS.md` for app-wide conventions/anti-patterns/gotchas;
- the relevant current guide in `docs/guides/` or active plan in `docs/planning/`;
- a durable auto-memory note (and memory index when present).
Prefer condensing an existing entry over duplicating; fix any guidance that became wrong.
**Reuse the established detail-page system:** every dossier tab uses `DossierSection`; one
`StatusChip` status language (no bespoke hue hex); decisions via `DecisionChip`/`DecisionResult`
(English Approve/Conditional/Reject); info has one home (see design-system.md).

## Identity at a glance (full detail in the reference)
- **Refined Navy** enterprise: primary `#14418f`, warm-paper canvas `#f6f8fb`, deep-navy
  sidebar. IBM Plex Sans (UI/headings) + IBM Plex Mono (IDs/currency, via `.tabular`).
- Cards `rounded-xl border bg-card shadow-[var(--shadow-card)]`. Semantic status tokens
  (success/warning/danger/info/neutral) whose **meanings never change**. Akad colour-coded —
  always via `AkadBadge`. Page titles `font-heading text-2xl font-semibold`.
- Restrained over flashy: the user has repeatedly preferred the simpler, calmer option.
