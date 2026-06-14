# MIZAN — PII Masking Layer

- **Type:** design blueprint (built) · **Status:** Built (core) · **Last reviewed:** 2026.06.04
- **Provenance:** merged from `brainstorm/MASKING.md` (retired). Regulatory "why" = `../references/compliance.md`.
- **Used by:** `lib/pii-mask.ts` (`maskPii`/`unmaskPii`), AI surfaces (`server/ai/*`).
- **Review trigger:** if NER/G2 is revisited (currently deferred, accepted residual risk).

> **Reconcile:** describes the shipped mask-in/unmask-out (bracket+regex) layer + residual backstop (fail-OPEN by default, fail-closed via `PII_RESIDUAL_BLOCK=1`); NER deferred. Live status in `../CURRENT-STATE.md`.

> Engineering detail for the compliance requirements in [COMPLIANCE.md](../references/compliance.md). **Mandatory, not optional.** Build status: [BUILD-STATE.md](../CURRENT-STATE.md) (gate G1).

## Why it exists

UU PDP §56 + Bank §4.1 + Bank §1.1 (AI security module): every AI call to an external generative model (**Gemini 3.5 Flash via Google Cloud Vertex AI**) **must strip or substitute PII** before it leaves Bank infra. No raw structured identifiers to the model.

**Two external service boundaries, different compliance bases:**
- **Google Document AI** (OCR, dedicated processor, `asia-southeast1`) — receives **raw documents** (KTP, financial statements); DPA-scoped dedicated processor, NOT a generative model. OCR text output is then passed through `maskPii` before being fed downstream.
- **Gemini** (generative) — receives only **masked text**; DPA + mandatory masking. Full-document OCR text now feeds in as narrative grounding (see Known Limitation below for the expanded surface acceptance).

## The model: mask-in / unmask-out (bracket + regex)

> Decision (human-ratified 2026-05-25): the **bracket-per-field placeholder** model is the masking design. It **supersedes** the earlier hash-pseudonym scheme (`DEBITUR_<hash>`, `PENGURUS_1`, `NOTARIS_A`) — there is no multi-entity numbering, because the data model has no pengurus/notaris/guarantor structured fields, only the **debitur** (`nasabahName`) and the **usaha** (`namaUsaha`).

Two layers, both deterministic, both run on Bank infra (`lib/pii-mask.ts` — `maskPii` / `unmaskPii`):

1. **Known structured fields → fixed bracket tokens:**
   `nasabahName → [NASABAH]`, `namaUsaha → [USAHA]`, `nik → [NIK]`, `phoneNumber`+`whatsappNumber → [TELEPON]`.
2. **Generic regex over any text → same tokens:** 16-digit NIK → `[NIK]`, Indonesian mobile → `[TELEPON]`, email → `[EMAIL]`.

### Two AI paths, deliberately asymmetric

| Path | mask-in | unmask-out | Why |
|---|---|---|---|
| **Narrative / doc-seed** (analysis, MUAP) | ✅ | ✅ `unmaskPii` restores real values | The document must carry the real name — restored **by the system**, never authored by the model |
| **Chat assistant** | ✅ | ❌ reply stays masked | A chat answer doesn't need real PII; it stays redacted |

Egress coverage is **complete across every AI text path** — all route through the single
`maskForEgress` seam (`server/ai/redact.ts`) and fail closed on residual: narrative, 5C
analysis, chat assistant, advisory-rec, bureau summary, **and web-research synthesis**. The
research path masks the fetched-page corpus with the generic regex layer (no per-app secrets —
`ResearchContext` deliberately omits the person name, and `namaUsaha` is the intended-egress
search subject), catching stray NIK/phone/email/NPWP in third-party page text before it reaches
Gemini; queries are separately constrained to business-only by `lib/research/classifier.ts`.

### Robustness + residual backstop (built)

