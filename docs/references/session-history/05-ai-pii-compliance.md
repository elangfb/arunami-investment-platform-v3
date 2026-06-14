<!-- DERIVED ARTIFACT — regenerate via the `mizan-knowledge-mining` skill; do not hand-maintain. -->
> **Type:** Living register (derived) · **Status:** Living register · **Last reviewed:** 2026.06.08
> **Provenance:** distilled from ~176 agent sessions (OMP + Claude Code + brainstorm) via the
> `mizan-knowledge-mining` skill. **Reads as:** how the project evolved + a doc-drift audit —
> NOT current-state truth. For what is true *now*: `docs/CURRENT-STATE.md`, `guides/`, `decisions/`.

# AI Assist, PII Masking & Compliance — consolidated knowledge

## Sub-topics

### 1. AI Advisory-Only Invariant

**The single non-negotiable rule across the entire codebase**: AI never decides, never authors gating values, never freezes decisions into signed documents. Stated in `docs/designs/ai-assist.md` as: "Menimbang & mengingat — tidak menyetir."

Concrete enforcement layers (all code-enforced, not prompt-only):
- `assertSafeTokens(tokens)` in `seed.ts` — rejects any fill that would write a gating key (`kol`, `dsr`, `ltv`) via AI path
- `scrubNarrative(output)` in `server/ai/narrative.ts` → `narrative-scrub.ts` — regex-strips any field carrying a verdict word (`DISETUJUI`/`BERSYARAT`/`DITOLAK`) or a risk-level word (`RENDAH`/`SEDANG`/`TINGGI`) before the output is used
- Adversarial unit tests added in batch-03 session b2cddd77 cover this
- AI output **as `aiRiskAdvisory`** only — never written to the authoritative `riskRecommendation` field; never frozen in the signed RSK PDF

Scoring is deterministic (not real LLM): `lib/scoring.ts`, Character←Kol, Capacity←DSR, Collateral←LTV, others via stable per-`app.id` jitter. The `ScoreOverview` subtitle at Stage 5 incorrectly said "AI menyusun draf skor" — this is a known UI copy bug (deferred fix, flagged F5).

### 2. AI Touchpoints (5C+1S draft, gap-detection, counter-offer, aiRiskAdvisory, bureauSummary, appraisal sanity-check)

**Phase A — RM@MUAP (Stage 1–3):**
- **OCR extract**: auto on every document upload via `extractAndStoreText()`, best-effort, never blocks upload
- **Bureau summary (`bureauSummary`)**: auto-generated on bureau data entry (SLIK + Pefindo). `server/ai/bureau.ts` orchestrates: mask-in → fail-closed residual backstop → infer via `inferenceProvider()` → audit row (`surface:'bureau'`) → unmask-out. Advisory only; Kol/stage-gating is always deterministic
- **Gap-flags**: passive/rule-based, `detectAnalysisGaps(app)` in `lib/analysis-assist.ts`; advisory only, labeled "Catatan untuk Ditinjau", never gating
- **Counter-offer**: auto-surfaces when hard-gate fails — computes a plafond/tenor combination that would pass DSR/LTV; displayed as suggestion, never applied automatically. Concept borrowed from kocek.ai
- **Deep research (RM-invoke)**: `runWebResearchAction`, gated `S3-LA`, rate-limited 3/min; `WEB_RESEARCH_PROVIDER` env (default `stub`; prod = SearXNG + Firecrawl OSS). Deterministic pipeline: plan → search → fetch → synthesize. Per-query PII gate via `lib/research/classifier.ts` — business-entity queries only, refuses any query naming an individual/NIK/phone
- **MUAP draft 5C+1S (RM-invoke)**: `buildAnalysisDraft(app)` auto-populates on Stage 3 entry; real LLM narrative via `POST /api/applications/[id]/analysis`

