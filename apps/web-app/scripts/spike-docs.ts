/**
 * Live round-trip spike: prove the named-range + sentinel approach against the
 * REAL Google Docs API. Creates a throwaway Doc, inserts a couple of fields
 * wrapped in `<marker>_start … <marker>_end` sentinels with a NamedRange over the
 * value, reads it back, and shows both resolution paths agree.
 *
 * Run from repo root:  pnpm exec tsx apps/web-app/scripts/spike-docs.ts
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import type { docs_v1 } from 'googleapis'
import { docsClient } from '../src/server/google/clients'
import { makeResolver } from '../src/server/google/extract/resolver'

// auth.ts reads env lazily (inside getOAuthClient), so loading .env.local here —
// after the hoisted imports but before any client call — is sufficient.
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

async function main() {
  const docs = docsClient()

  const fields = [
    { marker: 'character_level', value: 'Sedang' },
    { marker: 'ratio_dscri', value: '1,2x' },
  ]

  // Build the insert text and compute each NamedRange span (post-insert indices).
  let text = ''
  const base = 1
  const ranges: { marker: string; startIndex: number; endIndex: number }[] = []
  for (const f of fields) {
    const startTok = `${f.marker}_start `
    const endTok = ` ${f.marker}_end`
    const valOffset = text.length + startTok.length
    text += startTok + f.value + endTok + '\n'
    ranges.push({ marker: f.marker, startIndex: base + valOffset, endIndex: base + valOffset + f.value.length })
  }

  const created = await docs.documents.create({ requestBody: { title: `Mizan spike ${new Date().toISOString()}` } })
  const documentId = created.data.documentId
  if (!documentId) throw new Error('documents.create returned no documentId')
  console.log('✓ created doc:', documentId)

  const requests: docs_v1.Schema$Request[] = [
    { insertText: { location: { index: 1 }, text } },
    ...ranges.map((r) => ({
      createNamedRange: { name: r.marker, range: { startIndex: r.startIndex, endIndex: r.endIndex } },
    })),
  ]
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } })
  console.log('✓ inserted text + named ranges')

  const got = await docs.documents.get({ documentId })
  const resolver = makeResolver(got.data)

  let allOk = true
  for (const f of fields) {
    const nr = resolver.namedRange(f.marker)
    const se = resolver.sentinel(f.marker)?.trim()
    const ok = nr === f.value && se === f.value
    allOk &&= ok
    console.log(`\n[${f.marker}] expect ${JSON.stringify(f.value)}`)
    console.log(`  namedRange: ${JSON.stringify(nr)} ${nr === f.value ? '✓' : '✗'}`)
    console.log(`  sentinel  : ${JSON.stringify(se)} ${se === f.value ? '✓' : '✗'}`)
  }

  console.log('\nopen:', `https://docs.google.com/document/d/${documentId}/edit`)
  console.log(allOk ? '\n✅ ROUND-TRIP OK' : '\n❌ MISMATCH')
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
