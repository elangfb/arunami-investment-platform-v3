# Opening the gate (with a recorded dissent) + the tidy sweep

## The gate-open decision

The recency analysis (`02-which-wins-recency.md`) showed brainstorm held the **confirmed go-forward
design** for the 6→4 RM maker-checker restructure. mizan had this restructure marked **`GATED` pending
Discovery W1**. The user decided: **"buka gate"** — open it.

### The dissent (recorded for honesty)

I advised **against** flipping the gate, once, concretely:

- Brainstorm's own evidence docs say the SOP slides are *strong but unratified*:
  `hijra-bank-sop-digest.md` — *"do not flip 📝 → ✅ on these alone — ratify at W1"*; and
  `discovery-open-questions.md` still has DPS/BWMP/role-RBAC open.
- So the SOP fold is a **strong signal**, but the formal Bank confirmation (Discovery W1) had not
  happened.

The user overrode this — their call as the human authority. I stated the objection once and **deferred;
did not relitigate.** The override is precise: *the human accepts the SOP evidence as sufficient to
**unblock the build**; Discovery W1 still ratifies the numeric values (BWMP, SLA numbers, DPS scope).*

### Scope of "open" (to prevent mis-execution)

"Open the gate" = flip **status + design docs** to go-forward (`designs/workflow-target.md`,
`planning/workflow-rm-maker-checker.md`, CURRENT-STATE, `guides/workflow.md`). It is **not** a license
to write the 6→4 code — that build is a **separate, not-yet-started effort.** The decision is enshrined
in [`../../decisions/0003-workflow-target-and-rbac.md`](../../decisions/0003-workflow-target-and-rbac.md).

## The full-sweep tidy

Ran a read-only audit → applied only approved findings. Worth remembering:

- **Self-correction:** I first flagged `guides/core-workflow.md` and `guides/external-services.md` as
  byte-identical duplicates (delete candidates). The user corrected me — they are **symlinks** to the
  Bahasa canonicals (`alur-kerja-inti.md`, `layanan-eksternal.md`), i.e. intentional English-named
  aliases. **Kept; audit record corrected.** Lesson: a byte-identical "duplicate" with a 0 B tree size
  is a symlink tell — check `islink` before proposing a delete.
- **Digest-then-delete** the consumed `handoffs/2026.06.03-mizan-build-backlog/` (~85 % ✅): the
  Vertex-smoke nugget → `guides/launch-gates.md`; the AI-audit-fail-closed open decision repointed into
  CURRENT-STATE; the `blocked-on-w1` design confirmed already captured in `workflow-target` +
  maker-checker + `discovery-open-questions`; then deleted (git is the archive).
- **Drift fix:** reconciled the Bahasa target (`alur-kerja-inti.md`) to the 06-03 DPS-always + SP3
  detail and cross-linked it with `designs/workflow-target.md`.
- Verified: **0 broken links**, no dangling handoff references, mermaid balanced.

## Successor

The [`2026.06.04-design-foundation`](../2026.06.04-design-foundation/README.md) session built directly on
this open gate (16-step SOP-anchored target, command-sourced engine, document/AI design) and refined a
few details — notably Bersyarat (SP3 *is* written; informal confirm is out-of-system). See `follow-ups.md`.
