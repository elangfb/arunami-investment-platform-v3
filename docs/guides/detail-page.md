# Detail Page Guide

> Status: Current
> Last reviewed: 2026.06.06
> Source of truth for: `/applications/[id]` architecture and UI conventions

## Invariants

- Design from the arriving role's goal, not the database shape.
- Every surface stays reachable and deep-linkable for audit. Actions are gated inside panels.
- Bahasa Indonesia for user-facing strings, except decision verbs intentionally use `Approve`, `Conditional`, and `Reject`.
- Load the `mizan-design` skill before UI work.
- Reuse existing chips, tokens, and dossier primitives. Do not invent bespoke status colors.

## Component Shape

```txt
app/(app)/applications/[id]/page.tsx
└─ DetailClient.tsx
   ├─ DetailCockpit.tsx
   │  └─ ActionBand.tsx
   └─ DossierLayout.tsx
      ├─ DossierNav.tsx
      └─ DossierContent.tsx
```

Important files:

- `src/lib/detail-nav.ts` — view groups, valid views, default landing.
- `src/lib/proses-steps.ts` — status dots and workflow status truth.
- `src/lib/workstreams.ts` — RM-coordination worktable model (active / early / done / upcoming streams) for the Ringkasan command-center. Derives `done` from the SAME engine predicates as `proses-steps` (never forks status).
- `src/components/application/CoordinationPanel.tsx` — the "Alur kerja" worktable rendered on Ringkasan.
- `src/components/application/DossierSection.tsx` — standard tab frame.
- `src/components/application/ActionBand.tsx` — current actionable work.
- `src/hooks/useStageAction.ts` — client adapter for stage actions.

Keep `DetailClient` keyed by `app.id` so client state resets when navigating between applications. Do not replace that reset with effect-driven `setState` repairs.

## Navigation Model

The dossier uses grouped navigation with an audit-first policy: views are not hidden just because the actor cannot act there.

Current groups:

- Berkas: identity, data, documents.
- Penilaian: analysis, MUAP, RSK.
- Pencairan: pencairan. Stage-2 Legal/SLIK no longer has its own tab — legal verification lives in Documents; SLIK/Kol live in Data.
- Aktivitas: discussion, history, AI where applicable.

Status dots come from `proses-steps`; do not fork stage status logic in components.

MUAP/RSK panels are Google-Docs/API-backed. Re-survey the docs layer before reorganizing those tabs, and keep `/preview` embeds as the read surface.

## Ringkasan command-center ("Alur kerja")

The Ringkasan landing is a **coordinator's worktable**, not a wizard (ADR-0009). `CoordinationPanel` lists every workstream actionable **now** — `active` (its turn) or `early` (startable ahead of its stage, the do-it-early window) — as a row with status + owner + a one-click jump. It makes the parallel reality legible (Stage 2's Legal ∥ Penilaian ∥ Biro run as concurrent rows; Legal/Appraisal lagging into Stage 3 stay `active`). Rules:

- It **navigates only**. The viewer's own gated forward action stays in the cockpit `Tugas Anda` (`ActionBand`). Do not duplicate transition logic here.
- `done`/state come from `lib/workstreams.ts`, which reuses the engine predicates — never re-derive status in the component.
- Show `active` + `early` only; the full done/upcoming flow stays in the Proses stepper, so the two never fork.
- The hard-gate block on Ringkasan renders only when `financialsAssessed` (no empty "Belum dinilai" tiles at intake).

## Doc-tab spine (MUAP / RSK)

Both Google-Docs-backed tabs follow ONE order so they read as one mental model (ADR-0009): **Provenance band → Document (DocsPanel) → role work zone → Approval ladder**. MUAP's work zone is Riset Web; RSK's is the recommendation form + Saran AI. The empty-Doc state (`DocsPanel` → `NoDoc`) carries the "Buat Dokumen dari Template" CTA — keep it.

## Authorization Model

- ActionBand is capability-based and may show multiple task cards for multi-desk actors.
- Later-stage prep work is allowed only where `canWorkStage`/`assertCanWorkDesk` permits it. Stages 1-4 may allow prep for later owners; decisions and forward transitions remain at-stage; stages 5-6 are strict.
- Server actions are authoritative; UI conditions must mirror, not replace, server gates.
- Use `useActor` and desk helpers, not legacy role-string logic.
- Superadmin is **workflow-read-only** (ADR-0010): full read/view, but no `Tugas Anda` task and no act buttons on the dossier — it acts only by impersonating a real desk/user (audited). So the detail page renders for superadmin like a read-only observer until it impersonates.

## Tugas Anda (action band) grammar

`ActionBand` is a **directive, not a workspace**. Each task card has one fixed, minimal grammar
and nothing more:

