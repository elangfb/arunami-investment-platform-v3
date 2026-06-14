import type { LoanApplication } from '@/lib/types'
import type { OcrExtraction } from '@/lib/ocr'

// Swappable OCR provider boundary. Like the S3 client (server/storage/s3.ts), the engine is an
// env/credential choice — NOT a code change: the app depends only on this interface, so moving
// from the fabricated stub → an external model (Gemini vision, Google Document AI) → a LOCAL
// model is `OCR_PROVIDER=<name>` + that provider's config. Add a provider = implement this
// interface and register it in index.ts. The "OCR suggests, human confirms" UX is unchanged
// downstream, so a wrong extraction never silently becomes credit data.

// Doc kinds that extract() produces a structured FIELD for. Full-text OCR (extractFullText)
// works for ANY uploaded document, so OcrInput.docKind is a plain string.
export type OcrDocKind = 'ktp' | 'slik_report' | 'slip_gaji' | 'appraisal_agunan' | 'laporan_keuangan'

/** One extracted field suggestion (reuses the existing in-app shape). */
export type OcrSuggestion = OcrExtraction

export interface OcrInput {
  /** The document's docType. extract() acts only on known OcrDocKind values; extractFullText
   *  transcribes any document regardless of kind. */
  docKind: string
  /** Raw stored bytes of the document (image/PDF). The stub ignores these; real providers read them. */
  bytes: Buffer
  contentType: string
  /** Application context — the stub derives its fabricated values from this. */
  app: LoanApplication
}

export interface OcrProvider {
  readonly name: string
  /** Extract a field suggestion, or null if this provider can't read this doc kind. Never throws
   *  fatally for the caller — a failure returns null so upload never breaks (best-effort). */
  extract(input: OcrInput): Promise<OcrSuggestion | null>
  /** Transcribe the WHOLE document to plain text (not one field), or null if unavailable.
   *  Feeds richer grounding into MUAP/RSK narrative drafting (server/ai/narrative.ts) — the
   *  text is masked (mask-in/unmask-out) before any egress to the generative model, exactly
   *  like the structured prompt. Best-effort: a failure returns null so upload never breaks.
   *  Optional so a provider can implement field extraction without full text.
   *
   *  PII NOTE: full-document text is the densest free-text PII surface in the app. Current
   *  masking is known-fields + regex only (NO NER/DLP — deferred to a later phase), so the
   *  text carries an ACCEPTED residual-PII risk on egress. Revisit when NER/DLP lands. */
  extractFullText?(input: OcrInput): Promise<string | null>
}
