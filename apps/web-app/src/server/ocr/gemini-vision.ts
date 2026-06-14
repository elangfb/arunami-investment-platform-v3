import { Type, type Schema } from '@google/genai'
import { generateStructuredFromImage, generateTextFromImage } from '@/server/ai/gemini'
import { getActivePrompt } from '@/server/config/ai-prompts'
import { log, errField } from '@/server/log'
import type { OcrProvider, OcrSuggestion } from './provider'

// External OCR via Gemini multimodal. The stored document image/PDF is sent to the model
// (PII egress — only reached when OCR_PROVIDER=gemini is deliberately set; egress ruling
// 2026-05-24). Best-effort: any failure logs + returns null so the upload never breaks. The
// suggestion still flows through the "ocr_suggested → human confirms" UX, so a misread is caught.
//
// Compliance note: this is a GENERATIVE model reading an ID. Google Document AI (a dedicated
// processing API) is the more defensible posture for production ID/PII docs — it's a drop-in
// sibling provider (implement OcrProvider, register as 'documentai'). Gemini is the first
// external impl because the client already exists here.

const NIK_SCHEMA: Schema = { type: Type.OBJECT, properties: { nik: { type: Type.STRING } } }

export function geminiVisionProvider(): OcrProvider {
  return {
    name: 'gemini',
    async extract({ docKind, bytes, contentType }): Promise<OcrSuggestion | null> {
      // Only KTP→NIK is modeled so far; other doc kinds fall through to null (no suggestion).
      if (docKind !== 'ktp') return null
      try {
        const raw = await generateStructuredFromImage(
          await getActivePrompt('ocr_ktp_vision'),
          bytes,
          contentType,
          'Baca KTP ini dan kembalikan JSON {"nik": "<16 digit NIK>"}. Jika NIK tidak terbaca, kembalikan {"nik": ""}.',
          NIK_SCHEMA,
        )
        const nik = String((JSON.parse(raw) as { nik?: unknown }).nik ?? '').replace(/\D/g, '')
        if (nik.length !== 16) return null
        return { field: 'nik', label: 'NIK', value: nik }
      } catch (e) {
        log.warn('ocr.gemini_failed', { docKind, ...errField(e) })
        return null
      }
    },
    // Full-document transcription (any doc kind). Interim "cloud OCR for now": the raw bytes go
    // to the GENERATIVE model. Production posture = swap to Document AI (dedicated processor, no
    // generative egress) — same provider interface, register as 'documentai'. Best-effort: any
    // failure logs + returns null so the upload never breaks. The text is masked downstream
    // (narrative.ts mask-in/unmask-out) before it ever reaches the drafting model.
    async extractFullText({ docKind, bytes, contentType }): Promise<string | null> {
      try {
        const text = await generateTextFromImage(
          await getActivePrompt('ocr_fulltext_vision'),
          bytes,
          contentType,
          'Transkripsikan seluruh isi dokumen ini sebagai teks polos. Pertahankan urutan baris. Jika ada bagian tak terbaca, tulis [tidak terbaca].',
        )
        return text.trim() || null
      } catch (e) {
        log.warn('ocr.gemini_fulltext_failed', { docKind, ...errField(e) })
        return null
      }
    },
  }
}
