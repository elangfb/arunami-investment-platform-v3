# Flow walkthrough — dogfood findings (2026.06.05)

Live walkthrough of the Mizan origination flow in a headed Helium browser
(agent-browser), logged in as `superadmin@example.com` via the Firebase Auth
emulator. Findings logged as encountered; severity is the author's call.

> See `current-flow.md` (sibling) for the full as-built flow record + AI provenance.

## Setup notes
- Headed Helium: `agent-browser --session mizan --headed --executable-path /opt/helium-browser-bin/helium open http://localhost:3000`.
- Login is Google-popup only; emulator chooser advances only on a native `el.click()` (see MEMORY.md 2026.06.05).

## Findings

### F1 — Emulator account chooser ignores CDP coordinate clicks (tooling, low)
agent-browser's `click @ref` / CSS click does not advance the emulator's
`.js-reuse-account` list; mdc-ripple swallows the synthetic event. Native
`el.click()` via `eval` works. Tooling-only (not a Mizan bug), but it blocks
any automated login walkthrough until worked around. Captured in MEMORY.md.

### F2 — `Aplikasi Baru` sidebar link has a bilingual accessible name (a11y, low)
Snapshot shows `link "New Application / Aplikasi Baru"` — the accessible name
carries both an English string and the visible Bahasa label. Visible UI is
Bahasa-only (correct), but the doubled aria/name is inconsistent with the
Bahasa-Indonesia UI rule (apps/web-app/AGENTS.md "Use Bahasa Indonesia").
Worth confirming whether the English half is intentional (icon title vs label).

### F3 — Autofill (dev) floating pill overlaps the primary "Buat Aplikasi" submit (dev UX, medium)
On `/applications/new`, the fixed bottom-right `Autofill (dev)` pill
(box ~x750–891, y896–934) overlaps the sticky-footer submit button
`Buat Aplikasi` (box ~x768–875, y886–918). A center click on the submit
button lands on the pill instead and re-runs autofill (observed: Agunan
silently re-randomized to "Properti / Tanah" on each "submit" attempt).
Dev-only (the pill is gated to dev), so prod is unaffected, but it makes the
primary action unclickable at center in dev and is a hit-testing trap for
manual testers too. Fix: move the dev pill clear of the footer action region
or lower its z-index / make it non-overlapping. Workaround: native
`button.click()` or click the button's top ~10px strip.
### F4 — Detail page scrolls an inner container, not the window (tooling, low)
The application detail page renders inside the AppShell scroll container
(`div.flex-1.overflow-y-auto.p-4…`), so agent-browser's window-level
`scroll down N` is a no-op there. Scroll via `eval` on that element
(or `element.scrollIntoView()` on the target heading) to reveal below-fold
sections (e.g. the MUAP/RSK approval ladders).

### F6 — agent-browser `eval` persists top-level `const` across calls (tooling, low)
The agent-browser `eval` VM is a *persistent* context: a top-level `const x` from one call
survives into the next (and across separate CLI invocations, since the daemon holds the VM).
A second `const x` then throws `Identifier 'x' has already been declared`. This silently broke
the "Buat Aplikasi" submit on the first run of `scripts/walkthrough.sh` (caught by the AUTO
smoke test). Fix: wrap every eval body in an IIFE `(() => { … return …; })()` so declarations
are block-scoped and the script stays re-runnable. Captured in MEMORY.md.

### F7 — agent-browser `click` takes only CSS/XPath/snapshot-ref; popup needs a TRUSTED click (tooling, low)
This build's `click` resolves **CSS, plain XPath (`//…`, no `xpath/` prefix), or a snapshot
`@eN` ref** — `text/…`, `aria/…`, `xpath/…` query-handler selectors all return "Element not
found". For semantic clicks use `find role button click --name "…"` / `find text "…" click`
(note: `find text` needs the text to be an exact text node — it missed the icon+label login
button, where `find role button --name` worked). Also: `signInWithPopup`'s `window.open` is
popup-blocked unless triggered by a **trusted gesture**, so the Google button MUST be clicked
via agent-browser's CDP click (not a native `el.click()` in `eval`). Account switching =
`GET /api/auth/logout` (clears cookie → `/login`) → `find role button --name "Masuk dengan
Google"` → native-pick the persona row in the auto-focused emulator popup.

