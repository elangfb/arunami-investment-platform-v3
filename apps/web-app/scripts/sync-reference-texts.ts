/**
 * sync-reference-texts.ts — populate the TemplateReferenceText cache for a given
 * template ('muap' | 'rsk') from the References Doc.
 *
 * STAGE: scaffolding. The full implementation requires T3 (v2 Master has {{token}}
 * literals) and T4 (NamedRanges placed) before it can walk a NamedRange→cell→reference-doc
 * coordinate mapping. Until then, this script supports a MANUAL MAPPING mode:
 *   - Supply a JSON file `apps/web-app/scripts/data/<template>-reference-text.json`
 *     of shape `{ tokenName: "[Reference text from the Hijra template]", ... }`
 *   - Script validates each tokenName against the registry, upserts the row.
 *
 * Once T3+T4 ship, an additional DOC-WALK mode kicks in:
 *   - Read v2 Master Doc + References Doc via Docs API
 *   - For each NamedRange in Master, locate the spatially-corresponding cell in
 *     References Doc (same table T-index, same r/c)
 *   - Persist the cell's text content under that NamedRange's name
 *
 * The script refuses to write unless `--apply` is passed; default = dry-run that prints
 * planned upserts.
 *
 * Usage:
 *   pnpm exec tsx apps/web-app/scripts/sync-reference-texts.ts muap            # dry-run
 *   pnpm exec tsx apps/web-app/scripts/sync-reference-texts.ts muap --apply    # write
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { config } from 'dotenv'
import {
  upsertReferenceText,
  countReferenceTexts,
} from '../src/server/templates/reference-text'
import { findToken, tokenNamesFor, type TemplateId } from '../src/lib/templates/tokens'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

function usage(msg: string): never {
  console.error(`error: ${msg}`)
  console.error('usage: tsx sync-reference-texts.ts <muap|rsk> [--apply]')
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

  const here = dirname(fileURLToPath(import.meta.url))
  const dataPath = resolve(here, 'data', `${template}-reference-text.json`)
  if (!existsSync(dataPath)) {
    console.error(`no manual mapping file at ${dataPath}`)
    console.error(`(create one of shape { tokenName: "Reference text", ... }; doc-walk mode lands with T3+T4)`)
    process.exit(1)
  }

  const raw: Record<string, string> = JSON.parse(readFileSync(dataPath, 'utf-8'))
  const mappedNames = Object.keys(raw)
  const registryNames = new Set(tokenNamesFor(template))

  // Validate every key against the registry. Unknown names = mapping file is stale; fail loud.
  const unknown: string[] = []
  for (const name of mappedNames) {
    if (!findToken(name)) unknown.push(name)
  }
  if (unknown.length) {
    console.error(`error: mapping contains tokens not in the registry:\n  ${unknown.join('\n  ')}`)
    process.exit(2)
  }

  // Report coverage — which tokens still missing reference text.
  const missing = [...registryNames].filter((n) => !(n in raw))
  console.log(`Template:           ${template}`)
  console.log(`Mapping entries:    ${mappedNames.length}`)
  console.log(`Registry tokens:    ${registryNames.size}`)
  console.log(`Coverage gap:       ${missing.length} tokens without reference text`)
  if (missing.length && missing.length <= 20) {
    console.log(`Missing tokens:\n  ${missing.join('\n  ')}`)
  } else if (missing.length) {
    console.log(`Missing tokens (first 20):\n  ${missing.slice(0, 20).join('\n  ')}\n  ... and ${missing.length - 20} more`)
  }

  if (!apply) {
    console.log('\nDRY-RUN — no writes performed. Re-run with --apply to commit.')
    return
  }

  let n = 0
  for (const [tokenName, text] of Object.entries(raw)) {
    await upsertReferenceText({ templateId: template, tokenName, text })
    n++
  }
  const total = await countReferenceTexts(template)
  console.log(`\nApplied ${n} upserts. Total cached rows for ${template}: ${total}`)
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