**Phase B — Risk stage:**
- **`aiRiskAdvisory`**: `server/ai/advisory-rec.ts`. AI risk recommendation shown as "Saran AI" next to (never inside) the `riskRecommendation` field. Never frozen into RSK PDF

**Other:**
- **Appraisal sanity-check**: auto when collateral value recorded; desk Appraisal
- **MoM (Rapat Komite minutes)**: explicitly NOT AI-assisted — chair records manually

### 3. Masking Seam: maskForEgress and detectResidualPii

**Primary module**: `lib/pii-mask.ts` (pure, unit-tested). Key exports:
- `maskForEgress(text, secrets)` — bracket+regex: replaces known name/NIK/phone/business-name with `[NASABAH]`/`[USAHA]`/`[NIK]`/`[USAHA]` tokens. Hardened in batch-07 session 0bfd861b with: (I1) case-insensitive known-value matching, (I2) regex tolerant of separators (phone with `-/space/+62`), (I3) fail-closed backstop (see below), (I4) token-level name masking
- `unmaskPii(maskedText, mapping)` — substitutes placeholders back with real values in system-authored output (MUAP/RSK docs get real names; AI never authored them)
- `detectResidualPii(text, secrets)` — post-mask check for surviving known PII; feeds `blockOnResidualPii()`

**`server/ai/redact.ts`**: contains `blockOnResidualPii()` and `activeRedactor()` (NER drop-in seam slot, unimplemented). All AI text-egress paths route through `maskForEgress` here.

**Mask-in/unmask-out pattern**: AI only receives `[NASABAH]`/`[USAHA]` tokens; system substitutes real values back from the masking mapping before writing to Google Doc or returning to client. Real names in MUAP/RSK are system-originated, NEVER AI-authored.