> **Artifact**: `scripts/walkthrough.sh` — interactive, step-gated (Y/Enter), **multi-account**
> replay of this whole tour via agent-browser+Helium: it logs in as the real role-owner at each
> handoff (RM → Legal → RA → RM-Analis → TL/BM → RA → RO/CRO/DPS → Komite → RM). `AUTO=1`
> hands-free; `SOLO=1` stays on one account (`PERSONA_EMAIL`); `WALK_FROM=N`/`WALK_TO=M` slice.
> Verified end-to-end: full 21-step run, **10 distinct accounts** all log in, app created →
> `/pipeline`, each persona sees its own role-scoped task (e.g. Legal=verify-docs only,
> RA=SLIK only, BM=live MUAP `Setuju`). Persona→email map is in the script header.

## UI/UX findings
### U1 — Inconsistent reachability of future-stage sections in the cockpit nav (UI/UX, medium)
On a Stage-1 app (`FOS-2026-001`), the `Proses` section-nav stepper disables the
`Komite CM` step button (`[disabled]`) but leaves `Pencairan RM` clickable — and
`?view=pencairan` renders a graceful empty state ("Pencairan tersedia setelah
keputusan komite", wallet glyph). Both Komite and Pencairan are equally-future
stages, so disabling one and not the other is inconsistent. The Pencairan
empty-state is the better pattern and matches the design skill's audit-first
principle ("everything reachable, nothing hidden"); a disabled tab hides the
section. Fix direction: make the Komite section reachable too with an analogous
empty state, rather than disabling its nav button.

### U2 — Two parallel section-nav affordances (UI/UX, low / verify)
button AND the horizontal `Proses` stepper. They are **not the same list**: the
stepper shows process *stages* with owning desks (Legal & SLIK, Analisa, MUAP, RSK,
Komite, Pencairan) while the dropdown shows dossier *sections* (Ringkasan, Identitas,
Data, Dokumen, Analisa, MUAP, RSK, Pencairan, Diskusi, Riwayat). Overlap is partial,
so the mental model "stepper = sections" doesn't hold (e.g. stepper "Legal & SLIK"/
"Komite" have no direct dropdown entry; dropdown "Data/Dokumen/Diskusi/Riwayat" aren't
in the stepper). Confirm this dual nav is intentional and that both stay in sync.

### F5 — "AI menyusun draf skor" copy misrepresents a deterministic score (copy/compliance, medium)
The `ScoreOverview` subtitle on Stage 5 reads "**AI menyusun draf skor dari data
aplikasi** — keputusan tetap pada analis", implying AI produces the 5C+1S **score**.
It does not: `lib/scoring.ts` computes the score **deterministically** (data-aware from
DSR/LTV/Kol + a stable per-`app.id` jitter; comment: "Not a real LLM"). AI only drafts
the *narrative* prose, never the number. `ScoreOverview` is shared, so on the **Analisa
tab** this card sits directly under `AnalysisTab`'s correct note ("draf AI ditinjau
analis; **skor tetap deterministik**", `AnalysisTab.tsx:171`) — the two copies
contradict each other **on the same screen** (`ScoreOverview.tsx:45`). In an
audit-first, OJK-facing product, telling an auditor "AI drafts the credit score" when
it doesn't is a real misstatement. Fix: align the ScoreOverview subtitle to the
deterministic reality (AI = narrative only), matching the Stage-3 wording.

## Domain / workflow findings (USER-RAISED — fix deferred)
Raised by the product owner during the Stage-2 walkthrough. **Not yet
implemented** — recorded here for a later, single safety-critical batch
(workflow/desk-boundary work → use ≥medium-tier pi per AGENTS).

