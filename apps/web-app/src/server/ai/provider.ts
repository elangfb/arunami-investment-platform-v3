// Inference provider boundary — the swappable backend for TEXT generation: chat/assistant
// replies and MUAP/RSK narrative drafting. Selected by INFERENCE_PROVIDER (env): 'gemini'
// today; 'nova' (Amazon Bedrock, in-region Jakarta) and 'vllm' (self-host, OpenAI-compatible)
// are the Dec-2026 in-region targets, to be added behind THIS interface so the cutover is a
// config flip + an adapter, never a rewrite. See docs/designs/workflow-finetune.md §16.
//
// Scope: text-in → text-or-JSON-out ONLY. Image/PDF OCR egress is a SEPARATE boundary
// (server/ocr, OCR_PROVIDER) and stays there — the Gemini vision OCR provider is intrinsically
// Gemini and must not route through this (a non-vision INFERENCE_PROVIDER would break it).
//
// Cross-cutting compliance: mask-in / detectResidualPii are centralized in server/ai/redact.ts
// (Slice 2, the NER-ready seam) and the AiInteraction audit in server/ai/audit.ts; withRetry is
// owned by the provider impl. The Gemini impl is built on the Vercel AI SDK (Slice 3), so adding
// 'nova' (@ai-sdk/amazon-bedrock) / 'vllm' (OpenAI-compatible baseURL) is a new PROVIDERS entry.

import { geminiProvider, type StructuredOpts } from './gemini'
import { stubInferenceProvider } from './stub'
import type { z } from 'zod'

export interface InferenceProvider {
  /** Model identifier, for audit + logging (never PII). */
  model(): string
  /** Text system instruction + prompt → text reply (chat/assistant). */
  generateReply(systemInstruction: string, prompt: string): Promise<string>
  /**
   * Text system instruction + prompt → an object constrained by `schema` (narrative drafts),
   * returned already-parsed and schema-validated (AI SDK generateObject). The caller still
   * applies its own invariants (e.g. scrubNarrative) — the schema guarantees shape, not policy.
   */
  generateStructured<T>(
    systemInstruction: string,
    prompt: string,
    schema: z.ZodType<T>,
    opts?: StructuredOpts,
  ): Promise<T>
}

// Registry of available text-inference backends. Add 'nova' / 'vllm' here (Slice 3).
const PROVIDERS: Record<string, () => InferenceProvider> = {
  gemini: geminiProvider,
  stub: stubInferenceProvider,
}

/** Resolve the active text-inference provider from INFERENCE_PROVIDER (default 'gemini'). */
export function inferenceProvider(): InferenceProvider {
  const key = process.env.INFERENCE_PROVIDER || 'gemini'
  const factory = PROVIDERS[key]
  if (!factory) {
    throw new Error(`Unknown INFERENCE_PROVIDER "${key}" (known: ${Object.keys(PROVIDERS).join(', ')})`)
  }
  return factory()
}
