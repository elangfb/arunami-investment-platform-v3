# Planning — active work only

`docs/planning/` holds **only what's in flight right now.** Durable specs and living
registers go to `docs/references/` or `docs/designs/`; accepted decisions to `docs/decisions/`; live truth to `docs/CURRENT-STATE.md`.

## Every plan exits — never "sits forever"

A plan is retired in its closing batch (**retire-on-ship**):

- **Promote** → move durable facts/rationale/design to `docs/CURRENT-STATE.md`, `docs/references/`, `docs/designs/`, `docs/guides/`, or `docs/decisions/`.
- **Digest, then delete** → move the lasting nugget to its layer, then delete; git history is the archive.
- **Abandon** → delete; record only a durable scope boundary or a cross-cutting lesson if it passes that layer's gate.

## Status header

Each plan opens with `Status: ACTIVE` (+ date / owner). A plan whose body says
BUILT/DONE while still here is a bug — promote/digest/delete it.

## Active plans

- [execution-queue.md](execution-queue.md) — **ACTIVE (2026.06.12) — START HERE.** The single flat priority queue across docs maintenance, pending development, and offering-claim gaps; links out to the plans below instead of restating them.
- [penawaran-gap-closure.md](penawaran-gap-closure.md) — **ACTIVE (2026.06.12).** Make every claim in the official offering draft (`../guides/penawaran-produk-mizan.md`) demonstrably true: coverage ≥75%, Gherkin, C4, SAST, region Singapura pinning, masking/backstop prod posture, approval-routing admin UI. Verified non-contradictory against the original `../brainstorm` proposal.
- [target-flow-roadmap.md](target-flow-roadmap.md) — the master end-to-end target flow + gap register. **Batches 1–6 + 8 shipped 2026.06.10** (§2/§3 carry per-gap proof + file refs); **Batch 7** (origination-collapse + Legal-as-review) is **DEFERRED** — needs user re-activation + an ADR.
- [workflow-snapshot-persistence.md](workflow-snapshot-persistence.md) — ADR-0004 §3. **Phase 3a shipped** (named `WorkflowSnapshot` persisted on `Application`); **Phase 3b pending** (invert authority so `stage` derives from the snapshot + migrate the ~150 raw `app.stage` readers onto predicates) — the irreversible, highest-blast-radius step, stopped at the safe partial pending the human's review of that diff.
- [config-and-admin.md](config-and-admin.md) — remaining config/admin extensions after the core foundation (required-doc checklist, risk-policy audit display, broader OCR coverage, branch/region scope).
- [realtime-notifications-sse.md](realtime-notifications-sse.md) — **DEFERRED** (V1 = polling; the SSE + Postgres `LISTEN/NOTIFY` design is kept for when realtime is picked up).

> Everything else from the 2026.06 build campaign — Tracks A–D, Batches 1–8, the Wave-1 UI consistency spine, the workflow-engine build, the brainstorm merge — has **shipped and been digested** into [`../CURRENT-STATE.md`](../CURRENT-STATE.md), the relevant ADRs/designs, and [`../references/feature-acceptance.md`](../references/feature-acceptance.md). Git history is the archive for the retired plans.