### D1 — SLIK / Kolektibilitas must be owned by RM, not Risk Analyst (workflow, HIGH)
Today Stage 2 splits into two roles in *Tugas Anda · 2 Peran*: **Legal Officer**
(verify docs) and **Risk Analyst** (Input SLIK/Kolektibilitas). Product decision:
the **SLIK/Kol input task belongs to the RM**, not the RA. The RA's risk work
should stay scoped to Stage-4 RSK authoring.
- Root cause: `apps/web-app/src/lib/desks.ts` — the `slik` desk carries
  `ROLE_OF_DESK['slik'] = 'RA'` (and `DESK_CATALOG` slik `pipelineRole: 'RA'`,
  label "SLIK & Kolektibilitas"); `DEFAULT_ROLES` bundles `slik` into the
  `risk-team` (Risk Analyst) role alongside `rsk-author`. The top-of-file comment
  explicitly designs `slik`+`rsk-author` as two RA desks.
- Fix sketch (DEFERRED): move SLIK ownership to RM — flip the `slik` desk's role
  to `RM` (or fold SLIK into an RM-owned desk) and re-bundle it under the RM role
  (`account-officer`) instead of `risk-team`. Then sweep every consumer:
  `lib/stage-action.ts` Stage-2 Tugas-Anda role label/owner, `completeSlikAction`
  / `confirmKolAction` desk gate, the "slik desk can decline to RM" path,
  `DESK_FOR_STAGE[2]`, `lib/required-docs.ts` `OWNER_BY_DOC_TYPE`
  (`slik_report`/`pefindo_report` → today `slik`) + its test
  (`required-docs.test.ts` asserts `ownerDeskForDocType('slik_report')==='slik'`),
  the `application-data.ts` upload-gate comment ("RT for SLIK"), seed personas
  (`demo-logins.ts` RA vs RM), and docs.
  Re-confirm the dual-handoff (LG + SLIK) still advances Stage 2→3 with SLIK now
  RM-side. Update the desks.ts rationale comment (the "two RA desks" premise dies).

### D2 — Legal role becomes "Legal & Appraisal" (also checks appraisal) (workflow, HIGH)
Product decision: the **LG (Legal) role is now "Legal & Appraisal"** — in addition
to document-legality verification, Legal helps **check the agunan appraisal**
(Dokumen Appraisal Agunan / Nilai Appraisal Agunan).
- Today (confirmed): `desks.ts` `legal` desk → role `LG`, `DESK_CATALOG` label
  "Verifikasi Legal", description "Verifikasi keabsahan dokumen" (legality only).
  Appraisal/agunan docs are **owned by `intake` (RM)** — `OWNER_BY_DOC_TYPE`
  (`lib/required-docs.ts`) only overrides `slik_report`/`pefindo_report` to `slik`;
  everything else defaults to `intake`. BUT the `legal` desk already *legal-verifies*
  every non-SLIK doc (`legalDocs`/`legalUnverified` in `stage-action.ts`), so
  appraisal-document *legality* is already Legal's job — what's new is Legal owning
  the appraisal *assessment* (the value/quality check), hence "Legal & Appraisal".
- Fix sketch (DEFERRED): rename the legal desk label → "Legal & Appraisal" (Bahasa,
  e.g. "Verifikasi Legal & Appraisal") in `DESK_CATALOG` + `DEFAULT_ROLES` name,
  extend its description, and give Legal an explicit appraisal-check surface. Decide
  with PO whether that means (a) routing the appraisal *document* owner desk to
  `legal` via `OWNER_BY_DOC_TYPE`, and/or (b) moving the "Nilai Appraisal Agunan"
  gating-value OCR confirm/entry to Legal (today a gating field, owner-desk scoped).
  Re-check `docs/references/required-docs-matrix.md` + Stage-2 blockers. Open
  question for PO: does Legal *verify* appraisal docs, *enter* the appraisal value
  (gating field), or both?

### D3 — Re-check docs after D1/D2 (docs, follow-up)
Once D1/D2 land, re-audit + update all role/desk references so they don't drift:
`apps/web-app/AGENTS.md` (Stage-2 dual-handoff + Glossary lines), `docs/GLOSSARY.md`
(roles RM/LG/RA, "SLIK upload + Kol live in Data" ownership), `docs/guides/workflow.md`,
`docs/guides/alur-kerja-inti.md`, `docs/designs/workflow-target.md`
(§"Model peran & desk"), `docs/references/required-docs-matrix.md`, and MEMORY.md
(2026.06.04 role/desk-fold line). The 2026.06.04 fold note ("RT→RA", desk model)
is the canonical anchor to amend.
