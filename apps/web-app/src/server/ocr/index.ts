import 'server-only'

import type { OcrProvider } from './provider'
import { stubOcrProvider } from './stub'
import { geminiVisionProvider } from './gemini-vision'
import { documentAiProvider } from './documentai'

export type { OcrProvider, OcrInput, OcrSuggestion, OcrDocKind } from './provider'

// Provider registry. Add a backend (local model, …) by implementing OcrProvider and adding a
// line here — no call-site changes. Selection is env-only via OCR_PROVIDER.
//   stub       — offline fabrication; default for dev/test/CI (no credentials, no egress)
//   documentai — PRODUCTION engine: dedicated OCR processor, confidence scores, DPA posture
//   gemini     — interim cloud OCR (generative; sends raw image to the model)
const PROVIDERS: Record<string, () => OcrProvider> = {
  stub: stubOcrProvider,
  documentai: documentAiProvider,
  gemini: geminiVisionProvider,
  // local: localOcrProvider,          // drop-in: self-hosted model, zero egress (later)
}

/** The active OCR provider — `OCR_PROVIDER` (default 'stub', the offline fabrication). */
export function ocrProvider(): OcrProvider {
  const name = process.env.OCR_PROVIDER?.trim() || 'stub'
  const make = PROVIDERS[name]
  if (!make) throw new Error(`Unknown OCR_PROVIDER '${name}'. Known: ${Object.keys(PROVIDERS).join(', ')}.`)
  return make()
}
