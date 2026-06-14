# MIZAN — AI assist (recommendation · drafting · exploration)

- **Status:** Draft — 2026.06.04. SSOT for **where AI helps** + the **hard invariant**. Consolidates the
  scattered scaffolding (`aiRiskAdvisory`, `analysis-assist`, `bureau`, `narrative`, research agent).
- **North Star:** AI makes the human faster, never decides for them. "Keputusan tetap di institusi."

## The invariant (the line AI never crosses)

AI is **advisory only, everywhere**:
- **White-box.** Every recommendation shows its reasoning — no black-box verdicts.
- **Human confirms.** RM / Risk / Komite make the actual call; AI output is shown **next to**, never
  **inside**, the authoritative field (precedent: `aiRiskAdvisory` — "shown next to, never inside, RT must choose").
- **Never gating.** AI never sets DSR/LTV/Kol or any gate value — those are computed **server-side** from
  human-confirmed inputs.
- **Never frozen.** AI output is **not** written into the signed MUAP/RSK (advisory stays out of the
  frozen artifact + the audit ledger of signatures).
- **Masked + audited.** PII is masked before any model call (mask-in/unmask-out, `server/ai/narrative.ts`);
  every call is audited (`recordAiInteraction`, surface tag).

## Inference stack

Vercel AI SDK (`generateText` / `generateObject` + **Zod**) on **Vertex** (`server/ai/gemini.ts`
`geminiLanguageModel` / `generateStructured`); APAC residency guard fails closed off-region. The OCR
vision boundary stays on `@google/genai` (`server/ocr/gemini-vision.ts`). Provider-swap is config — V1 runs
Gemini on Vertex (Singapore) under the §56(b) DPA; in-region (§27(5)) deferred, Bedrock Nova dropped 2026-06-03 (`../references/compliance.md`).

## Recommendation points

| Point | What AI does | Status |
|---|---|---|
| **RM @ MUAP authoring** (Fase A) | draft 5C+1S narrative · gap detection · **counter-offer** (see below) · **asset-HPP price reference** (Murabahah cost vs market) | `analysis-assist` exists; counter-offer + price-ref NEW |
| **Risk Analyst @ MUAP ready** | recommend approve/conditional/reject + reasoning (+ optional score) | **`aiRiskAdvisory` exists** — fire when MUAP final |
| **Bureau (SLIK/Pefindo)** | summarize the bureau bundle | **`bureauSummary` exists** |
| **Komite** | deal briefing/summary for the session (decision-support, not deciding) | NEW, optional |
| **Appraisal @ valuation** | **sanity-check appraised collateral value vs market reference** (advisory flag) — Appraisal desk does the valuation, **not RM** | NEW |
| **SP3** | draft offer letter from approved terms | extends narrative gen |

## Counter-offer (borrowed from kocek; not the product)

When a **hard-gate fails** (DSR/LTV/Kol over the active policy), AI computes the **terms that would pass**
— e.g. *"plafond ≤ Rp X"* or *"tenor ≥ Y bulan"* so DSR ≤ limit — as a **counter-offer suggestion**. RM
applies it via `ReviseProposal` (the proposal is mutable pre-Komite — `workflow-engine.md`). Advisory; RM
/ Komite decide. Cheap (deterministic threshold math + AI phrasing of the rationale), high-value, demo-strong.

