# The merge method — routing, not cleanup

## Where we started

Two git repos describing the same product at different maturities:

- **`../brainstorm/`** — discovery-era knowledge base: ~25 flat topic docs + authoritative `sources/`,
  modelling a **5-stage / RM-RT-CM-MG** process.
- **this repo (`mizan`)** — a mature build repo with a layered knowledge system, modelling the
  **as-built 6-stage / AO-LG-RT-LA-CM-DPS-MG desk** process.

The ask: merge **almost all** of brainstorm here, excluding the work contract.

## The key insight: don't tidy, route

The instinct on "merge a pile of docs" is to clean up the destination first. That was **wrong here**:
the mizan structure was already clean and mature, and `references/` was nearly empty — a *ready landing
zone*. The real work was not cleanup but a **routing + reconciliation plan**, because the two corpora
**overlapped and contradicted** (5- vs 6-stage, RM vs desks, two glossaries). A blind copy would have
dropped stale, contradictory docs next to the canonical ones — the exact duplication-and-drift the
repo's own doc rules forbid.

So the fork "merge now vs. prepare first" resolved to: **plan-first**, where the "preparation" is a
per-doc routing decision + reconciliation notes, not a structural tidy.

## Decisions locked (with the user)

- **Plan-first**, then execute (a reviewable routing table before touching files).
- **Retire brainstorm** afterward → this repo becomes the single source of truth.
- **Copy `sources/`** in read-only (~1.3 MB artifacts) with a provenance index.
- **Omit `CONTACTS.md`** (real-name/phone PII out of a compliance-sensitive repo).
- **Omit `TIMELINE.md` + `SCOPE.md` payment/warranty** (commercial = work contract); keep SCOPE's
  scope-of-work.

## Execution notes worth keeping

- ~25 docs routed: **12 → `references/`**, **3 → `designs/`** (incl. net-new `pii-masking`,
  `admin-config-layer`, `workflow-target`), **GLOSSARY + workflow reconciled**, **BUILD-STATE digested**
  into CURRENT-STATE, exclusions dropped.
- The mechanical parts (metadata headers + remapping every old `brainstorm/X.md` cross-link to the
  layered layout) were done in **one deterministic scripted pass**, not by hand — exact and auditable.
  Result: **0 broken links across 74 docs**.

Full per-doc routing table + status lived in `planning/brainstorm-merge.md` (retired 2026.06.05 — see git history); the merge outcome is in [`../../CURRENT-STATE.md`](../../CURRENT-STATE.md) + [`../../references/`](../../references/).
