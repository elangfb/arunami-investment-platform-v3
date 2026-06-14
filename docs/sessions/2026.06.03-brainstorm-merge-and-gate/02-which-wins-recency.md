# Which source wins — authority by git date × nature (the keystone)

## The trap we avoided

The first-draft reconciliation rule was **"build-canonical (mizan) always wins."** The user corrected
this: *"to see which win, open git history. I have made several changes on brainstorm repo too."*

That mattered. mizan's last brainstorm reconcile was **2026.06.01**, but the user kept committing into
brainstorm **through 06-03 12:07** (Bank SOP fold, WORKFLOW-TARGET, a DPS revision, SP3 chain,
Bersyarat-informal). So brainstorm held decisions **newer** than mizan's docs on those topics. Picking a
winner by *which repo is canonical* would have thrown away the user's latest thinking.

## The rule we adopted

Open git history on **both** repos and decide **per topic**, by two axes:

1. **Built behavior** (what the code does now) → the **live repo (mizan / CURRENT-STATE) is reality.**
   mizan's 06-03 build commits also happen to be newest here. Brainstorm design notes never override
   shipped behavior.
2. **Unbuilt design / domain decisions** → **newest commit wins**, regardless of repo. Brainstorm's
   06-02/06-03 decisions post-dated mizan's docs (≈05-30/06-01) and therefore flow **into** mizan.

## What the dates actually showed

- **DPS model** — brainstorm 06-03 revised DPS to a **per-deal, always-signs-the-RSK** final signer
  (after CRO; reject → Risk Analyst). mizan's GLOSSARY (≈05-30) + maker-checker plan (06-01) still said
  **"conditional Stage-5 DPS."** Brainstorm newer + structurally different → **brainstorm wins**, flows in.
- **SP3→Akad chain · Bersyarat informal-confirm · signature ladders** — present in brainstorm 06-03,
  **absent in mizan entirely** → net-new, flow in.
- The clincher: mizan's own CURRENT-STATE literally said it was *"waiting for a gate-clear signal from
  brainstorm."* The 06-02/06-03 commits **were** that signal — not stale relics to overwrite.
- Conversely, AML attestation, Gemini provider/region, Pefindo, G3/G4 — **mizan built them on 06-03** →
  mizan/CURRENT-STATE authoritative; brainstorm only corroborates.

## Why it's worth remembering

When two knowledge sources diverge, **don't pick by repo prestige.** Decide each contested fact by
*git date × whether it's built reality or unbuilt design.* This is now a standing learning in
`docs/MEMORY.md`. The full per-topic authority table lived in the retired
`planning/brainstorm-merge.md` §Per-topic authority (2026.06.05 — see git history).
