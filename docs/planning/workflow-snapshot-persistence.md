# WorkflowSnapshot authoritative persistence (ADR-0004 Phase 3)

- **Status:** ACTIVE — **Phase 3a SHIPPED 2026.06.09 (snapshot persisted); Phase 3b pending** — the authority inversion + raw-reader migration is the irreversible step, stopped at the safe partial pending the human's review of that diff.
- **Started:** 2026.06.08 · **Owner:** App
- **Source of truth for:** the unbuilt "snapshot-authoritative" persistence from ADR-0004 §3

## Context — design ≠ implementation

[ADR-0004](../decisions/0004-workflow-engine-command-sourced.md) is titled and decided
"command-sourced, ledger-backed, **snapshot-authoritative**." §3:
> An authoritative, named `WorkflowSnapshot` (phase/step, not a bare integer) is the operational
> truth… written **only** through the command seam, **atomically with the ledger inserts**… a
> rebuildable read-model, not a second SSOT.

**Built (Phases 1–2):** the single write seam (`decide()` pure reducer + `dispatch()` →
`applyDecision()`), the insert-only ledgers (`ApprovalStep` / `HistoryEntry` / `DocumentVersion`),
and the Phase-2 *seam* in `apps/web-app/src/lib/workflow.ts` — semantic predicates (`isAt`,
`isAtOrAfter`, `isBefore`, `isPreKomite`, `stepOf`/`stageOfStep`) + `deriveWorkflowSnapshot`.

**Phase 3a — SHIPPED 2026.06.09:** the named `WorkflowSnapshot` (phase/step/status/closeReason) is now
**persisted** on `Application` (`workflowSnapshot` JSONB + migration), written at the single write seam
(`server/repo/write.ts`, create + save) **atomically** under the optimistic version guard and kept
`== deriveWorkflowSnapshot(app)` (a null column re-derives; the dummy seed backfills). Snapshot-invariant
itest 4/4.

**Phase 3b — PENDING (the stopped-at-safe-partial step):** `stage` Int **remains the SSOT**. The authority
inversion (`stage` derived FROM the snapshot) + the ~150 raw-`app.stage`-reader migration onto the
predicates is the irreversible, highest-blast-radius change (regulatory-grade workflow cursor / stage
gates), so it was **stopped here per the autonomous safety protocol** — its gate is the full e2e 21/21 +
the human's review of that diff. No live split-truth today: single SSOT = `stage`.

## Approach (the Phase-3 flip)

1. **Migrate raw readers onto the predicates** — the ~150 sites comparing `app.stage < N` /
   `app.stage === N` switch to the Phase-2 semantic predicates so nothing reads the integer directly.
   (This is the prerequisite the Phase-2 seam was built to enable.)
2. ~~**Persist the snapshot**~~ **DONE (Phase 3a, 2026.06.09)** — `workflowSnapshot` JSONB on
   `Application`, written at the `server/repo/write.ts` seam atomically under the optimistic guard.
3. **Invert the derivation** — make `stage` a derived accessor *from* the snapshot (back-compat for any
   residual readers), reversing today's `snapshot ← stage`.
4. **Backfill** — `deriveWorkflowSnapshot` is already the reset/reseed backfill; reuse it to compute each
   app's initial persisted snapshot.

**The 6→4 / 1→16 stage renumber is explicitly OUT of scope here** (excluded from the autonomous build run,
2026.06.09): it is organizational-gain-only with high authz blast-radius, so it stays
**deferred-indefinitely (no active plan)** — documented as deferred in `../designs/workflow-engine.md` and
the session-history register. This plan migrates the readers onto
predicates **only** for the snapshot persistence — it does **not** renumber the integers. (A future
renumber could reuse the predicate migration, but it is not bundled here.)

## Files

- `apps/web-app/src/lib/workflow.ts` — predicates + `deriveWorkflowSnapshot` (Phase-2 seam, already built).
- `apps/web-app/src/lib/workflow-engine.ts` — `dispatch`/`applyDecision` must write the snapshot.
- `apps/web-app/prisma/schema.prisma` — snapshot columns + migration; `stage` becomes derived.
- `apps/web-app/src/server/repo/write.ts` — persist the snapshot atomically with the ledger inserts.
- ~150 reader sites comparing `app.stage` directly — migrate to predicates.

## Verification

- Integration: after `dispatch(cmd)` the row carries the snapshot fields; reload returns them; derived
  `stage` matches the snapshot. No reader reads the raw `Int` after migration.
- Full engine + lifecycle suites + e2e (21/21) stay green; this is workflow-cursor code — run them all.

## Exit criteria (retire-on-ship)

Flip the wording from "pending" to "realized" and remove the pending markers in — `../decisions/0004-workflow-engine-command-sourced.md` (§3 note), `../GLOSSARY.md` ("snapshot-authoritative"), `../designs/workflow-engine.md` (Status + Overview + persistence table), `../CURRENT-STATE.md` (engine entry), and the session-history register (`references/session-history/06-engine-data.md` §19 + `README.md` §4/§5) — then **digest-then-delete** this plan.
