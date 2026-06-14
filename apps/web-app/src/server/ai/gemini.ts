// Gemini client.
//
// TWO SDKs, by design — they serve the two SEPARATE egress boundaries:
//   • TEXT inference (chat reply + MUAP/RSK narrative) → Vercel AI SDK v6 (this file's
//     generateReply / generateStructured, used via server/ai/provider.ts). The AI SDK gives
//     one `LanguageModel` interface, so the Dec-2026 in-region swap (Amazon Nova via
//     @ai-sdk/amazon-bedrock, self-host vLLM via an OpenAI-compatible baseURL) is a new
//     PROVIDERS entry in provider.ts — config, not a rewrite. See workflow-finetune.md §16.3.
//   • IMAGE/PDF OCR (server/ocr, OCR_PROVIDER) → @google/genai multimodal
//     (generateStructuredFromImage / generateTextFromImage). This is the OCR boundary, NOT the
//     inference boundary, and intentionally stays on @google/genai (a non-vision INFERENCE_
//     PROVIDER must never break it).
//
// Vertex (GOOGLE_CLOUD_PROJECT) is the SOLE provider on both paths — the AI Studio
// (GEMINI_API_KEY) path was dropped 2026.06.08 to remove the silent-precedence footgun.
// Model is configurable via GEMINI_MODEL so we can move between Flash versions freely.
import { GoogleGenAI, type Schema } from '@google/genai'
import { generateText, generateObject, type LanguageModel } from 'ai'
import { createVertex } from '@ai-sdk/google-vertex'
import { log } from '../log'
import type { z } from 'zod'
import { withRetry } from '../retry'

// Default model is Gemini 3.5 Flash — the GA Flash tag (user directive 2026-06-03; supersedes
// the 2026-05-27 'gemini-3-flash', which is Preview and unfit for a bank prod). Single model
// across all AI surfaces: narrative, analysis, chat, research synthesis, OCR-via-gemini.
// Override via GEMINI_MODEL when Google releases a new tag or for A/B. The OCR Document AI
// path is SEPARATE and unaffected — it doesn't use the generative model.
const DEFAULT_MODEL = 'gemini-3.5-flash'

export function aiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL
}

// ── Vertex data-residency posture (warn-only; out-of-region permitted) ────────────
// Bank PII egresses to the Vertex region named by GOOGLE_CLOUD_LOCATION (default
// asia-southeast1, Singapore — APAC). Out-of-region locations — INCLUDING the region-agnostic
// `global` endpoint, which Google serves from the US — are now PERMITTED: the 2026.06.08
// decision accepted out-of-region inference for this deployment. This REVERSES the prior OJK §27
// fail-closed residency guard; accepted as an interim, it MUST be revisited for production /
// before 17 Dec 2026 (in-region posture — docs/references/compliance.md). We never block, but
// keep a loud `ai.region_out_of_apac` warning so PII leaving APAC stays visible in logs.
// GCP APAC region IDs are prefixed `asia-` / `australia-`; global, us-*, europe-*, … are not.
export const VERTEX_DEFAULT_LOCATION = 'asia-southeast1'

export function isApacLocation(location: string): boolean {
  return /^(asia|australia)-[a-z]+\d+$/.test(location)
}

// Resolve the Vertex location for the client constructors below (shared by the text and
// OCR-vision egress paths). Warns — never blocks — when out-of-APAC.
export function resolveVertexLocation(): string {
  const location = process.env.GOOGLE_CLOUD_LOCATION || VERTEX_DEFAULT_LOCATION
  if (!isApacLocation(location)) {
    log.warn('ai.region_out_of_apac', { location })
  }
  return location
}

// Vertex auth credentials (value-based, mirrors server/ocr/documentai.ts + firebase/admin.ts):
// a dedicated VERTEX_CREDENTIALS (base64 SA JSON) wins; else reuse the same-project
// FIREBASE_SERVICE_ACCOUNT (that SA just needs roles/aiplatform.user); else undefined → ADC
// (gcloud / GOOGLE_APPLICATION_CREDENTIALS / metadata server). The returned shape is the
// GoogleAuthOptions BOTH Vertex SDKs accept (createVertex + GoogleGenAI), so the two egress
// paths can't diverge. No filesystem key paths — secrets are env-injected (serverless-safe).
function vertexGoogleAuthOptions(): { credentials: Record<string, unknown> } | undefined {
  const b64 = process.env.VERTEX_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT
  if (!b64) return undefined
  return { credentials: JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) }
}

// ── Vercel AI SDK language model (text boundary) ──────────────────────────────────
// Resolve a `LanguageModel` on Vertex (GOOGLE_CLOUD_PROJECT [+ LOCATION], with VERTEX_CREDENTIALS
// / FIREBASE_SERVICE_ACCOUNT base64 SA, else ADC). Vertex is the SOLE provider — the AI Studio
// (GEMINI_API_KEY) path was removed (2026.06.08) to kill the silent-precedence footgun.
function geminiLanguageModel(): LanguageModel {
  const project = process.env.GOOGLE_CLOUD_PROJECT
  if (!project) throw new Error('AI not configured: set GOOGLE_CLOUD_PROJECT (Vertex).')
  // Location via resolveVertexLocation; an unset LOCATION defaults to asia-southeast1. Out-of-region
  // (incl. `global`) is permitted (warn-only) per the 2026.06.08 decision.
  return createVertex({ project, location: resolveVertexLocation(), googleAuthOptions: vertexGoogleAuthOptions() })(aiModel())
}