- **Directive** — one plain line naming the task ("Lengkapi berkas, lalu kirim ke Legal, Agunan & Biro").
- **Primary** (filled) — the single *forward/completion* action: send the case onward **or** complete the role's deliverable. Exactly one. A `transition` opens the confirm modal; a named `action` (`complete-legal`, `bureau-handoff`) invokes the server action directly, with an optional `workView` "Buka …" link to the tab holding the prerequisite work.
- **Return pair** (outline, optional) — the *counterpart* of the primary: send the case **back** to
  the prior owner (`Kembalikan ke RM/Analis`, `Tolak SLIK & Kembalikan ke RM`). It is the inverse
  half of the same forward/back decision — **not** a slot for other actions, and there is at most
  one. Absent when there is nowhere to send back (Stage-1 RM is the originator → forward primary only).

A card's entire vocabulary is therefore **directive + [proceed | send-back] pair**. Model it as one
`primary` + one optional `returnAction` (not an open `secondaries[]`) so the rule is type-enforced.
Multi-desk actors (e.g. Stage-2 LG + SLIK) get one card per hat; the grammar applies per card.

**The band carries only REAL actions** — a `transition` or a direct server action (`complete-legal`,
`bureau-handoff`). A task that needs a **form/choice first** (e.g. **Penilaian Agunan** picks
internal/KJPP) is NOT a band action; surfacing it here as an `href`-to-a-tab is a *shortcut
masquerading as an action*. Such navigation belongs in **Alur kerja** (`CoordinationPanel`), which
"NAVIGATES only" — the two surfaces must not blur. So Analisa Yuridis (atomic `complete-legal`) is a
band action; Penilaian Agunan is an Alur-kerja `'penilaian'` shortcut into the Data tab. The LG band
action is windowed to **stage 2–3** so it **persists after the RM-driven 2→3 advance** instead of
vanishing at Stage 2 (the Alur-kerja `'penilaian'` stream stays `active` through Stage 3 too).

Categorically excluded from the band (neither the forward action nor its return):

- **Prerequisite sub-forms / the work surface.** The band owns the *action*; the *work* stays in its
  tab. The Stage-1 Initial-AML attestation lives as a "Kepatuhan (AML)" control in the **Dokumen** tab;
  the Stage-2 Analisa Yuridis (per-doc verify) lives in **Dokumen**, and the bureau Kol/SLIK entry in
  **Data** — never inline in the band. The band surfaces the completion/handoff as a gated `primary`:
  `complete-legal` ("Selesaikan Analisa Yuridis", `workView` = Dokumen) and `bureau-handoff` ("Kirim ke
  Feasibility", `workView` = Data), each with a "Buka …" secondary link to that work surface. Only
  `risk-recommendation` stays a form-directive (the 3-way verdict + note lives in the RSK tab).
- **The blocker wall.** A disabled primary shows ONE short readiness line in categories
  ("Belum lengkap: berkas wajib · atestasi AML"), never the full doc/OCR list. Detail lives where the
  work is (Dokumen checklist, Data nav badge, Analisa/MUAP/RSK). `stage*Blockers` stays the
  server-enforced gate and the canonical disabled reason; it is not rendered verbatim.

## UI Conventions

- Keep Berkas and Aktivitas stable unless the user asks; the main IA rethink is the middle workflow surfaces.
- If adding the deferred `Proses` rail, derive each step's status from artifacts/gate predicates, not stage number alone, so committee decisions remain visible after send-back/rollback.
- Frame dossier tabs with `DossierSection` unless there is a deliberate exception.
- Use `StatusChip`, `RoleBadge`, `SLAChip`, `AkadBadge`, `DecisionChip`, `ScoreOverview`, and `HardGateFlags` where appropriate.
- Hand-rolled card surfaces (cockpit hero, `ActionBand`, nav rail) match the `Card` primitive
  elevation: `shadow-[var(--shadow-card)]` + `border-border/70`. Never `shadow-sm`/bare `border`
  on a card-like surface.
- Ringkasan secondary grid (Hard Gate / Risk verdict) is orphan-free: 2-col only when both cards
  render, else full-width. Proses-stepper connectors are trailing, so a wrapped step never dangles
  a connector at the next row's start.
- Do not wire real/persistent AI chat without PII masking, prompt/response audit, bounded history window, and separate field semantics from human discussion.
- Status must be color-blind safe: color plus icon/shape plus label.
- Mobile label/value rows stack (`flex-col -> sm:flex-row`); avoid fixed-width labels on mobile.

## Open Product Questions

- Conditional approval (partly resolved 2026.05.29): RM records the nasabah's response in the Pencairan tab — accept advances to disbursement (decision stays `conditional`), decline closes the application. The committee's conditions become disbursement release conditions verified by RM (`pencairan`). Still open: whether a conditional approval **expires** if the nasabah doesn't respond within a window.
- Committee cadence: daily vs batch scheduling affects CM UX.
- BWMP authority tiers / low-plafond committee bypass are V2 questions unless explicitly reprioritized.

## Verification

- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` for layout/routing changes.
- Browser-check affected views at desktop and mobile widths, ideally `1280` and `375`.
- Authenticated role-specific UI requires a real `SUPERADMIN_EMAILS` login and impersonation from the footer.
- Use non-destructive seed helpers for dummy-state setup where possible; avoid `seed.ts` if you need to preserve the current login/session state.
- State clearly when verification is typecheck-only versus browser-proven.
