import 'server-only'

import { z, type ZodTypeAny } from 'zod'
import type { StructuredOpts } from './gemini'

// Deterministic offline InferenceProvider for tests/CI (INFERENCE_PROVIDER=stub). NEVER
// reach external APIs. The reply embeds a marker so e2e assertions can verify the stub
// path was taken; for generateStructured we synthesise a minimum-valid value against the
// caller's Zod schema so narrative/analysis flows complete deterministically.
//
// Mask-in / unmask-out is exercised on the REAL code path (server/ai/redact.ts wraps the
// provider regardless of which one is registered) — this stub never sees PII because the
// prompt arrives already-masked, and the assertions read AiInteraction.maskedPrompt.

const STUB_MARKER = '[stub-inference]'

// Zod-v4 internals shift between minor versions; cast through `unknown` and treat the
// def bag as a loose record. The stub doesn't ship to prod and re-validates output
// against the real schema before returning, so a missed case fails loudly.
type ZodDef = { typeName?: string; type?: string; [k: string]: unknown }

function fakeFromSchema(schema: ZodTypeAny, depth = 0): unknown {
  if (depth > 8) return null
  const def = (schema as unknown as { _def: ZodDef })._def
  const tag = (def.typeName ?? def.type ?? '') as string
  switch (tag) {
    case 'ZodString':
    case 'string':
      return `${STUB_MARKER} placeholder`
    case 'ZodNumber':
    case 'number':
      return 0
    case 'ZodBoolean':
    case 'boolean':
      return false
    case 'ZodLiteral':
    case 'literal':
      return (def as { value?: unknown }).value
    case 'ZodEnum':
    case 'enum': {
      const values = (def as { values?: readonly string[] | Record<string, unknown> }).values
      if (Array.isArray(values)) return values[0]
      if (values && typeof values === 'object') return Object.values(values)[0]
      return null
    }
    case 'ZodNativeEnum':
    case 'nativeEnum': {
      const values = (def as { values?: Record<string, unknown> }).values ?? {}
      return Object.values(values)[0]
    }
    case 'ZodArray':
    case 'array':
      return []
    case 'ZodObject':
    case 'object': {
      const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape
      const out: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(shape)) {
        out[key] = fakeFromSchema(child as ZodTypeAny, depth + 1)
      }
      return out
    }
    case 'ZodOptional':
    case 'optional':
    case 'ZodNullable':
    case 'nullable':
      return undefined
    case 'ZodDefault':
    case 'default': {
      const dv = (def as { defaultValue?: unknown }).defaultValue
      return typeof dv === 'function' ? (dv as () => unknown)() : dv
    }
    case 'ZodUnion':
    case 'union':
    case 'ZodDiscriminatedUnion':
    case 'discriminatedUnion': {
      const opts = (def as { options?: readonly ZodTypeAny[] }).options ?? []
      return opts.length ? fakeFromSchema(opts[0], depth + 1) : null
    }
    case 'ZodEffects':
    case 'pipe':
    case 'transform': {
      const inner = (def as { schema?: ZodTypeAny; in?: ZodTypeAny }).schema ?? (def as { in?: ZodTypeAny }).in
      return inner ? fakeFromSchema(inner, depth + 1) : null
    }
    default:
      return null
  }
}

async function generateReply(_systemInstruction: string, prompt: string): Promise<string> {
  // Echo the (already-masked) prompt's first 80 chars back. Lets compliance scenarios
  // check that the masked text round-trips, and keeps the body Bahasa-neutral for
  // narrative assertions.
  const echo = prompt.slice(0, 80).replace(/\s+/g, ' ').trim()
  return `${STUB_MARKER} reply: ${echo}`
}

async function generateStructured<T>(
  _systemInstruction: string,
  _prompt: string,
  schema: z.ZodType<T>,
  _opts?: StructuredOpts,
): Promise<T> {
  const candidate = fakeFromSchema(schema as ZodTypeAny)
  const result = schema.safeParse(candidate)
  if (result.success) return result.data
  // Schema introspection missed a constraint; throw loudly so we extend fakeFromSchema
  // rather than papering over with a bad stub.
  throw new Error(`stub generateStructured: synthesised value failed schema validation — ${result.error.message}`)
}

export function stubInferenceProvider() {
  return { model: () => 'stub-1', generateReply, generateStructured }
}