export async function generateReply(systemInstruction: string, prompt: string): Promise<string> {
  const res = await withRetry(
    // maxRetries: 0 — retry/backoff is owned by our withRetry (Retry-After + transient
    // detection, server/retry.ts), not the SDK; double-retrying would compound the delay.
    () => generateText({ model: geminiLanguageModel(), system: systemInstruction, prompt, temperature: 0.3, maxRetries: 0 }),
    { label: 'gemini.generateReply' },
  )
  const text = res.text?.trim()
  if (!text) throw new Error('Empty response from model')
  return text
}

export interface StructuredOpts {
  // Lower than the chat default (0.3): drafting a regulatory memo favours determinism.
  temperature?: number
  maxOutputTokens?: number
}

// Like generateReply, but constrains the model to a Zod schema (generateObject) so the result
// maps cleanly to known fields, returned already-parsed + schema-validated. Used for MUAP/RSK
// narrative drafts. The Zod schema replaces the prior hand-rolled @google/genai responseSchema.
export async function generateStructured<T>(
  systemInstruction: string,
  prompt: string,
  schema: z.ZodType<T>,
  opts: StructuredOpts = {},
): Promise<T> {
  const res = await withRetry(
    () =>
      generateObject({
        model: geminiLanguageModel(),
        schema,
        system: systemInstruction,
        prompt,
        temperature: opts.temperature ?? 0.2,
        ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
        maxRetries: 0,
      }),
    { label: 'gemini.generateStructured' },
  )
  return res.object
}

// The Gemini implementation of the text-inference boundary (server/ai/provider.ts). The
// object shape is structurally checked against InferenceProvider where it's registered, so
// no import of that interface is needed here (avoids a provider↔gemini import cycle). Only the
// TEXT egress is exposed — the image/PDF functions below belong to the OCR boundary, not this.
export function geminiProvider() {
  return { model: aiModel, generateReply, generateStructured }
}

// ── @google/genai OCR vision boundary (server/ocr, OCR_PROVIDER=gemini) ───────────
// These stay on @google/genai: they send raw document bytes to the GENERATIVE model and are
// only reached when an external OCR provider is deliberately enabled (OCR egress ruling
// 2026-05-24). A dedicated OCR processor (Google Document AI) is the production posture.
function genaiClient(): GoogleGenAI {
  const project = process.env.GOOGLE_CLOUD_PROJECT
  if (!project) throw new Error('AI not configured: set GOOGLE_CLOUD_PROJECT (Vertex).')
  // OCR vision egress (raw document bytes) on Vertex. Location via resolveVertexLocation
  // (warn-only out-of-region, per 2026.06.08); Vertex is the sole provider (no AI Studio path).
  return new GoogleGenAI({ vertexai: true, project, location: resolveVertexLocation(), googleAuthOptions: vertexGoogleAuthOptions() })
}

// Free-text transcription of a DOCUMENT IMAGE/PDF (Gemini multimodal) — returns the raw
// text content, no JSON schema. Used by the full-text OCR provider (server/ocr) to read an
// entire document, not just one field.
export async function generateTextFromImage(
  systemInstruction: string,
  imageBytes: Buffer,
  mimeType: string,
  prompt: string,
  opts: StructuredOpts = {},
): Promise<string> {
  const res = await withRetry(
    () =>
      genaiClient().models.generateContent({
        model: aiModel(),
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType, data: imageBytes.toString('base64') } }, { text: prompt }],
          },
        ],
        config: {
          systemInstruction,
          temperature: opts.temperature ?? 0,
          ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
        },
      }),
    { label: 'gemini.vision.text' },
  )
  const text = res.text?.trim()
  if (!text) throw new Error('Empty response from model')
  return text
}

// Structured extraction from a DOCUMENT IMAGE/PDF (Gemini multimodal). Sends the raw bytes
// inline + a prompt + a JSON schema. Used by the Gemini OCR provider (server/ocr) to read a
// KTP/SLIK. NOTE: the document image IS PII and is sent to the model — this path is only
// reached when an external OCR provider is deliberately enabled (OCR egress ruling 2026-05-24).
export async function generateStructuredFromImage(
  systemInstruction: string,
  imageBytes: Buffer,
  mimeType: string,
  prompt: string,
  responseSchema: Schema,
  opts: StructuredOpts = {},
): Promise<string> {
  const res = await withRetry(
    () =>
      genaiClient().models.generateContent({
        model: aiModel(),
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType, data: imageBytes.toString('base64') } }, { text: prompt }],
          },
        ],
        config: {
          systemInstruction,
          temperature: opts.temperature ?? 0,
          ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
    { label: 'gemini.vision' },
  )
  const text = res.text?.trim()
  if (!text) throw new Error('Empty response from model')
  return text
}
