# ADR-0020: Customer entity + RM-led pipeline model over stage Int

- **Status:** accepted — ratified 2026.06.11; **implemented (P1–P5) and merged to `main` 2026.06.12.** Live facts in [`../CURRENT-STATE.md`](../CURRENT-STATE.md); residuals tracked in [`../planning/execution-queue.md`](../planning/execution-queue.md).
- **Date:** 2026.06.11

## Context

Mizan models a financing case as a single `Application` row whose `stage` Int is the linear SSOT,
and carries customer identity (`nasabahName`/`nik`/`npwp`/`nib`/`alamat`…) directly on that row.
The RM-led redesign (see [rm-led-pipeline-redesign](../designs/rm-led-pipeline-redesign.md), Topics
1–2 + Fork A1) settles two coupled, hard-to-reverse moves: a durable customer to hang documents,
memory and lineage on (carry-forward across deals, review/adendum chains), and a pipeline surface
that is parallel and bounce-friendly rather than a march through Int stages.

Both touch the spine. The forces:

- **Identity has no home.** Today a `Nasabah` is re-typed per app; nothing carries forward, and
  there is no entity to share a Drive folder, AI memory, or a review/adendum lineage across deals.
- **The product flow is parallel, the model is linear.** Stages 1-2-3 are really one intake phase
  with concurrent streams (docs ∥ legal ∥ appraisal ∥ bureau ∥ MUAP-draft); a bare `stage` Int can't
  express "checklist-complete unlocks a handoff."
- **The full inversion is expensive.** Making a derived/parallel model the *authority* (Phase 3b,
  `planning/workflow-snapshot-persistence.md`) touches ~128 `stage` readers — a separate large change.
  We need the product surface now without paying that cost prematurely.

Recording an ADR because both choices are surprising (customer-first, not application-first) and a
real trade-off (a new entity + migration; a derived spine that does **not** yet own authority).

## Decision

**1 · First-class `Customer` / Nasabah entity.** Customer-first entry: the RM opens or picks a
`Nasabah`, then creates an application inside it. Identity migrates up off `Application`.

- **One entity, typed `individual | business`** — pengurus / pemegang saham are **attributes** of the
  company file, not their own entities.
- **Layered data:** real columns for queried identity (`npwp`, `nib`, `alamat`, `bidangUsaha`) +
  **Zod-validated JSON aggregates** for repeating groups (`pengurus[]`, `pemegangSaham[]`), matching
  the schema's existing "read-as-a-unit, never filter by sub-field" convention (`hardGates`,
  `financialInputs`) + a **slim `extractionExtras`** for the genuine one-off long-tail.
- **Identity key:** NIK (individual) / NPWP (business), NIB secondary. A create-time match is a
  **soft nudge** ("Nasabah ini sudah terdaftar — buka filenya?"), never a hard block.

**2 · RM-led pipeline = horizontal handoff spine + parallel checklists, built OVER `stage` Int.**
The product surface is a row of **handoffs** (the few points where control truly transfers) with
**parallel checklist streams** beneath each segment; checklist-complete unlocks the segment's main
action (a handoff — some are approval ladders) which advances the spine. The spine is a **derived
sequence of handoff-segments** over `stage` Int — illustratively `Inisiasi → Risk Review → Komite →
SP3 → Pencairan` — a UI grouping, **not** a renumber and **not** bound 1:1 to the 4 `phaseOf` values
(SP3 surfaces as its own segment within the post-Komite phase). `Inisiasi` = **Phase 1** (`phaseOf` /
`PHASE_OF_STAGE { 1:1, 2:1, 3:1 }`: stages 1-3 = intake → feasibility/MUAP; today *Originasi*) — the
consolidated start→MUAP phase. Stream-state is **derived** by `lib/workstreams.ts` over the engine
predicates (`lib/workflow.ts` `isAt`/`isAtOrAfter`/`isBefore`) — the same parallel-over-Int pattern the
shipped CoordinationPanel (ADR-0009) already proves. The 6→4/1→16 **renumber** (making phases the actual
stage integers) stays **deferred-indefinitely** alongside the A1 inversion (`../designs/workflow-engine.md`).

