# AI/ML — Deferred, Gated & Declined Register

**Status:** Living register. **Started:** 2026.05.26 · **Owner:** app-side
**Purpose:** capture *everything* AI/Machine-Learning that we defer, gate, or deliberately
skip now — so nothing is lost and a future build resumes without re-deriving the reasoning.

> This is the **parking lot**, not the active plan. Active/near-term AI work (the
> `INFERENCE_PROVIDER` boundary F1, the eval harness F2, MUAP/RSK auto-draft, in-region posture (deferred))
> lives in `docs/designs/workflow-finetune.md` §15–§16. This file holds what we chose NOT to
> build yet, and why. Companion sources: `docs/planning/config-and-admin.md`,
> `docs/guides/document-ai-ocr.md`, `docs/guides/layanan-eksternal.md`,
> `docs/guides/launch-gates.md`, and `docs/designs/pii-masking.md`.

## Status legend
- **DEFERRED** — do later; no external blocker, just sequencing.
- **GATED** — blocked on Bank Legal / OJK / regulatory approval (not an app build).
- **DECLINED** — deliberately chose NOT to do; listed so we don't re-litigate.
- **NEAR-TERM** — actually active/planned (tracked in workflow-finetune.md); listed only for boundary clarity.

Each item: *what · why deferred · accepted residual risk (if any) · trigger to revisit · bundle/deps · source*.

---

## 0. Bundling map — what MUST be done together (read this first)

The single most important "don't lose it" fact: several deferrals are **packages**, not
independent items. Building one alone is wrong.

1. **Masking/redaction package** — NER + hash-suffix placeholders + G2 pre-flight kill-switch
   + hallucinated-name flag + ML-adaptive OCR. *NER alone is incomplete; hash-suffix is useless
   without NER to find entities.* (Ratified 2026.05.25.)
2. **In-region sovereignty package** (Dec-2026 deadline) — self-host LLM + the eval gate (F2) +
   in-region self-host OCR. *Self-host can't cut over without the eval gate proving parity.*
3. **Typed-extraction package** — 2c structured OCR (Custom Extractor/Form Parser) + per-field
   confidence-derivation + confidence-tiered auto-fill UX.
4. **Grounded-research package** — AI web research + `ExploredSource[]` citations + egress
   classifier (business-only) + Bank-Legal egress approval. **Stack = SearXNG (search) +
   Firecrawl OSS (extract) + in-region LLM synthesis** (see D5).

---

## A. PII masking / redaction (the "masking future package")

**A1. NER for free-text person names** — **DEFERRED / BUNDLED**
- *What:* detect arbitrary third-party PERSON names in free text (not the known `nasabahName`) so they're masked before LLM egress. Today: known-fields + regex only, NO NER (`lib/pii-mask.ts:10-12`).
- *Accepted residual risk:* arbitrary person names, addresses, parent/guarantor/SLIK-creditor names in free text egress **UNMASKED**. **The full-text-OCR widening (2026.05.25) made this surface ~100× larger** than the originally-accepted scope — and that NEW acceptance does NOT auto-transfer; it's a bigger risk pending NER (see `docs/guides/document-ai-ocr.md` and `apps/web-app/AGENTS.md` OCR/AI rules).
- *Engine sizing (from 2026.05.26 research):* "good" Bahasa NER = IndoBERT-base ~110M params; int8/ONNX **<100MB, CPU, ~30–50ms, no GPU, in-region by construction.** Compute is cheap. Catch = accuracy: **~0.73 F1 on Indonesian *financial* text** (≈1 in 4 person mentions missed + false positives on name/common-word overlap) → mitigation, not a guarantee; needs **domain fine-tuning** + an eval set to be trustworthy. Packaging = a Python/Presidio sidecar.
- *Revisit trigger:* a Bank-legal mandate or after the platform fork + F2 land. Cheap first step = a **half-day spike**: run off-the-shelf IndoBERT NER over real masked prompts/OCR text, measure actual PER recall + false-positive rate on Mizan data.
- *Seam:* F1 slice 2 will add a **pluggable redactor pipeline** so NER drops in as one pass at ~zero marginal cost — adopt the seam, defer the engine.
- *Decision:* human chose **Accept-A** (no NER before go-live) over Mandate-NER. NOT a go-live gate.

