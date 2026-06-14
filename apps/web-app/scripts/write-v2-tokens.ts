/**
 * write-v2-tokens.ts — T3 token writer for the v2 Master Doc.
 *
 * For each token in `apps/web-app/scripts/data/<template>-cell-mapping.json` (produced
 * by the cell-mapping extraction pass), finds the cited `replace` string in the v2 Master
 * Doc and substitutes `{{token_name}}` for it. Idempotent: if the cell already contains
 * the `{{token_name}}` literal, the script skips it (no-op).
 *
 * Mandatory safety: before any --apply write, the script copies the live Master via
 * Drive `files.copy` and prints the backup ID. The backup is YOUR rollback — keep it
 * pinned until you've confirmed the writes look right. `--skip-backup` exists only for
 * re-runs against an already-backed-up Master.
 *
 * Coverage gap: the cell-mapping JSON may carry a `__missing__` array of tokens that the
 * extraction pass couldn't unambiguously place. Those are SKIPPED — `T3 follow-up` work.
 * The script reports the missing count so you can target the next pass.
 *
 * Usage:
 *   pnpm exec tsx apps/web-app/scripts/write-v2-tokens.ts muap                  # dry-run
 *   pnpm exec tsx apps/web-app/scripts/write-v2-tokens.ts muap --apply          # backup + write
 *   pnpm exec tsx apps/web-app/scripts/write-v2-tokens.ts muap --apply --skip-backup
 *
 * Doc IDs from env: GOOGLE_MASTER_MUAP_V2_DOC_ID, GOOGLE_MASTER_RSK_V2_DOC_ID.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
import { config } from 'dotenv'
import type { docs_v1 } from 'googleapis'
import { docsClient, driveClient } from '../src/server/google/clients'
import { buildCharMap } from '../src/server/google/extract/docText'
import { findToken, type TemplateId } from '../src/lib/templates/tokens'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

interface CellMappingEntry {
  replace: string
  anchor?: string
  occurrence?: number
  notes?: string
}
type CellMapping = {
  __missing__?: string[]
  [tokenName: string]: CellMappingEntry | string[] | undefined
}

function isEntry(v: CellMappingEntry | string[] | undefined): v is CellMappingEntry {
  return !!v && !Array.isArray(v) && typeof (v as CellMappingEntry).replace === 'string'
}

function usage(msg: string): never {
  console.error(`error: ${msg}`)
  console.error('usage: tsx write-v2-tokens.ts <muap|rsk> [--apply] [--skip-backup]')
  process.exit(1)
}

interface PlannedReplace {
  tokenName: string
  startIndex: number
  endIndex: number
  replace: string
  withLiteral: string
}

function planReplacements(
  doc: docs_v1.Schema$Document,
  mapping: CellMapping,
  template: TemplateId,
): { plan: PlannedReplace[]; skipped: string[]; alreadyDone: string[]; notFound: string[] } {
  const cm = buildCharMap(doc.body?.content ?? undefined)
  const plan: PlannedReplace[] = []
  const skipped: string[] = []
  const alreadyDone: string[] = []
  const notFound: string[] = []

  for (const [tokenName, raw] of Object.entries(mapping)) {
    if (tokenName === '__missing__') continue
    if (!isEntry(raw)) {
      skipped.push(`${tokenName}: not a valid entry`)
      continue
    }
    const entry = raw
    if (!findToken(tokenName)) {
      skipped.push(`${tokenName}: not in registry`)
      continue
    }
    if (!entry.replace) {
      skipped.push(`${tokenName}: empty replace`)
      continue
    }
    const withLiteral = `{{${tokenName}}}`

    // Idempotency: if the doc already contains the literal at the cited replace position,
    // count as alreadyDone (no-op). Simplest check: does the literal appear at all?
    if (cm.full.includes(withLiteral)) {
      alreadyDone.push(tokenName)
      continue
    }

    const occ = entry.occurrence ?? 1
    let foundAt = -1
    let from = 0
    for (let n = 0; n < occ; n++) {
      foundAt = cm.full.indexOf(entry.replace, from)
      if (foundAt < 0) break
      from = foundAt + entry.replace.length
    }
    if (foundAt < 0) {
      notFound.push(`${tokenName}: ${JSON.stringify(entry.replace).slice(0, 80)}`)
      continue
    }
    const startIndex = cm.at[foundAt]
    const endIndex = cm.at[foundAt + entry.replace.length - 1] + 1
    if (typeof startIndex !== 'number' || typeof endIndex !== 'number') {
      notFound.push(`${tokenName}: charmap mapping failed`)
      continue
    }
    plan.push({ tokenName, startIndex, endIndex, replace: entry.replace, withLiteral })
  }

  // De-dup any overlapping ranges (two tokens mapping to the same text — pick the first).
  plan.sort((a, b) => a.startIndex - b.startIndex)
  const dedup: PlannedReplace[] = []
  let lastEnd = -1
  for (const p of plan) {
    if (p.startIndex < lastEnd) continue
    dedup.push(p)
    lastEnd = p.endIndex
  }
  void template
  return { plan: dedup, skipped, alreadyDone, notFound }
}

async function backupDoc(documentId: string, label: string): Promise<string> {
  // Dedicated Mizan account owns the Doc and has its own Drive quota, so a bare
  // `files.copy` works without parent fiddling — the copy lands in the account's
  // root Drive folder. To organize backups in a sub-folder, set GOOGLE_BACKUP_FOLDER_ID.
  const folderId = process.env.GOOGLE_BACKUP_FOLDER_ID
  const drive = driveClient()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const res = await drive.files.copy({
    fileId: documentId,
    requestBody: {
      name: `BACKUP — ${label} — ${stamp}`,
      ...(folderId ? { parents: [folderId] } : {}),
    },
    fields: 'id, name',
  })
  if (!res.data.id) throw new Error('Drive copy returned no id')
  console.log(`  backup: ${res.data.name} → id=${res.data.id}${folderId ? ` (folder ${folderId})` : ''}`)
  return res.data.id
}

async function applyReplacements(
  docs: docs_v1.Docs,
  documentId: string,
  plan: PlannedReplace[],
): Promise<void> {
  if (!plan.length) return
  // Apply in REVERSE order so earlier indices stay valid as later ones get inserted/deleted.
  const requests: docs_v1.Schema$Request[] = []
  for (const p of [...plan].reverse()) {
    requests.push({
      deleteContentRange: {
        range: { startIndex: p.startIndex, endIndex: p.endIndex },
      },
    })
    requests.push({
      insertText: {
        location: { index: p.startIndex },
        text: p.withLiteral,
      },
    })
  }
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } })
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const templateArg = args[0]
  const apply = args.includes('--apply')
  const skipBackup = args.includes('--skip-backup')
  if (templateArg !== 'muap' && templateArg !== 'rsk') {
    usage(`first arg must be 'muap' or 'rsk' (got: ${templateArg ?? '<missing>'})`)
  }
  const template: TemplateId = templateArg

  const envKey =
    template === 'muap' ? 'GOOGLE_MASTER_MUAP_V2_DOC_ID' : 'GOOGLE_MASTER_RSK_V2_DOC_ID'
  const documentId = process.env[envKey]
  if (!documentId) usage(`${envKey} is not set in .env.local`)

  const here = dirname(fileURLToPath(import.meta.url))
  const dataPath = resolve(here, 'data', `${template}-cell-mapping.json`)
  if (!existsSync(dataPath)) usage(`no cell mapping at ${dataPath}`)
  const mapping = JSON.parse(readFileSync(dataPath, 'utf-8')) as CellMapping

  const mappedKeys = Object.keys(mapping).filter((k) => k !== '__missing__')
  const missing = mapping.__missing__ ?? []

  const docs = docsClient()
  const doc = (await docs.documents.get({ documentId })).data
  const { plan, skipped, alreadyDone, notFound } = planReplacements(doc, mapping, template)

  console.log(`Template:           ${template}`)
  console.log(`Doc ID:             ${documentId}`)
  console.log(`Mapping keys:       ${mappedKeys.length}`)
  console.log(`Missing (deferred): ${missing.length}`)
  console.log(`Plan to write:      ${plan.length}`)
  console.log(`Already done:       ${alreadyDone.length}`)
  console.log(`Not found in Doc:   ${notFound.length}`)
  console.log(`Skipped (other):    ${skipped.length}`)
  if (notFound.length && notFound.length <= 10) {
    console.log('\nNot found in Doc:')
    for (const n of notFound) console.log(`  - ${n}`)
  } else if (notFound.length) {
    console.log('\nNot found in Doc (first 10):')
    for (const n of notFound.slice(0, 10)) console.log(`  - ${n}`)
    console.log(`  ... and ${notFound.length - 10} more`)
  }

  if (!apply) {
    console.log('\nDRY-RUN — no Doc writes. Re-run with --apply.')
    return
  }
  if (!plan.length) {
    console.log('\nNothing to write.')
    return
  }
  if (!skipBackup) {
    console.log(`\nBackup before --apply:`)
    await backupDoc(documentId, `Master ${template.toUpperCase()} v2`)
  } else {
    console.log('\n--skip-backup: NOT creating a backup (caller asserts one already exists)')
  }
  console.log(`\nWriting ${plan.length} {{token}} literals...`)
  await applyReplacements(docs, documentId, plan)
  console.log('Done.')
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