- **Tolerant known-value matching** — case-insensitive + whitespace-tolerant (so `BUDI SANTOSO` doesn't leak); **token-level person-name masking** (≥4 chars, person names only — not business), boundary-aware so `Budi` ≠ `Budidaya`; catches `Pak Budi` / `Santoso`.
- **Tolerant pattern matching** — separator-tolerant phone (`+62` / dashed / landline), grouped NIK, NPWP; leading-0 landline handling so rupiah amounts are never masked.
- **Residual backstop (configurable policy)** — `detectResidualPii()` runs on BOTH the outgoing prompt AND the model reply and logs leaked *types* only, never values (`pii.residual_detected`). The **reaction** is policy, set by `blockOnResidualPii()` (`server/ai/redact.ts`):
  - **Default = fail-OPEN** (`PII_RESIDUAL_BLOCK` unset): log the residual but still egress the already-masked text, so an imperfect mask never blocks a demo/feature. Decided 2026.06.04 (human-directed: keep Mizan presentable). **Masking itself is unchanged** — only the backstop softens.
  - **fail-CLOSED** (`PII_RESIDUAL_BLOCK=1`): narrative → deterministic fallback `{}`, research → drop the pass, chat/advisory/bureau → throw. **Required for prod handling real customer data (G2/G5, OJK + UU PDP).**

## Hard rules (codified)

1. **AI never authors risk LEVELS or the RECOMMENDATION.** Structurally enforced: the response schema has no level/recommendation field (the model *cannot* return one); the system instruction forbids them; `scrubNarrative()` drops any field that smuggles a risk-level/verdict and falls back to the deterministic narrative.
2. **AI never authors customer NAMES.** It never receives them (masked in); real names in output are **system-restored** via `unmaskPii`, never model-generated.
3. **Known structured identifiers (NIK / phone / email) never leave Bank infra in raw form** — the regex layer substitutes them to brackets.

## ⚠️ Known limitation (V1, accepted residual risk)

**No NER.** There is no Presidio/spaCy/NER layer. Known values and detectable patterns (NIK, phone, email, NPWP) are masked — and hardened (above) — but an **arbitrary unknown person-name in free text** (one that is neither a known value nor a detectable pattern: e.g. a third party named only in the 5C narrative, analyst chat, or OCR'd text) is **not** redacted. The fail-closed `detectResidualPii()` backstop *narrows* this (it catches detectable residual PII before egress) but does not eliminate it — a genuinely novel name without a pattern still needs NER to catch. Relatedly, **hallucinated names are not flagged**.

**Two distinct acceptances — recorded separately:**

**Acceptance A — original G2 deferral (2026-05-25, human-ratified):** Covers structured narrative fields + analyst chat — a bounded, relatively small surface. Residual risk: novel pattern-less name in the structured narrative or chat reaches Gemini.

**Acceptance B — OCR grounding widening (2026-05-25, human-ratified, NEW):** Full-document OCR text (KTP, financial statements) is now masked and fed as grounding into MUAP/RSK narrative. This is **~100× larger surface** than Acceptance A. Residual risk: document text may contain third-party names not in the known-value list and not matching any regex pattern — these can reach Gemini. NER/DLP deferred. The same compensating controls apply; one additional prod condition: **G5 DPA signed + Bank-Legal sign-off** before real customer documents are processed.

**Compensating controls (both acceptances):** hardened known-value + pattern masking; fail-closed backstop on prompt + reply; risk-levels/recommendation structurally blocked (hard rule 1); G5 DPA gating lawful egress.

## Deferred to a future version — one coupled package

These four ship together (or not at all) — they're interdependent, not separate items:

- **NER (Presidio sidecar or equivalent)** — detect unstructured person/org names in free text before egress.
- **Pre-flight kill-switch (G2)** — block any AI call where an unmasked name slips through.
- **Hallucinated-name flagging** — flag any name in model output not present in the mapping.
- **Hash / numbered pseudonym scheme** (`DEBITUR_<hash>`, `PENGURUS_1`, `NOTARIS_A`).

**Why coupled:** a numbered pseudonym only matters when there are *multiple same-type entities* in free text, and detecting those needs NER — so no hash without NER. Today the data model has a single debitur + single usaha, so every `[NASABAH]` collapses to one canonical name on unmask (correct, unit-tested). No hash now (YAGNI).

## Data flow (narrative / doc-seed call)

```
Raw documents (KTP, financial statements, etc.)
        ↓
Google Document AI (OCR — DPA-scoped dedicated processor, asia-southeast1)
        ↓  ← raw PII enters here; DPA is the compliance basis for this leg
OCR text (may contain raw names, NIK, addresses, etc.)
        ↓
Assemble payload from app + OCR text + structured fields
        ↓
maskPii  → known fields → [NASABAH]/[USAHA]/[NIK]/[TELEPON]
         → regex over text → [NIK]/[TELEPON]/[EMAIL]
        ↓                    (no NER → free-text names NOT caught — see Acceptance B)
HTTPS → Gemini (narrative + OCR grounding)
        ↓
scrubNarrative → drop any smuggled risk-level/recommendation
        ↓
unmaskPii → system restores real values into the document
        ↓
Render to analyst
```

(Chat path: no OCR grounding; identical from masking through the model; reply left masked — no `unmaskPii`.)

OCR gate inputs (Kol/income/obligations/appraised value) go through `ocr_suggested → human-confirm` UX before any gate computation — human remains in the loop; DSR/LTV/Kol are deterministic, never AI-authored.