**A2. Hash-suffix / pseudonym placeholders** (`PERSON_1`, `DEBITUR_<hash>`) — **BUNDLED with A1**
- *What:* stable distinct placeholders for MULTIPLE same-type entities in free text, so unmask-out restores each correctly.
- *Why bundled:* only matters when multiple same-type entities appear in free text → needs NER to find them. Single-entity masking already collapses every `[NASABAH]`→one canonical name correctly (tested).
- *DECLINED to do hash alone* (YAGNI). Do hash **with** NER, never alone.

**A3. G2 pre-flight PII kill-switch** — **DEFERRED (partial today)**
- *What:* a pre-egress validation/kill-switch that blocks a prompt if free-text PII is detected. Today `detectResidualPii` is a fail-closed backstop for *known-fields + structured patterns* only; full-text/NER coverage is the gap (G2 in `docs/guides/layanan-eksternal.md` and `docs/references/compliance.md`).
- *Revisit:* with A1 (NER) — they're the same free-text work.

**A4. Hallucinated-name flag** — **DEFERRED**
- *What:* flag when the model emits a person name that isn't in the known values (a possible fabrication). Today unmask-out only restores known placeholders; a model-invented name is neither restored nor flagged.
- *Bundle:* masking package.

**A5. `unmaskPii` mangling tolerance (fuzzy placeholder restore)** — **DECLINED**
- *What:* tolerate a model mangling a placeholder (`[NASABAH ]`, `[NASA BAH]`) on restore. Today `unmaskPii` is exact-match.
- *Why declined:* real "unmask-right" risk is low; optional future fix, declined for now.

**A6. ML/adaptive OCR (learn from human overrides)** — **DEFERRED / BUNDLED with A1**
- *What:* learn extraction corrections over time from `ocr_overridden` provenance.
- *Why deferred:* explicitly bundled with the NER future package; do NOT build alone (`workflow-finetune.md` §14).

---

## B. Inference platform / local LLM

