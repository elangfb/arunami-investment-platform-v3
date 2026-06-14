// AI structured field extraction (Batch 9 T3-AI). Document AI gives us raw OCR TEXT; this hands that
// text to Gemini with a Zod-constrained schema and gets back valuable fields as a typed object —
// replacing the format-fragile regex parsers (lib/ocr.ts) as the primary extractor.
//
// Shape (per the design): { known: { <fieldPath>: { value, confidence } }, extras: { [key]: value } }
//   - known  = the curated FIELD_REGISTRY fields relevant to this docType. The LLM fills VALUES; the
//              registry still owns validation + routing + the gating/human-confirm rules downstream.
//   - extras = an OPEN map for anything else clearly labelled in the doc (sektor usaha, nama direktur,
//              tempat/tanggal lahir, …) — captured without a schema/migration per field, promotable later.
//
// Two safety rails kept (NOT compliance ceremony — correctness): every `known` value is run through
// the registry validator (don't trust the model's confidence — validate the value), and an invalid
// value is DROPPED (stays manual), never returned. Gating values still re-enter confirm+recompute at
// the wiring layer. The result is always a human-confirmed SUGGESTION, never an authoritative write.

import { z } from 'zod'
import { FIELD_REGISTRY, type FieldExtractor } from '../../lib/extraction-registry'
import type { StructuredOpts } from './gemini'

/** One extracted value plus the model's self-reported confidence (0..1) — NOT trusted alone. */
export interface ExtractedFieldValue {
  value: string
  confidence: number
}
export interface AiExtraction {
  /** Curated fields, keyed by registry fieldPath (e.g. 'nik', 'financialInputs.netMonthlyIncome'). */
  known: Record<string, ExtractedFieldValue>
  /** Anything else valuable the model found, keyed by a snake_case field name. */
  extras: Record<string, string>
}

/** The structured-generate primitive (server/ai/gemini.ts generateStructured), injectable for tests. */
export type StructuredGenerate = <T>(
  systemInstruction: string,
  prompt: string,
  schema: z.ZodType<T>,
  opts?: StructuredOpts,
) => Promise<T>

// fieldPath carries dots ('financialInputs.netMonthlyIncome') which make poor JSON keys for the model;
// use an underscore alias in the schema and map back to the fieldPath on the way out.
const aiKeyOf = (fieldPath: string): string => fieldPath.replace(/\./g, '__')

const SYSTEM =
  'You are a precise document data extractor for an Indonesian syariah bank. You receive the OCR text ' +
  'of one document and return ONLY clearly-present values. NEVER guess: if a field is not clearly in the ' +
  'text, return null for it. For each value also give a confidence in 0..1. Beyond the requested fields, ' +
  'put any OTHER clearly-labelled useful values into `extras` (key = short snake_case Indonesian name, ' +
  'value = the string). Do not invent data.'

function buildPrompt(docType: string, relevant: FieldExtractor[], ocrText: string): string {
  const lines = relevant.map((f) => `- ${aiKeyOf(f.fieldPath)} = ${f.label}`)
  return [
    `Document type: ${docType}`,
    relevant.length ? `Extract these fields (return null if absent):\n${lines.join('\n')}` : 'No specific fields required.',
    'Also capture any other valuable labelled fields into `extras`.',
    '',
    'OCR TEXT:',
    ocrText,
  ].join('\n')
}

/** A nullable {value, confidence} cell for one requested field. */
const cell = z.object({ value: z.string(), confidence: z.number().min(0).max(1) }).nullable()

function buildSchema(relevant: FieldExtractor[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, typeof cell> = {}
  for (const f of relevant) shape[aiKeyOf(f.fieldPath)] = cell
  return z.object({ ...shape, extras: z.record(z.string(), z.string()) })
}

/** The registry fields a given docType can yield (sourceDocTypes match). */
export function relevantFields(docType: string): FieldExtractor[] {
  return FIELD_REGISTRY.filter((f) => f.sourceDocTypes.includes(docType))
}

// Default generator: lazy-import gemini so this module (and its unit test) doesn't statically pull in
// the server-only inference stack. Tests inject their own `generate` and never hit this path.
const defaultGenerate: StructuredGenerate = async (system, prompt, schema, opts) => {
  const { generateStructured } = await import('./gemini')
  return generateStructured(system, prompt, schema, opts)
}

/**
 * Extract structured fields from one document's OCR text via the LLM. Returns validated `known` fields
 * (keyed by registry fieldPath) + an open `extras` map. Invalid values are dropped (stay manual).
 * `generate` is injectable for hermetic tests; production uses Gemini structured output.
 */
export async function extractFields(
  docType: string,
  ocrText: string,
  generate: StructuredGenerate = defaultGenerate,
): Promise<AiExtraction> {
  const text = ocrText?.trim()
  if (!text) return { known: {}, extras: {} }

  const relevant = relevantFields(docType)
  const schema = buildSchema(relevant)
  const raw = (await generate(SYSTEM, buildPrompt(docType, relevant, text), schema, { temperature: 0 })) as Record<string, unknown>

  const known: Record<string, ExtractedFieldValue> = {}
  for (const f of relevant) {
    const got = raw[aiKeyOf(f.fieldPath)] as { value?: unknown; confidence?: unknown } | null | undefined
    const value = got?.value
    if (value == null || String(value).trim() === '') continue // absent → stays manual
    if (f.validate && !f.validate(value).ok) continue // don't trust confidence — validate, drop if bad
    known[f.fieldPath] = { value: String(value), confidence: Number(got?.confidence) || 0 }
  }

  const extrasRaw = (raw.extras ?? {}) as Record<string, unknown>
  const extras: Record<string, string> = {}
  for (const [k, v] of Object.entries(extrasRaw)) {
    if (v != null && String(v).trim() !== '') extras[k] = String(v)
  }
  return { known, extras }
}