**Known limitation**: NER not built. Arbitrary free-text person names (in 5C narrative, analyst chat, OCR'd document text) reach Gemini unmasked. This is explicitly accepted residual risk in `docs/designs/pii-masking.md`.

### 4. Fail-Closed → Fail-Open Reversal + PII_RESIDUAL_BLOCK Toggle

**Original design**: residual backstop was fail-closed — if any known PII survived masking, the call was aborted and `log.error` was emitted.

**Reversal** (session S3 / batch-23, session `019e94fb`): user directed: "PII leaked to LLM should not trigger failure and block for now." Motivation: demo must not be blocked by PII detection misfires.

**Current state**: `PII_RESIDUAL_BLOCK` env var controls behavior:
- Unset (default) → **fail-OPEN**: logs `pii.residual_detected` (warn-level, types only, never values, `blocked:false`), proceeds
- `=1` → **fail-CLOSED**: old behavior (chat/advisory/bureau throw, narrative → `{}`, research → drop result)
- `.env.production.example` explicitly sets `PII_RESIDUAL_BLOCK=1`
- `.env.example` has it commented out (fail-open)

Applied to all 5 egress check sites:
- `server/ai/assistant.ts` (prompt + reply check)
- `server/ai/advisory-rec.ts` (prompt + reply check)
- `server/ai/bureau.ts`
- `server/ai/narrative.ts`
- `server/research/pipeline.ts`

No ADR written for this (policy is trivially reversible by env flip; failed ADR admission gate).

### 5. Research-Pipeline Corpus Leak Fix

**Bug**: `server/research/pipeline.ts` passed `buildCorpusPrompt(...)` straight to Gemini AND wrote the unmasked corpus to `AiInteraction.maskedPrompt` — the field name was a lie. This was the **only code-level PII leak** at session S3 time; all other AI text-egress paths already called `maskForEgress`.

**Fix** (session S3, commit `df79290`): `maskForEgress(buildCorpusPrompt(...), [])` inserted before both the model call and the audit write.

**Why `[]` for secrets**: `ResearchContext` deliberately omits the person name (queries are business-entity-only). The `namaUsaha` is the intended-egress subject; passing `[]` applies only the generic regex layer (NIK/phone/email patterns), not the person-name suppression.

**Fail-closed on residual** (research convention): return `[]` (empty results), never throw — separate from the `PII_RESIDUAL_BLOCK` toggle which was set to fail-open at the same session.

**Verification**: typecheck ✓, lint ✓ (0 errors), 32 masking unit tests ✓.

### 6. AiInteraction.maskedPrompt

**Prisma model** (`migration 20260524012559`):
```
AiInteraction {
  userId, appId, surface, maskedPrompt, maskedReply, model, timestamp
}
```

**`surface` valid values**: `'assistant'` (chat), `'advisory'` (aiRiskAdvisory), `'bureau'` (bureauSummary), `'narrative'` (MUAP/RSK drafter), `'research'` (web research).

**Invariant**: `maskedPrompt` field MUST NEVER hold raw PII. Was violated before session S3 in the research path (corpus written unmasked). Fixed.

**G3 audit gap**: `narrative.ts` had no per-call `AiInteraction` row until session d24cf23f (batch-15). Fix: `auditUserId` threaded + `recordAiInteraction` called in `runNarrative` with `surface:'narrative'`. Chat was audited from the start; narrative is now fixed.

**`recordAiInteraction` fail-open**: RESOLVED 2026.06.08 (human) — **fail-open / best-effort** is the policy (a failed audit write logs, never throws/discards the AI output). Code gap: `assistant.ts` / `advisory-rec.ts` still bare-`await` (fail-closed) pending alignment. See `docs/CURRENT-STATE.md`.

### 7. Vertex vs AI Studio (GEMINI_API_KEY Precedence, assertApacLocation APAC Guard, VERTEX_CREDENTIALS Chain)

**Runtime reality** (discovered session S3): the app ran on **AI Studio** (`GEMINI_API_KEY`), not Vertex AI. Prior docs claiming "Gemini via Vertex AI" were wrong.

**GEMINI_API_KEY precedence**: `gemini.ts` checks `GEMINI_API_KEY` first. While it is set, the AI Studio path is chosen — `assertApacLocation` never fires on this path. Must be cleared to activate Vertex.

**`assertApacLocation`**: throws if `GOOGLE_CLOUD_LOCATION` is not APAC (e.g. `us-central1`, `global`). Only called on the Vertex path (`createVertex`, `GoogleGenAI({vertexai:true})`). Fixed `.env.production.example` from `us-central1` to `asia-southeast1`.

**Vertex credential fallback chain** (post-session S3, commit `596c0b2`):
1. `VERTEX_CREDENTIALS` (base64 SA JSON, via `googleAuthOptions`)
2. `FIREBASE_SERVICE_ACCOUNT`
3. ADC

Mirrors `server/ocr/documentai.ts` Document AI loader exactly. SA `mizan-vertex@hijra-mizan.iam.gserviceaccount.com` created with `roles/aiplatform.user` only.

**Vertex API not enabled** on `hijra-mizan` as of session S3 (403 from `aiplatform.googleapis.com`). Vertex switch incomplete; deferred pending user-authorized `gcloud services enable`.

**Three separate Google credential systems** (documented `docs/guides/architecture.md`):
1. **Docs/Drive**: OAuth refresh-token (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`) — runtime-critical, not script-only, not replaceable by SA (SA has zero Drive quota)
2. **LLM**: `GEMINI_API_KEY` (AI Studio) OR `VERTEX_CREDENTIALS`/`GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION` (Vertex)
3. **Firebase Auth**: `FIREBASE_SERVICE_ACCOUNT`

### 8. NER Deferred

**Accept-A decision** (ratified in batch-07 session 0bfd861b by two humans simultaneously — the same human on both sessions): bracket+regex IS the V1 design. NER/G2/hallucinated-name-flagging/hash-pseudonymization = one coupled future-version package, not built separately.

**Rationale for bundling**: hash is only useful for multi-entity detection, which requires NER. NER requires: IndoBERT or similar (~110M params, ~100MB int8, CPU-class, ~30-50ms); Python sidecar (no good JS NER); domain fine-tuning; F2 eval harness; reopens the Accept-A joint decision.

**IndoBERT performance**: ~0.73 F1 on financial text (IPerFEX study); ~1-in-4 person mention missed. Bahasa names heavily overlap common words ("Budi" vs "Budidaya").

**Trigger for NER bundle**: F2 eval harness ready + platform decision settled + joint Accept-A reopened.

**Residual risk**: novel free-text person names typed into 5C narrative, analyst chat, OCR'd document text can reach Gemini unmasked. Documented in `docs/designs/pii-masking.md` "Known limitation" section.

**NER seam built** (`server/ai/redact.ts:activeRedactor()` swap point) as a drop-in stub — engine deferred, seam present.

### 9. OCR Egress Accepted Under DPA

**Document AI (prod OCR engine)** runs in Singapore (`asia-southeast1`) = cross-border PII. Accepted as "DPA egress" (not subject to `maskForEgress`). Gated on G5 DPA sign-off before real customer data.

**Gemini-vision (demo path)**: structured extraction via `generateObject`/Zod sends images to Gemini generative model. Deliberately bypasses masking (raw doc, not text). Production gate: DPA/compliance sign-off (G5). For demo with dummy data: safe.

**Rule**: numeric/gating fields (DSR/LTV/Kol, income, appraisal) must NEVER auto-confirm even at high confidence — VLMs show 28–34% numeric-hallucination on degraded scans. Auto-fill OK for low-stakes strings (nama/alamat). All OCR-suggested values require human confirmation before forward stage transition.

### 10. OJK/POJK-34-2025 and the Dec 2026 Deadline

**POJK 34/2025 §32(1)**: all code and infra must be on Bank premises in Indonesia (mentioned in early brainstorm sessions as the foundational constraint).

**UU PDP §56**: cross-border AI inference (e.g., Gemini in Singapore) requires DPA with AI provider + PII masking before every API call. Deadline: 17 Dec 2026.

**POJK 11/2022 Art. 35**: offshore processing = prior OJK approval (izin), ~3-month decision window. Commonly misread as just a reporting requirement. Validates the provider-boundary architecture (`OCR_PROVIDER`, `INFERENCE_PROVIDER` seams are the isolatable modules for the OJK permit application).

**In-region path by Dec 2026**:
- Vertex Jakarta does NOT guarantee in-country processing (ML processing = US/EU only)
- Bedrock Claude = global cross-region; only Amazon Nova runs in-region on `ap-southeast-3` Jakarta
- **Amazon Nova Pro on Bedrock `ap-southeast-3`** = pragmatic in-region managed path
- ⚠️ **Superseded (2026-06-03):** the Bedrock Nova plan was **dropped** — V1 consolidates on Google Cloud / Vertex (Gemini, Singapore) under the §56(b) DPA; in-region deferred, Bank decides posture by the deadline. Nova Jakarta is then **one option**, not the plan. See `../compliance.md`.
- Self-host (Qwen/Sahabat-AI on vLLM) = sovereignty option post-benchmark; TCO 5–15× more expensive
- `INFERENCE_PROVIDER` boundary (`server/ai/provider.ts`) was built for this swap — config flip, not rewrite

### 11. DPS Blessing / G5 Gate

**G5 gate**: DPA with LLM vendor (Gemini, Document AI, Drive, Docs, Nova). Bank Legal blocker; Discovery W1 required. Production AI blocked until resolved.

**DPS (Dewan Pengawas Syariah)**: always signs RSK on every deal, every application (final signer after CRO in the RSK approval ladder: RA → RO → CRO → DPS). This is distinct from G5. DPS = internal Syariah compliance review; G5 = external regulatory egress gate.

**Per session S2 (docs/designs/ai-assist.md)**: "Demo uses dummy data; production gated by G5/DPA + DPS blessing + POJK 34/2025 compliance."

**DPS desk (`dps-review`)**: real workstep, conditional gate (only when `rekomendasi_dps_or_tidak = yes` in MUAP T63). Added as `S5-DPS-REVIEW` desk concept in batch-12/13. Dual sign-off precedent from Stage 2 LG+RT.

### 12. Bureau AI Advisory-Only

`server/ai/bureau.ts` orchestrates the bureau summary:
1. `maskForEgress(bureauInput, secrets)` — mask-in
2. Fail-closed residual backstop (subject to `PII_RESIDUAL_BLOCK`)
3. `inferenceProvider()` call
4. `recordAiInteraction(appId, userId, 'bureau', maskedPrompt, maskedReply, model)`
5. `unmaskPii(output, mapping)` — unmask-out

`LoanApplication.bureauSummary: Json?` (Prisma migration `bureau_summary`). Kol/stage-gating remains deterministic. Bureau summary shown as advisory context, does not gate transitions or override hard-gate calculations.

### 13. recordAiInteraction Fail-Open (RESOLVED 2026.06.08)

Status: **RESOLVED 2026.06.08** (human decision) — `recordAiInteraction` is **fail-open / best-effort**: a failed DB write logs but never throws/discards the AI output. The counter-argument below won.

Agent position (never overridden): fail-closed (record failure should block returning AI output) for OJK audit trail defensibility — if a regulator asks "show me the masked prompt for this advisory", a missing row is a compliance gap.

Counter-argument (implicit in current behavior): audit failure is an infrastructure problem; blocking the user because the DB had a transient hiccup is bad UX.

Resolved by human decision 2026.06.08; recorded in `docs/CURRENT-STATE.md`. **No ADR** — reversible code policy, mirroring the PII-residual fail-open precedent (item 2). Code follow-up (deferred, tracked): `assistant.ts` / `advisory-rec.ts` still bare-`await` (fail-closed) and need wrapping in try/catch to match — plan `../../planning/ai-audit-fail-open-alignment.md`.

---

# AI Assist, PII Masking & Compliance — contradictions, reversals & evolution

## Timeline

**1. NER/masking mechanism: hash-pseudonym → bracket+regex → Accept-A**
- **EARLY (brainstorm, May 14–21)**: designed hash-pseudonyms (`DEBITUR_<hash>`, `PENGURUS_1`) + NER via Presidio/spaCy. GAP 5 in d9ebd10f batch-18: "AI Chat masking + audit log + 10-turn cap = V2 compliance debt." `// TODO (compliance, V2)` in `AIChatTab.tsx`.
- **INTERMEDIATE (batch-02 session d6396b01, May 21)**: app was built with bracket+regex only; no NER. Human ratification: "bracket+regex IS the V1 design; NER/G2/hallucinated-name-flagging deferred; residual risk accepted." `MASKING.md` rewritten (brainstorm NER spec was over-engineered vs actual schema). **RESOLVED** as Accept-A.
- **FINAL (batch-07 session 0bfd861b, May 24)**: both humans (same human, both sessions) ratified Accept-A again after user asked to "fix implementation to follow MASKING.md + flag hallucinations" — AI paused, explained Accept-A was already jointly ratified; user confirmed Accept-A stands. NER is a bundled future-version package.
- **Status**: RESOLVED. NER deferred. No reversal possible without reopening joint Accept-A decision.

**2. Residual PII backstop: fail-closed → fail-open**
- **EARLY (batch-07 to batch-15)**: all docs described residual backstop as fail-closed. `pii-masking.md`, `CURRENT-STATE.md`, `compliance.md`, AGENTS, env comments all stated fail-closed.
- **REVERSAL (session S3, 2026-06-04T23, commit `df79290`)**: user directive: "PII leaked to LLM should not trigger failure and block for now." `blockOnResidualPii()` helper added, `PII_RESIDUAL_BLOCK` env var introduced. All 5 egress sites flipped to fail-open default. All docs updated.
- **Status**: RESOLVED. Fail-open by default; `PII_RESIDUAL_BLOCK=1` for production.

**3. Research-pipeline corpus: unmasked → masked**
- **EARLY (batches 10–15, through ~May 31)**: `server/research/pipeline.ts` called `buildCorpusPrompt()` directly without `maskForEgress`. `AiInteraction.maskedPrompt` written with unmasked corpus.
- **FIX (session S3, 2026-06-04T23, commit `df79290`)**: `maskForEgress(buildCorpusPrompt(...), [])` inserted before model call and audit write. The field now holds actually-masked corpus.
- **Status**: RESOLVED.

**4. Gemini via Vertex AI (claimed) vs AI Studio (actual)**
- **EARLY through OMP era start**: `pii-masking.md`, `CURRENT-STATE.md`, `layanan-eksternal.md` all stated inference backend = Vertex AI. `assertApacLocation` was thought to enforce this.
- **DISCOVERY (session S3, 2026-06-04T23)**: probed live. `GEMINI_API_KEY` is present → AI Studio path chosen silently; `assertApacLocation` never fires. App was NEVER on Vertex at runtime.
- **FIX (session S3, commit `596c0b2`)**: `VERTEX_CREDENTIALS` fallback chain wired; `assertApacLocation` footgun fixed (`us-central1` → `asia-southeast1` in `.env.production.example`); `architecture.md` credential-boundary documented. Docs corrected.
- **Status**: RESOLVED (doc correction). Vertex switch still incomplete pending API enable on `hijra-mizan` project. `GEMINI_API_KEY` precedence is an ongoing operational risk if the Vertex migration is done incorrectly.
- **`[VERIFY-DOC]`**: confirm `pii-masking.md` and `CURRENT-STATE.md` now correctly reflect AI Studio as current inference backend, Vertex as the planned path.

**5. G3 narrative audit gap: no audit → audited**
- **EARLY (batch-03 through batch-15 session d24cf23f)**: `narrative.ts` called `maskForEgress` but never `recordAiInteraction`. Chat/advisory/bureau were audited; MUAP/RSK drafter had no per-call audit row. `workflow-finetune.md §0` overclaimed "SHIPPED" on G3 when narrative path was unaudited.
- **FIX (batch-15 session d24cf23f, commit `0b624f6`)**: `auditUserId` threaded into `runNarrative`; `recordAiInteraction` called with `surface:'narrative'`. New `narrative` surface added to `AiInteraction.surface` schema comment.
- **Status**: RESOLVED. Narrative path now audited. G3 audit is **fail-open by decision** (best-effort; see item 8) — a failed audit write does not block egress.

**6. `wrapLanguageModel` middleware seam: planned → never built**
- **EARLY (batch-10 session 52d36006, May 25)**: `INFERENCE_PROVIDER` boundary designed with `wrapLanguageModel` middleware as "single seam for mask-in/unmask-out/audit/retry."
- **INTERMEDIATE**: `workflow-finetune.md §16.3` asserted "single middleware seam" built.
- **DISCOVERED (batch-15 session d24cf23f)**: "`wrapLanguageModel` 'single middleware seam' was **never built** — masking/audit/retry are caller-invoked shared helpers (`redact.ts`/`audit.ts`). Functionally compliant; architectural claim is false."
- **Status**: OPEN/RESOLVED ambiguously. Functionally equivalent (all paths do call the helpers), but the architectural claim of a single centralized middleware is wrong. No ADR written. The `activeRedactor()` seam in `redact.ts` is the closest thing.

**7. OCR provider for egress compliance: Gemini-vision → Document AI**
- **EARLY (batch-01, May 18)**: OCR implemented with Gemini multimodal vision. "Gemini-as-OCR defeats the compliance architecture" — using Gemini for full OCR sends raw docs to the generative model.
- **FIX (batch-09 session bdf4967f, May 25)**: Google Document AI chosen. Decisive reasons: (a) no hallucination (not generative), (b) per-token confidence scores, (c) better DPA/compliance posture — dedicated processor vs generative model's weaker DPA story.
- **Status**: RESOLVED. Document AI = prod engine; Gemini-vision remains as "demo path" via `OCR_PROVIDER=gemini`.

**8. recordAiInteraction: fail-closed proposed → fail-open decided**
- **EARLY (session S1 `019e8bf3`, 2026-06-03)**: "AI audit fail-closed left as an open human decision."
- **RESOLVED (2026.06.08)**: human chose **fail-open** for now; the agent's fail-closed lean was not adopted.
- **Status**: RESOLVED. Fail-open is the policy (`docs/CURRENT-STATE.md`); 2 surfaces (`assistant` / `advisory`) still fail-closed in code pending alignment. No ADR (reversible code policy).

**9. DPS model: conditional → always**
- **EARLY (GLOSSARY ~May 30, plan Jun 01)**: DPS = conditional Stage-5 sign-off only on flagged deals
- **REVERSAL (session D2/S2, 2026-06-03/04)**: brainstorm 06-03 commits confirmed DPS always signs RSK per-deal. Applied to GLOSSARY, CURRENT-STATE, `workflow-rm-maker-checker.md`
- **Status**: RESOLVED. DPS = final signer on every RSK (after CRO).

**10. AI 5C+1S auto-draft: static boilerplate → data-driven → real LLM**
- **EARLY (batch-01 session d9ebd10f, May 18)**: `buildAnalysisDraft(app)` deterministic, no real LLM. Advisory only. Gap-flagger ephemeral in V1 (`// TODO (compliance, V2)` to log runs).
- **INTERMEDIATE (batch-03 session b2cddd77, May 22)**: real Gemini (`generateAnalysis` → `POST /api/applications/[id]/analysis`); scores stay deterministic (`generateAspectScores`).
- **CURRENT**: real LLM via `inferenceProvider()` for narrative; deterministic for scores; AI output persists to `analysis.*` app-side only, never authoritative RSK recommendation.
- **Status**: RESOLVED (multiple evolution stages; current state is settled).

**11. `assertSafeTokens` gating-field protection**
- **EARLY (batch-03)**: added as adversarial unit tests for `scrubNarrative`.
- **V3 doc-gen (session S6/batch-23)**: `assertSafeTokens` explicitly verified present in V3 `fillApplicationDoc` — gating tokens (`kol`, `dsr`, `ltv`) never AI-written across all doc-gen versions.
- **Status**: RESOLVED. Invariant held across V1→V2→V3 doc-gen migrations.

**12. V2 doc-gen CURRENT-STATE overstatement**
- **CLAIMED**: `CURRENT-STATE.md` stated "MUAP/RSK docs — done — auto-seed on create" and "Document system — shipped 2026.06.04 … one-way NamedRange fill activated"
- **REALITY (session S6, 2026-06-08)**: `seedApplicationDocV2` had one commit (`f90d409`) and was never imported. `createApplicationDocs` ran V1 throughout. The "activated" claim was based on a manual throwaway-copy OAuth test, not the production path.
- **FIX**: corrected in session S6 (`e98e0fc`); V3 then wired (`9538bef`).
- **Status**: RESOLVED (corrected + V3 wired).

**13. `assertApacLocation` footgun in production config**
- **EARLY**: `.env.production.example` had `GOOGLE_CLOUD_LOCATION=us-central1` — would be rejected by APAC guard
- **FIX (session S3, commit `df79290`)**: corrected to `asia-southeast1`
- **Status**: RESOLVED.