## Price / valuation check ("cek harga")
Two surfaces — note **the Appraisal desk does the collateral valuation, not RM** (`workflow-target.md`):
- **Collateral value (agunan → LTV).** The **Appraisal** desk records the appraised value (internal/KJPP);
  AI runs a **light sanity-check vs a market reference** → advisory flag ("nilai X, ~Y% di atas/bawah
  pasar"). **AUTO** when the value is recorded (cheap, event-driven — like the bureau summary).
- **Financed-asset price (HPP → margin, Murabahah).** **RM @ MUAP** needs the asset's cost/market price to
  set the margin; AI gives a **market-price reference** during MUAP authoring (light auto-ref).
- **Deep market/price research** (multi-source survey) = part of the **deep-research agent → INVOKE** (expensive).

Rule (consistent): **light event-driven sanity = auto · deep multi-source research = invoke.**

## Document creation triggers

| Doc | Trigger | AI-assisted? |
|---|---|---|
| **MUAP** | **auto** on Stage-3 entry — grounded research runs first, then the draft; **manual "Riset ulang"** re-runs after new docs (2026.06.09, see below) | **yes** |
| **RSK** | **SHOULD be auto on entering the Risk desk (Stage-4 entry, MUAP final → Fase B), grounded in the FINAL MUAP** | **yes** |
| **SP3** | Komite **approved → auto-create**; Komite **conditional → RM-invoked** | **yes** (both) |
| **MoM** | **invoked** (chair/RM records the meeting) | **no** (factual minutes are human-authored) |

> ✅ **RSK draft timing — FIXED (Batch 3 T3, 2026.06.10, typecheck+test).** The RSK is now created
> **entirely at Stage-4 entry** — `createApplicationDocs` is MUAP-only and `ensureStage4DocsOnEntry`
> (`server/docs/auto-draft.ts`) copies + fills the RSK on entering Stage 4, grounded in the **final-MUAP
> read-back Markdown** (`syncExtractionFromMarkdown`). `DocLinkage.rskDocId` is nullable; the doc spine
> tolerates RSK-absent ≤ Stage 3. (Live render at Stage 4 not yet smoke-verified.)

## Fase A AI exploration — auto on entry + manual re-run (DECIDED 2026.06.09)

**Current decision (2026.06.09): MUAP research + draft are AUTO on Stage-3 entry, with a manual
"Riset ulang" re-run.** When an app enters Feasibility, `ensureStage3ResearchOnEntry` runs grounded
web research (business-entity-only; classifier refuses individual nasabah; never throws), persists
`exploredSources`, **then** `createApplicationDocs` drafts the MUAP grounded in those citations. So the
RM opens a memo that is **already non-empty** instead of a blank canvas. The manual button
(`runWebResearchAction`, MUAPTab "Riset ulang") is the explicit re-run after new documents land.
Wiring: `server/docs/auto-draft.ts` (`ensureStage3ResearchOnEntry` → `createApplicationDocs`),
`server/ai/narrative.ts:156` (citation grounding), `server/research/pipeline.ts` (fail-safe pipeline).

**This reverses the 2026.06.04 "RM-invoked" decision below.** Rationale for the reversal: a blank MUAP
on entry was the felt failure (RM had nothing to start from); the user prioritised a non-empty grounded
draft over the cost/freedom argument. **Cost tradeoff (accepted):** research now fires on *every*
business-nasabah Stage-3 entry; it is idempotent (skips if `exploredSources` already exist) and uses the
stub provider in dev/CI. If synchronous synthesis latency on the transition becomes a problem, the async
job queue (`server/research/job.ts`) is the planned upgrade — not a re-revert to manual-only.

---
**Superseded (2026.06.04) — kept for the rationale trail:** *MUAP was RM-invoked, not auto.* Principle:
auto at deterministic milestones · invoke in the fluid phase. The argument was that Fase A is
fluid/iterative with no ripe milestone, so auto-running expensive AI on every app or every churn wastes
cost and constrains the maker. Valid concern; the 2026.06.09 decision accepts that cost in exchange for
the non-empty-draft UX, mitigated by idempotency + the stub-in-dev posture.

**Ambient exception (auto, not "exploration"):** OCR field extraction runs **auto on document upload**
(`ocr_suggested` → RM confirms); rule-based gap-flags are passive/derived. These are input processing, not
the heavy AI gated behind RM-invoke.

## Pointers

- Invariant precedent + scaffolding: `server/ai/` (`gemini.ts`, `narrative.ts`, `bureau.ts`,
  `advisory-rec.ts`, `analysis-assist.ts`), `server/research/`, `server/ai/audit.ts`.
- Flow + proposal mutability: `workflow-engine.md`. Doc generation/triggers: `document-system.md`.
- Deferred/advanced AI (DPIA, web-research production gate G5): `../references/ai-ml-deferred.md`.
