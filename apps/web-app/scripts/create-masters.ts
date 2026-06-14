/**
 * Upload resources/*.docx to Drive, converting to native Google Docs — these
 * become the master templates that per-application Docs are copied from.
 * Writes the resulting IDs to apps/web-app/.env.local.
 *
 * (With drive.file scope the app can only access files it creates, so the masters
 * MUST be created by the app rather than uploaded by hand.)
 *
 * Run from repo root:  pnpm exec tsx apps/web-app/scripts/create-masters.ts
 */
import { createReadStream, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { driveClient } from '../src/server/google/clients'

const here = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(here, '../.env.local')
const RESOURCES = resolve(here, '../../../resources')
config({ path: ENV_PATH })

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const GDOC = 'application/vnd.google-apps.document'

const MASTERS = [
  { key: 'GOOGLE_MASTER_MUAP_DOC_ID', file: 'Template_MUAP_Syariah_v2.docx', name: 'Mizan Master — MUAP' },
  { key: 'GOOGLE_MASTER_RSK_DOC_ID', file: 'RSK_Template_Profesional.docx', name: 'Mizan Master — RSK' },
]

function upsertEnv(key: string, value: string): void {
  let text = readFileSync(ENV_PATH, 'utf8')
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`
  writeFileSync(ENV_PATH, text)
}

async function main() {
  const drive = driveClient()
  for (const m of MASTERS) {
    const path = resolve(RESOURCES, m.file)
    const res = await drive.files.create({
      requestBody: { name: m.name, mimeType: GDOC },
      media: { mimeType: DOCX, body: createReadStream(path) },
      fields: 'id',
    })
    const id = res.data.id
    if (!id) throw new Error(`No id returned for ${m.file}`)
    upsertEnv(m.key, id)
    console.log(`✓ ${m.name}\n   ${m.key}=${id}\n   https://docs.google.com/document/d/${id}/edit`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
