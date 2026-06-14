# Doc fill V3.5 — targeted NamedRange for un-replaceable slots (SHIPPED + live)

- **Status:** **SHIPPED + live (Batch 4, 2026.06.10).** The spike passed (commit `608b989`) and V3.5 was shipped + verified live (commit `6e2af34` "Batch 4 V3.5: NamedRange value-fill SHIPPED + verified live"). Live code: `apps/web-app/src/lib/templates/doc-registry.ts` (V3.5 NamedRange section) + `apps/web-app/src/server/docs/seed.ts` (`V35_RESOLVERS`, PASS 2 NamedRange fills with a post-fill verify). Originally captured 2026.06.09 as a spike-gated proposal; the design content below records the decision and rationale as built.
- **What shipped:** NamedRange value-fill for the master's underscore blanks that `replaceAllText` cannot anchor — **plafond** and **tenor** (filled at doc creation), plus **No. MUAP** and **Tanggal** (filled at the finalize re-fill once the MUAP ladder is fully signed). `[bracket]` slots continue to use the V3 `replaceAllText` path unchanged.
- **Authority now:** **V3 + V3.5 are both live** (`document-system.md`, ADR-0013): `[bracket]` value/narrative fill = `replaceAllText`; the underscore/hard slots above = targeted NamedRange. This **extends ADR-0013 point 4** (NamedRange for *some* value fill) — now ratified by shipping.
- **Last reviewed:** 2026.06.10

## Scope (clarified 2026.06.10)

**Plafond/tenor are EXAMPLES, not the list.** The deliverable starts with a **full-coverage audit of
every master** (MUAP, RSK — and re-check MoM/SP3 while at it): enumerate **every slot Mizan should fill
but doesn't** — underscore blanks, unanchored cells, registry-vs-master drift in either direction
(registry lists a slot the master can't take; master has a blank the registry doesn't know). Output =
a **coverage matrix** (slot → label → fill method `[bracket]`/NamedRange/none → status) committed to
`document-templates.md` BEFORE building. Do not build from the two known examples alone.

## Problem

Some master slots **cannot** be filled by `replaceAllText`: the bank's real template uses **underscore
blanks** — `Rp ____________,-`, `___ Bulan` (evidence: the actual MUAP master; these are the two slots
*found so far*, not the inventory) — not `[bracket]` tokens. `replaceAllText` has no safe anchor for a
run of underscores (which run? collides with the others). So those slots stay **UNFILLED today** even
though `doc-registry.ts` lists them (registry-vs-master drift). Converting the underscores to
`[bracket]` would fix replaceAllText but **breaks the bank's template fidelity** (the formal
`Rp ___,-` look).

## Decision (leaning B)

**V3.5 = `replaceAllText` for `[bracket]` slots (unchanged) + targeted NamedRange for the underscore/hard
slots.** Create a NamedRange over each hard blank **on the master, once**; at runtime read the range's
index and `deleteContentRange`+`insertText`.

Chosen over **option A (runtime index-range fill by adjacent-label anchor)**: A's text-anchor heuristic is
fragile on **every runtime fill, every per-app doc** (silent miss when the bank renames a label). B confines
the fragile "locate" to a **one-time, human-verifiable master setup**, after which runtime is a deterministic
read-range-and-fill — the existing `qr-stamp.ts` pattern. (A is kept on file as fallback — see below.)

**Why the old NamedRange fears don't bite here:**
- **Persistence through `files.copy`:** per-app docs are copies of the master; the QR-signature NamedRanges
  already live on the master and stamp on every per-app doc → ranges survive the copy (`qr-stamp.ts` +
  document-system.md). *Spike must confirm this explicitly for value-fill ranges.*
- **Survive-refill (the V2 killer):** irrelevant — MUAP fill is **one-shot**; the range only needs to be
  correct AT fill time (collapse-after-fill is fine).
- **Unmaintainable 644-token V2:** avoided — this is **targeted (~5–15 hard slots)**, not every blank.
- **Dup-occurrence leak:** a **distinct NamedRange per occurrence**, inventoried (the V2 dup-leak was a
  single range wrapping only the first occurrence).

## Discovery — find the hard slots via the Docs API JSON, NOT PDF/vision

Use **`documents.get` (structured JSON)**, not a PDF→image→vision pipeline:
- `documents.get` returns exact text + table structure + `startIndex/endIndex` per run — i.e. **the index
  ranges you need to create NamedRanges**. Reuse/extend the `sync-v2.ts` walker (already tracks indices;
  **needs table-cell traversal added**).
- Walk → inventory candidates: underscore runs (`/_{2,}/`), existing `[bracket]` tokens (coverage
  cross-check), and the adjacent **label** per slot.
- Label each candidate → registry var (human, or **AI fed the walked TEXT — not images**).
- **PDF→image→AI is strictly worse:** it discards the structured source and re-derives it lossily from
  pixels, and vision can't return the API index ranges anyway (you'd have to map back). Vision/PDF only
  makes sense for image-only docs with no text layer — not a native Google Doc. (A rendered overlay is fine
  as a **human-review aid**, never the discovery mechanism.) Bonus: the JSON walk also gives the drafting AI
  the template's full structure more precisely than images would.

## Registry shape (extend, not replace)

`doc-registry.ts` entries gain a fill method: `[bracket]` slots keep `placeholder` (replaceAllText); hard
slots carry a NamedRange name + a creation locator. Registry stays the single source of truth.

## Spike gates (prove BEFORE building)

1. A **value-fill** NamedRange created on the master **survives `files.copy`** into a per-app doc.
2. `deleteContentRange`+`insertText` within the range **cleanly replaces** the underscore blank (no residue,
   correct cell).
3. **Read-back verify** after fill (value landed, no leftover underscores) — **fail loud, never silent.**

## Cost (honest)

- **Re-author tax:** a new master-template version requires **re-creating its NamedRanges** (manageable at
  ~5–15 slots — this is exactly what made V2's 644 fatal, so keep it targeted).
- More than replaceAllText, **far less than full-NamedRange**; reuses `scripts/setup-template-ranges.ts`
  (create) + `qr-stamp.ts` (read/fill).

## Alternative kept on file

**Option A — runtime index-range fill by label-anchor:** no master setup, but a fragile text-anchor on every
fill. Rejected as primary (hacky / re-fragile); **retained as fallback** if a value-fill NamedRange fails
spike gate 1 or 2.
