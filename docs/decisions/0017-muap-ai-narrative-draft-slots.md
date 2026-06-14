# ADR-0017: MUAP master carries AI 5C+1S narrative draft-assist slots

- **Status:** accepted
- **Date:** 2026.06.10

## Context

The MUAP fill pipeline was fully wired for AI narrative: `generateMuapNarrative` produces 8 consolidated
5C+1S prose keys (`m_ringkasan_usulan`, `m_character`, `m_capacity`, `m_capital`, `m_condition`,
`m_collateral`, `m_syariah`, `m_tujuan_naratif`), the registry maps each to a `[bracket]`, and `seed.ts`
fills via `replaceAllText`. But the **brackets were intentionally absent from the live master** — the
2026.06.08 posture (`document-system.md` narrative note) was that the MUAP master uses *granular human-fill
prompts* and the analyst authors the 5C+1S; AI narratives were therefore generated for app-side scoring/context
only and silently no-op'd at fill. Result: a freshly-generated MUAP was a header-filled scaffold with an
empty analysis body — not reviewable as a draft.

The forces: (a) we want a downloadable initial draft with substantive analysis content; (b) the AI narrative
is already generated, masked, audited, and grounded in web research — discarding it wastes it; (c) the MUAP is
a regulatory document whose 5C+1S analysis is the analyst's professional judgment, not the model's.

## Decision

Place the 8 narrative `[bracket]` slots on the MUAP master, each as a **labelled, editable** paragraph —
`📝 Draf analisa AI (sunting/lengkapi sebelum finalisasi): [Analisis …]` — directly under its analysis
section heading (`scripts/place-narrative-slots.ts`, backup-first + verify). The existing fill path then
populates them, so **the AI seeds an editable first draft** under each section. The analyst remains the author
of record: the granular human prompts stay alongside as guidance, the slot is explicitly labelled as an AI
draft to edit, and the Doc is what freezes to PDF at committee. This reverses the 2026.06.08 "no-ops" posture
for **MUAP only**; RSK narratives stay not-doc-filled.

Compliance guards are unchanged and still apply: mask-in/unmask-out PII, `assertSafeTokens` (no
level/recommendation/verdict token can ever fill), and the narrative scrub that drops any risk-level or
decision the model emits. The AI never authors authoritative numbers, risk levels, or the recommendation.

## Consequences

- **Easier:** a generated MUAP is now a content-bearing draft (5C+1S prose grounded in facts + web research),
  reviewable offline by another team and a real head-start for the analyst.
- **Harder / risk:** AI-drafted prose now sits in the regulatory analysis body. Mitigated by the explicit
  "Draf analisa AI — sunting sebelum finalisasi" label, the analyst's edit-before-freeze ownership, and the
  unchanged compliance guards. **Anchoring risk** (analyst rubber-stamps the AI draft) is the live concern to
  watch; the label is the primary control.
- **Maintenance:** a re-authored MUAP master must re-run `place-narrative-slots.ts` (brackets don't carry over),
  same re-author tax as the V3.5 NamedRanges. Master backup recorded in `document-templates.md`.
- **Scope:** MUAP only. Extending to RSK would be a separate decision.
