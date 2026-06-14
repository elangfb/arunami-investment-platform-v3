/**
 * Copy a hand-created RSK template Doc into an APP-OWNED master (so the app can write
 * it: drive.file lets the app edit files it created; drive.readonly lets it read the
 * source). Writes the new id to GOOGLE_MASTER_RSK_DOC_ID in .env.local.
 *
 * Requires the broadened OAuth scope — run `pnpm google:auth` (re-consent) first.
 *
 * Run:  pnpm exec tsx apps/web-app/scripts/copy-rsk-master.ts <SOURCE_DOC_ID>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { driveClient } from '../src/server/google/clients'

const ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local')
config({ path: ENV_PATH })

function upsertEnv(key: string, value: string): void {
  let text = readFileSync(ENV_PATH, 'utf8')
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`
  writeFileSync(ENV_PATH, text)
}

async function main() {
  const source = process.argv[2]
  if (!source) throw new Error('Usage: copy-rsk-master.ts <SOURCE_DOC_ID>')
  const drive = driveClient()
  const res = await drive.files.copy({
    fileId: source,
    requestBody: { name: 'Mizan Master — RSK (v2)' },
    fields: 'id',
  })
  const id = res.data.id
  if (!id) throw new Error('copy returned no id')
  upsertEnv('GOOGLE_MASTER_RSK_DOC_ID', id)
  console.log(`✓ Copied ${source} → app-owned master ${id}`)
  console.log(`  GOOGLE_MASTER_RSK_DOC_ID=${id}`)
  console.log(`  https://docs.google.com/document/d/${id}/edit`)
  console.log('\nNext: pnpm exec tsx scripts/setup-template-ranges.ts (places NamedRanges; inspect with inspect-masters / inventory-master-tokens).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
