/**
 * setup-v2-named-ranges.ts — v2 NamedRange placement script.
 *
 * Walks the v2 Master Doc, finds every `{{token_name}}` literal, and creates a
 * NamedRange spanning exactly that text. No sentinel wrapping (v1's `${{X}}…${{/X}}`
 * scheme is RETIRED for v2 per docs/planning/muap-template-engine-v2.md).
 *
 * Each NamedRange's name = the token's registry name. Validation:
 *   - Every literal name MUST appear in the T1 registry (apps/web-app/src/lib/templates/tokens.ts).
 *     Unknown names = fail loud (likely a typo in the Master, or a stale token name).
 *   - Forbidden gating tokens (`_level`, `recommend`, etc.) MUST NOT appear — registry's
 *     `assertNoForbidden` already catches this at module load; we re-assert here.
 *
 * Idempotent: a name that already has a NamedRange is skipped. Safe to re-run after
 * Master edits or partial setup.
 *
 * Dry-run by default — prints the plan; --apply commits via Docs API batchUpdate.
 *
 * Usage:
 *   pnpm exec tsx apps/web-app/scripts/setup-v2-named-ranges.ts muap            # dry-run
 *   pnpm exec tsx apps/web-app/scripts/setup-v2-named-ranges.ts muap --apply    # write
 *   pnpm exec tsx apps/web-app/scripts/setup-v2-named-ranges.ts rsk --apply
 *
 * Doc IDs are read from env: GOOGLE_MASTER_MUAP_V2_DOC_ID, GOOGLE_MASTER_RSK_V2_DOC_ID.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import type { docs_v1 } from 'googleapis'
import { docsClient } from '../src/server/google/clients'
import { buildCharMap } from '../src/server/google/extract/docText'
import { findToken, tokenNamesFor, type TemplateId } from '../src/lib/templates/tokens'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

interface PlannedRange {
  name: string
  startIndex: number
  endIndex: number
}

function scanLiterals(doc: docs_v1.Schema$Document): PlannedRange[] {
  const cm = buildCharMap(doc.body?.content ?? undefined)
  const re = /\{\{(\w+)\}\}/g
  const out: PlannedRange[] = []
  for (let m = re.exec(cm.full); m; m = re.exec(cm.full)) {
    const name = m[1]
    if (!name) continue
    const startIndex = cm.at[m.index]
    const endIndex = cm.at[m.index + m[0].length - 1] + 1
    if (typeof startIndex === 'number' && typeof endIndex === 'number') {
      out.push({ name, startIndex, endIndex })
    }
  }
  return out
}

interface Plan {
  toCreate: PlannedRange[]
  toSkipExisting: string[]
  unknown: string[]
  duplicatesInDoc: string[]
}

function planForDoc(doc: docs_v1.Schema$Document, template: TemplateId): Plan {
  const literals = scanLiterals(doc)
  const existing = new Set(Object.keys(doc.namedRanges ?? {}))
  const registry = new Set(tokenNamesFor(template))
  const seenInDoc = new Set<string>()

  const plan: Plan = { toCreate: [], toSkipExisting: [], unknown: [], duplicatesInDoc: [] }
  for (const lit of literals) {
    if (!registry.has(lit.name)) {
      plan.unknown.push(lit.name)
      continue
    }
    if (!findToken(lit.name)) {
      // belt-and-braces — should never happen given the registry check
      plan.unknown.push(lit.name)
      continue
    }
    if (existing.has(lit.name)) {
      plan.toSkipExisting.push(lit.name)
      continue
    }
    if (seenInDoc.has(lit.name)) {
      plan.duplicatesInDoc.push(lit.name)
      continue
    }
    seenInDoc.add(lit.name)
    plan.toCreate.push(lit)
  }
  return plan
}

function usage(msg: string): never {
  console.error(`error: ${msg}`)
  console.error('usage: tsx setup-v2-named-ranges.ts <muap|rsk> [--apply]')
  process.exit(1)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const templateArg = args[0]
  const apply = args.includes('--apply')
  if (templateArg !== 'muap' && templateArg !== 'rsk') {
    usage(`first arg must be 'muap' or 'rsk' (got: ${templateArg ?? '<missing>'})`)
  }
  const template: TemplateId = templateArg

  const envKey =
    template === 'muap' ? 'GOOGLE_MASTER_MUAP_V2_DOC_ID' : 'GOOGLE_MASTER_RSK_V2_DOC_ID'
  const documentId = process.env[envKey]
  if (!documentId) usage(`${envKey} is not set in .env.local`)

  const docs = docsClient()
  const doc = (await docs.documents.get({ documentId })).data
  const plan = planForDoc(doc, template)

  console.log(`Template:           ${template}`)
  console.log(`Doc ID:             ${documentId}`)
  console.log(`Literals to create: ${plan.toCreate.length}`)
  console.log(`Already exists:     ${plan.toSkipExisting.length}`)
  console.log(`Duplicates in Doc:  ${plan.duplicatesInDoc.length}`)
  console.log(`Unknown names:      ${plan.unknown.length}`)

  if (plan.unknown.length) {
    console.error('\nERROR — these {{token}} literals do not match any registry token:')
    for (const u of plan.unknown.slice(0, 30)) console.error(`  - ${u}`)
    if (plan.unknown.length > 30) console.error(`  ... and ${plan.unknown.length - 30} more`)
    console.error('Fix the Master or the registry before --apply. Refusing to proceed.')
    process.exit(2)
  }

  if (plan.duplicatesInDoc.length) {
    console.warn('\nWARNING — token names that appear MULTIPLE times in the Doc (only the first will get the NamedRange):')
    for (const d of plan.duplicatesInDoc) console.warn(`  - ${d}`)
    console.warn('Multiple occurrences is OK for T83/T87 strict-reuse — fill engine handles via name lookup, all occurrences receive the same value via replaceNamedRangeContent.')
  }

  if (!apply) {
    console.log('\nDRY-RUN — no writes performed. Re-run with --apply to commit.')
    if (plan.toCreate.length) {
      console.log('\nFirst 10 planned NamedRanges:')
      for (const p of plan.toCreate.slice(0, 10)) {
        console.log(`  ${p.name.padEnd(40)} [${p.startIndex}..${p.endIndex})`)
      }
    }
    return
  }

  if (!plan.toCreate.length) {
    console.log('\nNothing to do.')
    return
  }

  const requests: docs_v1.Schema$Request[] = plan.toCreate.map((p) => ({
    createNamedRange: { name: p.name, range: { startIndex: p.startIndex, endIndex: p.endIndex } },
  }))
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } })
  console.log(`\nCreated ${plan.toCreate.length} NamedRange(s).`)
}

// Expose pure helpers for unit tests.
export const __testing = { scanLiterals, planForDoc }

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