**3 · Authority inversion is DEFERRED (Fork A1).** The `stage` Int **remains the authoritative SSOT**;
the spine is a read model on top of it, not a replacement. We do **not** invert authority (Phase 3b)
until review / adendum / facility-lifecycle work actually breaks the bare Int — the trigger and the
raw-reader migration (~150 per the plan; ≈130 by fresh count 2026.06.11) live in
[`planning/workflow-snapshot-persistence.md`](../planning/workflow-snapshot-persistence.md).

## Consequences

- **Easy:** carry-forward of customer docs/identity/memory across deals; review/adendum lineage to
  hang on the customer; a parallel, bounce-friendly UI without rewriting the engine; the maker-checker
  and freeze invariants (ADR-0004/0005/0016) keep working unchanged because authority stays on `stage`.
- **Hard / ruled out (for now):** moving identity up off `Application` is the blast radius — a
  migration plus every `nasabahName`/`nik`/… reader. The spine cannot express any state the `stage`
  Int can't encode; a truly nonlinear authoritative flow waits on the deferred inversion. Two sources
  of "where are we" coexist (Int = truth, spine = derived view) — they must stay reconciled by
  `lib/workstreams.ts`, never diverge.
- **Builds on:** ADR-0009 (parallel workstreams over the stage spine). Companion proposals from the
  same design: a new ADR superseding ADR-0016 §1 (MUAP-early) and relaxing ADR-0014 (open-read).
  The eventual authority-inversion ADR is the deferred follow-on, not this one.

## P1 implementation status + known limitations (2026.06.11)

**SHIPPED (verified `test`):** the additive migration (Customer table + nullable `Application.customerId`
FK, 1:1 backfill — parity verified by SQL: 47 apps = 47 linked = 47 customers, 0 identity mismatches);
the Customer repo (`server/repo/customer.ts`), the pure dedup resolver (`lib/customer-dedup.ts`,
NIK/NPWP compared as strings not floats), dual-write on create + on update (`application-create.core.ts`
+ `write.ts mirrorIdentityToCustomer`), and customer-first dedup linking. Gate: cold `typecheck` clean,
`test:unit` 450/450, the full integration suite (`scripts/test-integration.sh`) 76/76 across 3 runs.

**Dual-write is MERGE, not clobber** (adversarial-review finding, fixed + regression-guarded): a Customer
is shared 1:many across a customer's applications (the create path reuses one Customer per NIK/NPWP), so
`mirrorIdentityToCustomer` only writes fields the saving application actually has a value for — a blank
field is omitted, never written as `null`, so a sibling application's blank save cannot wipe identity
another application populated on the shared row. Conflicting non-blank values are last-writer-wins on the
shared row (accepted for P1; per-application identity divergence is a later concern).

**KNOWN LIMITATIONS — deferred follow-ups (not blocking P1):**
1. **Concurrent-duplicate race.** `resolveOrCreateCustomer` is a non-atomic find-then-create with NO DB
   unique constraint (`@@index` only on nik/npwp/nib, not `@@unique`). Two *simultaneous* creates with the
   same NIK/NPWP can each miss the dedup read and both insert a Customer. Serial flows (normal product use)
   and the CI suite are unaffected; only true concurrency triggers it. **Durable fix:** a partial unique
   index (`(type, npwp) WHERE npwp IS NOT NULL`, same for nik) + an upsert/catch in the create path —
   **BUT** the backfill already left **1 duplicate-NIK group** (two existing apps share a NIK, the seed
   scenario), so the index cannot apply until that group is deduped first. So the fix is a small dedicated
   migration (dedup existing Customer rows → add partial unique indexes → upsert in create), not a P1 add.
2. **Empty-key creates fork a fresh Customer.** An individual with no NIK (KTP NIK is OCR-extracted *after*
   intake) or a business with no NPWP/NIB has an empty dedup key, so each such create makes a new Customer
   even for the same person; the dual-write-on-update path links/syncs once NIK is OCR-confirmed. Acceptable
   per the soft-nudge stance (dedup is advisory, never a hard block), but "repeat customer" recognition
   silently does not fire while the key field is blank at intake.
