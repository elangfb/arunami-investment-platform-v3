import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import { withRetry } from '@/server/retry'
import { log, errField } from '@/server/log'
import type { OcrProvider, OcrInput, OcrSuggestion } from './provider'

// Google Document AI OCR provider — the PRODUCTION OCR engine.
//
// Why this over the Gemini provider: Document AI is a DEDICATED processor, not a generative
// model. It transcribes what's on the page (no hallucinated NIK/figures), returns per-token
// CONFIDENCE we can gate on, and is the more defensible PII posture (DPA-scoped, regional
// endpoints — pick `eu` to help the in-region-inference deadline). The raw document goes to a
// scoped OCR service, never to the generative model; only the masked text reaches Gemini
// downstream (narrative.ts mask-in/unmask-out).
//
// Scope NOW: the GENERAL "Document OCR" processor — full-text transcription for every doc kind,
// plus gate inputs (NIK, Kol, income, appraisal) pulled from that text by regex.
// FUTURE (2c) — when regex is unreliable on real scans, upgrade to typed structured extraction:
//   • Custom Extractor (trained) → KTP fields + P&L net income (NO pre-trained Indonesian KTP/ID
//     processor exists — Document AI's ID parsers are US-only).
//   • Form Parser → SLIK tables, slip gaji, appraisal line items.
// Drop-in siblings via the OcrProvider boundary (no call-site changes). Full path + trigger +
// steps: docs/guides/document-ai-ocr.md → "2c upgrade path".
//
// Auth/config (all env, value-based — mirrors FIREBASE_SERVICE_ACCOUNT, no filesystem paths):
//   DOCUMENTAI_PROJECT_ID    — GCP project id
//   DOCUMENTAI_LOCATION      — processor region: 'us' or 'eu'
//   DOCUMENTAI_PROCESSOR_ID  — the Document OCR processor id
//   DOCUMENTAI_CREDENTIALS   — base64 of the service-account JSON (Document AI User role).
//                              If unset, falls back to ADC (GOOGLE_APPLICATION_CREDENTIALS).

interface DocAiConfig {
  projectId: string
  location: string
  processorId: string
}

function readConfig(): DocAiConfig {
  const projectId = process.env.DOCUMENTAI_PROJECT_ID
  const location = process.env.DOCUMENTAI_LOCATION
  const processorId = process.env.DOCUMENTAI_PROCESSOR_ID
  if (!projectId || !location || !processorId) {
    throw new Error(
      'Document AI not configured: set DOCUMENTAI_PROJECT_ID, DOCUMENTAI_LOCATION, DOCUMENTAI_PROCESSOR_ID.',
    )
  }
  return { projectId, location, processorId }
}

// Lazy singletons — built on first use so `next build` / env-less contexts never construct a
// client (matches the lazy server-secret rule in the deployment runbook).
let _client: DocumentProcessorServiceClient | null = null
let _name: string | null = null

function clientAndName(cfg: DocAiConfig): { client: DocumentProcessorServiceClient; name: string } {
  if (!_client) {
    // Credentials: a dedicated DOCUMENTAI_CREDENTIALS (base64 SA JSON) wins; else reuse the
    // same-project FIREBASE_SERVICE_ACCOUNT (both are hijra-mizan) — that SA just needs the
    // `roles/documentai.apiUser` grant; else fall back to ADC. Prod can use a dedicated SA.
    const b64 = process.env.DOCUMENTAI_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT
    const credentials = b64 ? JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) : undefined
    _client = new DocumentProcessorServiceClient({
      apiEndpoint: `${cfg.location}-documentai.googleapis.com`,
      ...(credentials ? { credentials } : {}), // else Application Default Credentials
    })
  }
  if (!_name) _name = _client.processorPath(cfg.projectId, cfg.location, cfg.processorId)
  return { client: _client, name: _name }
}

// One processDocument call → { full text, mean token confidence }. Throws on failure; callers
// wrap in try/catch so a failure degrades to null (upload never breaks).
async function runOcr(bytes: Buffer, mimeType: string): Promise<{ text: string; confidence: number | null }> {
  const cfg = readConfig()
  const { client, name } = clientAndName(cfg)
  const [result] = await withRetry(
    () =>
      client.processDocument({
        name,
        rawDocument: { content: bytes, mimeType },
        processOptions: { ocrConfig: { enableNativePdfParsing: true } },
      }),
    { label: 'documentai.processDocument' },
  )
  const doc = result.document
  const text = (doc?.text ?? '').trim()
  // Mean per-token confidence across pages — a non-PII signal for gating/logging.
  let sum = 0
  let n = 0
  for (const page of doc?.pages ?? []) {
    for (const tok of page.tokens ?? []) {
      const c = tok.layout?.confidence
      if (typeof c === 'number') {
        sum += c
        n += 1
      }
    }
  }
  return { text, confidence: n ? sum / n : null }
}

function nikFromText(text: string): string | null {
  // Exact 16-digit token first; then a separator-tolerant fallback (NIK is often spaced/dashed).
  const exact = text.match(/\b\d{16}\b/)
  if (exact) return exact[0]
  const loose = text.match(/\d[\d\s.-]{14,}\d/)
  if (loose) {
    const digits = loose[0].replace(/\D/g, '')
    if (digits.length >= 16) return digits.slice(0, 16)
  }
  return null
}

export function documentAiProvider(): OcrProvider {
  return {
    name: 'documentai',
    // KTP → NIK, read from the OCR text (general processor). Other doc kinds: null for now —
    // their structured fields are the specialized-parser future improvement noted above.
    async extract({ docKind, bytes, contentType }: OcrInput): Promise<OcrSuggestion | null> {
      if (docKind !== 'ktp') return null
      try {
        const { text, confidence } = await runOcr(bytes, contentType)
        const nik = nikFromText(text)
        if (!nik) return null
        if (confidence != null && confidence < 0.7) {
          log.warn('ocr.documentai_low_confidence', { docKind, confidence: Math.round(confidence * 100) / 100 })
        }
        return { field: 'nik', label: 'NIK', value: nik }
      } catch (e) {
        log.warn('ocr.documentai_failed', { docKind, ...errField(e) })
        return null
      }
    },
    // Full-document transcription for any doc kind. Best-effort: failure → null.
    async extractFullText({ docKind, bytes, contentType }: OcrInput): Promise<string | null> {
      try {
        const { text, confidence } = await runOcr(bytes, contentType)
        if (confidence != null && confidence < 0.7) {
          log.warn('ocr.documentai_low_confidence', { docKind, confidence: Math.round(confidence * 100) / 100 })
        }
        return text || null
      } catch (e) {
        log.warn('ocr.documentai_fulltext_failed', { docKind, ...errField(e) })
        return null
      }
    },
  }
}
