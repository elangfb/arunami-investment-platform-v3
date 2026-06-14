# Penawaran gap closure — make every offering claim true

- **Status:** ACTIVE   <!-- ACTIVE only; on close: promote/digest/delete. -->
- **Started:** 2026.06.12 · **Owner:** Luthfi

## Context

`docs/guides/penawaran-produk-mizan.md` is the official offering draft for Hijra. Per the user's
direction it restores several commitments from the ORIGINAL agreed proposal (sibling repo
`../brainstorm` — `SCOPE.md`, `TECH-STACK.md`, `MASKING.md`, `COMPLIANCE.md`; latest agreed
scope = "NoEffort - Tanggapan Review MIZAN Project" 2026.05.07). Each restored claim is
**not yet fully true in this repo today**. This plan lists the gaps so they become build
priorities — the offering must never promise something we can't demo or be audited on.

Alignment check done 2026.06.12 against `../brainstorm`: the offering does NOT contradict the
original proposal (5-stage flow superset, bracket+regex masking with NER explicitly deferred,
Vertex/Singapore posture, scope exclusions match). The Presidio/spaCy claim that was in an
earlier draft was a contradiction and is already removed.

## Gaps (claim → reality today → work)

| # | Offering claim (section) | Reality today | Work to close |
|---|---|---|---|
| 1 | Test coverage ≥75% per stack (§6, §8) | **Baseline measured 2026.06.12** (see below): **logic (lib/server) ≥71.4% whole-stack** / 94.1% on exercised code; **FE (.tsx) 0% — no automated line coverage**. 708 unit+integration cases. | Logic: cover the ~78 unreached lib/server files (or high-value subset) to clear ≥75% whole-stack. FE: needs a coverage-instrumented path (component tests, or V8-instrumented Playwright) — it is at zero today. (= queue item #9.) |
| 2 | Skenario test format Gherkin (§6) | vitest + Playwright, no Gherkin; original committed `cucumber-js` | Decide: adopt Given-When-Then naming over existing specs (cheap) vs cucumber-js layer (original letter). Recommend naming convention + record decision |
| 3 | Dokumentasi arsitektur C4 di repo (§6, §8) | `guides/architecture.md` exists; **no C4 Context/Container/Component diagrams** | Author C4 (minimum 3 levels per original TECH-STACK.md) in `docs/designs/` or `docs/guides/` |
| 4 | CI/CD dengan SAST gate (§6) | CI runs typecheck/lint/test/compliance; **no SAST** | Add SAST to CI (semgrep or CodeQL), pinned major version. Original also committed periodic **DAST** on staging — track as follow-up once staging exists on Bank infra |
| 5 | AI region Singapura (§6, §7) | Vertex live but residency guard **warn-only**; dev currently permits `global` (US egress) — see CURRENT-STATE "AI inference provider" | Pin `asia-southeast1` in prod/staging env; decide whether to restore fail-closed APAC guard before real data (reverses the interim warn-only posture) |
| 6 | Masking PII aktif & teruji (§3.3) | Machinery intact + CI compliance gate runs masking ON, but `PII_MASK_ENABLED` default **off** (dev posture) and residual backstop default **fail-open** | Before real customer data: enable `PII_MASK_ENABLED=1` + `PII_RESIDUAL_BLOCK=1` (original MASKING.md committed a **fail-closed** backstop) in prod env; smoke all 5 egress surfaces masked |
| 7 | Setiap pemanggilan AI diaudit (§3.3) | True, but audit writes are **fail-open** (a failed audit write never blocks output) — accepted interim | Revisit before real data / OJK defensibility (G5); decide whether prod needs fail-closed audit |
| 8 | Penunjukan penandatangan dapat disesuaikan (§3.1) | Approval routing is config-level (`server/config/approval-routing.ts`); **no admin UI**, production map = W1 | Build routing editor in the admin POLICY desk so the claim is self-service, per `designs/admin-config-layer.md` |

## Coverage baseline (measured 2026.06.12 — queue item #6)

**Tooling.** The suite runs on **Node's built-in test runner** (`node --test` + `tsx`), **not vitest** —
coverage is Node v24's built-in V8 instrumentation (`--experimental-test-coverage`, `lcov` reporter), no
new dependency. Measured = `pnpm test:unit` (hermetic, no DB) ∪ `pnpm test:integration` (against
`mizan_test`); a line is counted covered if hit by **either** suite. Both suites green. Playwright e2e is
**not** coverage-instrumented, so it contributes nothing to these numbers. Reproduce: run both suites with
`--experimental-test-coverage --test-reporter=lcov`, then aggregate the lcov by directory.

| Stack | Line coverage (whole-stack floor¹) | Line coverage on *reached* files | Files reached / total |
|---|---|---|---|
| **lib/** | — | 97.1% (8790/9056) | 80 / 97 |
| **server/** | — | 90.7% (7158/7896) | 62 / 119 |
| **Logic** (lib+server+hooks+context) | **≥71.4%** (15948/22325) | 94.1% (15948/16952) | 142 / 220 |
| **FE** (components/ + app/, `.tsx`) | **0.0%** (0/13583) | — (none reached) | **0 / 134** |
| **All src** | ≥44.4% (15949/35912) | 94.1% (15949/16956) | 143 / 354 |

¹ *Whole-stack floor* counts every unreached source file as 0%-covered (denominator = covered lines +
non-blank lines of unreached files). It is a conservative **lower bound** (the non-blank count includes
imports/types, which inflates the denominator), so true logic coverage sits between 71.4% and 94.1% —
realistically ~75–80%.

**Honest read of the ≥75%-per-stack claim:**
- **Logic layer** — the *exercised* code is excellent (94%), but **only 142/220 logic files are reached** by
  any test; whole-stack it floors at **≥71.4%**, i.e. just under the line. Closing to ≥75% is small, bounded
  work: reach the ~78 untested lib/server files (many are thin glue/types; the high-value subset is fewer).
- **FE layer** — **0% measured.** 134 `.tsx` files, none loaded by unit/integration; the only thing that
  exercises them (Playwright e2e) is not a coverage tool. The "≥75% per stack" claim is **not substantiated
  for FE today** and cannot be without either component tests (instrumentable) or a V8-instrumented e2e run.
  This is the real coverage gap, and it should reshape the offering's wording or the build plan (item #9).

## Verification

Each row closes with its own proof: coverage report ≥75% committed to CI, SAST job green in a
PR run, C4 docs merged, prod env file pinning region+masking flags + a masked-egress smoke,
routing editable via admin UI in a Playwright smoke. Re-read the offering doc after each close —
remove this plan only when every claim is demonstrably true.

## Exit criteria

On close: update `docs/CURRENT-STATE.md` (coverage/SAST/C4/region/masking posture lines),
`references/compliance.md` (region + fail-closed posture), then delete this plan. If a claim is
descoped instead, the offering doc must be edited in the same batch — doc and reality may not
diverge.