**B1. Self-host open model in-region** (Qwen 2.5/3 · Llama 3.x · Sahabat-AI; vLLM; GPU Merdeka / on-prem) — **DEFERRED (sovereignty option)**
- *What:* run the text-generation backend on Indonesian GPUs to satisfy the Dec-2026 in-region mandate with full sovereignty.
- *Why deferred:* TCO research — self-host is **5–15× pricier** than managed at Mizan's volume (idle GPU; ~$1,500–5,500/mo vs ~$80–400/mo). **Don't buy GPUs** (break-even ~14–16mo at 100% util, which we won't hit). It's a *sovereignty* decision, not economics.
- *Revisit:* if the Bank's sovereignty review mandates dedicated/on-prem AND a benchmark proves quality. Benchmark **Qwen2.5-32B-FP8** (1× rented H100) + **Sahabat-AI 70B** on real masked MUAP/RSK before committing. **FP8 yes; 4-bit NO** for long-context OCR→narrative.
- *Bundle:* needs the eval gate (F2) to prove parity before cutover.

**B2. In-region inference cutover** — **GATED (hard deadline 17 Dec 2026)**
- ⚠️ **Superseded 2026-06-03:** the Bedrock Nova plan was **dropped** — V1 consolidates external AI on **Google Cloud / Vertex** (Gemini, Singapore) under the §56(b) DPA; in-region (§27(5)) is **deferred**, the Bank decides posture by the deadline. *If* true in-region is later elected, the managed option analyzed was **Amazon Nova Pro on Bedrock Jakarta** (`ap-southeast-3`) — managed, in-region — since Vertex Jakarta and Claude-on-Bedrock do **not** satisfy in-country processing; it is **one option, not the plan**. See `compliance.md`.
- *Deferred part:* the self-host alternative (B1). *Gated part:* the actual flip waits on G5 DPA + the eval gate.

**B3. Vercel AI SDK adoption + `generateObject`/Zod migration** — **NEAR-TERM (F1 slice 3)**
- Listed for boundary clarity only. Makes Nova/vLLM config-not-code. Tracked in workflow-finetune.md §16.3 / §16.5. Today the seam is a thin internal `InferenceProvider` (slice 1, built `b496ecd`); centralized mask/audit middleware is slice 2.

---

## C. OCR / structured document extraction

> Note: **Document AI is ALREADY the production OCR engine** (built + E2E-verified 2026.05.25, `OCR_PROVIDER=documentai`, region `asia-southeast1`/Singapore). What follows is what's deferred *on top of* that. ⚠️ Singapore = **cross-border PII** → see F (G5 DPA + OJK permit).

**C1. 2c typed structured extraction** (Doc AI Custom Extractor / Form Parser, per-field confidence) — **DEFERRED**
- *What:* replace regex-over-general-OCR with typed per-doc schemas + confidence scores. Current 2b path is conservative regex (`lib/ocr.ts parseGateValueFromText`), fragile on real scans.
- *Revisit trigger:* when regex accuracy is poor on **real (scanned)** Indonesian docs — clean rendered text is flawless today. Full path: `docs/guides/document-ai-ocr.md` "2c upgrade path".
- *Output shape (decided):* engine-agnostic `ExtractedField<T> = { value, rawConfidence, confidence: high|review|low, validation }` — this IS the Stage-1 field-registry `extract` return type.

**C2. In-region OCR self-host** (Qwen2.5-VL + PaddleOCR PP-StructureV3) — **DEFERRED (Dec-2026 endgame)**
- *Why:* Doc AI is Singapore (cross-border). In-region OCR removes that egress trigger.
- *Bundle:* in-region sovereignty package; shadow-mode F1 against Doc AI before flip.

**C3. Specialized parsers / more doc types** — **DEFERRED**
- *What:* beyond general OCR + regex — Identity-class extraction for KTP fields; Form/Layout for SLIK tables, slip gaji, appraisal line items, NPWP, akta/NIB/SIUP. (`config-and-admin.md`, `docs/guides/document-ai-ocr.md`.)

**C4. Confidence-derivation layer** — **DEFERRED (needed iff self-host VLM OCR)**
- *What:* VLM self-reported confidence is untrustworthy → derive it (OCR-vs-VLM agreement + checksum/format validation: NIK 16-digit, Kol ∈ 1–5, NPWP format).

**C5. Confidence-tiered auto-fill UX** — **DESIGN RULE (lands with C1)**
- ≥0.9 auto-fill · 0.6–0.9 prefill+flag · <0.6 blank — **BUT numeric/gating fields (DSR/LTV/Kol inputs, net income, appraised value, Kol) NEVER auto-confirm**, even at high confidence (VLMs hallucinate 28–34% on degraded scans). Auto-fill only low-stakes strings (nama/alamat).

---

## D. AI analysis features

**D1. AI web research for 5C+1S** — **GATED (Bank Legal — new egress) + DEFERRED**
- *What:* citation-grounded research on the *business* for 5C+1S; deterministic pipeline (`plan → search(SearXNG) → fetch(Firecrawl) → synthesize`), citations enforced in code, **no agent framework / no tool-call control loop** (auditability).
- *The blocker:* searching a named entity is **new PII egress** masking can't cover (can't mask the query). Scope = **business/public-entity only, NEVER an individual's PII** — enforced by a classifier so a `[NASABAH]`-class identifier can never be a query. ⚠️ "Business" can still be personal (sole-prop/director names) → strip person names. POJK 11/2022 may require OJK approval even for business-term egress.
- *Architecture decided:* **self-hosted** raw-results search + in-region synthesis (stack in D5); **DECLINED** answer-APIs (Perplexity Sonar / Vertex Grounding — inject a 2nd uncontrolled LLM) and managed SaaS search (Tavily/Exa) as the *prod* path — self-host chosen for **sovereignty** (the SaaS APIs were ~$0–20/mo, so cost wasn't the driver). Source allowlist (AHU/Kemenkumham, OJK, IDX, news).
- *Bundle:* grounded-research package (with D3, D5).

**D2. AI risk recommendation (advisory "Saran AI")** — **GATED (compliance) + DEFERRED**
- *What:* an advisory risk hint shown next to — **never inside** — the authoritative `riskRecommendation`; never written to it, never frozen into the RSK doc; RA still explicitly decides.
- *Why gated:* contradicts the deliberate guarantee that AI authors no recommendation/level → needs Bank-Legal sign-off. (Schema-no-field + `scrubNarrative` stay the structural enforcement.)

**D3. `ExploredSource[]` citation artifact** — **DEFERRED (with D1)**
- *What:* first-class record `{ url, title, claim, retrievedAt }`, rendered on the MUAP tab and frozen into the decision checkpoint for audit.

**D4. RSK narrative draft + MUAP auto-draft on stage entry** — **NEAR-TERM (Stage 3/4, in-scope)**
- Boundary note only: RSK tokens (`r_profil_risiko`, `r_mitigasi`, `r_kesimpulan`) are empty today; auto-draft-on-entry + richer OCR grounding are active Stage-3/4 work in workflow-finetune.md, NOT deferred.

**D5. Web-research tooling stack (self-hosted) — DECIDED 2026.05.26**
- *Chosen:* **SearXNG** (metasearch backend) + **Firecrawl OSS** (extractor + one-call search+scrape, pointed at SearXNG via `SEARXNG_ENDPOINT`, JSON output required) + **our in-region LLM** (synthesis, via `INFERENCE_PROVIDER`). Use Firecrawl as the single extractor — do NOT also run Crawl4AI.
- *Why Firecrawl over Crawl4AI:* **bus-factor / longevity** — Firecrawl is company-backed; Crawl4AI is single-maintainer-dominant. ⚠️ Correction of the premise that prompted this: **Crawl4AI is NOT stale** (v0.8.5 anti-bot + v0.8.6 security hotfix, active commits) — the choice is bus-factor, not abandonment.
- *Architecture fact:* Firecrawl's self-hosted `/search` **IS SearXNG under the hood** — so this is SearXNG (engine) + Firecrawl (extractor/wrapper), not two search tools. It's the **heaviest stack**: SearXNG + Firecrawl API + Redis + workers + Playwright.
- *⚠️ Gating to-do:* Firecrawl is **AGPL-3.0** → **Bank legal/OSS-policy must clear it** (internal-only use almost certainly doesn't trip the network clause, but many banks blanket-avoid AGPL). If rejected, Apache-2.0 fallback = SearXNG + **Trafilatura** (primary, static) + **Crawl4AI** (JS fallback).
- *Egress nuance:* SearXNG still sends the query to public engines (Google/Bing) → reduces vendor-DPA surface, NOT query egress. Only a self-crawled allowlist index removes external query egress.
- *Cost:* $0 license; cost = infra + ops. (Self-host chosen for sovereignty, not savings.)

**D6. Social media / LinkedIn research — OUT OF SCOPE (declined 2026.05.26)**
- *Decision:* do NOT scrape LinkedIn/social. Three reasons: (1) **personal PII** — profiles are individuals' data → breaks the business/public-entity-only boundary + PDP Law (no consent, cross-border, no DPA); (2) **legal/ToS** — scraping breaches LinkedIn's User Agreement (hiQ v. LinkedIn ended with hiQ paying damages + destroying scraped data — CFAA ≠ permission); (3) **low reliability** — self-reported, unverified, easily faked for a credit decision. It would also require a Tier-3 proxy/anti-bot arms race (the "we need robust extraction" tell).
- *Compliant alternative:* authoritative registries already in the allowlist (AHU/Kemenkumham = verified company + officers, OJK, IDX, BPS, news); person-level verification = consented KYC or licensed data under a DPA, never covert scraping.
- *Escalate:* a scope/compliance call for Bank Legal + human, not an engineering one.

---

## E. AI eval & observability

**E1. Eval harness (Promptfoo + RAGAS, local judge)** — **NEAR-TERM (F2 prerequisite, not yet built)**
- Boundary note: the deterministic guardrail regression + provider-swap eval gate. Prerequisite for any model swap and all AI stages. Tracked in workflow-finetune.md §16.4–§16.5. Self-hostable, no SaaS egress.

**E2. Langfuse production AI monitoring** — **DEFERRED (optional, post-cutover)**
- *What:* trace + online eval on prod AI traces. MIT, self-hostable. Optional, after F2 + cutover.

**E3. Model-risk validation artifacts (OJK AI Governance, 29 Apr 2025)** — **DEFERRED / GATED**
- *What:* model/prompt documentation, bias note, drift monitoring, output-quality controls; **independent validation + board sign-off IF the credit-memo LLM is "high-impact"** ([LEGAL CALL]). DPIA effectively mandatory.

**E4. Error monitoring (Sentry / GlitchTip)** — **DEFERRED (AI-adjacent, needs tool choice + external service, HUMAN)**
- `server/log.ts` is the seam; not strictly ML but the observability backstop for AI failures.

---

## F. Compliance / regulatory gates (Bank-owned — not an app build)

All **GATED**; tracked so the AI work knows its blockers. Sources: `docs/designs/workflow-finetune.md` §16.1, `docs/guides/launch-gates.md`, `docs/guides/layanan-eksternal.md`, and `docs/references/compliance.md` (the G1–G5 record).

- **G5 — signed LLM-vendor DPA** — Bank Legal hard blocker for Gemini / Google Docs+Drive / Doc AI / search vendor / Nova. The single artifact satisfying PDP + POJK-11 + AI-guidance at once → prioritize.
- **OJK offshore permit (POJK 11/2022 Art. 35)** — prior approval (izin), ~3-month window → **gating long-pole** for any cross-border (Doc AI Singapore / Gemini US / search API). Module-separation rule (FAQ Q7) validates the provider-boundary architecture.
- **DPIA** — effectively mandatory for the AI pipeline.
- **DPS (Dewan Pengawas Syariah) opinion** — must bless the advisory-AI workflow; no DSN-MUI fatwa exists ([LEGAL CALL]).
- **PDP Law (UU 27/2022)** — cross-border PII = DPA + explicit consent (no adequacy list yet); per-vendor processor agreements; breach notify 3×24h.
- **High-impact-model classification / board sign-off** — undecided ([LEGAL CALL]).
- **OJK approval for business-term web-research egress** — possibly required even when no personal PII leaves.

---

## G. Declined (chose NOT to do — don't re-litigate without new reason)

- **NER via spaCy-en / generic models** — need an Indonesian model; generic won't work.
- **Hash-suffix alone** (without NER) — A2.
- **`unmaskPii` fuzzy/mangling tolerance** — A5.
- **Answer-APIs for research** (Perplexity Sonar / Vertex Grounding) — inject a 2nd uncontrolled LLM; conflicts with in-region + "AI authors no conclusions."
- **LangChain.js / LiteLLM** for the provider abstraction — Vercel AI SDK chosen.
- **Agent framework / tool-calling control loop** for research — deterministic pipeline instead (auditability).
- **Buying GPUs** — rent if self-host; capex break-even never reached at our volume.
- **OpenAI Evals** — wrong ecosystem for in-region/local.
- **Vertex AI Jakarta / Claude-on-Bedrock-Jakarta** as the in-region answer — neither commits to in-country *processing*.
- **Crawl4AI as the extractor** — chose Firecrawl on bus-factor (D5). Crawl4AI is NOT stale + is Apache-2.0 → keep it as the AGPL-rejection fallback, not the primary.
- **Managed SaaS search (Tavily/Exa) as the prod path** — self-host (SearXNG+Firecrawl) chosen for sovereignty; SaaS retained only as a possible dev/eval convenience.
- **Scraping LinkedIn / social media** — D6 (personal PII + ToS + low reliability).

---

## H. Non-ML deferrals noted elsewhere (out of scope here, pointer only)
Doc virus-scanning/security headers, MUAP/RSK template-token migration, 5C+1S scoring-weights config, tenor-presets config, required-doc-checklist config (`config-and-admin.md`), Stage-5 auto-schedule P2/P3, the `nextMeetingId` TOCTOU fix, CSP headers, and Proses-rail are non-AI/ML items; track them in their owning guide/plan/launch-gate docs, not this register.
