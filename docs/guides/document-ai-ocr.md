# Document AI OCR — setup guide

Mizan's production OCR engine is **Google Document AI** (`server/ocr/documentai.ts`), selected
with `OCR_PROVIDER=documentai`. It's a *dedicated* OCR processor — it transcribes the document
(no hallucinated NIK/figures), returns per-token confidence, and keeps the raw document off the
generative model. Only the masked text reaches Gemini downstream (`server/ai/narrative.ts`).

The default everywhere else is `stub` (offline fabrication, no credentials, no egress) so
dev/test/CI need no setup. This guide is only for enabling the real engine.

## What you set up in GCP (one time)

1. **Enable the API.** GCP console → *APIs & Services* → enable **Cloud Document AI API**
   (in the project you want billed).
2. **Create the processor.** Document AI → *Processors* → *Create processor* →
   **Enterprise Document OCR** (the general OCR processor). Pick a **region**:
   - `asia-southeast1` (Singapore) — **recommended for Mizan**: nearest region to Indonesia,
     best data-residency + latency for an Indonesian/OJK context. (No Document AI in Jakarta.)
   - `eu` / `us` — also valid, but ship data out of the Asian region (worse residency story here).
   Copy the **Processor ID** (and remember the region) from the processor's detail page.
3. **Create a service account.** IAM & Admin → *Service Accounts* → create one →
   grant the role **Document AI API User** (`roles/documentai.apiUser`) → *Keys* →
   *Add key* → JSON → download the key file.
4. **Base64 the key** (value-based config, no file paths in the app):
   ```bash
   base64 -w0 ~/Downloads/sa-key.json     # macOS: base64 -i sa-key.json
   ```

## What you put in `apps/web-app/.env.local`

```bash
OCR_PROVIDER=documentai
DOCUMENTAI_PROJECT_ID=your-gcp-project-id
DOCUMENTAI_LOCATION=asia-southeast1    # must match the processor's region
DOCUMENTAI_PROCESSOR_ID=xxxxxxxxxxxxxxxx
DOCUMENTAI_CREDENTIALS=<paste the base64 string from step 4>
```

**Credentials resolution** (first that's set wins): `DOCUMENTAI_CREDENTIALS` → the same-project
`FIREBASE_SERVICE_ACCOUNT` (already in `.env.local` — just grant that SA `roles/documentai.apiUser`)
→ Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` / workload identity). For
local dev the simplest path is to reuse the Firebase SA; production can use a dedicated SA.

## Verify

Restart `pnpm dev`, upload a KTP in Stage 1, and confirm the suggested NIK reflects the real
card (not the stub's fabricated value). Low-confidence pages log `ocr.documentai_low_confidence`
(a number only — never PII).

## Cost & limits

Document AI bills **per page**. The Document OCR processor has per-request page limits; very
large PDFs may need batch processing (not wired — current path is synchronous `processDocument`).

## 2c upgrade path — structured extraction when regex isn't enough

Today the engine is the **general Enterprise Document OCR** processor: it returns full text, and
the **gate inputs** (NIK, Kol, income, appraised value) are pulled from that text by *regex*
(`parseGateValueFromText` in `lib/ocr.ts`; NIK regex in `server/ocr/documentai.ts`). That regex is
deterministic and conservative, and the **human-confirm step is the safety net** — but it is
**format-fragile** on real, varied, scanned Indonesian documents (especially P&L statements and
SLIK tables). "2c" is the planned upgrade to **typed structured extraction**.

### When to trigger it

Upgrade when a real-document eval shows the regex path is unreliable — concretely:
- field accuracy below your bar on a sample of real scanned KTP / SLIK / slip / financials, **or**
- frequent low-confidence pages (watch the `ocr.documentai_low_confidence` log; Document AI returns
  per-token confidence), **or**
- a doc type whose value isn't a single labelled line (a P&L net-income figure is *derived*, not
  printed as "laba bersih: Rp X" — exactly where regex breaks).

Clean rendered text (and the dev dummy docs) OCR near-perfectly, so don't trigger on those — trigger
on **real scans**.

### The options, in order of effort

1. **Form Parser** (no training, ~$30 / 1,000 pages) — returns generic key-value pairs + tables.
   Good first step for SLIK tables and slip gaji where the value sits in a labelled field/cell.
2. **Custom Extractor** (train on labelled samples, ~$10–30 / 1,000 pages + ~$0.05/hr hosting) —
   define the exact fields and fine-tune on real Indonesian KTP / SLIK / financial statements.
   This is the **defensible production answer** for ID/PII docs and for derived figures (P&L income),
   and gives per-field confidence to gate on.
3. **Different vendor** (AWS Textract, Azure Document Intelligence) — only if Google specifically
   underperforms on Indonesian docs. Same provider-boundary swap.
4. **Local / on-prem** (PaddleOCR, DocTR, deepdoctection) — when the driver is *residency* (data must
   not leave Indonesia / the 17 Dec 2026 in-region deadline) or cost at very high volume, not accuracy.

> **No pre-trained Indonesian KTP processor exists** — Document AI's identity parsers are US-only.
> KTP typed fields therefore require a **Custom Extractor**, not a pre-built one. (Earlier notes that
> said "Identity Document processor for KTP" were wrong.)

### How to implement (boundary makes it a drop-in)

The `OcrProvider` interface (`server/ocr/provider.ts`) is the seam — **no call-site changes**:

1. **GCP:** create the Form Parser / Custom Extractor processor (train + deploy a version for Custom);
   note its processor ID + region.
2. **Provider:** either add a sibling file (e.g. `server/ocr/documentai-forms.ts` implementing
   `OcrProvider`) and register it in `server/ocr/index.ts`, **or** extend `documentai.ts` to call the
   structured processor and map its `document.entities` → typed values. Reuse the existing
   `DocumentProcessorServiceClient`, `withRetry`, and base64-SA credential resolution.
3. **Map outputs → gate inputs:** have the provider's `extract()` return the typed field as an
   `OcrSuggestion`, and have the upload actions consume it **instead of** `parseGateValueFromText`
   for that doc kind. Keep `applyGateSuggestion`'s field routing; the only change is the *source* of
   the value (typed entity vs regex over OCR text).
4. **Keep invariants:** still `ocr_suggested` → human confirms; DSR/LTV/Kol still computed
   server-side; AI never auto-applies; full text still masked before any Gemini egress.
5. **Env:** add `DOCUMENTAI_*_PROCESSOR_ID` per processor (the boundary can route per doc kind).

### Measure before/after

Use `pnpm verify:documentai <path/to/real-doc>` to compare extracted values against ground truth on
real samples, before committing to (and paying for) a Custom Extractor. Decide per doc kind — you can
run general OCR for narrative full-text and a Custom Extractor only for the high-value gate fields.

## Compliance note

Full-document text is the densest free-text PII surface in the app, and current masking is
known-fields + regex only (no NER/DLP — deferred). Sending OCR'd full text into narrative
drafting widens the Gemini egress surface and is gated on human + Bank-Legal/DPA sign-off (G5).
See `server/ai/narrative.ts` (mask-in/unmask-out) and the masking decision record.
